import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/simulation.ts';
import { TEAMS } from '../src/data.ts';
import { EMPTY_INPUT, type GameConfig, type InputFrame, type Simulation } from '../src/types.ts';
import { defenseExperiment } from './defense-lab.ts';
import { createTacticsScenario, screenScenario, offBallScenario } from './tactics-lab.ts';

const config = (overrides: Partial<GameConfig> = {}): GameConfig => ({ home: TEAMS.find(t => t.id === 'gsw')!, away: TEAMS.find(t => t.id === 'lal')!, mode: 'exhibition', difficulty: 'pro', quarterLength: 120, quarters: 4, playersPerTeam: 3, seed: 42, ...overrides });
const frame = (input: Partial<InputFrame> = {}): InputFrame => ({ ...EMPTY_INPUT, ...input });
function advance(sim: Simulation, seconds: number, input: Partial<InputFrame> = {}) {
  for (let time = 0; time < seconds - 1e-8; time += 1 / 60) sim.update(1 / 60, frame(input));
}
function playing(overrides: Partial<GameConfig> = {}) {
  const sim = createSimulation(config(overrides)); advance(sim, 1.5); sim.drainEvents(); return sim;
}
function clearDefenders(sim: Simulation) {
  for (const p of sim.state.players) if (p.side === 1) { p.x = -12; p.z = 6; }
}
function shoot(sim: Simulation, time = 0.7) {
  sim.update(1 / 60, frame({ shootPressed: true, shootHeld: true }));
  advance(sim, time - 1 / 60, { shootHeld: true });
  sim.update(1 / 60, frame({ shootReleased: true }));
}

test('seeded simulations reproduce controls, random shots, players, and events exactly', () => {
  const a = playing(), b = playing();
  for (let i = 0; i < 3600; i++) {
    const input = frame({ moveX: i % 360 < 180 ? 1 : -1, moveZ: Math.sin(i / 100), sprint: i % 90 < 20, shootHeld: i % 300 < 41, shootPressed: i % 300 === 0, shootReleased: i % 300 === 41, passPressed: i % 500 === 100, switchPressed: i % 400 === 390 });
    a.update(1 / 60, input); b.update(1 / 60, input);
  }
  assert.deepEqual(a.state, b.state);
});

test('diagonal input is normalized and sprint spends recoverable stamina', () => {
  const straight = playing(), diagonal = playing();
  const startA = { ...straight.state.players[0] }, startB = { ...diagonal.state.players[0] };
  advance(straight, 0.25, { moveX: 1 }); advance(diagonal, 0.25, { moveX: 1, moveZ: 1 });
  const a = straight.state.players[0], b = diagonal.state.players[0];
  assert.ok(Math.abs(Math.hypot(a.x - startA.x, a.z - startA.z) - Math.hypot(b.x - startB.x, b.z - startB.z)) < 0.02);
  advance(straight, 1, { moveX: 1, sprint: true }); const exhausted = a.stamina;
  assert.ok(exhausted < 95); advance(straight, 1); assert.ok(a.stamina > exhausted);
});

test('pass has no owner in flight and hands control to the receiver', () => {
  const sim = playing(); clearDefenders(sim);
  sim.update(1 / 60, frame({ passPressed: true, passTarget: 1 }));
  assert.equal(sim.state.ball.state, 'pass'); assert.equal(sim.state.ball.owner, null);
  advance(sim, 0.7);
  assert.equal(sim.state.ball.owner, 1); assert.equal(sim.state.controlled, 1);
  assert.equal(sim.state.ball.state, 'held');
});

test('an off-ball controlled teammate can call for a pass', () => {
  const sim = playing(); clearDefenders(sim);
  sim.state.controlled = 1;
  sim.update(1 / 60, frame({ passPressed: true }));
  assert.equal(sim.state.ball.state, 'pass'); assert.equal(sim.state.ball.target, 1);
  advance(sim, 0.7);
  assert.equal(sim.state.ball.owner, 1); assert.equal(sim.state.controlled, 1);
});

