import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, restoreSimulation, type CheckpointSimulation } from '../src/simulation.ts';
import { TEAMS } from '../src/data.ts';
import { getLineup } from '../src/roster.ts';
import { EMPTY_INPUT, type GameConfig, type InputFrame } from '../src/types.ts';
import { policy } from './balance-lab.ts';
import { createTacticsScenario } from './tactics-lab.ts';

const frame = (input: Partial<InputFrame> = {}): InputFrame => ({ ...EMPTY_INPUT, ...input });
function create(overrides: Partial<GameConfig> = {}) {
  return createSimulation({ home: getLineup(TEAMS[9]), away: getLineup(TEAMS[13]), mode: 'exhibition', difficulty: 'pro', quarterLength: 120, quarters: 4, playersPerTeam: 3, seed: 42,
    challengeKind: undefined, dailyChallengeId: undefined, ...overrides });
}
function advance(sim: CheckpointSimulation, seconds: number, input: InputFrame = EMPTY_INPUT, awayInput: InputFrame = EMPTY_INPUT) {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.update(1 / 60, input, awayInput);
}
function playing(overrides: Partial<GameConfig> = {}) { const sim = create(overrides); advance(sim, 1.5); return sim; }
function prepareOpenShot(sim: CheckpointSimulation) {
  Object.assign(sim.state.players[0], { x: 10.7, z: 0 });
  for (const p of sim.state.players.filter(p => p.side === 1)) Object.assign(p, { x: -12, z: p.slot * 2 });
}
function charge(sim: CheckpointSimulation, seconds = 0.7, side = 0) {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.update(1 / 60, side === 0 ? frame({ shootHeld: true, shootPressed: i === 0 }) : EMPTY_INPUT, side === 1 ? frame({ shootHeld: true, shootPressed: i === 0 }) : EMPTY_INPUT);
}
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Same real inputs for 7,200 frames; compare every state and every emitted event. */
function assertFutureEquivalent(original: CheckpointSimulation, seconds = 120) {
  const checkpoint = json(original.checkpoint());
  const restored = restoreSimulation(checkpoint);
  assert.ok(restored, `valid snapshot rejected: ${original.state.phase}/${original.state.ball.state}`);
  assert.deepEqual(restored.state, original.state, 'restored public state differs before the first input');
  assert.deepEqual(restored.checkpoint(), original.checkpoint(), 'restored closure state differs');
  for (let i = 0; i < seconds * 60; i++) {
    const input = policy('team-basketball', original.state);
    const awayInput = frame({ moveX: Math.sin(i / 123), moveZ: Math.cos(i / 171), sprint: i % 180 < 25, shootHeld: i % 210 < 42, shootPressed: i % 210 === 0, shootReleased: i % 210 === 42, passPressed: i % 370 === 300, switchPressed: i % 240 === 180, stealPressed: i % 65 === 0, blockPressed: i % 92 === 0, callScreenPressed: i % 425 === 200 });
    original.update(1 / 60, input, awayInput); restored.update(1 / 60, input, awayInput);
    assert.deepEqual(restored.drainEvents(), original.drainEvents(), `event mismatch at frame ${i}`);
    assert.deepEqual(restored.state, original.state, `state mismatch at frame ${i}`);
  }
  assert.deepEqual(restored.checkpoint(), original.checkpoint(), 'future closure state differs');
}

test('fresh and mid-introduction snapshots reproduce the next 120 seconds exactly', () => {
  assertFutureEquivalent(create());
  const intro = create(); advance(intro, 0.8); assert.equal(intro.state.phase, 'intro'); assertFutureEquivalent(intro);
});

test('half-charged jumpers and live shot flight preserve timing, RNG and eventual scoring', () => {
  const held = playing(); prepareOpenShot(held); charge(held, 0.35);
  assert.ok(held.state.charging); assertFutureEquivalent(held);
  const flying = playing(); prepareOpenShot(flying); charge(flying); flying.update(1 / 60, frame({ shootReleased: true })); advance(flying, 0.1);
  assert.equal(flying.state.ball.state, 'shot'); assert.ok(flying.state.ball.progress > 0); assertFutureEquivalent(flying);
});

test('post-score inbound snapshots neither replay a score nor lose the next possession', () => {
  const sim = playing(); prepareOpenShot(sim); charge(sim); sim.update(1 / 60, frame({ shootReleased: true }));
  for (let i = 0; i < 120 && sim.state.phase === 'playing'; i++) sim.update(1 / 60, EMPTY_INPUT);
  assert.equal(sim.state.phase, 'inbound'); assert.ok(sim.state.score[0] > 0);
  assertFutureEquivalent(sim);
});

