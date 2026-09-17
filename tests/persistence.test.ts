import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS, getTeam } from '../src/data';
import { SAVE_KEY, defaultSave, loadSave, normalizeSave, recordChampionship, recordMatch, saveProgress, updateSettings } from '../src/persistence';
import type { GameState, PlayerStats } from '../src/types';

const stat = (overrides: Partial<PlayerStats> = {}): PlayerStats => ({ points: 0, assists: 0, rebounds: 0, steals: 0, blocks: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, turnovers: 0, ...overrides });
function match(seed = 1): GameState {
  const home = getTeam('lal'); const away = getTeam('bos');
  return {
    config: { home, away, mode: 'exhibition', difficulty: 'pro', quarterLength: 60, quarters: 4, playersPerTeam: 3, seed },
    players: [
      { id: 0, side: 0, slot: 0, athlete: home.players[0], x: 0, z: 0, vx: 0, vz: 0, facing: 0, stamina: 1, jump: 0, action: 'idle', actionTime: 0, cooldown: 0, stats: stat({ points: 18, assists: 4, rebounds: 5, steals: 2, tpm: 4 }) },
      { id: 1, side: 0, slot: 1, athlete: home.players[1], x: 0, z: 0, vx: 0, vz: 0, facing: 0, stamina: 1, jump: 0, action: 'idle', actionTime: 0, cooldown: 0, stats: stat({ points: 12, assists: 2, rebounds: 3, steals: 1, tpm: 2 }) },
      { id: 5, side: 1, slot: 0, athlete: away.players[0], x: 0, z: 0, vx: 0, vz: 0, facing: 0, stamina: 1, jump: 0, action: 'idle', actionTime: 0, cooldown: 0, stats: stat({ points: 20, assists: 8, steals: 5, tpm: 3 }) },
    ],
    ball: { x: 0, y: 1, z: 0, owner: null, state: 'dead', progress: 0, startX: 0, startZ: 0, startY: 1, endX: 0, endZ: 0, endY: 1, duration: 1, arc: 1 },
    score: [30, 20], quarter: 4, clock: 0, shotClock: 0, possession: 0, controlled: 0, phase: 'finished', phaseTime: 0, elapsed: 240,
    charging: false, charge: 0, shotFeedback: null, events: [], momentum: [0, 0], winner: 0, lastScorer: 0,
  };
}

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

test('fresh saves default to Chinese and do not share mutable references', () => {
  const a = defaultSave(); const b = defaultSave();
  assert.equal(a.settings.locale, 'zh'); assert.equal(a.settings.quarterLength, 60);
  a.achievements.push('first_win'); a.settings.locale = 'en';
  assert.deepEqual(b.achievements, []); assert.equal(b.settings.locale, 'zh');
});

test('schema validation repairs malformed numeric, enum and nested values', () => {
  const save = normalizeSave({
    settings: { locale: 'xx', volume: Infinity, quarterLength: -99, music: 'false', camera: 'bad', quality: null },
    career: { games: -10, wins: 'infinite', points: 5.9, steals: Infinity },
    favoriteTeam: '<script>', achievements: ['first_win', 'first_win', '<script>', null], history: [null, {}, 'x'],
    challengeBests: JSON.parse('{"__proto__":123,"constructor":999,"score-pro":40,"bad key":4}'),
  });
  assert.equal(save.settings.locale, 'zh'); assert.equal(save.settings.volume, 0.55);
  assert.equal(save.settings.quarterLength, 30); assert.equal(save.settings.music, true);
  assert.equal(save.career.games, 0); assert.equal(save.career.points, 5); assert.equal(save.career.steals, 0);
  assert.equal(save.favoriteTeam, 'lal'); assert.deepEqual(save.achievements, ['first_win']);
  assert.deepEqual(save.history, []); assert.deepEqual(save.challengeBests, { 'score-pro': 40 });
});

test('completed match credits only the human team, unlocks achievements once and cannot duplicate', () => {
  const save = defaultSave(); const state = match();
  const first = recordMatch(save, state);
  assert.deepEqual(first, ['first_win', 'thirty_points', 'clean_game']);
  assert.equal(save.career.games, 1); assert.equal(save.career.wins, 1); assert.equal(save.career.losses, 0);
  assert.equal(save.career.points, 30); assert.equal(save.career.assists, 6); assert.equal(save.career.threes, 6); assert.equal(save.career.steals, 3);
  assert.equal(save.history[0].rebounds, 8);
  assert.deepEqual(recordMatch(save, state), []); assert.equal(save.career.games, 1);
});