test('green release creates a valid shot, rating feedback, and field-goal attempt', () => {
  const sim = playing(); clearDefenders(sim);
  sim.state.players[0].x = 5; sim.state.players[0].z = 0;
  shoot(sim);
  assert.equal(sim.state.ball.state, 'shot'); assert.equal(sim.state.ball.owner, null);
  assert.equal(sim.state.ball.points, 3); assert.equal(sim.state.players[0].stats.fga, 1);
  assert.equal(sim.state.players[0].stats.tpa, 1);
  assert.equal(sim.state.shotFeedback?.perfect, true);
  assert.ok(sim.state.shotFeedback!.quality > 0.9);
});

test('timing and contest change shot quality', () => {
  const perfect = playing(), early = playing(), contested = playing();
  for (const sim of [perfect, early, contested]) { clearDefenders(sim); sim.state.players[0].x = 5; }
  contested.state.players[3].x = 5.8; contested.state.players[3].z = 0;
  shoot(perfect, 0.7); shoot(early, 0.2); shoot(contested, 0.7);
  assert.ok(perfect.state.shotFeedback!.quality > early.state.shotFeedback!.quality);
  assert.ok(perfect.state.shotFeedback!.quality > contested.state.shotFeedback!.quality);
});

test('shooting ratings still matter on green releases and full-court heaves are difficult', () => {
  const elite = playing({ mode: 'practice', playersPerTeam: 1 });
  const poor = playing({ mode: 'practice', playersPerTeam: 1 });
  const distant = playing({ mode: 'practice', playersPerTeam: 1 });
  for (const sim of [elite, poor, distant]) { sim.state.players[0].x = 5; sim.state.players[0].athlete = { ...sim.state.players[0].athlete }; }
  elite.state.players[0].athlete.shooting = 99; poor.state.players[0].athlete.shooting = 35;
  distant.state.players[0].x = -11;
  shoot(elite); shoot(poor); shoot(distant);
  assert.equal(elite.state.shotFeedback?.perfect, true); assert.equal(poor.state.shotFeedback?.perfect, true);
  assert.ok(elite.state.shotFeedback!.quality - poor.state.shotFeedback!.quality > 0.25);
  assert.ok(distant.state.shotFeedback!.quality < 0.2);
});

test('heat modestly softens imperfect timing and energy use without widening the green window', () => {
  const cold = playing({ mode: 'practice', playersPerTeam: 1 });
  const hot = playing({ mode: 'practice', playersPerTeam: 1 });
  hot.state.momentum[0] = 100;
  shoot(cold, 0.3); shoot(hot, 0.3);
  assert.equal(cold.state.shotFeedback?.perfect, false); assert.equal(hot.state.shotFeedback?.perfect, false);
  const benefit = hot.state.shotFeedback!.quality - cold.state.shotFeedback!.quality;
  assert.ok(benefit > 0.03 && benefit < 0.09, `heat benefit is modest: ${benefit}`);
  assert.ok(hot.state.players[0].stamina > cold.state.players[0].stamina);
  assert.ok(hot.state.players[0].stamina - cold.state.players[0].stamina < 0.5);
  const poor = playing({ mode: 'practice', playersPerTeam: 1 });
  poor.state.players[0].x = 5; poor.state.players[0].athlete = { ...poor.state.players[0].athlete, shooting: 35 };
  poor.state.momentum[0] = 100; shoot(poor);
  assert.ok(poor.state.shotFeedback!.quality < 0.75);
});

