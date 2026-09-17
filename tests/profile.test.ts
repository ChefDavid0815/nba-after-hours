import test from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_CHALLENGE_KEY, getDailyChallenges, normalizeChallengeProgress } from '../src/challenges';
import { defaultSave, normalizeSave, SAVE_KEY } from '../src/persistence';
import { LINEUP_KEY } from '../src/roster';
import { advanceTournament, createTournament, normalizeTournament, TOURNAMENT_KEY } from '../src/tournament';
import { exportProfile, importProfile, inspectProfile, MAX_PROFILE_BYTES, PROFILE_ERROR_MESSAGES, PROFILE_STORAGE_KEYS, TUTORIAL_COMPLETED_KEY, type ProfileDocument, type ProfileStorage } from '../src/profile';

class MemoryStorage implements ProfileStorage {
  data = new Map<string, string>();
  reads: string[] = []; mutations: string[] = [];
  getItem(key: string) { this.reads.push(key); return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.mutations.push(key); this.data.set(key, value); }
  removeItem(key: string) { this.mutations.push(key); this.data.delete(key); }
}
function source(): MemoryStorage {
  const storage = new MemoryStorage(); const save = defaultSave();
  save.settings.locale = 'en'; save.settings.volume = 0.31; save.favoriteTeam = 'gsw';
  save.career = { games: 8, wins: 5, losses: 3, points: 241, threes: 19, assists: 27, steals: 12, championships: 1, bestScore: 42 };
  save.achievements = ['first_win', 'century_points', 'champion']; save.playedTeams = ['gsw', 'hou'];
  save.challengeBests = { 'score-pro': 32 };
  save.history = [{ id: 'test-match-8', date: '2026-09-17T12:00:00.000Z', home: 'gsw', away: 'bos', score: [42, 31], won: true, mode: 'championship', difficulty: 'pro', points: 42, assists: 6, rebounds: 7 }];
  const tournament = createTournament('gsw', 'bos', 'pro', 60, 3, 771); tournament.config.homeLineup = [0, 1, 4];
  advanceTournament(tournament, [42, 31]);
  const definition = getDailyChallenges(new Date(2026, 8, 17, 12))[0];
  const daily = normalizeChallengeProgress({ version: 1, entries: [{ id: definition.id, day: definition.day, kind: definition.kind, attempts: 4, bestMetrics: { points: 27, threes: 9 }, updatedAt: '2026-09-17T12:01:00.000Z', recentRunIds: ['run-a', 'run-b'] }] });
  storage.data.set(SAVE_KEY, JSON.stringify(save)); storage.data.set(TOURNAMENT_KEY, JSON.stringify(tournament));
  storage.data.set(LINEUP_KEY, JSON.stringify({ version: 1, teams: { gsw: [0, 1, 4], hou: [4, 3, 0] } }));
  storage.data.set(DAILY_CHALLENGE_KEY, JSON.stringify({ version: 1, entries: daily }));
  storage.data.set(TUTORIAL_COMPLETED_KEY, JSON.stringify({ version: 1, completed: true, completedAt: '2026-09-17T12:02:00.000Z' }));
  storage.data.set('other-app.session', 'private unrelated token'); return storage;
}
function backup(storage = source()) {
  const result = exportProfile(storage); assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.code);
  return result;
}
function document() { return JSON.parse(backup().text) as ProfileDocument; }
function sortedData(storage: MemoryStorage) { return [...storage.data].sort(([a], [b]) => a.localeCompare(b)); }
function invalid(mutator: (profile: any) => void, expected: string) {
  const profile = document(); mutator(profile);
  const storage = source(); const before = sortedData(storage);
  assert.deepEqual(importProfile(JSON.stringify(profile), storage), { ok: false, code: expected });
  assert.equal(storage.reads.length, 0); assert.equal(storage.mutations.length, 0); assert.deepEqual(sortedData(storage), before);
}

