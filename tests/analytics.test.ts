import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchAnalytics } from '../src/analytics';
import { getTeam } from '../src/data';
import { getLineup } from '../src/roster';
import { createSimulation } from '../src/simulation';
import { EMPTY_INPUT, type GameConfig, type GameEvent, type InputFrame } from '../src/types';

const dt = 1 / 60;
const input = (value: Partial<InputFrame> = {}): InputFrame => ({ ...EMPTY_INPUT, ...value });
function fixture(overrides: Partial<GameConfig> = {}) {
  const sim = createSimulation({ home: getLineup(getTeam('gsw')), away: getLineup(getTeam('lal')), mode: 'practice', difficulty: 'pro', quarterLength: 60, quarters: 4, playersPerTeam: 1, seed: 42, ...overrides });
  const analytics = createMatchAnalytics(); const events: GameEvent[] = [];
  const step = (home: Partial<InputFrame> = {}, away: Partial<InputFrame> = {}) => {
    sim.update(dt, input(home), input(away)); const fresh = sim.drainEvents();
    analytics.record(sim.state, fresh); events.push(...fresh); return fresh;
  };
  const advance = (seconds: number, home: Partial<InputFrame> = {}, away: Partial<InputFrame> = {}) => {
    for (let frame = 0; frame < Math.round(seconds / dt); frame++) step(home, away);
  };
  advance(1.5);
  const shoot = (seconds = 0.7, side = 0) => {
    advance(seconds, side === 0 ? { shootHeld: true } : {}, side === 1 ? { shootHeld: true } : {});
    return step(side === 0 ? { shootReleased: true } : {}, side === 1 ? { shootReleased: true } : {});
  };
  return { sim, analytics, events, step, advance, shoot };
}

test('real green-release flight remains pending until its score event and captures exact feedback', () => {
  const game = fixture(); game.sim.state.players[0].x = 5; game.sim.state.players[0].z = -0.4;
  game.shoot(); const pending = game.analytics.snapshot(); const ball = game.sim.state.ball;
  assert.equal(pending.shots.length, 1); assert.equal(pending.shots[0].result, 'pending');
  assert.equal(pending.shots[0].x, ball.startX); assert.equal(pending.shots[0].z, ball.startZ);
  assert.equal(pending.shots[0].points, 3); assert.equal(pending.shots[0].kind, 'shot');
  assert.equal(pending.shots[0].playerName, 'Stephen Curry');
  for (const key of ['quality', 'contest', 'timing', 'perfect'] as const) assert.equal(pending.shots[0][key], game.sim.state.shotFeedback![key]);
  assert.equal(pending.shots[0].perfect, true); assert.equal(pending.shots[0].resolvedAt, null);
  // The simulation may already hold a predetermined random outcome; analytics must wait for the event.
  assert.equal(game.events.some(event => event.type === 'score'), false);
  const frozen = JSON.stringify(pending); game.advance(1.6);
  const finished = game.analytics.snapshot(); assert.equal(finished.shots[0].result, 'made');
  assert.deepEqual(finished.score, [3, 0]); assert.deepEqual(finished.quarters, [{ quarter: 1, score: [3, 0] }]);
  assert.equal(JSON.stringify(pending), frozen); assert.equal(pending.shots[0].result, 'pending');
});

test('natural misses and dunk-only launch events resolve without fabricated extra attempts', () => {
  const miss = fixture({ seed: 1 }); miss.sim.state.players[0].x = -11; miss.shoot(0.1); miss.advance(2.5);
  assert.ok(miss.events.some(event => event.type === 'miss'));
  assert.equal(miss.analytics.snapshot().shots[0].result, 'missed'); assert.deepEqual(miss.analytics.snapshot().score, [0, 0]);
  const dunk = fixture(); dunk.sim.state.players[0].x = 11.1; dunk.shoot(); dunk.advance(0.6);
  assert.equal(dunk.events.filter(event => event.type === 'dunk').length, 1);
  assert.equal(dunk.events.filter(event => event.type === 'shot').length, 0);
  const result = dunk.analytics.snapshot(); assert.equal(result.shots.length, 1);
  assert.equal(result.shots[0].kind, 'dunk'); assert.equal(result.shots[0].points, 2); assert.equal(result.shots[0].result, 'made');
  assert.deepEqual(result.maxLead, [2, 0]); assert.deepEqual(result.maxRun, [2, 0]);
});