test('an open close finish is a two-point dunk and records score correctly', () => {
  const sim = playing(); clearDefenders(sim);
  sim.state.players[0].x = 11.1; shoot(sim);
  assert.equal(sim.state.ball.points, 2); assert.equal(sim.state.players[0].action, 'dunk');
  sim.state.ball.made = true; advance(sim, 0.6);
  assert.equal(sim.state.score[0], 2); assert.equal(sim.state.players[0].stats.points, 2);
  assert.equal(sim.state.players[0].stats.fgm, 1); assert.equal(sim.state.phase, 'inbound');
  advance(sim, 1.3); assert.equal(sim.state.possession, 1); assert.equal(sim.state.shotClock < 24, true);
});

test('shot-clock violation changes possession and records a turnover', () => {
  const sim = playing(); sim.state.shotClock = 0.005;
  sim.update(1 / 60, frame());
  assert.equal(sim.state.phase, 'inbound'); assert.equal(sim.state.possession, 1);
  assert.equal(sim.state.players[0].stats.turnovers, 1);
  assert.ok(sim.drainEvents().some(event => event.text === 'Shot clock violation'));
});

test('a buzzer-beater released before zero is resolved before the final score', () => {
  const sim = playing({ quarters: 1 }); clearDefenders(sim);
  sim.state.score = [0, 1]; sim.state.players[0].x = 11; sim.state.clock = 0.78;
  shoot(sim); sim.state.ball.made = true;
  advance(sim, 1);
  assert.equal(sim.state.score[0], 2); assert.equal(sim.state.phase, 'finished'); assert.equal(sim.state.winner, 0);
});

test('a tied final period leads to overtime, while a decided game stops', () => {
  const tied = playing({ quarters: 1 }); tied.state.clock = 0.001; tied.update(1 / 60, frame());
  assert.equal(tied.state.phase, 'halftime'); assert.equal(tied.state.quarter, 2); assert.equal(tied.state.clock, 60);
  const won = playing({ quarters: 1 }); won.state.score[0] = 10; won.state.clock = 0.001; won.update(1 / 60, frame());
  assert.equal(won.state.phase, 'finished'); assert.equal(won.state.winner, 0);
  const snapshot = JSON.stringify(won.state); advance(won, 3, { moveX: 1 }); assert.equal(JSON.stringify(won.state), snapshot);
});

test('practice clock stays available and target-score games finish immediately', () => {
  const practice = playing({ mode: 'practice', quarterLength: 1 }); advance(practice, 3);
  assert.equal(practice.state.clock, 1); assert.equal(practice.state.phase, 'playing');
  const target = playing({ targetScore: 2 }); clearDefenders(target); target.state.players[0].x = 11;
  shoot(target); target.state.ball.made = true; advance(target, 0.6);
  assert.equal(target.state.phase, 'finished'); assert.equal(target.state.winner, 0);
});

test('practice has no opponent, no shot-clock violation, and returns each shot automatically', () => {
  const sim = playing({ mode: 'practice', quarterLength: 0, playersPerTeam: 1 });
  assert.equal(sim.state.players.length, 1); assert.equal(sim.state.players[0].side, 0);
  advance(sim, 30);
  assert.equal(sim.state.phase, 'playing'); assert.equal(sim.state.shotClock, 24);
  const spot = { x: sim.state.players[0].x, z: sim.state.players[0].z };
  shoot(sim); sim.state.ball.made = false; advance(sim, 1.7);
  assert.equal(sim.state.ball.owner, 0); assert.equal(sim.state.phase, 'playing');
  assert.equal(sim.state.players[0].x, spot.x); assert.equal(sim.state.players[0].z, spot.z);
  assert.equal(sim.state.clock, 0); assert.equal(sim.state.score[1], 0);
});