test('unfinished games and free practice do not change progression', () => {
  const save = defaultSave(); const state = match();
  state.phase = 'playing'; assert.deepEqual(recordMatch(save, state), []);
  state.phase = 'finished'; state.config.mode = 'practice'; assert.deepEqual(recordMatch(save, state), []);
  assert.deepEqual(save, defaultSave());
});

test('challenges have independent best scores and never inflate career wins or achievements', () => {
  const save = defaultSave(); const state = match(); state.config.mode = 'challenge';
  assert.deepEqual(recordMatch(save, state), []);
  assert.deepEqual(save.career, defaultSave().career);
  assert.equal(save.challengeBests['score-pro'], 30);
  const lower = match(2); lower.config.mode = 'challenge'; lower.score = [24, 10]; recordMatch(save, lower);
  assert.equal(save.challengeBests['score-pro'], 30); assert.equal(save.history.length, 2);
});

test('losses, all-star wins and championships are tracked separately', () => {
  const save = defaultSave(); const lost = match(); lost.winner = 1; lost.score = [20, 30];
  recordMatch(save, lost); assert.equal(save.career.losses, 1); assert.equal(save.career.wins, 0);
  const final = match(2); final.config.mode = 'championship'; final.config.difficulty = 'allstar';
  assert.ok(recordMatch(save, final).includes('allstar_win')); assert.equal(save.career.championships, 0);
  assert.deepEqual(recordChampionship(save), ['champion']); assert.equal(save.career.championships, 1);
  assert.deepEqual(recordChampionship(save), []); assert.equal(save.career.championships, 2);
});

test('history remains capped at 50 without truncating lifetime career totals', () => {
  const save = defaultSave();
  for (let seed = 1; seed <= 65; seed++) recordMatch(save, match(seed));
  assert.equal(save.history.length, 50); assert.equal(save.career.games, 65); assert.equal(save.career.points, 1950);
  assert.ok(save.history[0].id.startsWith('65-')); assert.ok(save.history[49].id.startsWith('16-'));
  assert.ok(save.achievements.includes('ten_wins')); assert.ok(save.achievements.includes('sharpshooter'));
});

test('local multiplayer earns shared match achievements but cannot earn an all-star AI victory', () => {
  const save = defaultSave(); const multiplayer = match();
  multiplayer.config.difficulty = 'allstar'; multiplayer.config.localMultiplayer = true;
  const unlocked = recordMatch(save, multiplayer);
  assert.deepEqual(unlocked, ['first_win', 'thirty_points', 'clean_game']);
  assert.equal(save.career.wins, 1); assert.equal(save.career.points, 30);
  assert.equal(save.achievements.includes('allstar_win'), false);
  const singlePlayer = match(2); singlePlayer.config.difficulty = 'allstar'; singlePlayer.config.localMultiplayer = false;
  assert.ok(recordMatch(save, singlePlayer).includes('allstar_win'));
  assert.equal(save.career.wins, 2);
});

test('the league tour remembers lifetime team participation beyond the fifty-game history', () => {
  let save = defaultSave();
  for (let index = 0; index < 9; index++) { const game = match(index + 1); game.config.home = TEAMS[index]; recordMatch(save, game); }
  for (let index = 10; index < 70; index++) { const game = match(index); game.config.home = TEAMS[0]; recordMatch(save, game); }
  assert.equal(new Set(save.history.map(game => game.home)).size, 1);
  assert.equal(save.playedTeams?.length, 9);
  save = normalizeSave(JSON.parse(JSON.stringify(save)));
  const tenth = match(70); tenth.config.home = TEAMS[9];
  assert.ok(recordMatch(save, tenth).includes('world_tour'));
  assert.equal(save.playedTeams?.length, 10);
});

test('legacy saves infer played teams from valid matches and discard malformed participation', () => {
  const save = defaultSave(); recordMatch(save, match());
  delete save.playedTeams;
  assert.deepEqual(normalizeSave(save).playedTeams, ['lal']);
  assert.deepEqual(normalizeSave({ ...save, playedTeams: ['bos', 'bos', '__proto__', 5] }).playedTeams, ['bos', 'lal']);
});

test('storage round-trips settings, recovers a corrupted primary from backup and survives denial', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    const save = defaultSave(); save.settings.locale = 'en'; saveProgress(save);
    assert.equal(loadSave().settings.locale, 'en');
    save.career.wins = 3; saveProgress(save);
    storage.setItem(SAVE_KEY, '{broken');
    assert.equal(loadSave().career.wins, 0); assert.equal(loadSave().settings.locale, 'en');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    save.career.wins = 7; assert.doesNotThrow(() => saveProgress(save));
    assert.equal(loadSave().career.wins, 7);
    updateSettings(save, { volume: 5, locale: 'zh' });
    assert.equal(loadSave().settings.volume, 1); assert.equal(loadSave().settings.locale, 'zh');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