test('real last-second baskets belong to the releasing period even when score and quarter arrive together', () => {
  const game = fixture({ mode: 'exhibition', localMultiplayer: true, playersPerTeam: 1, quarters: 2 });
  game.sim.state.players[0].x = 11.1; game.sim.state.players[1].x = -10; game.sim.state.players[1].z = 6;
  game.sim.state.clock = 0.78; game.shoot(); game.advance(0.6);
  assert.equal(game.sim.state.quarter, 2); assert.equal(game.sim.state.phase, 'halftime');
  const result = game.analytics.snapshot();
  assert.equal(result.shots[0].quarter, 1); assert.equal(result.shots[0].result, 'made');
  assert.deepEqual(result.quarters, [{ quarter: 1, score: [2, 0] }, { quarter: 2, score: [0, 0] }]);
  const order = game.events.filter(event => ['score', 'buzzer', 'quarter'].includes(event.type)).map(event => event.type);
  assert.deepEqual(order, ['score', 'buzzer', 'quarter']);
});

test('actual timed blocks attach to the shooter and do not require a miss event', () => {
  let verified = 0;
  for (let seed = 1; seed <= 10 && verified < 3; seed++) {
    const game = fixture({ mode: 'exhibition', localMultiplayer: true, playersPerTeam: 1, seed });
    const [shooter, defender] = game.sim.state.players;
    shooter.x = 8.5; shooter.z = 0; defender.x = -10; defender.z = 6;
    // Begin with a genuine charged release, then time a nearby defender's normal block input.
    game.shoot(); defender.x = 9.0; defender.z = 0; defender.cooldown = 0;
    game.step({}, { blockPressed: true }); game.advance(0.22);
    const block = game.events.find(event => event.type === 'block');
    if (!block) continue;
    verified++; const result = game.analytics.snapshot();
    assert.equal(result.shots.length, 1); assert.equal(result.shots[0].result, 'blocked');
    assert.equal(result.shots[0].player, shooter.id); assert.equal(result.shots[0].blockedBy, defender.id);
    assert.equal(game.events.some(event => event.type === 'miss'), false); assert.equal(defender.stats.blocks, 1);
    assert.deepEqual(result.score, [0, 0]);
  }
  assert.equal(verified, 3, 'at least three seeded, physically resolved blocks must exercise the event chain');
});

test('a complete real game matches field-goal statistics, period points and event-derived lead/run totals', () => {
  const game = fixture({ mode: 'exhibition', playersPerTeam: 3, quarterLength: 12, quarters: 2, seed: 7 });
  let expectedScore = [0, 0], expectedLead = [0, 0], expectedRun = [0, 0], runSide = -1, runPoints = 0;
  // Normal inputs keep the user active while the other five players continue using their real AI.
  for (let tick = 0; tick < 60 * 200 && game.sim.state.phase !== 'finished'; tick++) {
    const state = game.sim.state; const player = state.players.find(player => player.id === state.controlled)!;
    const home: Partial<InputFrame> = state.ball.owner === player.id
      ? state.charging ? { shootHeld: state.charge < 0.69, shootReleased: state.charge >= 0.69 }
        : { moveX: player.x < 9 ? 1 : 0, moveZ: -player.z * 0.4, shootHeld: player.x >= 9 }
      : { moveX: Math.sign(state.ball.x - player.x), moveZ: Math.sign(state.ball.z - player.z) };
    for (const event of game.step(home)) if (event.type === 'score' && event.side !== undefined) {
      const side = event.side; const points = event.value!; expectedScore[side] += points;
      expectedLead[0] = Math.max(expectedLead[0], expectedScore[0] - expectedScore[1]);
      expectedLead[1] = Math.max(expectedLead[1], expectedScore[1] - expectedScore[0]);
      runPoints = runSide === side ? runPoints + points : points; runSide = side; expectedRun[side] = Math.max(expectedRun[side], runPoints);
    }
  }
  assert.equal(game.sim.state.phase, 'finished');
  const result = game.analytics.snapshot();
  assert.ok(result.shots.length > 1); assert.deepEqual(result.score, game.sim.state.score);
  assert.deepEqual(result.maxLead, expectedLead); assert.deepEqual(result.maxRun, expectedRun);
  assert.deepEqual(result.untrackedPoints, [0, 0]);
  assert.equal(result.shots.length, game.sim.state.players.reduce((sum, player) => sum + player.stats.fga, 0));
  for (const side of [0, 1] as const) {
    assert.equal(result.shots.filter(shot => shot.side === side && shot.result === 'made').length, game.sim.state.players.filter(player => player.side === side).reduce((sum, player) => sum + player.stats.fgm, 0));
    assert.equal(result.quarters.reduce((sum, period) => sum + period.score[side], 0), result.score[side]);
  }
  assert.equal(result.shots.some(shot => shot.side === 1), true);
  for (const shot of result.shots.filter(shot => shot.side === 1)) {
    assert.equal(shot.quality, null); assert.equal(shot.contest, null); assert.equal(shot.timing, null); assert.equal(shot.perfect, null);
  }
});