test('challenge rotates fixed shooting stations, clocks reset time, and never goes into overtime', () => {
  const sim = playing({ mode: 'challenge', quarterLength: 60, quarters: 1, playersPerTeam: 1 });
  const spot = { x: sim.state.players[0].x, z: sim.state.players[0].z };
  advance(sim, 1, { moveX: 1, moveZ: 1, sprint: true });
  assert.equal(sim.state.players[0].x, spot.x); assert.equal(sim.state.players[0].z, spot.z);
  shoot(sim); sim.state.ball.made = false; advance(sim, 1.7);
  assert.equal(sim.state.ball.owner, 0); assert.notEqual(sim.state.players[0].z, spot.z);
  assert.equal(sim.state.score[1], 0);
  sim.state.clock = 0.001; sim.update(1 / 60, frame());
  assert.equal(sim.state.phase, 'finished'); assert.equal(sim.state.quarter, 1); assert.equal(sim.state.winner, 0);
});

test('daily three-point challenge uses seven distinct three-point stations on every rotation', () => {
  const sim = playing({ mode: 'challenge', challengeKind: 'three', playersPerTeam: 5, quarterLength: 120 });
  assert.equal(sim.state.players.length, 1); assert.ok(sim.state.clock < 60 && sim.state.clock > 59);
  const positions: string[] = [];
  for (let i = 0; i < 14; i++) {
    const p = sim.state.players[0], range = Math.hypot(p.x - 12.15, p.z);
    assert.ok(range >= 6.75 && range < 8, `three-point station range ${range}`);
    positions.push(`${p.x.toFixed(3)},${p.z.toFixed(3)}`);
    shoot(sim); assert.equal(sim.state.ball.points, 3);
    advance(sim, 1.6); assert.equal(sim.state.ball.owner, 0);
  }
  assert.equal(new Set(positions.slice(0, 7)).size, 7);
  assert.deepEqual(positions.slice(0, 7), positions.slice(7));
  assert.equal(sim.state.players[0].stats.tpa, 14);
});

test('daily inside challenge alternates close angles with both dunks and short jumpers', () => {
  const sim = playing({ mode: 'challenge', challengeKind: 'inside', playersPerTeam: 1 });
  const actions = new Set<string>(), positions = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const p = sim.state.players[0], range = Math.hypot(p.x - 12.15, p.z);
    assert.ok(range >= 1.4 && range <= 2.9 + 1e-9 && range < 3.2);
    positions.add(`${p.x.toFixed(3)},${p.z.toFixed(3)}`);
    shoot(sim); actions.add(p.action); assert.equal(sim.state.ball.points, 2);
    advance(sim, 1.6);
  }
  assert.equal(positions.size, 7); assert.ok(actions.has('dunk')); assert.ok(actions.has('shoot'));
  assert.equal(sim.state.players[0].stats.tpa, 0);
});

test('all-around challenge is real three-on-three with movement, passing and assists', () => {
  const sim = playing({ mode: 'challenge', challengeKind: 'allaround', playersPerTeam: 1 });
  assert.equal(sim.state.players.length, 6); assert.equal(sim.state.players.filter(p => p.side === 1).length, 3);
  const startX = sim.state.players[0].x; advance(sim, 0.25, { moveX: 1 });
  assert.ok(sim.state.players[0].x > startX + 0.8);
  clearDefenders(sim); sim.state.players[0].x = 5; sim.state.players[1].x = 9; sim.state.players[1].z = -1;
  sim.update(1 / 60, frame({ passPressed: true, passTarget: 1 })); advance(sim, 0.7);
  assert.equal(sim.state.ball.owner, 1); shoot(sim); sim.state.ball.made = true; advance(sim, 1.2);
  assert.equal(sim.state.players[0].stats.assists, 1); assert.equal(sim.state.phase, 'inbound');
  const beforeInbound = sim.state.clock; advance(sim, 0.5);
  assert.ok(beforeInbound - sim.state.clock >= 0.49, 'challenge clock runs during the inbound');
  advance(sim, 1); assert.equal(sim.state.possession, 1);
});

