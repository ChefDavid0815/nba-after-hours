import { COURT, EMPTY_INPUT, type BallState, type GameConfig, type GameEvent, type GameState, type InputFrame, type PlayerState, type PlayerStats, type Side } from './types';
import { playerStyle } from './roster';
import { encodeCheckpoint, decodeCheckpoint, type CheckpointSimulation, type SimulationCheckpoint } from './simulation-checkpoint';
export type { CheckpointSimulation, SimulationCheckpoint } from './simulation-checkpoint';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const direction = (side: Side) => side === 0 ? 1 : -1;
const other = (side: Side): Side => side === 0 ? 1 : 0;
const newStats = (): PlayerStats => ({ points: 0, assists: 0, rebounds: 0, steals: 0, blocks: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, turnovers: 0 });
const edgeKeys: (keyof InputFrame)[] = ['shootPressed', 'shootReleased', 'passPressed', 'switchPressed', 'stealPressed', 'blockPressed', 'crossoverPressed', 'callScreenPressed'];

/** A browser-independent, seeded basketball simulation. Distances are metres, times seconds. */
export function createSimulation(config: GameConfig): CheckpointSimulation { return buildSimulation(config); }

/** Restore only a complete validated engine snapshot, never a partially trusted state object. */
export function restoreSimulation(checkpoint: unknown): CheckpointSimulation | null {
  const snapshot = decodeCheckpoint(checkpoint);
  return snapshot ? buildSimulation(snapshot.state.config, snapshot) : null;
}