test('a moving pass and subsequent assist attribution survive restoration', () => {
  const sim = playing(); prepareOpenShot(sim);
  Object.assign(sim.state.players[0], { x: 4, z: 0 }); Object.assign(sim.state.players[1], { x: 9, z: -2 });
  sim.update(1 / 60, frame({ passPressed: true, passTarget: 1 })); advance(sim, 0.1);
  assert.equal(sim.state.ball.state, 'pass'); assert.ok(sim.checkpoint().engine.lastPass); assertFutureEquivalent(sim);
});

test('missed-shot loose ball preserves its bounce velocity and rebound race', () => {
  const sim = playing();
  charge(sim, 0.1); sim.update(1 / 60, frame({ shootReleased: true }));
  for (let i = 0; i < 180 && sim.state.ball.state === 'shot'; i++) sim.update(1 / 60, EMPTY_INPUT);
  assert.equal(sim.state.ball.state, 'loose'); assert.ok(sim.checkpoint().engine.looseVelocity.y !== 0); assertFutureEquivalent(sim);
});

test('planted pick, roll timers and backdoor cuts preserve their future paths', () => {
  const screen = createTacticsScenario(); screen.update(1 / 60, frame({ callScreenPressed: true })); advance(screen, 0.6);
  assert.equal(screen.checkpoint().engine.screenPlan?.phase, 'set'); assertFutureEquivalent(screen);
  const cut = createTacticsScenario();
  Object.assign(cut.state.players[0], { x: 5, z: 0 }); Object.assign(cut.state.players[1], { x: 7.5, z: -5.5 }); Object.assign(cut.state.players[2], { x: 10, z: 4.5 });
  Object.assign(cut.state.players[3], { x: 6.3, z: 0 }); Object.assign(cut.state.players[4], { x: 8.2, z: -4.7 }); Object.assign(cut.state.players[5], { x: 10.5, z: 4 });
  for (let i = 0; i < 180 && cut.checkpoint().engine.cuts.length === 0; i++) cut.update(1 / 60, EMPTY_INPUT);
  assert.ok(cut.checkpoint().engine.cuts.length > 0); assertFutureEquivalent(cut);
});

test('AI targets, decisions, current stun and possession protection are retained', () => {
  const sim = createTacticsScenario();
  Object.assign(sim.state.players[3], { x: sim.state.players[0].x + 0.7, z: sim.state.players[0].z });
  sim.update(1 / 60, frame({ crossoverPressed: true }));
  assert.ok(sim.checkpoint().engine.stunned.length > 0); assertFutureEquivalent(sim);
  const ai = playing();
  for (let i = 0; i < 60 * 30 && ai.checkpoint().engine.aiTargets.length === 0; i++) ai.update(1 / 60, policy('team-basketball', ai.state));
  assert.ok(ai.checkpoint().engine.aiTargets.length > 0); assertFutureEquivalent(ai);
});

test('local player two can restore a live charge without merging the two controls', () => {
  const sim = playing({ localMultiplayer: true });
  sim.state.possession = 1; sim.state.ball.owner = 3; sim.state.controlledAway = 3;
  Object.assign(sim.state.players[3], { x: -5, z: 0 });
  for (const p of sim.state.players.filter(p => p.side === 0)) Object.assign(p, { x: 12, z: p.slot * 2 });
  charge(sim, 0.3, 1);
  assert.equal(sim.checkpoint().engine.chargingPlayer, 3); assertFutureEquivalent(sim);
});

test('a legal buzzer-beater already in flight still resolves exactly once after resume', () => {
  const sim = playing(); prepareOpenShot(sim); charge(sim);
  sim.state.clock = 0.02; sim.update(1 / 60, frame({ shootReleased: true })); sim.update(1 / 60, EMPTY_INPUT);
  assert.equal(sim.state.clock, 0); assert.ok(sim.checkpoint().engine.pendingPeriod); assert.equal(sim.state.ball.state, 'shot');
  assertFutureEquivalent(sim);
});

test('practice and every challenge kind preserve stations, scores and time limits', () => {
  for (const mode of ['practice', 'freestyle', 'three', 'inside', 'allaround'] as const) {
    const sim = playing({ mode: mode === 'practice' ? 'practice' : 'challenge', challengeKind: mode === 'practice' ? undefined : mode, quarterLength: mode === 'practice' ? 0 : 60, quarters: 1, playersPerTeam: mode === 'allaround' ? 3 : 1 });
    charge(sim); sim.update(1 / 60, frame({ shootReleased: true })); advance(sim, 1.6);
    assertFutureEquivalent(sim);
  }
});

test('snapshot and restored state are detached, including nested athletes, stats and engine maps', () => {
  const sim = playing(); charge(sim, 0.2);
  const checkpoint = sim.checkpoint(), before = sim.checkpoint(), restored = restoreSimulation(checkpoint)!;
  checkpoint.state.players[0].stats.assists = 999;
  checkpoint.state.config.home.players[0].name = 'Changed'; checkpoint.engine.nextCutAt[0] = 999;
  assert.deepEqual(sim.checkpoint(), before); assert.deepEqual(restored.checkpoint(), before);
  restored.state.players[0].stats.rebounds++;
  assert.equal(sim.state.players[0].stats.rebounds, 0);
});