test('all-around challenge permits defensive steals and ends a scoreless tie without overtime', () => {
  let steals = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const sim = playing({ mode: 'challenge', challengeKind: 'allaround', seed });
    advance(sim, 1.0); // Allow the inbound gather protection to expire.
    sim.state.possession = 1; sim.state.ball.owner = 3;
    Object.assign(sim.state.players[0], { x: 0, z: 0 }); Object.assign(sim.state.players[3], { x: 0.7, z: 0 });
    sim.update(1 / 60, frame({ stealPressed: true })); steals += sim.state.players[0].stats.steals;
  }
  assert.ok(steals >= 3, `steals should be possible in all-around play: ${steals}`);
  const tied = playing({ mode: 'challenge', challengeKind: 'allaround', quarters: 4 });
  tied.state.clock = 0.001; tied.update(1 / 60, frame());
  assert.equal(tied.state.phase, 'finished'); assert.equal(tied.state.quarter, 1); assert.equal(tied.state.winner, 0);
  assert.deepEqual(tied.state.score, [0, 0]);
});

test('all challenge clocks include returns and inbounds but count a legal buzzer-beater', () => {
  for (const challengeKind of ['freestyle', 'three', 'inside', 'allaround'] as const) {
    const sim = playing({ mode: 'challenge', challengeKind });
    sim.state.phase = 'inbound'; sim.state.phaseTime = 1; sim.state.clock = 0.2;
    sim.state.ball.state = 'dead'; sim.state.ball.owner = null;
    advance(sim, 0.3); assert.equal(sim.state.phase, 'finished', `${challengeKind} must expire during return`);
    const buzzer = playing({ mode: 'challenge', challengeKind });
    clearDefenders(buzzer); buzzer.state.players[0].x = 11; buzzer.state.players[0].z = 0; buzzer.state.clock = 0.78;
    shoot(buzzer); buzzer.state.ball.made = true; advance(buzzer, 1);
    assert.equal(buzzer.state.phase, 'finished'); assert.equal(buzzer.state.score[0], 2);
    assert.equal(buzzer.state.quarter, 1);
  }
});

test('a well-timed close block deflects a shot without awarding a steal', () => {
  let blocks = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const sim = playing({ seed });
    const defender = sim.state.players[0], shooter = sim.state.players[3];
    defender.x = -11.5; defender.z = 0; shooter.x = -11; shooter.z = 0;
    sim.state.possession = 1;
    Object.assign(sim.state.ball, { owner: null, state: 'shot', from: 3, progress: 0, startX: -11, startZ: 0, startY: 2.0, endX: -12.15, endZ: 0, endY: 3.05, duration: 0.57, arc: 1.5, made: true, points: 2 });
    sim.update(1 / 60, frame({ blockPressed: true })); advance(sim, 0.4);
    blocks += defender.stats.blocks;
    assert.equal(defender.stats.steals, 0);
  }
  assert.ok(blocks >= 5, `close timed blocks should work, got ${blocks}/10`);
});

test('steal spam is rate limited and cannot take possession of a flying shot', () => {
  const sim = playing({ playersPerTeam: 1 });
  const defender = sim.state.players[0], owner = sim.state.players[1];
  let steals = 0;
  for (let i = 0; i < 240; i++) {
    defender.x = 0; defender.z = 0; owner.x = 0.7; owner.z = 0;
    sim.state.ball.state = 'held'; sim.state.ball.owner = 1; sim.state.possession = 1;
    sim.update(1 / 60, frame({ stealPressed: true }));
    steals += sim.drainEvents().filter(e => e.type === 'steal' && e.player === 0).length;
  }
  assert.ok(steals <= 7, `four seconds allows at most seven steal attempts, got ${steals} successes`);
  defender.cooldown = 0;
  Object.assign(sim.state.ball, { owner: null, state: 'shot', from: 1, progress: 0, startX: 0.7, startZ: 0, startY: 2, endX: -12.15, endZ: 0, endY: 3.05, duration: 1.2, arc: 3, made: false });
  const previous = defender.stats.steals;
  advance(sim, 0.4, { stealPressed: true });
  assert.equal(defender.stats.steals, previous); assert.equal(sim.state.ball.owner, null);
});