test('export/import round-trips all five subsystems and touches only the seven known keys', () => {
  const original = source(); const exported = backup(original);
  assert.equal(exported.text.includes('private unrelated token'), false);
  assert.deepEqual(exported.warnings, []);
  assert.deepEqual(exported.summary, { games: 8, wins: 5, achievements: 3, historyMatches: 1, locale: 'en', tournamentRound: 2, tournamentActive: true, lineupTeams: 2, dailyRecords: 1, tutorialCompleted: true });
  const inspection = inspectProfile(exported.text); assert.equal(inspection.ok, true);
  const restored = new MemoryStorage(); restored.data.set('other-app.session', 'preserve this');
  const result = importProfile(exported.text, restored); assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.reloadRequired, true);
  assert.equal(restored.data.get('other-app.session'), 'preserve this');
  for (const key of [SAVE_KEY, TOURNAMENT_KEY, LINEUP_KEY, DAILY_CHALLENGE_KEY, TUTORIAL_COMPLETED_KEY]) assert.deepEqual(JSON.parse(restored.getItem(key)!), JSON.parse(original.getItem(key)!));
  assert.deepEqual(JSON.parse(restored.getItem(`${SAVE_KEY}.backup`)! ), JSON.parse(restored.getItem(SAVE_KEY)!));
  assert.deepEqual(JSON.parse(restored.getItem(`${TOURNAMENT_KEY}.backup`)! ), JSON.parse(restored.getItem(TOURNAMENT_KEY)!));
  assert.deepEqual(normalizeSave(JSON.parse(restored.getItem(SAVE_KEY)!)), JSON.parse(restored.getItem(SAVE_KEY)!));
  assert.ok(normalizeTournament(JSON.parse(restored.getItem(TOURNAMENT_KEY)!)));
  const known = new Set<string>(PROFILE_STORAGE_KEYS);
  for (const key of [...restored.reads, ...restored.mutations, ...original.reads]) assert.equal(known.has(key), true);
});

test('an empty profile intentionally removes both old cup copies and the tutorial flag', () => {
  const empty = backup(new MemoryStorage()); const target = source();
  target.data.set(`${TOURNAMENT_KEY}.backup`, target.getItem(TOURNAMENT_KEY)!);
  assert.equal(importProfile(empty.text, target).ok, true);
  assert.equal(target.getItem(TOURNAMENT_KEY), null); assert.equal(target.getItem(`${TOURNAMENT_KEY}.backup`), null);
  assert.equal(target.getItem(TUTORIAL_COMPLETED_KEY), null);
  assert.deepEqual(JSON.parse(target.getItem(LINEUP_KEY)!), { version: 1, teams: {} });
  assert.deepEqual(JSON.parse(target.getItem(DAILY_CHALLENGE_KEY)!), { version: 1, entries: [] });
  assert.equal(JSON.parse(target.getItem(SAVE_KEY)!).settings.locale, 'zh');
});

test('malformed, foreign and future backups are rejected before even reading storage', () => {
  assert.deepEqual(inspectProfile('{broken'), { ok: false, code: 'invalid_json' });
  assert.deepEqual(inspectProfile('null'), { ok: false, code: 'unsupported_format' });
  invalid(profile => { profile.format = 'another-game'; }, 'unsupported_format');
  invalid(profile => { profile.version = 2; }, 'unsupported_version');
  invalid(profile => { profile.data.save.version = 2; }, 'invalid_save');
  invalid(profile => { delete profile.data.daily; }, 'invalid_structure');
  invalid(profile => { profile.data.unrelated = {}; }, 'invalid_structure');
  invalid(profile => { profile.exportedAt = 'yesterday'; }, 'invalid_structure');
  invalid(profile => { profile.data.save.settings.music = 'false'; }, 'invalid_save');
  invalid(profile => { profile.data.save.career.points = -1; }, 'invalid_save');
  invalid(profile => { profile.data.save.history[0].home = 'fake'; }, 'invalid_save');
});