function buildSimulation(config: GameConfig, snapshot?: SimulationCheckpoint): CheckpointSimulation {
  let seed = config.seed >>> 0;
  const random = () => {
    seed += 0x6D2B79F5;
    let n = seed;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
  const challenge = config.mode === 'challenge';
  const allaroundChallenge = challenge && config.challengeKind === 'allaround';
  const solo = config.mode === 'practice' || (challenge && !allaroundChallenge);
  const localMultiplayer = !!config.localMultiplayer && config.mode === 'exhibition';
  const count = allaroundChallenge ? 3 : challenge ? 1 : clamp(Math.floor(config.playersPerTeam), 1, 5);
  const players: PlayerState[] = [];
  for (const side of (solo ? [0] : [0, 1]) as Side[]) {
    const team = side === 0 ? config.home : config.away;
    for (let slot = 0; slot < count; slot++) {
      players.push({ id: side * count + slot, side, slot, athlete: team.players[slot % team.players.length], x: 0, z: 0, vx: 0, vz: 0, facing: side === 0 ? Math.PI / 2 : -Math.PI / 2, stamina: 100, jump: 0, action: 'idle', actionTime: 0, cooldown: 0, stats: newStats() });
    }
  }
  const ball: BallState = { x: -7, y: 1, z: 0, owner: 0, state: 'held', progress: 0, startX: 0, startZ: 0, startY: 1, endX: 0, endZ: 0, endY: 1, duration: 1, arc: 0 };
  const state: GameState = { config, players, ball, score: [0, 0], quarter: 1, clock: challenge ? 60 : config.quarterLength, shotClock: 24, possession: 0, controlled: 0, phase: 'intro', phaseTime: 1.4, elapsed: 0, charging: false, charge: 0, shotFeedback: null, events: [], momentum: [0, 0], winner: null, lastScorer: null };
  if (localMultiplayer) state.controlledAway = count;
  let eventId = 0;
  let possessionAge = 0;
  let ownerAge = 0;
  let previousOwner: number | null = null;
  let lastPass: { from: number; to: number; time: number } | null = null;
  let looseVelocity = { x: 0, y: 0, z: 0 };
  let looseAge = 0;
  let pendingPeriod = false;
  let shotBlocked = false;
  let screenPlayer: number | null = null;
  let screenTime = 0;
  let screenPlan: { owner: number; defender: number; x: number; z: number; phase: 'approach' | 'set' | 'roll'; phaseTime: number; usedAt: number | null; rollX: number; rollZ: number; contacted: Set<number> } | null = null;
  const cuts = new Map<number, { phase: 'entry' | 'finish'; x: number; z: number; finishX: number; finishZ: number; remaining: number }>();
  const nextCutAt: [number, number] = [2, 2];
  let ballProtectedUntil = 0;
  let chargingPlayer: number | null = null;
  const passChallenges = new Set<number>();
  let challengeSpot = 0;
  const spotAt = (radius: number, angle: number) => ({ x: COURT.hoopX - Math.cos(angle) * radius, z: Math.sin(angle) * radius });
  const challengeSpots = config.challengeKind === 'three'
    ? [-1.12, -0.77, -0.38, 0, 0.38, 0.77, 1.12].map(angle => spotAt(7.2, angle))
    : config.challengeKind === 'inside'
      ? [1.45, 2.8, 1.85, 2.9, 1.5, 2.65, 2.05].map((radius, i) => spotAt(radius, [-1.05, -0.75, -0.4, 0, 0.4, 0.75, 1.05][i]))
      : [{ x: 5.0, z: 0 }, { x: 7.0, z: -4.8 }, { x: 10.8, z: 6.8 }, { x: 8.9, z: -2.0 }, { x: 7.0, z: 4.8 }, { x: 10.8, z: -6.8 }, { x: 9.9, z: 0 }];
  const stunned = new Map<number, number>();
  const aiTargets = new Map<number, { x: number; z: number; style: number }>();
  const aiDecision = new Map<number, number>();
  const difficulty = config.difficulty === 'rookie' ? 0 : config.difficulty === 'allstar' ? 2 : 1;

  function emit(type: GameEvent['type'], text: string, side?: Side, player?: number, value?: number) {
    state.events.push({ id: ++eventId, type, text, side, player, value });
    // Consumers may pause without draining. Keep both memory and HUD work bounded.
    if (state.events.length > 64) state.events.splice(0, state.events.length - 64);
  }
  function athleteRating(p: PlayerState, key: 'shooting' | 'finishing' | 'speed' | 'defense') {
    return clamp(p.athlete[key] || 70, 1, 100);
  }
  function heat(p: PlayerState) { return clamp((state.momentum[p.side] - 35) / 65, 0, 1); }
  function spendEnergy(p: PlayerState, amount: number) { p.stamina = Math.max(0, p.stamina - amount * (1 - heat(p) * 0.12)); }
  function hoop(side: Side) { return { x: direction(side) * COURT.hoopX, z: 0 }; }
  function cancelCharge() { state.charging = false; state.charge = 0; chargingPlayer = null; }
  function controlledFor(side: Side) { return side === 0 ? state.controlled : state.controlledAway; }
  function selectPlayer(p: PlayerState) { if (p.side === 0) state.controlled = p.id; else if (localMultiplayer) state.controlledAway = p.id; }
  function clearScreen() { screenPlayer = null; screenTime = 0; screenPlan = null; }
  function clearTactics() { clearScreen(); cuts.clear(); nextCutAt[0] = nextCutAt[1] = state.elapsed + 2; }
  function setAction(p: PlayerState, action: PlayerState['action'], time: number) { p.action = action; p.actionTime = time; }
  function resetPositions(side: Side, initial = false) {
    if (solo) {
      for (const p of players) {
        if (initial || config.mode === 'challenge') {
          const spot = config.mode === 'challenge' ? challengeSpots[challengeSpot % challengeSpots.length] : { x: 5.8, z: 0 };
          p.x = spot.x - p.slot; p.z = spot.z + p.slot * 1.6;
        }
        p.vx = p.vz = p.jump = 0; p.action = 'idle'; p.actionTime = 0;
        p.facing = Math.atan2(COURT.hoopX - p.x, -p.z); p.stamina = 100;
      }
      state.controlled = 0; state.possession = 0; state.shotClock = 24;
      ball.owner = 0; ball.state = 'held'; ball.progress = 0;
      ball.from = undefined; ball.target = undefined; ball.made = undefined;
      previousOwner = null; ownerAge = 0; lastPass = null;
      clearTactics();
      ballProtectedUntil = state.elapsed + 0.7;
      cancelCharge(); syncHeld(); return;
    }
    const dir = direction(side);
    for (const p of players) {
      const attacking = p.side === side;
      const spread = count === 3 ? [0, -4.2, 4.2] : [0, -4.9, 4.9, -2.5, 2.5];
      p.x = dir * (attacking ? -7.8 + p.slot * 1.1 : 2.0 + p.slot * 0.7);
      p.z = spread[p.slot] || 0;
      p.vx = p.vz = p.jump = 0;
      p.facing = Math.atan2(dir, 0);
      p.action = 'idle'; p.actionTime = 0;
      p.stamina = Math.min(100, p.stamina + (initial ? 100 : 4));
    }
    state.possession = side;
    state.shotClock = 24;
    ball.owner = side * count;
    ball.state = 'held'; ball.progress = 0;
    ball.from = undefined; ball.target = undefined; ball.made = undefined;
    state.controlled = side === 0 ? ball.owner : nearestPlayer(0, players[ball.owner]);
    if (localMultiplayer) state.controlledAway = side === 1 ? ball.owner : nearestPlayer(1, players[ball.owner]);
    possessionAge = ownerAge = 0; previousOwner = null;
    lastPass = null; clearTactics();
    aiTargets.clear(); aiDecision.clear(); stunned.clear();
    ballProtectedUntil = state.elapsed + 1.0;
    cancelCharge(); syncHeld();
  }
  function nearestPlayer(side: Side, to: { x: number; z: number }) {
    return players.filter(p => p.side === side).sort((a, b) => distance(a, to) - distance(b, to))[0].id;
  }
  function syncHeld() {
    if (ball.owner === null) return;
    const p = players[ball.owner];
    const dribble = Math.abs(Math.sin(state.elapsed * 10.5));
    ball.x = p.x + Math.sin(p.facing) * 0.35;
    ball.z = p.z + Math.cos(p.facing) * 0.35;
    ball.y = state.charging ? 1.55 + p.jump : 0.3 + dribble * 0.8 + p.jump;
  }
  function changePossession(side: Side) {
    if (state.possession !== side) {
      state.possession = side; state.shotClock = 24; possessionAge = 0;
      aiTargets.clear(); lastPass = null; cancelCharge(); clearTactics();
    }
  }
  function inbound(side: Side, text?: string) {
    state.phase = 'inbound'; state.phaseTime = 1.15;
    ball.owner = null; ball.state = 'dead'; cancelCharge();
    for (const p of players) { p.vx = p.vz = 0; if (p.actionTime <= 0) p.action = 'idle'; }
    state.possession = side; possessionAge = 0;
    if (text) emit('whistle', text, side);
  }
  function finish() {
    state.phase = 'finished'; state.winner = solo || (challenge && state.score[0] === state.score[1]) ? 0 : state.score[0] > state.score[1] ? 0 : 1;
    ball.owner = null; ball.state = 'dead'; cancelCharge();
    for (const p of players) { p.vx = p.vz = p.jump = 0; p.action = 'idle'; p.actionTime = 0; }
    emit('gameover', 'Final', state.winner, undefined, state.score[state.winner]);
  }
  function nextPeriod() {
    pendingPeriod = false;
    emit('buzzer', 'End of quarter');
    if (config.mode === 'challenge') { finish(); return; }
    if (state.quarter >= config.quarters && state.score[0] !== state.score[1]) { finish(); return; }
    state.quarter++;
    state.clock = state.quarter > config.quarters ? Math.min(60, config.quarterLength) : config.quarterLength;
    state.phase = 'halftime'; state.phaseTime = 2.7;
    state.possession = state.quarter % 2 === 0 ? 1 : 0;
    ball.state = 'dead'; ball.owner = null; cancelCharge();
    for (const p of players) { p.vx = p.vz = 0; if (p.actionTime <= 0) p.action = 'idle'; }
    emit('quarter', state.quarter > config.quarters ? 'Overtime' : 'Next quarter', undefined, undefined, state.quarter);
  }
  function contestAt(p: PlayerState) {
    let contest = 0;
    for (const defender of players) {
      if (defender.side === p.side) continue;
      const d = distance(p, defender);
      const facingHoop = (defender.x - p.x) * direction(p.side) > -0.65;
      let contribution = clamp(1 - d / 2.5, 0, 1) * (facingHoop ? 1 : 0.55);
      contribution *= (0.72 + athleteRating(defender, 'defense') / 300) * (defender.action === 'block' ? 1.3 : 1);
      if ((stunned.get(defender.id) || 0) > 0) contribution *= 0.35;
      contest = Math.max(contest, contribution);
    }
    return clamp(contest, 0, 1);
  }
  function releaseShot(p: PlayerState, timing: number, ai = false) {
    if (ball.state !== 'held' || ball.owner !== p.id) return;
    clearTactics();
    const target = hoop(p.side);
    const d = distance(p, target);
    const contest = contestAt(p);
    const perfect = timing >= 0.625 && timing <= 0.775;
    const dunk = d < 2.15 && p.stamina > 13 && athleteRating(p, 'finishing') >= 72 && contest < 0.82;
    const points = d >= COURT.threeRadius ? 3 : 2;
    const rating = athleteRating(p, d < 3.2 ? 'finishing' : 'shooting');
    const base = dunk ? 0.93 : d < 2.7 ? 0.80 : d < 5 ? 0.59 : d < 6.75 ? 0.48 : d < 8.4 ? 0.43 : Math.max(0.07, 0.38 - (d - 8.4) * 0.048);
    // Heat softens imperfect timing; the visible green window and its definition stay fixed.
    const timingBonus = perfect ? 0.21 : 0.035 - Math.abs(timing - 0.70) * 0.75 * (1 - heat(p) * 0.22);
    const tiredPenalty = Math.max(0, 35 - p.stamina) * 0.004;
    const aiBonus = ai && p.side === 1 && !localMultiplayer ? (difficulty - 1) * 0.055 : 0;
    const rangePenalty = Math.max(0, d - 8.5) * 0.027;
    let quality = clamp(base + (rating - 78) * 0.004 + timingBonus - contest * (dunk ? 0.18 : 0.35) - tiredPenalty - rangePenalty + aiBonus, 0.035, 0.98);
    // Timing should reward skill without making a non-shooting centre identical to Curry.
    if (perfect && contest < 0.25 && d < 8.5 && !ai) quality = Math.max(quality, clamp(0.82 + (rating - 60) * 0.006 - tiredPenalty, 0.64, 0.985));
    const made = random() < quality;
    p.stats.fga++; if (points === 3) p.stats.tpa++;
    spendEnergy(p, dunk ? 7 : 3);
    p.facing = Math.atan2(target.x - p.x, -p.z);
    setAction(p, dunk ? 'dunk' : 'shoot', dunk ? 0.72 : 0.6);
    p.cooldown = Math.max(p.cooldown, 0.55);
    Object.assign(ball, { owner: null, state: 'shot', from: p.id, target: undefined, progress: 0, startX: p.x, startZ: p.z, startY: dunk ? 2.5 : 2.0, endX: target.x, endZ: 0, endY: COURT.hoopY, duration: dunk ? 0.46 : 0.52 + d * 0.046, arc: dunk ? 0.55 : 1.3 + d * 0.18, made, points });
    shotBlocked = false;
    if (p.side === 0 || localMultiplayer) state.shotFeedback = { text: dunk ? 'Slam dunk' : perfect ? 'Perfect release' : timing < 0.625 ? 'Early release' : 'Late release', quality, timing, contest, perfect, ttl: 2.3 };
    emit(dunk ? 'dunk' : 'shot', dunk ? 'Slam dunk' : points === 3 ? 'For three' : 'Jump shot', p.side, p.id, points);
    if (perfect && !ai) emit('perfect', 'Perfect release', p.side, p.id);
    cancelCharge();
  }
  function throwPass(p: PlayerState, requested?: number) {
    if (ball.owner !== p.id || ball.state !== 'held') return;
    const teammates = players.filter(q => q.side === p.side && q.id !== p.id);
    if (!teammates.length) return;
    let target = teammates.find(q => q.id === requested);
    if (!target) {
      target = teammates.sort((a, b) => {
        const passScore = (q: PlayerState) => (1 - contestAt(q)) * 4 + q.x * direction(p.side) * 0.22 - distance(p, q) * 0.10 - passingLaneRisk(p, q) * 4.5;
        return passScore(b) - passScore(a);
      })[0];
    }
    const d = distance(p, target);
    passChallenges.clear();
    Object.assign(ball, { owner: null, state: 'pass', from: p.id, target: target.id, progress: 0, startX: p.x, startZ: p.z, startY: 1.15, endX: target.x, endZ: target.z, endY: 1.0, duration: clamp(d / 19, 0.2, 0.62), arc: d > 8 ? 0.8 : 0.35 });
    lastPass = { from: p.id, to: target.id, time: state.elapsed };
    p.cooldown = 0.25; cancelCharge();
    emit('pass', 'Pass', p.side, p.id);
  }
  function passingLaneRisk(from: PlayerState, to: PlayerState) {
    const dx = to.x - from.x, dz = to.z - from.z, lengthSquared = dx * dx + dz * dz;
    if (lengthSquared < 0.1) return 0;
    let risk = 0;
    for (const defender of players) {
      if (defender.side === from.side) continue;
      const t = ((defender.x - from.x) * dx + (defender.z - from.z) * dz) / lengthSquared;
      if (t < 0.16 || t > 0.84) continue;
      const gap = Math.hypot(defender.x - from.x - t * dx, defender.z - from.z - t * dz);
      risk = Math.max(risk, clamp(1 - gap / 1.0, 0, 1));
    }
    return risk;
  }
  function makeLoose(x: number, z: number, y: number, vx: number, vz: number, vy: number) {
    Object.assign(ball, { state: 'loose', owner: null, x, z, y, progress: 0 });
    looseVelocity = { x: vx, z: vz, y: vy }; looseAge = 0;
    lastPass = null; cancelCharge();
  }
  function attemptSteal(p: PlayerState, ai = false) {
    if (p.cooldown > 0 || ball.state !== 'held' || ball.owner === null) return;
    const owner = players[ball.owner];
    if (owner.side === p.side) return;
    setAction(p, 'steal', 0.46); p.cooldown = ai ? 1.85 : 1.10;
    spendEnergy(p, 5.5);
    const d = distance(p, owner);
    // Reaching is a commitment: a miss opens a driving lane instead of being free pressure.
    const failedReach = () => stunned.set(p.id, Math.max(stunned.get(p.id) || 0, 0.40));
    if (d > 1.62 || state.elapsed < ballProtectedUntil) { failedReach(); return; }
    const ux = (p.x - owner.x) / Math.max(0.01, d), uz = (p.z - owner.z) / Math.max(0.01, d);
    const ownerAngle = ux * Math.sin(owner.facing) + uz * Math.cos(owner.facing);
    const defenderAngle = -ux * Math.sin(p.facing) - uz * Math.cos(p.facing);
    const approach = ownerAngle > 0.35 ? 0.68 : ownerAngle < -0.45 ? 0.58 : 1;
    const facing = defenderAngle < -0.3 ? 0.80 : 1;
    const handle = athleteRating(owner, 'speed') * 0.45 + athleteRating(owner, 'shooting') * 0.30 + athleteRating(owner, 'finishing') * 0.25 + (playerStyle(owner.athlete).passBias > 0.8 ? 6 : 0);
    const exposure = owner.action === 'crossover' ? 0.22 : state.charging ? 1.12 : 1;
    const rookieHelp = !ai && difficulty === 0 ? 0.045 : 0;
    const chance = clamp((0.14 + (athleteRating(p, 'defense') - handle) * 0.002 + (1 - d / 1.62) * 0.18 + rookieHelp) * approach * facing * exposure * (ai ? 0.70 + difficulty * 0.10 : 1), 0.018, 0.42);
    if (random() < chance) {
      owner.stats.turnovers++; p.stats.steals++;
      ball.owner = p.id; ball.state = 'held';
      changePossession(p.side); ownerAge = 0;
      ballProtectedUntil = state.elapsed + 1.2;
      stunned.set(owner.id, Math.max(stunned.get(owner.id) || 0, 0.30));
      selectPlayer(p);
      emit('steal', 'Steal', p.side, p.id);
      state.momentum[p.side] = clamp(state.momentum[p.side] + 8, 0, 100);
    } else failedReach();
  }
  function tryBlock(p: PlayerState, ai = false) {
    if (p.cooldown > 0) return;
    setAction(p, 'block', 0.7); p.cooldown = ai ? 1.5 : 0.8;
    spendEnergy(p, 5);
  }
  function resolveBlock(p: PlayerState) {
    if (p.action !== 'block' || p.actionTime > 0.65 || p.actionTime < 0.12 || ball.state !== 'shot' || ball.from === undefined || shotBlocked) return;
    const shooter = players[ball.from];
    if (p.side === shooter.side || ball.progress > 0.58) return;
    const reach = 1.25 + Math.max(0, p.athlete.height - 1.85) * 0.7;
    const handReach = 2.68 + Math.max(0, p.athlete.height - 1.85) * 0.65 + p.jump;
    if (Math.hypot(ball.x - p.x, ball.z - p.z) > reach || ball.y > handReach) return;
    shotBlocked = true;
    if (random() > 0.4 + athleteRating(p, 'defense') / 200) return;
    p.stats.blocks++;
    emit('block', 'Blocked', p.side, p.id);
    makeLoose(ball.x, ball.z, Math.min(ball.y, 3.0), direction(p.side) * 3.5, (random() - 0.5) * 5, 1.5);
  }
  function crossover(p: PlayerState) {
    if (ball.owner !== p.id || p.cooldown > 0 || p.stamina < 9) return;
    setAction(p, 'crossover', 0.55); p.cooldown = 0.8; spendEnergy(p, 9);
    emit('crossover', 'Crossover', p.side, p.id);
    for (const d of players) if (d.side !== p.side && distance(p, d) < 1.8 && random() < 0.78) stunned.set(d.id, 0.75);
  }
  function callScreen(p: PlayerState) {
    if (ball.owner !== p.id || screenTime > 0) return;
    const teammate = players.filter(q => q.side === p.side && q.id !== p.id && q.id !== controlledFor(p.side)).sort((a, b) => (distance(a, p) - playerStyle(a.athlete).paintPresence * 1.2) - (distance(b, p) - playerStyle(b.athlete).paintPresence * 1.2))[0];
    if (!teammate) return;
    const defender = players.filter(q => q.side !== p.side).sort((a, b) => distance(a, p) - distance(b, p))[0];
    if (!defender) return;
    const dir = direction(p.side), wing = Math.sign(teammate.z - p.z) || 1;
    const personality = playerStyle(teammate.athlete), pop = personality.threeBias > 0.75 && personality.paintPresence < 0.5;
    screenPlayer = teammate.id; screenTime = 5.4;
    screenPlan = { owner: p.id, defender: defender.id, x: clamp(defender.x + dir * 0.18, -12.8, 12.8), z: clamp(defender.z + wing * 0.72, -6.4, 6.4), phase: 'approach', phaseTime: 0, usedAt: null, rollX: dir * (pop ? 7.0 : 11.1), rollZ: wing * (pop ? 5.6 : 1.3), contacted: new Set() };
    cuts.delete(teammate.id);
    emit('tip', 'Screen called', p.side, teammate.id);
  }
  function updateTactics(dt: number) {
    screenTime = Math.max(0, screenTime - dt);
    if (screenTime <= 0) clearScreen();
    if (screenPlan && screenPlayer !== null) {
      screenPlan.phaseTime += dt;
      if (players[screenPlayer].side !== state.possession || ball.owner === screenPlayer || controlledFor(players[screenPlayer].side) === screenPlayer) clearScreen();
      else if (ball.owner !== null && ball.owner !== screenPlan.owner && screenPlan.phase !== 'roll') { screenPlan.phase = 'roll'; screenPlan.phaseTime = 0; }
    }
    for (const [id, cut] of cuts) {
      cut.remaining -= dt;
      if (cut.remaining <= 0 || players[id].side !== state.possession || ball.owner === id || controlledFor(players[id].side) === id) cuts.delete(id);
    }
    if (screenTime > 0 || ball.state !== 'held' || ball.owner === null || state.charging || cuts.size > 0) return;
    const owner = players[ball.owner], dir = direction(owner.side);
    if (owner.x * dir < 2.5 || possessionAge < 1.4 || state.elapsed < nextCutAt[owner.side]) return;
    nextCutAt[owner.side] = state.elapsed + 0.65;
    const candidates = players.filter(p => {
      if (p.side !== owner.side || p.id === owner.id || p.id === controlledFor(p.side) || p.x * dir < 3 || p.x * dir > 9.7 || Math.abs(p.z) < 2.8 || p.stamina < 20) return false;
      const defender = players.filter(q => q.side !== p.side).sort((a, b) => distance(a, p) - distance(b, p))[0];
      const finish = { x: dir * 11.1, z: Math.sign(p.z) * 1.15 };
      return defender && distance(defender, p) < 2.8 && Math.abs(defender.z) < Math.abs(p.z) - 0.2 && !players.some(q => q.side !== p.side && q.id !== defender.id && distance(q, finish) < 1.35);
    }).sort((a, b) => (playerStyle(b.athlete).driveBias + b.athlete.finishing / 100) - (playerStyle(a.athlete).driveBias + a.athlete.finishing / 100));
    const cutter = candidates[0];
    if (!cutter) return;
    const wing = Math.sign(cutter.z) || 1;
    cuts.set(cutter.id, { phase: 'entry', x: dir * Math.min(11.1, cutter.x * dir + 1.65), z: wing * Math.min(6.4, Math.abs(cutter.z) + 0.5), finishX: dir * 11.1, finishZ: wing * 1.15, remaining: 2.1 });
    nextCutAt[owner.side] = state.elapsed + 4.6;
  }
  function move(p: PlayerState, dx: number, dz: number, dt: number, sprint: boolean) {
    const length = Math.hypot(dx, dz);
    if (length > 1) { dx /= length; dz /= length; }
    const moving = length > 0.06;
    const activeSprint = moving && sprint && p.stamina > 4;
    const fatigue = 0.78 + Math.min(p.stamina, 45) / 45 * 0.22;
    let speed = (4.1 + athleteRating(p, 'speed') * 0.022) * fatigue * (activeSprint ? 1.30 : 1);
    if (state.charging && ball.owner === p.id) speed *= 0.38;
    if (p.action === 'shoot' || p.action === 'dunk' || p.action === 'block') speed *= 0.32;
    if (p.action === 'crossover') speed *= 1.23;
    if ((stunned.get(p.id) || 0) > 0) speed *= 0.25;
    p.vx = dx * speed; p.vz = dz * speed;
    p.x = clamp(p.x + p.vx * dt, -13.5, 13.5);
    p.z = clamp(p.z + p.vz * dt, -7.0, 7.0);
    if (moving) p.facing = Math.atan2(dx, dz);
    if (p.actionTime <= 0) p.action = moving ? 'run' : 'idle';
    p.stamina = clamp(p.stamina + dt * (activeSprint ? -10 * (1 - heat(p) * 0.12) : moving ? 3.5 : 7), 0, 100);
  }
  function moveToward(p: PlayerState, target: { x: number; z: number }, dt: number, sprint = false, stop = 0.22) {
    const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    const scale = d < stop ? 0 : Math.min(1, d / 1.2);
    move(p, d ? dx / d * scale : 0, d ? dz / d * scale : 0, dt, sprint);
  }
  function offensiveSpot(p: PlayerState) {
    const dir = direction(p.side);
    const formations = count === 3 ? [{ x: 5.1, z: 0 }, { x: 8.0, z: -5.8 }, { x: 9.5, z: 4.2 }] : [{ x: 4.8, z: 0 }, { x: 6.5, z: -5.7 }, { x: 6.5, z: 5.7 }, { x: 10.2, z: -3.6 }, { x: 10.2, z: 3.6 }];
    const spot = { ...formations[p.slot] };
    const personality = playerStyle(p.athlete), wing = p.slot % 2 === 0 ? 1 : -1;
    if (personality.paintPresence > 0.85) { spot.x = 10.6; spot.z = wing * 2.4; }
    else if (personality.threeBias > 0.7 && p.slot !== 0) { spot.x = 7.1; spot.z = wing * 5.6; }
    const owner = ball.owner !== null ? players[ball.owner] : null;
    // Clear a teammate's drive instead of standing in the same lane with the ball handler.
    if (owner && owner.id !== p.id && owner.x * dir > 7.5 && spot.x > owner.x * dir - 0.8 && Math.abs(spot.z - owner.z) < 1.8) spot.z = (Math.sign(spot.z) || wing) * Math.min(6.4, Math.max(Math.abs(spot.z) + 1.4, Math.abs(owner.z) + 2.2));
    // Fill lanes in transition, then settle into a spread half-court offence.
    const advance = owner ? Math.min(0, owner.x * dir - 3) * 0.55 : 0;
    return { x: dir * (spot.x + advance), z: spot.z + Math.sin(state.elapsed * 0.75 + p.slot * 2) * 0.35 };
  }
  function runAI(p: PlayerState, dt: number) {
    const owner = ball.owner !== null ? players[ball.owner] : null;
    if (ball.state === 'loose') { moveToward(p, ball, dt, true, 0.08); return; }
    if (ball.state === 'shot') {
      const shooter = ball.from === undefined ? null : players[ball.from];
      const h = hoop(shooter?.side ?? state.possession);
      const spread = (p.slot - (count - 1) / 2) * 0.7;
      moveToward(p, { x: h.x - direction(shooter?.side ?? state.possession) * (1.3 + p.slot * 0.2), z: spread }, dt, false);
      if (shooter && shooter.side !== p.side && distance(p, shooter) < 2.2 && ball.progress < 0.24 && p.cooldown <= 0 && random() < dt * (5 + difficulty * 3)) tryBlock(p, true);
      return;
    }
    if (owner?.id === p.id) {
      const dir = direction(p.side), h = hoop(p.side), d = distance(p, h), contest = contestAt(p);
      const personality = playerStyle(p.athlete);
      let target = aiTargets.get(p.id);
      if (!target) {
        const style = random(), threeChance = personality.threeBias < 0.12 ? 0 : 0.03 + personality.threeBias * 0.43;
        const driveChance = 0.27 + personality.driveBias * 0.34 + personality.paintPresence * 0.10;
        if (style < threeChance) {
          const angle = (random() < 0.5 ? -1 : 1) * (0.30 + random() * 0.24);
          const radius = 7.15 + personality.threeBias * 0.20;
          target = { x: dir * (COURT.hoopX - Math.cos(angle) * radius), z: Math.sin(angle) * radius, style };
        } else if (style < threeChance + driveChance) {
          target = { x: dir * (10.6 + personality.paintPresence * 0.45), z: (random() - 0.5) * 2.4, style };
        } else {
          target = { x: dir * (COURT.hoopX - clamp(personality.preferredDistance, 3.2, 6.2)), z: (random() - 0.5) * 2.8, style };
        }
        aiTargets.set(p.id, target);
      }
      // Defer decisions slightly so a received pass can be read and defended.
      const ready = state.elapsed >= (aiDecision.get(p.id) || 0);
      if (ready && ownerAge > 0.45 * personality.releaseMultiplier) {
        aiDecision.set(p.id, state.elapsed + 0.2 + random() * 0.12);
        const nearSpot = distance(p, target) < 1.0;
        const mustShoot = state.shotClock < 2.0 || (state.clock < 1.0 && config.mode !== 'practice');
        const comfortableRange = personality.preferredDistance + (personality.paintPresence > 0.8 ? 1.0 : 2.0);
        const openShot = d < Math.min(8.1, comfortableRange) && contest < 0.34 && (nearSpot || ownerAge > 2.8);
        const inside = d < 2.5 && (contest < 0.77 || ownerAge > 3.0);
        const settled = d < Math.min(7.5, personality.preferredDistance + 1.8) && ownerAge > 5.3;
        if (mustShoot || openShot || inside || settled) {
          const timing = 0.70 + (random() - 0.5) * (0.34 - difficulty * 0.065);
          releaseShot(p, timing, true); return;
        }
        if (ownerAge > 1.25 + (1 - personality.passBias) * 1.4 && contest > 0.48 - personality.passBias * 0.2 && count > 1) {
          const open = players.filter(q => q.side === p.side && q.id !== p.id && q.x * dir > -1).sort((a, b) => (contestAt(a) + passingLaneRisk(p, a) * 0.8) - (contestAt(b) + passingLaneRisk(p, b) * 0.8))[0];
          if (open && passingLaneRisk(p, open) < 0.58 && contestAt(open) + 0.25 - personality.passBias * 0.12 < contest && random() < 0.27 + personality.passBias * 0.33) { throwPass(p, open.id); return; }
        }
        if (personality.passBias > 0.8 && ownerAge > 1.1 && contest > 0.35 && screenTime <= 0 && random() < 0.10) callScreen(p);
        if (contest > 0.6 && p.cooldown <= 0 && ownerAge > 1.2 && random() < 0.22) crossover(p);
      }
      if (screenPlan?.owner === p.id && screenPlayer !== null && screenPlan.phase !== 'roll') {
        if (screenPlan.phase === 'approach') move(p, 0, 0, dt, false);
        else {
          const wing = Math.sign(screenPlan.rollZ) || 1;
          moveToward(p, { x: screenPlan.x + dir * 1.4, z: screenPlan.z + wing * 1.15 }, dt, true);
        }
        return;
      }
      // Curve around the nearest defender instead of pushing forever into a body.
      let targetZ = target.z;
      const obstacle = players.filter(q => q.side !== p.side && (q.x - p.x) * dir > 0 && distance(p, q) < 2.2).sort((a, b) => distance(a, p) - distance(b, p))[0];
      if (obstacle && d > 3) targetZ += p.z > obstacle.z ? 2.1 : -2.1;
      moveToward(p, { x: target.x, z: clamp(targetZ, -6.2, 6.2) }, dt, p.x * dir < 1 || p.action === 'crossover');
      return;
    }
    if (p.side === state.possession) {
      if (screenPlayer === p.id && screenPlan) {
        if (screenPlan.phase === 'approach') {
          moveToward(p, screenPlan, dt, true, 0.10);
          if (distance(p, screenPlan) < 0.13) { screenPlan.phase = 'set'; screenPlan.phaseTime = 0; screenPlan.x = p.x; screenPlan.z = p.z; spendEnergy(p, 2); }
          else if (screenPlan.phaseTime > 1.75) { screenPlan.phase = 'roll'; screenPlan.phaseTime = 0; }
        } else if (screenPlan.phase === 'set') {
          move(p, 0, 0, dt, false);
          const handler = players[screenPlan.owner]; p.facing = Math.atan2(handler.x - p.x, handler.z - p.z);
          const used = screenPlan.usedAt !== null && state.elapsed - screenPlan.usedAt > 0.18;
          if (screenPlan.phaseTime > 1.65 || (screenPlan.phaseTime > 0.32 && (used || (handler.x - p.x) * direction(p.side) > 0.85))) { screenPlan.phase = 'roll'; screenPlan.phaseTime = 0; }
        } else {
          moveToward(p, { x: screenPlan.rollX, z: screenPlan.rollZ }, dt, true);
          if (screenPlan.phaseTime > 1.9) clearScreen();
        }
      } else if (cuts.has(p.id)) {
        const cut = cuts.get(p.id)!;
        if (cut.phase === 'entry') {
          moveToward(p, cut, dt, true, 0.12);
          if (distance(p, cut) < 0.55) cut.phase = 'finish';
        } else moveToward(p, { x: cut.finishX, z: cut.finishZ }, dt, true);
      } else moveToward(p, offensiveSpot(p), dt, Math.abs(p.x) > 6 && p.x * direction(p.side) < 0);
      return;
    }
    const matchup = players.find(q => q.side !== p.side && q.slot === p.slot)!;
    let marked = matchup;
    if (owner) {
      const nearestDefender = players.filter(q => q.side === p.side).sort((a, b) => distance(a, owner) - distance(b, owner))[0];
      if (nearestDefender.id === p.id) marked = owner;
    }
    const attackDir = direction(other(p.side));
    const onBall = owner?.id === marked.id;
    let target = { x: marked.x + attackDir * (onBall ? 1.20 + (2 - difficulty) * 0.1 : 0.8), z: marked.z * (onBall ? 0.99 : 0.87) };
    if (screenPlayer !== null && screenPlan?.phase === 'set' && players[screenPlayer].side !== p.side) {
      const screener = players[screenPlayer], gap = distance(p, screener);
      const dx = target.x - p.x, dz = target.z - p.z, length = Math.hypot(dx, dz);
      // Contact requires chasing into a planted pick; standing beside it cannot consume the screen early.
      const closingOnScreen = dx * (screener.x - p.x) + dz * (screener.z - p.z) > 0.1;
      if (gap < 0.99 && closingOnScreen && owner && Math.hypot(owner.vx, owner.vz) > 0.5 && !screenPlan.contacted.has(p.id)) {
        screenPlan.contacted.add(p.id);
        if (p.id === screenPlan.defender) screenPlan.usedAt = state.elapsed;
        stunned.set(p.id, Math.max(stunned.get(p.id) || 0, 0.52 + playerStyle(screener.athlete).paintPresence * 0.16));
      }
      const projection = length > 0.01 ? ((screener.x - p.x) * dx + (screener.z - p.z) * dz) / (length * length) : -1;
      const laneGap = Math.hypot(screener.x - p.x - projection * dx, screener.z - p.z - projection * dz);
      if (gap < 2.7 && projection > 0 && projection < 1 && laneGap < 0.98) {
        const nx = -dz / length, nz = dx / length, around = (p.x - screener.x) * nx + (p.z - screener.z) * nz >= 0 ? 1 : -1;
        target = { x: screener.x + nx * around * 1.15, z: screener.z + nz * around * 1.15 };
      }
    }
    moveToward(p, target, dt, distance(p, target) > 4);
    if (onBall && owner && p.cooldown <= 0 && state.elapsed >= ballProtectedUntil && ownerAge > 0.65 && distance(p, owner) < 1.5 && random() < dt * (0.14 + difficulty * 0.055)) attemptSteal(p, true);
  }
  function separatePlayers() {
    for (let a = 0; a < players.length; a++) for (let b = a + 1; b < players.length; b++) {
      const p = players[a], q = players[b], dx = q.x - p.x, dz = q.z - p.z;
      const pBraced = p.id === screenPlayer && screenPlan?.phase === 'set' && p.side !== q.side;
      const qBraced = q.id === screenPlayer && screenPlan?.phase === 'set' && p.side !== q.side;
      const d = Math.hypot(dx, dz), minimum = p.side === q.side ? 0.59 : pBraced || qBraced ? 0.88 : 0.68;
      if (d >= minimum) continue;
      const nx = d > 0.001 ? dx / d : 1, nz = d > 0.001 ? dz / d : 0;
      const correction = (minimum - d) * 0.96, pShare = pBraced ? 0.12 : qBraced ? 0.88 : 0.5;
      p.x = clamp(p.x - nx * correction * pShare, -13.5, 13.5); p.z = clamp(p.z - nz * correction * pShare, -7, 7);
      q.x = clamp(q.x + nx * correction * (1 - pShare), -13.5, 13.5); q.z = clamp(q.z + nz * correction * (1 - pShare), -7, 7);
    }
  }
  function finishShot() {
    const shooter = players[ball.from!];
    if (ball.made) {
      const points = ball.points || 2;
      state.score[shooter.side] += points; shooter.stats.points += points;
      shooter.stats.fgm++; if (points === 3) shooter.stats.tpm++;
      state.lastScorer = shooter.id;
      if (lastPass && lastPass.to === shooter.id && state.elapsed - lastPass.time < 5 && lastPass.from !== shooter.id) players[lastPass.from].stats.assists++;
      state.momentum[shooter.side] = clamp(state.momentum[shooter.side] + (points === 3 ? 11 : 7), 0, 100);
      state.momentum[other(shooter.side)] = Math.max(0, state.momentum[other(shooter.side)] - 5);
      emit('score', points === 3 ? 'Three pointer' : 'Basket', shooter.side, shooter.id, points);
      if (!solo && !challenge && config.targetScore && state.score[shooter.side] >= config.targetScore) { finish(); return; }
      if (pendingPeriod) { nextPeriod(); return; }
      if (solo) returnSoloBall(); else inbound(other(shooter.side));
    } else {
      emit('miss', 'Off the rim', shooter.side, shooter.id);
      if (pendingPeriod) { nextPeriod(); return; }
      if (solo) { returnSoloBall(); return; }
      const reboundAngle = random() * Math.PI * 2;
      makeLoose(ball.x, ball.z, COURT.hoopY, Math.cos(reboundAngle) * (2.4 + random() * 2), Math.sin(reboundAngle) * (2.4 + random() * 2), 1.8);
    }
  }
  function returnSoloBall() {
    if (config.mode === 'challenge') challengeSpot++;
    state.phase = 'inbound'; state.phaseTime = config.mode === 'practice' ? 0.55 : 0.4;
    ball.owner = null; ball.state = 'dead'; state.possession = 0; cancelCharge();
    for (const p of players) { p.vx = p.vz = 0; if (p.actionTime <= 0) p.action = 'idle'; }
  }
  function updateBall(dt: number) {
    if (ball.state === 'held') { syncHeld(); return; }
    if (ball.state === 'dead') return;
    if (ball.state === 'shot' || ball.state === 'pass') {
      const flight = ball.state;
      ball.progress = Math.min(1, ball.progress + dt / ball.duration);
      if (flight === 'pass' && ball.target !== undefined) { ball.endX = players[ball.target].x; ball.endZ = players[ball.target].z; }
      const t = ball.progress;
      ball.x = ball.startX + (ball.endX - ball.startX) * t;
      ball.z = ball.startZ + (ball.endZ - ball.startZ) * t;
      ball.y = ball.startY + (ball.endY - ball.startY) * t + Math.sin(t * Math.PI) * ball.arc;
      if (flight === 'shot') {
        for (const p of players) resolveBlock(p);
        if (ball.state !== 'shot') return;
        if (t >= 1) finishShot();
      } else {
        const passer = players[ball.from!];
        for (const defender of players) {
          if (defender.side === passer.side || t < 0.18 || t > 0.82 || ball.y > 1.85 || distance(defender, ball) > 0.60 || defender.cooldown > 0.1 || passChallenges.has(defender.id)) continue;
          passChallenges.add(defender.id);
          const interceptionChance = clamp(0.12 + (athleteRating(defender, 'defense') - 70) * 0.003, 0.08, 0.23);
          if (random() < interceptionChance) {
            passer.stats.turnovers++; defender.stats.steals++;
            ball.owner = defender.id; ball.state = 'held'; changePossession(defender.side);
            ballProtectedUntil = state.elapsed + 1.0; defender.cooldown = Math.max(defender.cooldown, 0.8); ownerAge = 0;
            selectPlayer(defender);
            emit('steal', 'Pass intercepted', defender.side, defender.id); return;
          }
        }
        if (t >= 1 && ball.target !== undefined) {
          ball.owner = ball.target; ball.state = 'held'; ownerAge = 0;
          ballProtectedUntil = state.elapsed + 0.55;
          selectPlayer(players[ball.owner]);
          syncHeld();
        }
      }
      return;
    }
    looseAge += dt;
    looseVelocity.y -= 9.8 * dt;
    ball.x += looseVelocity.x * dt; ball.z += looseVelocity.z * dt; ball.y += looseVelocity.y * dt;
    if (ball.y < 0.24) { ball.y = 0.24; looseVelocity.y = Math.abs(looseVelocity.y) * 0.5; looseVelocity.x *= 0.73; looseVelocity.z *= 0.73; }
    if (Math.abs(ball.x) > 13.6) { ball.x = clamp(ball.x, -13.6, 13.6); looseVelocity.x *= -0.6; }
    if (Math.abs(ball.z) > 7.1) { ball.z = clamp(ball.z, -7.1, 7.1); looseVelocity.z *= -0.6; }
    const candidates = players.filter(p => distance(p, ball) < 0.85 && ball.y < 1.9 + p.jump && p.action !== 'shoot' && p.action !== 'dunk').sort((a, b) => distance(a, ball) - distance(b, ball));
    if (looseAge > 0.17 && candidates.length) {
      const p = candidates[0], offensive = p.side === state.possession;
      p.stats.rebounds++; ball.owner = p.id; ball.state = 'held';
      if (offensive) state.shotClock = 14; else changePossession(p.side);
      ownerAge = 0; aiTargets.delete(p.id);
      ballProtectedUntil = state.elapsed + 0.65;
      selectPlayer(p);
      emit('rebound', offensive ? 'Offensive rebound' : 'Defensive rebound', p.side, p.id);
      syncHeld();
    }
  }
  function handleInput(input: InputFrame, dt: number, side: Side = 0) {
    const oldControlled = controlledFor(side);
    if (oldControlled === undefined) return;
    if (input.switchPressed) {
      const team = players.filter(p => p.side === side && p.id !== oldControlled);
      const target = ball.owner !== null ? players[ball.owner] : ball;
      if (team.length) selectPlayer(team.sort((a, b) => distance(a, target) - distance(b, target))[0]);
      if (chargingPlayer === oldControlled) cancelCharge();
    }
    const p = players[controlledFor(side)!];
    const fixedSpot = challenge && !allaroundChallenge;
    move(p, !fixedSpot && Number.isFinite(input.moveX) ? input.moveX : 0, !fixedSpot && Number.isFinite(input.moveZ) ? input.moveZ : 0, dt, input.sprint);
    if (ball.owner === p.id && ball.state === 'held') {
      const target = input.passTarget !== undefined && side === 1 && input.passTarget < count ? input.passTarget + count : input.passTarget;
      if (input.passPressed) throwPass(p, target);
      else {
        if (input.crossoverPressed) crossover(p);
        if (input.callScreenPressed) callScreen(p);
        if (input.shootPressed || (input.shootHeld && !state.charging)) { state.charging = true; state.charge = 0; chargingPlayer = p.id; }
        if (state.charging && chargingPlayer === p.id) {
          state.charge = Math.min(1.12, state.charge + dt);
          if (input.shootReleased || (!input.shootHeld && !input.shootPressed) || state.charge >= 1.1) releaseShot(p, state.charge);
        }
      }
    } else {
      if (chargingPlayer === p.id) cancelCharge();
      if (input.passPressed && ball.owner !== null && ball.state === 'held' && players[ball.owner].side === p.side) throwPass(players[ball.owner], p.id);
      if (input.stealPressed) attemptSteal(p);
      if (input.blockPressed) tryBlock(p);
    }
  }
  function step(dt: number, input: InputFrame, awayInput: InputFrame = EMPTY_INPUT) {
    if (state.phase === 'finished') return;
    state.elapsed += dt;
    if (state.shotFeedback) { state.shotFeedback.ttl -= dt; if (state.shotFeedback.ttl <= 0) state.shotFeedback = null; }
    for (const p of players) {
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.actionTime = Math.max(0, p.actionTime - dt);
      const duration = p.action === 'dunk' ? 0.72 : p.action === 'block' ? 0.7 : 0.6;
      p.jump = ['shoot', 'dunk', 'block'].includes(p.action) && p.actionTime > 0 ? Math.sin(clamp(1 - p.actionTime / duration, 0, 1) * Math.PI) * (p.action === 'dunk' ? 1.05 : p.action === 'block' ? 0.9 : 0.65) : 0;
      if (p.actionTime <= 0 && !['run', 'idle'].includes(p.action)) p.action = 'idle';
      if (stunned.has(p.id)) { const t = stunned.get(p.id)! - dt; if (t <= 0) stunned.delete(p.id); else stunned.set(p.id, t); }
    }
    state.momentum[0] = Math.max(0, state.momentum[0] - dt * 0.15);
    state.momentum[1] = Math.max(0, state.momentum[1] - dt * 0.15);
    if (state.phase !== 'playing') {
      if (config.mode === 'challenge' && state.phase === 'inbound') {
        state.clock = Math.max(0, state.clock - dt);
        if (state.clock <= 0) { nextPeriod(); return; }
      }
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) {
        resetPositions(state.possession); state.phase = 'playing'; state.phaseTime = 0;
        if (!solo || state.elapsed < 3) emit('tip', state.quarter === 1 && state.elapsed < 3 ? 'Tip off' : 'Play ball', state.possession);
      }
      syncHeld(); return;
    }
    possessionAge += dt;
    if (ball.owner !== previousOwner) { ownerAge = 0; previousOwner = ball.owner; } else ownerAge += dt;
    updateTactics(dt);
    if (config.mode !== 'practice') state.clock = Math.max(0, state.clock - dt);
    if (!solo && ball.state !== 'shot') state.shotClock = Math.max(0, state.shotClock - dt);
    if (state.clock <= 0 && config.mode !== 'practice') {
      if (ball.state === 'shot') pendingPeriod = true;
      else { nextPeriod(); return; }
    }
    if (!solo && state.shotClock <= 0 && ball.state !== 'shot') {
      if (ball.owner !== null) players[ball.owner].stats.turnovers++;
      inbound(other(state.possession), 'Shot clock violation'); return;
    }
    handleInput(input, dt, 0);
    if (localMultiplayer) handleInput(awayInput, dt, 1);
    for (const p of players) if (p.id !== state.controlled && (!localMultiplayer || p.id !== state.controlledAway)) runAI(p, dt);
    separatePlayers(); updateBall(dt);
  }
  resetPositions(0, true);
  if (snapshot) {
    const saved = snapshot.state, e = snapshot.engine;
    for (let i = 0; i < players.length; i++) Object.assign(players[i], saved.players[i]);
    for (const key of Object.keys(ball)) delete (ball as unknown as Record<string, unknown>)[key];
    Object.assign(ball, saved.ball);
    for (const key of Object.keys(state)) delete (state as unknown as Record<string, unknown>)[key];
    Object.assign(state, saved, { config, players, ball });
    seed = e.seed; eventId = e.eventId; possessionAge = e.possessionAge; ownerAge = e.ownerAge; previousOwner = e.previousOwner;
    lastPass = e.lastPass; looseVelocity = e.looseVelocity; looseAge = e.looseAge; pendingPeriod = e.pendingPeriod; shotBlocked = e.shotBlocked;
    screenPlayer = e.screenPlayer; screenTime = e.screenTime; screenPlan = e.screenPlan ? { ...e.screenPlan, contacted: new Set(e.screenPlan.contacted) } : null;
    cuts.clear(); for (const [id, cut] of e.cuts) cuts.set(id, cut);
    nextCutAt[0] = e.nextCutAt[0]; nextCutAt[1] = e.nextCutAt[1]; ballProtectedUntil = e.ballProtectedUntil; chargingPlayer = e.chargingPlayer;
    passChallenges.clear(); for (const id of e.passChallenges) passChallenges.add(id);
    challengeSpot = e.challengeSpot;
    stunned.clear(); for (const [id, duration] of e.stunned) stunned.set(id, duration);
    aiTargets.clear(); for (const [id, target] of e.aiTargets) aiTargets.set(id, target);
    aiDecision.clear(); for (const [id, time] of e.aiDecision) aiDecision.set(id, time);
  }
  return {
    state,
    checkpoint() {
      return encodeCheckpoint(state, {
        seed, eventId, possessionAge, ownerAge, previousOwner, lastPass, looseVelocity, looseAge, pendingPeriod, shotBlocked,
        screenPlayer, screenTime, screenPlan: screenPlan ? { ...screenPlan, contacted: [...screenPlan.contacted] } : null,
        cuts: [...cuts], nextCutAt, ballProtectedUntil, chargingPlayer, passChallenges: [...passChallenges], challengeSpot,
        stunned: [...stunned], aiTargets: [...aiTargets], aiDecision: [...aiDecision],
      });
    },
    update(dt: number, input: InputFrame = EMPTY_INPUT, awayInput: InputFrame = EMPTY_INPUT) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      // Keep collision, input timing, and flight integration stable after a long browser frame.
      const total = Math.min(dt, 0.5), steps = Math.max(1, Math.ceil(total / (1 / 60))), delta = total / steps;
      for (let i = 0; i < steps; i++) {
        if (i === 0) step(delta, input, awayInput);
        else {
          const continued = { ...input };
          const continuedAway = { ...awayInput };
          for (const key of edgeKeys) (continued[key] as boolean) = false;
          for (const key of edgeKeys) (continuedAway[key] as boolean) = false;
          step(delta, continued, continuedAway);
        }
      }
    },
    drainEvents() { const events = state.events.slice(); state.events.length = 0; return events; },
  };
}