test('inbound ball protection prevents an immediate theft and failed reaches create a driving gap', () => {
  const reaching = playing({ playersPerTeam: 1 }), disciplined = playing({ playersPerTeam: 1 });
  for (const sim of [reaching, disciplined]) {
    sim.state.possession = 1; sim.state.ball.owner = 1;
    Object.assign(sim.state.players[0], { x: 0, z: 0 }); Object.assign(sim.state.players[1], { x: 0.8, z: 0 });
  }
  reaching.update(1 / 60, frame({ stealPressed: true })); disciplined.update(1 / 60, frame());
  assert.equal(reaching.state.ball.owner, 1); assert.equal(reaching.state.players[0].stats.steals, 0);
  assert.ok(reaching.state.players[0].cooldown > 1);
  const startReach = reaching.state.players[0].z, startDisciplined = disciplined.state.players[0].z;
  advance(reaching, 0.25, { moveZ: -1 }); advance(disciplined, 0.25, { moveZ: -1 });
  const reachTravel = Math.abs(reaching.state.players[0].z - startReach), normalTravel = Math.abs(disciplined.state.players[0].z - startDisciplined);
  assert.ok(reachTravel < normalTravel * 0.5, `failed reach should cost defensive position: ${reachTravel} vs ${normalTravel}`);
  assert.ok(reaching.state.players[0].stamina < disciplined.state.players[0].stamina - 2);
});

test('repeated close pursuit and steal-key presses do not create possession ping-pong', () => {
  const result = defenseExperiment('pro', 6);
  assert.equal(result.unfinished, 0);
  assert.ok(result.homeSteals / result.games < 15, `human pressure averaged ${result.homeSteals / result.games} steals`);
  assert.ok(result.turnovers / result.games < 22, `overall turnovers averaged ${result.turnovers / result.games}`);
  assert.ok(result.fastReversals / result.games < 1, `quick reverse steals averaged ${result.fastReversals / result.games}`);
  assert.equal(result.homeSteals + result.awaySteals, result.onBallSteals + result.interceptions);
});

test('scoring after a received pass awards exactly one assist to the passer', () => {
  const sim = playing(); clearDefenders(sim);
  sim.state.players[0].x = 5; sim.state.players[1].x = 9; sim.state.players[1].z = -1;
  sim.update(1 / 60, frame({ passPressed: true, passTarget: 1 })); advance(sim, 0.7);
  shoot(sim); sim.state.ball.made = true; advance(sim, 1.2);
  assert.equal(sim.state.players[0].stats.assists, 1);
  assert.equal(sim.state.players[1].stats.assists, 0);
  assert.equal(sim.state.players[1].stats.points, sim.state.score[0]);
});

test('an offensive rebound resets the clock to fourteen seconds', () => {
  const sim = playing(); clearDefenders(sim);
  const p = sim.state.players[0]; p.x = 10; p.z = 0;
  sim.state.shotClock = 21;
  Object.assign(sim.state.ball, { owner: null, state: 'loose', x: 10, y: 1, z: 0, from: 0 });
  advance(sim, 0.2);
  assert.equal(sim.state.ball.owner, 0); assert.equal(p.stats.rebounds, 1);
  assert.ok(sim.state.shotClock <= 14 && sim.state.shotClock > 13.9);
});

test('overlapping players separate without leaving the court or exhausting stamina below zero', () => {
  const sim = playing({ playersPerTeam: 5 });
  for (const p of sim.state.players) { p.x = 0; p.z = 0; p.stamina = 0.01; }
  advance(sim, 1, { moveX: 1, moveZ: 1, sprint: true, crossoverPressed: true });
  for (const p of sim.state.players) {
    assert.ok(p.stamina >= 0 && p.stamina <= 100);
    assert.ok(Math.abs(p.x) <= 13.5 && Math.abs(p.z) <= 7);
    for (const q of sim.state.players) if (q.id !== p.id) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) > 0.45);
  }
});