test('prototype keys at every depth, excessive nesting, nonfinite JSON numbers and UTF-8 oversize are rejected', () => {
  const text = backup().text;
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const profile = JSON.parse(text); Object.defineProperty(profile.data.save.challengeBests, key, { enumerable: true, value: { polluted: true } });
    const payload = JSON.stringify(profile); assert.deepEqual(inspectProfile(payload), { ok: false, code: 'unsafe_keys' });
  }
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  invalid(profile => { let child = profile.data; for (let depth = 0; depth < 30; depth++) child = child.deep = {}; }, 'invalid_structure');
  assert.deepEqual(inspectProfile(text.replace('"points": 241', '"points": 1e309')), { ok: false, code: 'invalid_structure' });
  assert.deepEqual(inspectProfile(' '.repeat(MAX_PROFILE_BYTES + 1)), { ok: false, code: 'too_large' });
  assert.deepEqual(inspectProfile('x'.repeat(MAX_PROFILE_BYTES + 1)), { ok: false, code: 'too_large' });
  const unicode = JSON.stringify({ format: '球'.repeat(400_000) });
  assert.ok(unicode.length < MAX_PROFILE_BYTES); assert.deepEqual(inspectProfile(unicode), { ok: false, code: 'too_large' });
});

test('invalid brackets, lineup indices, forged medals and tutorial fields cannot partially import', () => {
  invalid(profile => { profile.data.tournament.bracket[1][0].homeId = 'lal'; }, 'invalid_tournament');
  invalid(profile => { profile.data.tournament.bracket[0][0].score = [10, 10]; }, 'invalid_tournament');
  invalid(profile => { profile.data.tournament.teams[1] = profile.data.tournament.teams[0]; }, 'invalid_tournament');
  invalid(profile => { profile.data.lineups.teams.gsw = [0, 0, 4]; }, 'invalid_lineups');
  invalid(profile => { profile.data.lineups.teams.not_a_team = [0, 1, 2]; }, 'invalid_lineups');
  invalid(profile => { profile.data.daily.entries[0].score = 100; }, 'invalid_daily');
  invalid(profile => { profile.data.daily.entries[0].medal = 'none'; }, 'invalid_daily');
  invalid(profile => { profile.data.daily.entries.push(profile.data.daily.entries[0]); }, 'invalid_daily');
  invalid(profile => { profile.data.tutorial.completed = 'true'; }, 'invalid_tutorial');
  invalid(profile => { profile.data.tutorial.completedAt = 'not a date'; }, 'invalid_tutorial');
});

