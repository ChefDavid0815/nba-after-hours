import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/simulation.ts';
import { TEAMS } from '../src/data.ts';
import { EMPTY_INPUT, type GameConfig, type InputFrame, type Simulation } from '../src/types.ts';
import { policy } from './balance-lab.ts';

const input = (values: Partial<InputFrame> = {}): InputFrame => ({ ...EMPTY_INPUT, ...values });
function advance(sim: Simulation, seconds: number, home: Partial<InputFrame> = {}, away: Partial<InputFrame> = {}) {
  for (let time = 0; time < seconds - 1e-8; time += 1 / 60) sim.update(1 / 60, input(home), input(away));
}
function playing(overrides: Partial<GameConfig> = {}) {
  const sim = createSimulation({ home: TEAMS[9], away: TEAMS[13], mode: 'exhibition', difficulty: 'pro', quarterLength: 120, quarters: 4, playersPerTeam: 3, seed: 20, localMultiplayer: true, ...overrides });
  advance(sim, 1.5); sim.drainEvents(); return sim;
}
function shoot(sim: Simulation, side: 0 | 1) {
  sim.update(1 / 60, input(side === 0 ? { shootPressed: true, shootHeld: true } : {}), input(side === 1 ? { shootPressed: true, shootHeld: true } : {}));
  advance(sim, 0.7 - 1 / 60, side === 0 ? { shootHeld: true } : {}, side === 1 ? { shootHeld: true } : {});
  sim.update(1 / 60, input(side === 0 ? { shootReleased: true } : {}), input(side === 1 ? { shootReleased: true } : {}));
}

test('two human movement inputs are independent and missing away input keeps its player human', () => {
  const sim = playing(); const home = sim.state.players[sim.state.controlled], away = sim.state.players[sim.state.controlledAway!];
  const homeX = home.x, awayZ = away.z;
  advance(sim, 0.25, { moveX: 1 }, { moveZ: 1 });
  assert.ok(home.x > homeX + 1); assert.ok(away.z > awayZ + 1);
  const stopped = { x: away.x, z: away.z };
  for (let i = 0; i < 15; i++) sim.update(1 / 60, input({ moveX: -1 }));
  assert.ok(Math.hypot(away.x - stopped.x, away.z - stopped.z) < 0.01);
  assert.equal(away.vx, 0); assert.equal(away.vz, 0);
});

test('switching a defender does not cancel the other human shooting charge', () => {
  const sim = playing(); sim.state.players[0].x = 5;
  for (const p of sim.state.players.filter(p => p.side === 1)) { p.x = -11; p.z = 6; }
  sim.update(1 / 60, input({ shootPressed: true, shootHeld: true }), input({ switchPressed: true }));
  const selectedAway = sim.state.controlledAway;
  advance(sim, 0.5, { shootHeld: true }, { moveZ: -1, stealPressed: true });
  assert.equal(sim.state.charging, true); assert.ok(sim.state.charge > 0.5);
  assert.equal(sim.state.controlled, 0); assert.equal(sim.state.controlledAway, selectedAway);
  advance(sim, 0.1833333333, { shootHeld: true });
  sim.update(1 / 60, input({ shootReleased: true }), input({ blockPressed: true }));
  assert.equal(sim.state.ball.state, 'shot'); assert.equal(sim.state.ball.from, 0); assert.equal(sim.state.shotFeedback?.perfect, true);
});

test('the away human charges independently, attacks the opposite hoop and receives feedback', () => {
  const sim = playing(); sim.state.possession = 1; sim.state.ball.owner = 3; sim.state.controlledAway = 3;
  Object.assign(sim.state.players[3], { x: -5, z: 0 });
  for (const p of sim.state.players.filter(p => p.side === 0)) { p.x = 12; p.z = 6; }
  sim.update(1 / 60, input({ switchPressed: true }), input({ shootPressed: true, shootHeld: true }));
  advance(sim, 0.6833333333, { stealPressed: true }, { shootHeld: true });
  assert.equal(sim.state.charging, true); assert.ok(sim.state.charge > 0.69);
  sim.update(1 / 60, input({ blockPressed: true }), input({ shootReleased: true }));
  assert.equal(sim.state.ball.from, 3); assert.equal(sim.state.ball.endX, -12.15);
  assert.equal(sim.state.ball.points, 3); assert.equal(sim.state.shotFeedback?.perfect, true);
  sim.state.ball.made = true; advance(sim, 1.2);
  assert.equal(sim.state.score[1], 3);
});

test('both humans score at their own attacking hoop and normal ties still go to overtime', () => {
  const sim = playing({ quarters: 1 });
  sim.state.players[0].x = 11.0;
  for (const p of sim.state.players.filter(p => p.side === 1)) { p.x = -12; p.z = 6; }
  shoot(sim, 0); assert.equal(sim.state.ball.endX, 12.15); sim.state.ball.made = true;
  advance(sim, 2.0); assert.equal(sim.state.possession, 1); assert.equal(sim.state.controlledAway, 3);
  Object.assign(sim.state.players[3], { x: -11, z: 0 });
  for (const p of sim.state.players.filter(p => p.side === 0)) { p.x = 12; p.z = 6; }
  shoot(sim, 1); assert.equal(sim.state.ball.endX, -12.15); sim.state.ball.made = true;
  advance(sim, 0.6); assert.deepEqual(sim.state.score, [2, 2]);
  advance(sim, 1.4); sim.state.clock = 0.001; sim.update(1 / 60, input(), input());
  assert.equal(sim.state.phase, 'halftime'); assert.equal(sim.state.quarter, 2);
});

