/** Reproducible, state-observing playtest bots. Run: npx tsx tests/balance-lab.ts --seeds=18 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createSimulation } from '../src/simulation.ts';
import { TEAMS } from '../src/data.ts';
import { COURT, EMPTY_INPUT, type Difficulty, type GameState, type InputFrame, type PlayerState } from '../src/types.ts';

export type Strategy = 'heaves' | 'rim-rush' | 'team-basketball';
export interface Experiment { strategy: Strategy; difficulty: Difficulty; games: number; wins: number; points: number; against: number; attempts: number; makes: number; threes: number; turnovers: number; assists: number; rebounds: number; blocks: number; possessionChanges: number; regulationMinutes: number; playedMinutes: number; heatEnabled: boolean; unfinished: number; }
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const hoop = { x: COURT.hoopX, z: 0 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const strategies: Strategy[] = ['heaves', 'rim-rush', 'team-basketball'];
const difficulties: Difficulty[] = ['rookie', 'pro', 'allstar'];

function steer(input: InputFrame, p: PlayerState, x: number, z: number, sprint = false) {
  const dx = x - p.x, dz = z - p.z, length = Math.hypot(dx, dz);
  input.moveX = length < 0.2 ? 0 : dx / Math.max(1, length);
  input.moveZ = length < 0.2 ? 0 : dz / Math.max(1, length);
  input.sprint = sprint;
}
function pressure(state: GameState, p: { x: number; z: number }) {
  return state.players.filter(q => q.side === 1).reduce((n, q) => Math.max(n, clamp(1 - dist(p, q) / 2.5, 0, 1)), 0);
}
function release(input: InputFrame, state: GameState) {
  if (state.charging) {
    input.shootHeld = state.charge < 0.69;
    input.shootReleased = !input.shootHeld;
  } else { input.shootPressed = true; input.shootHeld = true; }
}

/** All policies use only public observations and the same attainable defensive policy. */
export function policy(strategy: Strategy, state: GameState): InputFrame {
  const input = { ...EMPTY_INPUT };
  if (state.phase !== 'playing') return input;
  const p = state.players[state.controlled], ball = state.ball;
  const owner = ball.owner === null ? null : state.players[ball.owner];
  if (ball.state === 'loose') {
    steer(input, p, ball.x, ball.z, true); return input;
  }
  if (state.possession === 1) {
    const target = owner ?? ball;
    // Close out toward the basket side, but do not spam actions at every frame.
    steer(input, p, target.x - 1.0, target.z, dist(p, target) > 3.0);
    input.stealPressed = ball.state === 'held' && dist(p, target) < 1.5 && state.elapsed % 1.4 < 1 / 60;
    input.blockPressed = ball.state === 'shot' && ball.progress < 0.2 && dist(p, ball) < 2.0;
    return input;
  }
  if (!owner || ball.state !== 'held') {
    if (ball.state === 'shot') steer(input, p, COURT.hoopX - 1.2, 0, true);
    return input;
  }
  if (owner.id !== p.id) { input.passPressed = true; return input; }
  if (state.charging) { release(input, state); return input; }
  const range = dist(p, hoop), contest = pressure(state, p);
  if (strategy === 'heaves') {
    // Even after an offensive rebound this policy only attempts very deep threes.
    if (range >= 11.5 || state.shotClock < 1.2) release(input, state);
    else steer(input, p, -1.0, 0, false);
    return input;
  }
  if (strategy === 'rim-rush') {
    if (range < 1.55 || state.shotClock < 1.2) release(input, state);
    else steer(input, p, 11.2, 0, true);
    return input;
  }

  // Pass to a genuinely more open, useful shooter. Avoid endless harmless passing.
  const teammates = state.players.filter(q => q.side === 0 && q.id !== p.id && q.x > 2.0);
  const shotValue = (q: PlayerState) => (1 - pressure(state, q)) * (dist(q, hoop) > 6.75 ? q.athlete.shooting / 100 * 3 : 2) - Math.max(0, dist(q, hoop) - 8) * 0.4;
  const best = teammates.sort((a, b) => shotValue(b) - shotValue(a))[0];
  if (best && contest > 0.38 && pressure(state, best) + 0.2 < contest && state.shotClock > 3) {
    input.passPressed = true; input.passTarget = best.id; return input;
  }
  if ((range < 2.6 && contest < 0.76) || (range < 8.0 && contest < 0.38) || state.shotClock < 1.6) {
    release(input, state); return input;
  }
  if (contest > 0.42 && p.cooldown <= 0) input.crossoverPressed = true;
  if (contest > 0.4 && state.shotClock < 18 && state.elapsed % 3.3 < 1 / 60) input.callScreenPressed = true;
  const nearest = state.players.filter(q => q.side === 1 && q.x >= p.x - 0.4).sort((a, b) => dist(a, p) - dist(b, p))[0];
  let laneZ = p.z > 0 ? 1.7 : -1.7;
  if (nearest && dist(p, nearest) < 2.7) laneZ = nearest.z >= p.z ? p.z - 2.7 : p.z + 2.7;
  if (p.x > 9.4) laneZ *= 0.25;
  steer(input, p, p.x < 4 ? 6.0 : 11.0, clamp(laneZ, -5.6, 5.6), p.x < 5 || p.action === 'crossover');
  return input;
}