test('P2 human launches capture their own release measurements', () => {
  const game = fixture({ mode: 'exhibition', localMultiplayer: true, playersPerTeam: 1 });
  const [home, away] = game.sim.state.players;
  home.x = 11.1; away.x = -10; away.z = 6; game.shoot(); game.advance(1.8);
  assert.equal(game.sim.state.possession, 1); assert.equal(game.sim.state.ball.owner, away.id);
  home.x = 10; home.z = 6; away.x = -5; away.z = 0;
  game.shoot(0.7, 1);
  const shot = game.analytics.snapshot().shots.at(-1)!;
  assert.equal(shot.side, 1); assert.equal(shot.player, away.id); assert.equal(shot.x, game.sim.state.ball.startX);
  assert.equal(shot.timing, game.sim.state.shotFeedback?.timing); assert.equal(shot.perfect, true);
});

test('duplicate event deliveries are idempotent and snapshots share no mutable arrays', () => {
  const game = fixture(); game.shoot(); game.advance(1.7);
  const result = game.analytics.snapshot(); const bytes = JSON.stringify(result);
  game.analytics.record(game.sim.state, [...game.events, ...game.events]); game.analytics.record(game.sim.state, game.events);
  assert.equal(JSON.stringify(game.analytics.snapshot()), bytes);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.shots[0]) && Object.isFrozen(result.quarters[0].score));
  assert.throws(() => { (result.shots as unknown as { x: number }[])[0].x = 100; }, TypeError);
  game.analytics.reset(); assert.deepEqual(game.analytics.snapshot().shots, []); assert.deepEqual(game.analytics.snapshot().score, [0, 0]);
  assert.equal(JSON.stringify(result), bytes);
  const next = fixture(); next.shoot(); next.advance(1.7);
  // Resetting also resets event de-duplication, allowing another game's ids to begin at one.
  game.analytics.record(next.sim.state, next.events); assert.equal(game.analytics.snapshot().shots.length, 1);
});

test('delayed batches leave lost launch coordinates unknown and missing results stay pending', () => {
  const sim = createSimulation({ home: getLineup(getTeam('gsw')), away: getLineup(getTeam('lal')), mode: 'practice', difficulty: 'pro', quarterLength: 60, quarters: 1, playersPerTeam: 1, seed: 42 });
  const analytics = createMatchAnalytics(); const all: GameEvent[] = [];
  const advance = (seconds: number, controls: Partial<InputFrame> = {}) => {
    for (let tick = 0; tick < Math.round(seconds / dt); tick++) { sim.update(dt, input(controls)); all.push(...sim.drainEvents()); }
  };
  advance(1.5); advance(0.7, { shootHeld: true }); advance(dt, { shootReleased: true }); advance(2);
  sim.state.players[0].x = 11.1;
  advance(0.7, { shootHeld: true }); advance(dt, { shootReleased: true });
  const secondLaunch = all.findLast(event => event.type === 'dunk')!;
  analytics.record(sim.state, all);
  let result = analytics.snapshot();
  assert.equal(result.shots.length, 2); assert.equal(result.shots[0].x, null); assert.equal(result.shots[0].quality, null); assert.equal(result.shots[0].clock, null);
  assert.equal(result.shots[1].x, sim.state.ball.startX); assert.equal(result.shots[1].eventId, secondLaunch.id);
  assert.equal(result.shots[0].result, 'made'); assert.equal(result.shots[1].result, 'pending');
  advance(0.6); analytics.record(sim.state, []); result = analytics.snapshot();
  assert.equal(result.shots[1].result, 'pending', 'a changed scoreboard alone cannot resolve an unobserved shot');
  assert.deepEqual(result.untrackedPoints, [2, 0]); assert.equal(result.currentRun, null);
});