test('away pass slots and receiver selection never change the home human selection', () => {
  const sim = playing(); sim.state.controlled = 2; sim.state.controlledAway = 3;
  sim.state.possession = 1; sim.state.ball.owner = 3;
  Object.assign(sim.state.players[3], { x: -4, z: 0 }); Object.assign(sim.state.players[4], { x: -7, z: -4 });
  for (const p of sim.state.players.filter(p => p.side === 0)) { p.x = 12; p.z = 6; }
  sim.update(1 / 60, input(), input({ passPressed: true, passTarget: 1 }));
  assert.equal(sim.state.ball.target, 4); advance(sim, 0.7);
  assert.equal(sim.state.ball.owner, 4); assert.equal(sim.state.controlledAway, 4); assert.equal(sim.state.controlled, 2);
  sim.state.controlledAway = 5;
  sim.update(1 / 60, input(), input({ passPressed: true }));
  assert.equal(sim.state.ball.target, 5); advance(sim, 0.7);
  assert.equal(sim.state.controlledAway, 5); assert.equal(sim.state.controlled, 2);
});

test('an away teammate rebound transfers only the away human selection', () => {
  const sim = playing(); sim.state.controlled = 1; sim.state.controlledAway = 3;
  for (const p of sim.state.players) { p.x = p.side === 0 ? 12 : -12; p.z = 6; }
  Object.assign(sim.state.players[5], { x: 0, z: 0 });
  Object.assign(sim.state.ball, { owner: null, state: 'loose', x: 0, z: 0, y: 1 });
  advance(sim, 0.2);
  assert.equal(sim.state.ball.owner, 5); assert.equal(sim.state.controlledAway, 5); assert.equal(sim.state.controlled, 1);
  assert.equal(sim.state.players[5].stats.rebounds, 1);
});

test('an away AI teammate interception hands control to player two without switching player one', () => {
  let intercepted = 0;
  for (let seed = 1; seed <= 32; seed++) {
    const sim = playing({ seed }); sim.state.controlled = 1; sim.state.controlledAway = 3;
    Object.assign(sim.state.players[0], { x: -3, z: 0 }); Object.assign(sim.state.players[1], { x: 3, z: 0 });
    Object.assign(sim.state.players[2], { x: -1, z: 0 }); Object.assign(sim.state.players[5], { x: 0, z: 0 });
    Object.assign(sim.state.players[3], { x: 11, z: 6 }); Object.assign(sim.state.players[4], { x: 11, z: -6 });
    sim.update(1 / 60, input({ passPressed: true }), input()); advance(sim, 0.5);
    if (sim.state.players[5].stats.steals > 0) {
      intercepted++; assert.equal(sim.state.controlledAway, 5); assert.equal(sim.state.controlled, 1);
      assert.equal(sim.state.ball.owner, 5);
    }
  }
  assert.ok(intercepted > 0, 'at least one well-positioned interception should transfer control');
});

test('local multiplayer is ignored outside exhibition and never disables the normal away AI', () => {
  const a = playing({ mode: 'championship', localMultiplayer: true });
  const b = playing({ mode: 'championship', localMultiplayer: false });
  for (let i = 0; i < 1200; i++) {
    a.update(1 / 60, input(), input({ moveX: 1, shootHeld: true, passPressed: true })); b.update(1 / 60, input());
  }
  assert.equal(a.state.controlledAway, undefined); assert.deepEqual(a.state.players, b.state.players); assert.deepEqual(a.state.ball, b.state.ball);
  assert.equal(playing({ mode: 'practice', localMultiplayer: true }).state.controlledAway, undefined);
});

test('both human control streams can complete competitive full matches with their AI teammates', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const sim = playing({ seed, quarterLength: 60, quarters: 4 });
    for (let tick = 0; tick < 60 * 700 && sim.state.phase !== 'finished'; tick++) {
      const s = sim.state;
      const homeInput = policy('team-basketball', s);
      // Give the same observation-only policy the away player's mirrored court perspective.
      const view = { ...s, controlled: s.controlledAway!, possession: (1 - s.possession) as 0 | 1, ball: { ...s.ball, x: -s.ball.x, z: -s.ball.z }, players: s.players.map(p => ({ ...p, side: (1 - p.side) as 0 | 1, x: -p.x, z: -p.z })) };
      const awayInput = policy('team-basketball', view); awayInput.moveX *= -1; awayInput.moveZ *= -1;
      sim.update(1 / 60, homeInput, awayInput); sim.drainEvents();
    }
    assert.equal(sim.state.phase, 'finished', `seed ${seed} should finish`);
    assert.ok(sim.state.score[0] > 0 && sim.state.score[1] > 0, `both humans should score: seed ${seed}, ${sim.state.score}`);
    assert.equal(sim.state.players[sim.state.controlled].side, 0);
    assert.equal(sim.state.players[sim.state.controlledAway!].side, 1);
    assert.ok(sim.state.players.every(p => Number.isFinite(p.x + p.z + p.stamina)));
  }
});