test('both roster sizes complete AI possessions, score, and stay physically finite', () => {
  for (const count of [3, 5]) {
    const sim = playing({ playersPerTeam: count, quarterLength: 90, quarters: 1, seed: 1337 });
    for (let i = 0; i < 60 * 150 && sim.state.phase !== 'finished'; i++) {
      // Spectate by moving control off the current home ball handler.
      if (sim.state.ball.owner !== null && sim.state.players[sim.state.ball.owner].side === 0) sim.state.controlled = (sim.state.ball.owner + 1) % count;
      sim.update(1 / 60, frame());
      for (const p of sim.state.players) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.stamina));
        assert.ok(Math.abs(p.x) <= 13.5 && Math.abs(p.z) <= 7);
      }
    }
    assert.ok(sim.state.score[0] > 0 && sim.state.score[1] > 0, `both teams should score in ${count}v${count}: ${sim.state.score}`);
    assert.equal(sim.state.phase, 'finished');
    assert.ok(sim.state.events.length <= 64);
  }
});

test('AI personalities create different shot diets under the same open-court conditions', () => {
  function sample(name: string) {
    const ranges: number[] = [];
    for (let seed = 1; seed <= 32; seed++) {
      const template = { ...TEAMS[9].players[0], name, shooting: 85, finishing: 85, speed: 85, defense: 85, height: 2.0 };
      const sim = createSimulation(config({ seed, playersPerTeam: 1, away: { ...TEAMS[13], players: [template] } }));
      sim.state.phase = 'playing'; sim.state.possession = 1;
      sim.state.ball.owner = 1; sim.state.players[1].x = 3; sim.state.players[1].z = 0;
      sim.state.players[0].x = 13; sim.state.players[0].z = 7;
      for (let i = 0; i < 600; i++) {
        sim.update(1 / 60, frame());
        if (sim.state.ball.state === 'shot' && sim.state.ball.from === 1) {
          ranges.push(Math.hypot(sim.state.ball.startX + 12.15, sim.state.ball.startZ)); break;
        }
      }
    }
    assert.equal(ranges.length, 32);
    return { average: ranges.reduce((n, d) => n + d, 0) / ranges.length, threes: ranges.filter(d => d >= 6.75).length };
  }
  const curry = sample('Stephen Curry'), shaq = sample('Shaquille O’Neal');
  assert.ok(curry.average > shaq.average + 1.8, `Curry ${curry.average.toFixed(2)}m vs Shaq ${shaq.average.toFixed(2)}m`);
  assert.ok(curry.threes >= 10, `Curry should find frequent outside shots: ${curry.threes}/32`);
  assert.ok(shaq.threes <= 3, `Shaq should prefer the paint: ${shaq.threes}/32`);
});

test('a playmaker finds an open teammate more often than a post scorer under pressure', () => {
  function passCount(name: string) {
    let passes = 0;
    for (let seed = 101; seed <= 140; seed++) {
      const away = { ...TEAMS[13], players: TEAMS[13].players.map((p, i) => i === 0 ? { ...p, name, shooting: 85, finishing: 85, speed: 85, defense: 85, height: 2.0 } : { ...p }) };
      const sim = createSimulation(config({ seed, away }));
      sim.state.phase = 'playing'; sim.state.possession = 1; sim.state.ball.owner = 3;
      Object.assign(sim.state.players[3], { x: -5, z: 0 });
      Object.assign(sim.state.players[0], { x: -5.9, z: 0, athlete: { ...sim.state.players[0].athlete, speed: 85 } });
      Object.assign(sim.state.players[1], { x: 13, z: -6 }); Object.assign(sim.state.players[2], { x: 13, z: 6 });
      Object.assign(sim.state.players[4], { x: -8, z: -4 }); Object.assign(sim.state.players[5], { x: -8, z: 4 });
      for (let i = 0; i < 480; i++) {
        const owner = sim.state.players[3], defender = sim.state.players[0];
        sim.update(1 / 60, frame({ moveX: owner.x - 0.9 - defender.x, moveZ: owner.z - defender.z }));
        const action = sim.drainEvents().find(e => e.player === 3 && ['pass', 'shot', 'dunk'].includes(e.type));
        if (action) { if (action.type === 'pass') passes++; break; }
      }
    }
    return passes;
  }
  const magic = passCount('Magic Johnson'), shaq = passCount('Shaquille O’Neal');
  assert.ok(magic >= shaq + 7, `Magic should organize more often: ${magic}/40 passes vs Shaq ${shaq}/40`);
});

