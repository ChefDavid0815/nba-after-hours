/** Reproduce the real keyboard playtest's close pursuit, 1.1s steal key, and switches. */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createSimulation } from '../src/simulation.ts';
import { getTeam } from '../src/data.ts';
import { getLineup } from '../src/roster.ts';
import { EMPTY_INPUT, type Difficulty, type GameState, type InputFrame } from '../src/types.ts';

const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
export function createPressurePolicy() {
  let lastAction = -10, wasShootHeld = false;
  return (state: GameState): InputFrame => {
    const input = { ...EMPTY_INPUT }, p = state.players[state.controlled];
    const owner = state.ball.owner === null ? null : state.players[state.ball.owner];
    let target = { x: p.x, z: p.z }, sprint = false, shoot = false;
    const now = state.elapsed;
    if (state.phase === 'playing') {
      if (state.possession === 0 && owner?.id === p.id) {
        const closest = Math.min(...state.players.filter(q => q.side === 1).map(q => distance(p, q)));
        const range = distance(p, { x: 12.15, z: 0 });
        if (state.charging) shoot = state.charge < 0.69;
        else if (range < 2.2 || (range < 7.6 && closest > 1.8) || state.shotClock < 2) shoot = true;
        else {
          target = { x: 10.8, z: range < 4 ? 0 : p.z >= 0 ? -3.2 : 3.2 }; sprint = p.stamina > 40;
          if (closest < 1.1 && now - lastAction > 1.2) { input.passPressed = true; lastAction = now; }
          else if (closest < 1.9 && now - lastAction > 1.4) { input.crossoverPressed = true; lastAction = now; }
        }
      } else if (state.possession === 1 && owner) {
        target = { x: owner.x - 1, z: owner.z }; sprint = distance(p, target) > 2;
        if (distance(p, owner) > 5 && now - lastAction > 1.1) { input.switchPressed = true; lastAction = now; }
        else if (distance(p, owner) < 1.4 && now - lastAction > 1.1) { input.stealPressed = true; lastAction = now; }
      } else if (state.ball.state === 'loose') { target = { x: state.ball.x, z: state.ball.z }; sprint = true; }
      else if (state.ball.state === 'shot') {
        if (state.possession === 1 && distance(p, state.ball) < 2.4 && state.ball.progress < 0.35 && now - lastAction > 1) { input.blockPressed = true; lastAction = now; }
        target = { x: state.possession === 0 ? 10.4 : -10.4, z: 0 }; sprint = true;
      }
    }
    input.moveX = Math.abs(target.x - p.x) <= 0.3 ? 0 : Math.sign(target.x - p.x);
    input.moveZ = Math.abs(target.z - p.z) <= 0.3 ? 0 : Math.sign(target.z - p.z);
    input.sprint = sprint; input.shootHeld = shoot;
    input.shootPressed = shoot && !wasShootHeld; input.shootReleased = !shoot && wasShootHeld; wasShootHeld = shoot;
    return input;
  };
}

export function defenseExperiment(difficulty: Difficulty, games = 24) {
  const totals = { difficulty, games, homeScore: 0, awayScore: 0, homeSteals: 0, awaySteals: 0, onBallSteals: 0, interceptions: 0, passes: 0, turnovers: 0, fastReversals: 0, maxPlayerSteals: 0, unfinished: 0 };
  for (let seed = 1; seed <= games; seed++) {
    const sim = createSimulation({ home: getLineup(getTeam('gsw')), away: getLineup(getTeam('bos')), mode: 'exhibition', difficulty, quarterLength: 60, quarters: 4, playersPerTeam: 3, seed: 8189 + seed * 7919 });
    const decide = createPressurePolicy(); let input = { ...EMPTY_INPUT };
    let lastSteal = { time: -10, side: -1 };
    for (let tick = 0; tick < 60 * 700 && sim.state.phase !== 'finished'; tick++) {
      if (tick % 4 === 0) input = decide(sim.state);
      else input = { ...input, shootPressed: false, shootReleased: false, passPressed: false, switchPressed: false, stealPressed: false, blockPressed: false, crossoverPressed: false, callScreenPressed: false };
      sim.update(1 / 60, input);
      for (const event of sim.drainEvents()) {
        if (event.type === 'pass') totals.passes++;
        if (event.type !== 'steal') continue;
        if (event.side === 0) totals.homeSteals++; else totals.awaySteals++;
        if (event.text === 'Pass intercepted') totals.interceptions++; else totals.onBallSteals++;
        if (lastSteal.side !== event.side && sim.state.elapsed - lastSteal.time < 1.2) totals.fastReversals++;
        lastSteal = { time: sim.state.elapsed, side: event.side! };
      }
    }
    totals.homeScore += sim.state.score[0]; totals.awayScore += sim.state.score[1];
    totals.turnovers += sim.state.players.reduce((n, p) => n + p.stats.turnovers, 0);
    totals.maxPlayerSteals = Math.max(totals.maxPlayerSteals, ...sim.state.players.map(p => p.stats.steals));
    if (sim.state.phase !== 'finished') totals.unfinished++;
  }
  return { ...totals, averages: Object.fromEntries(Object.entries(totals).filter(([key, value]) => typeof value === 'number' && !['games', 'maxPlayerSteals'].includes(key)).map(([key, value]) => [key, Number((Number(value) / games).toFixed(2))])) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const games = Number(process.argv.find(a => a.startsWith('--seeds='))?.split('=')[1] ?? 24);
  console.log(JSON.stringify((['rookie', 'pro', 'allstar'] as const).map(d => defenseExperiment(d, games)), null, 2));
}