export function experiment(strategy: Strategy, difficulty: Difficulty, seeds = 18, seconds = 60, quarters = 4, heatEnabled = true): Experiment {
  const total: Experiment = { strategy, difficulty, games: seeds, wins: 0, points: 0, against: 0, attempts: 0, makes: 0, threes: 0, turnovers: 0, assists: 0, rebounds: 0, blocks: 0, possessionChanges: 0, regulationMinutes: seeds * seconds * quarters / 60, playedMinutes: 0, heatEnabled, unfinished: 0 };
  for (let i = 0; i < seeds; i++) {
    const home = TEAMS[(i * 7 + 9) % TEAMS.length], away = TEAMS[(i * 7 + 20) % TEAMS.length];
    const sim = createSimulation({ home, away, mode: 'exhibition', difficulty, quarterLength: seconds, quarters, playersPerTeam: i % 2 === 0 ? 3 : 5, seed: 4001 + i * 7919 });
    let lastPossession = sim.state.possession;
    for (let frame = 0; frame < 60 * (seconds * quarters + 480) && sim.state.phase !== 'finished'; frame++) {
      // Experimental ablation only: zero heat reproduces the original cosmetic momentum system.
      if (!heatEnabled) sim.state.momentum = [0, 0];
      if (sim.state.phase === 'playing' && sim.state.clock > 0) total.playedMinutes += Math.min(1 / 60, sim.state.clock) / 60;
      sim.update(1 / 60, policy(strategy, sim.state));
      if (sim.state.possession !== lastPossession) { total.possessionChanges++; lastPossession = sim.state.possession; }
      sim.drainEvents();
    }
    if (sim.state.phase !== 'finished') total.unfinished++;
    total.wins += sim.state.winner === 0 ? 1 : 0;
    total.points += sim.state.score[0]; total.against += sim.state.score[1];
    for (const p of sim.state.players.filter(p => p.side === 0)) {
      total.attempts += p.stats.fga; total.makes += p.stats.fgm; total.threes += p.stats.tpm;
      total.turnovers += p.stats.turnovers; total.assists += p.stats.assists; total.rebounds += p.stats.rebounds; total.blocks += p.stats.blocks;
    }
  }
  return total;
}

export function table(results: Experiment[]) {
  const labels: Record<Strategy, string> = { heaves: '原地超远盲投', 'rim-rush': '无传球直冲篮下', 'team-basketball': '传球、找空位与突破' };
  return ['| 策略 | 难度 | 胜率 | 场均得分 | 场均失分 | 每比赛分钟得分¹ | 命中率 | 场均失误 | 场均助攻 |', '|---|---|---:|---:|---:|---:|---:|---:|---:|', ...results.map(r => `| ${labels[r.strategy]} | ${r.difficulty} | ${(100 * r.wins / r.games).toFixed(1)}% | ${(r.points / r.games).toFixed(1)} | ${(r.against / r.games).toFixed(1)} | ${(r.points / r.playedMinutes).toFixed(2)} | ${(100 * r.makes / Math.max(1, r.attempts)).toFixed(1)}% | ${(r.turnovers / r.games).toFixed(1)} | ${(r.assists / r.games).toFixed(1)} |`)].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const argument = (name: string, fallback: number) => Number(process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
  const seeds = argument('seeds', 18), seconds = argument('seconds', 60), quarters = argument('quarters', 4);
  const results = strategies.flatMap(strategy => difficulties.map(difficulty => experiment(strategy, difficulty, seeds, seconds, quarters, !process.argv.includes('--cold'))));
  console.log(process.argv.includes('--json') ? JSON.stringify(results, null, 2) : table(results));
  if (results.some(r => r.unfinished)) process.exitCode = 1;
}