test('a one-shot write failure at every transaction position restores original bytes and absence', () => {
  const text = backup().text;
  for (const populated of [false, true]) for (let failureAt = 1; failureAt <= 7; failureAt++) {
    const target = populated ? source() : new MemoryStorage();
    if (populated) {
      target.data.set(SAVE_KEY, '{ original corrupt save, retained byte for byte }');
      target.data.set(TOURNAMENT_KEY, '{ original corrupt cup }'); target.data.set(LINEUP_KEY, '{ old lineup }');
      target.data.set(DAILY_CHALLENGE_KEY, '{ old daily }'); target.data.set(TUTORIAL_COMPLETED_KEY, '{ old tutorial }');
    }
    target.data.set('other-app.session', 'untouched'); const before = sortedData(target);
    let writes = 0; const originalSet = target.setItem.bind(target);
    target.setItem = (key, value) => { if (++writes === failureAt) throw new Error('secret data in a quota exception'); originalSet(key, value); };
    const result = importProfile(text, target);
    assert.deepEqual(result, { ok: false, code: 'storage_write_failed' }, `write ${failureAt}, populated ${populated}`);
    assert.deepEqual(sortedData(target), before);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});

test('throw-after-write, failed removals and silent write failures are verified and rolled back', () => {
  const target = source(); const before = sortedData(target); let once = true;
  const set = target.setItem.bind(target); target.setItem = (key, value) => { set(key, value); if (once) { once = false; throw new Error('post mutation'); } };
  assert.deepEqual(importProfile(backup().text, target), { ok: false, code: 'storage_write_failed' }); assert.deepEqual(sortedData(target), before);
  const removeTarget = source(); const removeBefore = sortedData(removeTarget); const remove = removeTarget.removeItem.bind(removeTarget); once = true;
  removeTarget.removeItem = key => { remove(key); if (once) { once = false; throw new Error('remove failed after mutation'); } };
  assert.deepEqual(importProfile(backup(new MemoryStorage()).text, removeTarget), { ok: false, code: 'storage_write_failed' }); assert.deepEqual(sortedData(removeTarget), removeBefore);
  const silent = new MemoryStorage(); silent.setItem = () => {};
  assert.deepEqual(importProfile(backup().text, silent), { ok: false, code: 'storage_write_failed' }); assert.equal(silent.data.size, 0);
});

test('persistent failures report incomplete rollback honestly while continuing other restorations', () => {
  const target = new MemoryStorage(); const set = target.setItem.bind(target); let count = 0;
  target.setItem = (key, value) => { count++; if (count >= 3) throw new Error('storage locked'); set(key, value); };
  target.removeItem = () => { throw new Error('storage locked'); };
  assert.deepEqual(importProfile(backup().text, target), { ok: false, code: 'rollback_failed' });
  assert.equal(target.data.size, 2);
});

test('read failures, denied localStorage and absent storage return stable errors without exposing raw exceptions', () => {
  const text = backup().text; const target = new MemoryStorage(); target.getItem = () => { throw new Error('sensitive detail'); };
  assert.deepEqual(exportProfile(target), { ok: false, code: 'storage_read_failed' });
  assert.deepEqual(importProfile(text, target), { ok: false, code: 'storage_read_failed' }); assert.equal(target.mutations.length, 0);
  assert.deepEqual(exportProfile(null), { ok: false, code: 'storage_unavailable' });
  assert.deepEqual(importProfile(text, null), { ok: false, code: 'storage_unavailable' });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    assert.deepEqual(exportProfile(), { ok: false, code: 'storage_unavailable' });
    assert.deepEqual(importProfile(text), { ok: false, code: 'storage_unavailable' });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
    assert.deepEqual(exportProfile(), { ok: false, code: 'storage_unavailable' });
    assert.deepEqual(importProfile(text), { ok: false, code: 'storage_unavailable' });
  } finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete (globalThis as { localStorage?: unknown }).localStorage; }
  for (const messages of Object.values(PROFILE_ERROR_MESSAGES)) assert.ok(messages.zh && messages.en);
});

test('export can recover validated career and cup backups without changing the originals', () => {
  const storage = source(); storage.data.set(`${SAVE_KEY}.backup`, storage.getItem(SAVE_KEY)!); storage.data.set(`${TOURNAMENT_KEY}.backup`, storage.getItem(TOURNAMENT_KEY)!);
  storage.data.set(SAVE_KEY, '{bad'); storage.data.set(TOURNAMENT_KEY, '{bad'); const before = sortedData(storage);
  const result = backup(storage); assert.deepEqual(result.warnings, ['save_recovered_from_backup', 'tournament_recovered_from_backup']);
  assert.equal(result.summary.games, 8); assert.equal(result.summary.tournamentRound, 2); assert.deepEqual(sortedData(storage), before);
  storage.data.delete(`${TOURNAMENT_KEY}.backup`); assert.deepEqual(exportProfile(storage), { ok: false, code: 'invalid_tournament' });
  storage.data.delete(`${SAVE_KEY}.backup`); assert.deepEqual(exportProfile(storage), { ok: false, code: 'invalid_save' });
});
