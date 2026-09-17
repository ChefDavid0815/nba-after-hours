import test from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_CHALLENGE_KEY, challengeAthlete, evaluateChallenge, getChallengeById, getDailyChallenges, getLocalDay, loadDailyProgress, normalizeChallengeMetrics, normalizeChallengeProgress, recordChallengeResult } from '../src/challenges';
import type { ChallengeMetrics } from '../src/challenges';
import { getTeam } from '../src/data';

const today = new Date(2026, 8, 17, 12);
const definitions = () => getDailyChallenges(today);
function withStorage(run: (data: Map<string, string>) => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) } });
  try { run(data); }
  finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

test('the daily trio is deterministic for the local calendar day and changes across midnight', () => {
  const morning = getDailyChallenges(new Date(2026, 8, 17, 0, 1));
  const evening = getDailyChallenges(new Date(2026, 8, 17, 23, 59));
  assert.deepEqual(morning, evening);
  assert.equal(getLocalDay(today), '2026-09-17');
  assert.notDeepEqual(morning.map(item => item.seed), getDailyChallenges(new Date(2026, 8, 18, 0, 1)).map(item => item.seed));
  assert.deepEqual(morning.map(item => item.kind), ['three', 'inside', 'allaround']);
  assert.equal(new Set(morning.map(item => item.seed)).size, 3);
  assert.equal(new Set(morning.map(item => item.id)).size, 3);
});

test('daily definitions always reference real, bilingual roster content and ordered medal thresholds', () => {
  const players = new Set<string>();
  for (let offset = 0; offset < 60; offset++) for (const definition of getDailyChallenges(new Date(2026, 8, 17 + offset, 12))) {
    assert.equal(definition.duration, 60);
    assert.ok(definition.name.zh && definition.name.en && definition.description.zh && definition.description.en);
    assert.ok(getTeam(definition.teamId).players[definition.playerIndex]);
    assert.ok(definition.medalThresholds.bronze < definition.medalThresholds.silver && definition.medalThresholds.silver < definition.medalThresholds.gold);
    assert.equal(definition.target, definition.medalThresholds.bronze);
    assert.deepEqual(getChallengeById(definition.id), definition);
    players.add(challengeAthlete(definition).name);
  }
  assert.ok(players.size >= 12);
});

test('only the intended basketball metrics count toward each objective', () => {
  const [three, inside, allaround] = definitions();
  assert.deepEqual(evaluateChallenge(three, { points: 100, threes: 5, paintPoints: 50 }), { score: 5, medal: 'bronze', completed: true });
  assert.deepEqual(evaluateChallenge(inside, { points: 100, threes: 9, paintPoints: 0 }), { score: 0, medal: 'none', completed: false });
  assert.deepEqual(evaluateChallenge(inside, { paintPoints: 14 }), { score: 14, medal: 'silver', completed: true });
  assert.deepEqual(evaluateChallenge(allaround, { points: 10, assists: 2, steals: 1, blocks: 2, rebounds: 3 }), { score: 23, medal: 'silver', completed: true });
  for (const definition of definitions()) {
    const key: keyof ChallengeMetrics = definition.kind === 'three' ? 'threes' : definition.kind === 'inside' ? 'paintPoints' : 'points';
    for (const medal of ['bronze', 'silver', 'gold'] as const) assert.equal(evaluateChallenge(definition, { [key]: definition.medalThresholds[medal] }).medal, medal);
  }
});

test('invalid dates, malformed metrics and forged definitions are handled safely', () => {
  for (const id of ['2026-02-30-three', '2026-13-17-inside', '2026-00-00-three', 'not-a-date', '__proto__', '2026-09-17-fake']) assert.equal(getChallengeById(id), null);
  assert.ok(getChallengeById('2028-02-29-three'));
  assert.deepEqual(normalizeChallengeMetrics({ points: -1, threes: Infinity, assists: '100', paintPoints: 5.9, steals: NaN }), { points: 0, threes: 0, assists: 0, paintPoints: 5, rebounds: 0, steals: 0, blocks: 0 });
  assert.ok(getDailyChallenges(new Date(NaN)).length === 3);
  withStorage(data => {
    assert.throws(() => recordChallengeResult({ ...definitions()[0], seed: -1 }, { threes: 99 }));
    assert.equal(data.size, 0);
  });
});