test('restoring a real in-flight snapshot preserves the earlier chart and resolves the pending basket once', () => {
  const game = fixture(); game.sim.state.players[0].x = 5; game.shoot(); game.advance(1.7);
  game.sim.state.players[0].x = 11.1; game.shoot();
  const saved = JSON.parse(JSON.stringify(game.analytics.snapshot())); const resumed = createMatchAnalytics();
  assert.equal(saved.shots.length, 2); assert.equal(saved.shots[1].result, 'pending');
  assert.equal(resumed.restore(saved), true); assert.deepEqual(resumed.snapshot(), game.analytics.snapshot());
  // Re-delivering pre-save events cannot count an earlier score or launch twice.
  resumed.record(game.sim.state, game.events); assert.deepEqual(resumed.snapshot(), game.analytics.snapshot());
  saved.shots[0].x = -99; saved.quarters[0].score[0] = 999;
  assert.notEqual(resumed.snapshot().shots[0].x, -99);
  for (let tick = 0; tick < 60; tick++) { const fresh = game.step(); resumed.record(game.sim.state, fresh); }
  assert.deepEqual(resumed.snapshot(), game.analytics.snapshot());
  assert.equal(resumed.snapshot().shots[1].result, 'made'); assert.deepEqual(resumed.snapshot().score, [5, 0]);
  assert.deepEqual(resumed.snapshot().maxRun, [5, 0]);
});

test('legacy snapshots without an event watermark resume pending shots and reset clears the restored watermark', () => {
  const game = fixture(); game.shoot(); const legacy = JSON.parse(JSON.stringify(game.analytics.snapshot())); delete legacy.lastEventId;
  const resumed = createMatchAnalytics(); assert.equal(resumed.restore(legacy), true);
  for (let tick = 0; tick < 100; tick++) { const fresh = game.step(); resumed.record(game.sim.state, fresh); }
  assert.deepEqual(resumed.snapshot(), game.analytics.snapshot());
  resumed.reset(); const next = fixture(); next.shoot();
  resumed.record(next.sim.state, next.events); assert.equal(resumed.snapshot().shots.length, 1);
  assert.equal(createMatchAnalytics().restore(createMatchAnalytics().snapshot()), true);
});

test('invalid restores are atomic and reject bad score, shot, run, event and period structures', () => {
  const game = fixture(); game.shoot(); game.advance(1.7);
  const original = game.analytics.snapshot(), bytes = JSON.stringify(original);
  const mutations: ((snapshot: any) => void)[] = [
    snapshot => { snapshot.shots[0].x = Infinity; },
    snapshot => { snapshot.shots[0].result = 'predicted'; },
    snapshot => { snapshot.shots[0].resolvedAt = -1; },
    snapshot => { snapshot.shots.push(snapshot.shots[0]); },
    snapshot => { snapshot.quarters[0].score[0] += 2; },
    snapshot => { snapshot.maxLead[0] = 999; },
    snapshot => { snapshot.bestRuns[0].points += 1; },
    snapshot => { snapshot.currentRun.endScore[0] += 2; },
    snapshot => { snapshot.lastEventId = 0; },
    snapshot => { snapshot.constructor = {}; },
  ];
  for (const mutate of mutations) {
    const candidate = JSON.parse(bytes); mutate(candidate);
    assert.equal(game.analytics.restore(candidate), false); assert.equal(JSON.stringify(game.analytics.snapshot()), bytes);
  }
  for (const candidate of [null, [], {}, 'invalid']) {
    assert.equal(game.analytics.restore(candidate), false); assert.equal(JSON.stringify(game.analytics.snapshot()), bytes);
  }
});
