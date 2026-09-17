/** Small observation-only scenarios for screen contact, roll spacing and off-ball motion. */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createSimulation } from '../src/simulation.ts';
import { getTeam } from '../src/data.ts';
import { getLineup } from '../src/roster.ts';
import { EMPTY_INPUT, type InputFrame } from '../src/types.ts';

export function createTacticsScenario(seed = 21) {
  const sim = createSimulation({ home: getLineup(getTeam('gsw')), away: getLineup(getTeam('bos')), mode: 'exhibition', difficulty: 'pro', quarterLength: 120, quarters: 1, playersPerTeam: 3, seed });
  for (let i = 0; i < 150; i++) sim.update(1 / 60, EMPTY_INPUT);
  const spots = [[4, 0], [7, 5.5], [5.6, -2], [5.3, 0], [7, 4.5], [10, -4]];
  sim.state.players.forEach((p, i) => { p.x = spots[i][0]; p.z = spots[i][1]; p.cooldown = 0; p.vx = p.vz = 0; });
  sim.drainEvents(); return sim;
}
export function screenScenario(useScreen: boolean, seed = 21) {
  const sim = createTacticsScenario(seed); let minimumClearance = Infinity, maximumClearance = 0, openingSeconds = 0;
  let rollRange = 0, screenEvents = 0;
  const trace: unknown[] = [];
  for (let tick = 0; tick < 330; tick++) {
    const t = tick / 60, input: InputFrame = { ...EMPTY_INPUT };
    input.callScreenPressed = useScreen && tick === 0;
    if (t >= 0.9 && t < 1.5) { input.moveX = 1; input.moveZ = -1; }
    else if (t >= 1.5 && t < 2.2) input.moveX = 1;
    sim.update(1 / 60, input);
    screenEvents += sim.drainEvents().filter(e => e.text === 'Screen called').length;
    if (t >= 1.1 && t < 2.2) {
      const owner = sim.state.players[0];
      const gap = Math.min(...sim.state.players.filter(p => p.side === 1).map(p => Math.hypot(p.x - owner.x, p.z - owner.z)));
      minimumClearance = Math.min(minimumClearance, gap); maximumClearance = Math.max(maximumClearance, gap);
      if (gap > 1.65) openingSeconds += 1 / 60;
    }
    if (tick === 180) rollRange = Math.hypot(sim.state.players[2].x - 12.15, sim.state.players[2].z);
    if (process.argv.includes('--trace') && tick % 12 === 0 && tick < 200) trace.push({ t, players: sim.state.players.map(p => [p.id, +p.x.toFixed(2), +p.z.toFixed(2)]) });
  }
  return { useScreen, seed, screenEvents, minimumClearance, maximumClearance, openingSeconds, rollRange, finalScreener: { x: sim.state.players[2].x, z: sim.state.players[2].z }, owner: sim.state.ball.owner, ...(trace.length ? { trace } : {}) };
}

export function offBallScenario(seed = 21) {
  const sim = createTacticsScenario(seed);
  Object.assign(sim.state.players[0], { x: 5, z: 0 });
  Object.assign(sim.state.players[1], { x: 7.5, z: -5.5 });
  Object.assign(sim.state.players[2], { x: 10, z: 4.5 });
  Object.assign(sim.state.players[3], { x: 6.3, z: 0 });
  Object.assign(sim.state.players[4], { x: 8.2, z: -4.7 });
  Object.assign(sim.state.players[5], { x: 10.5, z: 4 });
  let minimumRange = Infinity, highestX = -100, recoveryRange = 0;
  for (let tick = 0; tick < 420; tick++) {
    sim.update(1 / 60, EMPTY_INPUT); sim.drainEvents();
    const cutter = sim.state.players[1];
    minimumRange = Math.min(minimumRange, Math.hypot(cutter.x - 12.15, cutter.z)); highestX = Math.max(highestX, cutter.x);
    if (tick === 300) recoveryRange = Math.hypot(cutter.x - 12.15, cutter.z);
  }
  return { minimumRange, highestX, recoveryRange, finalCutter: { x: sim.state.players[1].x, z: sim.state.players[1].z } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(JSON.stringify({ noScreen: screenScenario(false), screen: screenScenario(true), offBall: offBallScenario() }, null, 2));
}