test('JSON round trips preserve undefined property presence and negative zero', () => {
  const sim = playing(); sim.state.players[0].vx = -0;
  const checkpoint = json(sim.checkpoint());
  assert.ok(checkpoint.encoding.undefinedPaths.length > 0); assert.ok(checkpoint.encoding.negativeZeroPaths.includes('state.players.0.vx'));
  const restored = restoreSimulation(checkpoint); assert.ok(restored);
  assert.deepEqual(restored.state, sim.state); assert.ok(Object.is(restored.state.players[0].vx, -0));
});

test('frequent snapshots of complete three- and five-player games accept every legitimate phase', () => {
  const phases = new Set<string>(), balls = new Set<string>(); let sampled = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const sim = create({ seed, home: TEAMS[(seed * 7) % 30], away: TEAMS[(seed * 11 + 3) % 30], quarterLength: 30, quarters: 4, playersPerTeam: seed % 2 ? 3 : 5 });
    for (let tick = 0; tick < 60 * 360 && sim.state.phase !== 'finished'; tick++) {
      sim.update(1 / 60, policy('team-basketball', sim.state));
      if (tick % 30 === 0 || sim.state.phase === 'finished') {
        const restored = restoreSimulation(json(sim.checkpoint()));
        assert.ok(restored, `rejected legitimate seed ${seed} frame ${tick}: ${sim.state.phase}/${sim.state.ball.state}`);
        assert.deepEqual(restored.state, sim.state); sampled++; phases.add(sim.state.phase); balls.add(sim.state.ball.state);
      }
    }
    assert.equal(sim.state.phase, 'finished');
  }
  assert.ok(sampled > 1_000); assert.deepEqual([...phases].sort(), ['finished', 'halftime', 'inbound', 'intro', 'playing']);
  for (const state of ['dead', 'held', 'loose', 'pass', 'shot']) assert.ok(balls.has(state), `not sampled: ${state}`);
});

test('invalid, foreign-roster and inconsistent snapshots are rejected rather than repaired', () => {
  const good = playing().checkpoint();
  const mutations: ((value: any) => void)[] = [
    v => v.version = 2, v => delete v.engine, v => v.extra = true, v => v.state.clock = NaN, v => v.state.ball.x = Infinity,
    v => v.state.config.home.id = 'fake', v => v.state.config.home.arena = '<script>bad()</script>', v => v.state.config.home.players[0].shooting = 999,
    v => v.state.players[0].athlete.name = 'Unlisted player', v => v.state.players[0].id = 999, v => v.state.players[0].stats.points = 2,
    v => v.state.ball.owner = 999, v => v.state.ball.state = 'shot', v => v.state.score[0] = 1000, v => v.state.winner = 1,
    v => v.engine.seed = Number.MAX_SAFE_INTEGER + 1, v => v.engine.aiTargets = [[999, { x: 0, z: 0, style: 0 }]],
    v => v.engine.stunned = [[0, 0.5], [0, 0.5]], v => v.engine.cuts = [[0, { phase: 'finish', x: 0, z: 0, finishX: 0, finishZ: 0, remaining: Infinity }]],
    v => v.engine.chargingPlayer = 0, v => v.engine.screenTime = 5, v => v.state.events[0].text = '<img onerror=bad()>',
    v => v.encoding.undefinedPaths.push('state.config.home.__proto__'), v => v.encoding.undefinedPaths.push('state.clock'),
    v => v.encoding.negativeZeroPaths.push('state.players.0.athlete.speed'), v => v.state.players = Array(1000).fill(v.state.players[0]),
  ];
  for (const mutate of mutations) { const value = json(good); mutate(value); assert.equal(restoreSimulation(value), null, `accepted mutation ${mutate}`); }
  for (const invalid of [null, undefined, 3, [], {}, { version: 1 }, new Date(), 'not parsed JSON']) assert.equal(restoreSimulation(invalid), null);
});

test('hostile objects cannot execute getters, serialization hooks, or prototype pollution', () => {
  let called = 0;
  const getter = playing().checkpoint(); Object.defineProperty(getter.state.config, 'home', { enumerable: true, get() { called++; throw new Error('getter ran'); } });
  assert.equal(restoreSimulation(getter), null); assert.equal(called, 0);
  const hook = playing().checkpoint() as any; hook.toJSON = () => { called++; return {}; };
  assert.equal(restoreSimulation(hook), null); assert.equal(called, 0);
  const polluted = json(playing().checkpoint()) as any;
  Object.defineProperty(polluted.state.config, '__proto__', { value: { polluted: true }, enumerable: true });
  assert.equal(restoreSimulation(polluted), null); assert.equal(({} as any).polluted, undefined);
  const cyclic = playing().checkpoint() as any; cyclic.engine.loop = cyclic;
  assert.equal(restoreSimulation(cyclic), null);
});