test('personal bests and medals only improve while attempts and retry IDs remain accurate', () => withStorage(() => {
  const definition = definitions()[0];
  const first = recordChallengeResult(definition, { threes: 2 }, 'attempt-1');
  assert.equal(first.progress.score, 2); assert.equal(first.progress.attempts, 1); assert.equal(first.newMedal, false);
  const gold = recordChallengeResult(definition, { threes: 9 }, 'attempt-2');
  assert.equal(gold.progress.medal, 'gold'); assert.equal(gold.newMedal, true); assert.equal(gold.improved, true);
  const lower = recordChallengeResult(definition, { threes: 3 }, 'attempt-3');
  assert.equal(lower.progress.score, 9); assert.equal(lower.progress.attempts, 3); assert.equal(lower.improved, false); assert.equal(lower.newMedal, false);
  const retry = recordChallengeResult(definition, { threes: 9 }, 'attempt-2');
  assert.equal(retry.progress.attempts, 3); assert.equal(retry.improved, false);
  const saved = loadDailyProgress(definition.day); saved.entries[0].bestMetrics.threes = 999; saved.entries[0].recentRunIds.push('mutated');
  assert.equal(loadDailyProgress(definition.day).entries[0].bestMetrics.threes, 9);
  assert.equal(loadDailyProgress(definition.day).entries[0].recentRunIds.includes('mutated'), false);
}));

test('the three daily tasks count independently and yesterday runs can finish after midnight', () => withStorage(() => {
  const [three, inside, allaround] = definitions();
  recordChallengeResult(three, { threes: 9 }); recordChallengeResult(inside, { paintPoints: 14 }); recordChallengeResult(allaround, { points: 28 });
  const progress = loadDailyProgress(three.day);
  assert.equal(progress.entries.length, 3); assert.equal(progress.completed, 3); assert.equal(progress.goldMedals, 2);
  assert.equal(loadDailyProgress('2026-09-18').entries.length, 0);
  const yesterday = getDailyChallenges(new Date(2026, 8, 16, 23, 59))[0]; recordChallengeResult(yesterday, { threes: 6 });
  assert.equal(loadDailyProgress(yesterday.day).entries[0].medal, 'silver');
  assert.equal(loadDailyProgress(three.day).completed, 3);
}));

test('loaded medals and scores are recomputed, malformed entries discarded and ninety days retained', () => {
  const entries: unknown[] = [];
  for (let day = 0; day < 100; day++) for (const definition of getDailyChallenges(new Date(2026, 5, 1 + day, 12))) {
    entries.push({ id: definition.id, day: definition.day, kind: definition.kind, score: 9999999, medal: 'gold', completed: true, attempts: -4, bestMetrics: { threes: 3 }, updatedAt: 'bad', recentRunIds: ['run', 'run', '<script>'] });
  }
  entries.push(null, {}, { id: '__proto__' });
  const clean = normalizeChallengeProgress({ version: 1, entries });
  assert.equal(clean.length, 270); assert.equal(new Set(clean.map(entry => entry.day)).size, 90);
  for (const entry of clean) {
    assert.equal(entry.score, entry.kind === 'three' ? 3 : 0);
    assert.equal(entry.medal, entry.kind === 'three' ? 'bronze' : 'none');
    assert.equal(entry.attempts, 1); assert.deepEqual(entry.recentRunIds, ['run']);
    assert.ok(Number.isFinite(Date.parse(entry.updatedAt)));
  }
});

test('daily records survive blocked storage and a corrupted JSON value without crashing', () => withStorage(data => {
  const definition = definitions()[0]; recordChallengeResult(definition, { threes: 6 }, 'valid');
  data.set(DAILY_CHALLENGE_KEY, '{broken');
  assert.equal(loadDailyProgress(definition.day).entries[0].score, 6);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  assert.doesNotThrow(() => recordChallengeResult(definition, { threes: 10 }, 'private-mode'));
  assert.equal(loadDailyProgress(definition.day).entries[0].score, 10);
}));
