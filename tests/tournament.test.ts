import test from 'node:test';
import assert from 'node:assert/strict';
import { TOURNAMENT_KEY, advanceTournament, createTournament, getTournamentChampion, getTournamentMatch, loadTournament, normalizeTournament, saveTournament } from '../src/tournament';
import type { Tournament } from '../src/tournament';

const create = (seed = 1) => createTournament('lal', 'bos', 'pro', 60, 3, seed);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function assertBracketLinks(cup: Tournament) {
  for (let round = 0; round < 4; round++) {
    for (const [index, game] of cup.bracket[round].entries()) {
      if (game.score) assert.notEqual(game.score[0], game.score[1]);
      if (round > 0) {
        const prior = cup.bracket[round - 1];
        const previousWinner = (i: number) => prior[i].score ? prior[i].score![0] > prior[i].score![1] ? prior[i].homeId : prior[i].awayId : null;
        assert.equal(game.homeId, previousWinner(index * 2));
        assert.equal(game.awayId, previousWinner(index * 2 + 1));
      }
    }
  }
}

test('sixteen unique teams form a seeded 8/4/2/1 bracket with the chosen first opponent', () => {
  const cup = create();
  assert.equal(cup.teams.length, 16); assert.equal(new Set(cup.teams).size, 16);
  assert.deepEqual(cup.bracket.map(round => round.length), [8, 4, 2, 1]);
  assert.equal(cup.bracket.flat().filter(game => game.homeId && game.awayId).length, 8);
  assert.equal(getTournamentMatch(cup)?.homeId, 'lal'); assert.equal(getTournamentMatch(cup)?.awayId, 'bos');
  assert.deepEqual(create().teams, cup.teams);
  assert.notDeepEqual(create(2).teams, cup.teams);
  assert.deepEqual(normalizeTournament(clone(cup)), cup);
});

test('invalid input choices are safely normalized without duplicate participants', () => {
  const cup = createTournament('missing', 'lal', 'bad' as any, Infinity, 400, NaN);
  assert.equal(cup.userTeamId, 'lal'); assert.notEqual(getTournamentMatch(cup)?.awayId, 'lal');
  assert.equal(cup.config.quarterLength, 60); assert.equal(cup.config.difficulty, 'pro'); assert.equal(cup.config.playersPerTeam, 3);
  assert.ok(normalizeTournament(cup));
});

test('human scoring is correctly mapped from either bracket side for every route', () => {
  let foundHome = false; let foundAway = false;
  for (let seed = 0; seed < 80; seed++) {
    const cup = create(seed);
    for (let round = 1; round <= 4; round++) {
      const fixture = getTournamentMatch(cup)!;
      assert.equal(fixture.round, round); assert.equal(fixture.homeId, 'lal');
      const actual = cup.bracket[round - 1].find(game => game.id === fixture.matchId)!;
      const userHome = actual.homeId === 'lal'; foundHome ||= userHome; foundAway ||= !userHome;
      const result = advanceTournament(cup, [35 + round, 19], fixture.matchId);
      assert.deepEqual(actual.score, userHome ? [35 + round, 19] : [19, 35 + round]);
      assert.equal(result.champion, round === 4); assert.equal(result.eliminated, false);
      assert.ok(cup.bracket[round - 1].every(game => game.score));
      assertBracketLinks(cup);
      assert.deepEqual(normalizeTournament(clone(cup)), cup);
    }
    assert.equal(getTournamentChampion(cup), 'lal'); assert.equal(getTournamentMatch(cup), null); assert.equal(cup.completed, true);
  }
  assert.ok(foundHome && foundAway, 'seed coverage must exercise both score orientations');
});