test('events drain once and invalid elapsed time cannot corrupt the state', () => {
  const sim = createSimulation(config()); advance(sim, 1.5);
  assert.ok(sim.drainEvents().length > 0); assert.deepEqual(sim.drainEvents(), []);
  const before = JSON.stringify(sim.state);
  sim.update(NaN, frame()); sim.update(-1, frame()); sim.update(Infinity, frame());
  assert.equal(JSON.stringify(sim.state), before);
});

test('using a planted screen creates separation and the big rolls toward the rim', () => {
  const isolated = screenScenario(false), pickAndRoll = screenScenario(true);
  assert.equal(pickAndRoll.screenEvents, 1);
  assert.ok(pickAndRoll.maximumClearance > isolated.maximumClearance + 0.6);
  assert.ok(pickAndRoll.openingSeconds > 0.08);
  assert.ok(pickAndRoll.rollRange < 2.3 && pickAndRoll.rollRange < isolated.rollRange - 0.7);
  assert.ok(pickAndRoll.finalScreener.x > 9, 'the screener must clear the original pick location');
});

test('a screen is stationary while set and repeated calls cannot perpetually pin a defender', () => {
  const sim = createTacticsScenario(); let calls = 0;
  let first: { x: number; z: number } | undefined, plantedTravel = 0;
  for (let i = 0; i < 360; i++) {
    sim.update(1 / 60, frame({ callScreenPressed: i < 60 }));
    calls += sim.drainEvents().filter(e => e.text === 'Screen called').length;
    const big = sim.state.players[2];
    if (i === 30) first = { x: big.x, z: big.z };
    if (i > 30 && i < 48) plantedTravel = Math.max(plantedTravel, Math.hypot(big.x - first!.x, big.z - first!.z));
  }
  assert.equal(calls, 1);
  assert.ok(plantedTravel < 0.20, `planted pick moved ${plantedTravel}m`);
  assert.ok(sim.state.players[2].x > 9, 'unused screens time out and return to offensive spacing');
  assert.ok(sim.state.players.every(p => Number.isFinite(p.x) && Number.isFinite(p.z)));
});

test('a wing defender shading inside opens a real backdoor cut to the basket', () => {
  const result = offBallScenario();
  assert.ok(result.minimumRange < 2.5, `wing stayed ${result.minimumRange}m from the rim`);
  assert.ok(result.highestX > 10.5);
  assert.ok(result.recoveryRange > 5, 'an unreceived cut should recover perimeter spacing');
});

test('an outside shooter pops beyond the arc after setting a pick', () => {
  const sim = createTacticsScenario();
  sim.state.players[2].athlete = { ...sim.state.players[2].athlete, name: 'Stephen Curry' };
  sim.update(1 / 60, frame({ callScreenPressed: true }));
  advance(sim, 3);
  const shooter = sim.state.players[2];
  assert.ok(Math.hypot(shooter.x - 12.15, shooter.z) > 6.75);
  assert.ok(shooter.z < -4.5, 'pick-and-pop should preserve the side where the screen was set');
});