test('elimination in any round produces a complete, coherent bracket and the actual AI champion', () => {
  for (let exitRound = 1; exitRound <= 4; exitRound++) {
    const cup = create(exitRound);
    for (let round = 1; round < exitRound; round++) advanceTournament(cup, [27, 19]);
    assert.deepEqual(advanceTournament(cup, [12, 21]), { champion: false, eliminated: true });
    assert.equal(cup.round, exitRound); assert.equal(cup.completed, true); assert.equal(cup.eliminated, true);
    assert.equal(getTournamentMatch(cup), null); assert.notEqual(getTournamentChampion(cup), 'lal');
    assert.ok(cup.bracket.flat().every(game => game.score)); assertBracketLinks(cup);
    assert.deepEqual(normalizeTournament(clone(cup)), cup);
    const before = clone(cup); advanceTournament(cup, [99, 0]); assert.deepEqual(cup, before);
  }
});

test('retrying a completed fixture cannot accidentally play the next round', () => {
  const cup = create(); const fixture = getTournamentMatch(cup)!;
  advanceTournament(cup, [25, 21], fixture.matchId);
  const snapshot = clone(cup);
  advanceTournament(cup, [25, 21], fixture.matchId);
  assert.deepEqual(cup, snapshot); assert.equal(cup.round, 2);
});

test('tied, negative, non-integer and nonfinite results never mutate the bracket', () => {
  for (const score of [[0, 0], [20, 20], [-1, 3], [3.5, 1], [Infinity, 4], [4, NaN], [10000, 1]]) {
    const cup = create(); const before = clone(cup);
    assert.throws(() => advanceTournament(cup, score as [number, number]), RangeError);
    assert.deepEqual(cup, before);
  }
});

test('AI simulation stays deterministic across save/reload boundaries', () => {
  const first = create(1337); const second = normalizeTournament(clone(first))!;
  for (let round = 1; round <= 4; round++) {
    advanceTournament(first, [40, 27]); advanceTournament(second, [40, 27]);
    assert.deepEqual(first.bracket, second.bracket);
  }
});

test('a custom three-player lineup survives every round and is repaired if malformed', () => {
  const cup = create(); cup.config.homeLineup = [4, 3, 1];
  let restored = normalizeTournament(clone(cup))!;
  assert.deepEqual(restored.config.homeLineup, [4, 3, 1]);
  for (let round = 1; round <= 4; round++) {
    advanceTournament(restored, [30, 20]); restored = normalizeTournament(clone(restored))!;
    assert.deepEqual(restored.config.homeLineup, [4, 3, 1]);
  }
  cup.config.homeLineup = [4, 4, -99];
  assert.deepEqual(normalizeTournament(cup)?.config.homeLineup, [4, 0, 1]);
});

test('unsafe persisted brackets cannot replace entrants, invent winners or skip rounds', () => {
  const badCases: ((cup: any) => void)[] = [
    cup => { cup.teams[1] = cup.teams[0]; },
    cup => { cup.bracket[0][0].homeId = 'not-a-team'; },
    cup => { cup.bracket[0][0].score = [12, 12]; },
    cup => { cup.bracket[0][0].score = [12, 11]; },
    cup => { cup.bracket[1][0].homeId = 'lal'; cup.bracket[1][0].awayId = 'bos'; cup.bracket[1][0].score = [12, 11]; },
    cup => { cup.config.seed = -1; },
    cup => { cup.completed = true; },
    cup => { cup.round = 3; },
    cup => { cup.createdAt = 'not-a-date'; },
    cup => { cup.id = '<script>'; },
  ];
  for (const corrupt of badCases) { const cup = clone(create()); corrupt(cup); assert.equal(normalizeTournament(cup), null); }
  for (const input of [null, {}, [], 'bad', 0]) assert.equal(normalizeTournament(input), null);
});

test('saved cups restore, recover a backup, survive denied storage and can be explicitly cleared', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    const cup = create(); saveTournament(cup); assert.deepEqual(loadTournament(), cup);
    const priorRound = clone(cup); advanceTournament(cup, [30, 20]); saveTournament(cup);
    assert.deepEqual(loadTournament(), cup);
    data.set(TOURNAMENT_KEY, '{corrupt'); assert.deepEqual(loadTournament(), priorRound);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    assert.doesNotThrow(() => saveTournament(cup)); assert.deepEqual(loadTournament(), cup);
    saveTournament(null); assert.equal(loadTournament(), null);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    saveTournament(null); assert.equal(data.size, 0); assert.equal(loadTournament(), null);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
