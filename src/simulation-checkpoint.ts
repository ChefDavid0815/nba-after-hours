import { TEAMS } from './data';
import type { GameConfig, GameState, Simulation, Team, Athlete } from './types';

export interface ScreenCheckpoint {
  owner: number; defender: number; x: number; z: number;
  phase: 'approach' | 'set' | 'roll'; phaseTime: number; usedAt: number | null;
  rollX: number; rollZ: number; contacted: number[];
}
export interface CutCheckpoint { phase: 'entry' | 'finish'; x: number; z: number; finishX: number; finishZ: number; remaining: number; }
export interface EngineCheckpoint {
  seed: number; eventId: number; possessionAge: number; ownerAge: number; previousOwner: number | null;
  lastPass: { from: number; to: number; time: number } | null;
  looseVelocity: { x: number; y: number; z: number }; looseAge: number; pendingPeriod: boolean; shotBlocked: boolean;
  screenPlayer: number | null; screenTime: number; screenPlan: ScreenCheckpoint | null;
  cuts: [number, CutCheckpoint][]; nextCutAt: [number, number]; ballProtectedUntil: number; chargingPlayer: number | null;
  passChallenges: number[]; challengeSpot: number; stunned: [number, number][];
  aiTargets: [number, { x: number; z: number; style: number }][]; aiDecision: [number, number][];
}
export interface SimulationCheckpoint {
  version: 1;
  state: GameState;
  engine: EngineCheckpoint;
  /** Preserve JS value distinctions that JSON normally loses, without executable serialization hooks. */
  encoding: { undefinedPaths: string[]; negativeZeroPaths: string[] };
}
export interface CheckpointSimulation extends Simulation { checkpoint(): SimulationCheckpoint; }

type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => v !== null && typeof v === 'object' && !Array.isArray(v);
const shape = (v: unknown, required: string[], optional: string[] = []): boolean => record(v) && required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
const num = (v: unknown, lo = 0, hi = 100_000_000): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const int = (v: unknown, lo = 0, hi = 1_000_000_000): v is number => num(v, lo, hi) && Number.isSafeInteger(v);
const bool = (v: unknown): v is boolean => typeof v === 'boolean';
const oneOf = (v: unknown, values: readonly unknown[]) => values.includes(v);
const optional = (v: object, key: string, validate: (value: unknown) => boolean) => !Object.hasOwn(v, key) || validate((v as RecordValue)[key]);
const pair = (v: unknown, validate: (value: unknown) => boolean) => Array.isArray(v) && v.length === 2 && v.every(validate);
const nullable = (v: unknown, validate: (value: unknown) => boolean) => v === null || validate(v);
const safeId = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v);

/** Copy data through descriptors so corrupt saves cannot run getters or toJSON hooks. */
function untrustedCopy(value: unknown): unknown {
  let nodes = 0, characters = 0;
  const seen = new Set<object>();
  function copy(v: unknown, depth: number): unknown {
    if (++nodes > 15_000 || depth > 16) throw new Error('Checkpoint is too large');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('Invalid number'); return v; }
    if (typeof v === 'string') { characters += v.length; if (v.length > 1_000 || characters > 150_000) throw new Error('Invalid string'); return v; }
    if (typeof v !== 'object' || seen.has(v)) throw new Error('Invalid value');
    const prototype = Object.getPrototypeOf(v);
    if (Array.isArray(v) ? prototype !== Array.prototype || v.length > 512 : prototype !== Object.prototype && prototype !== null) throw new Error('Invalid object');
    if (Object.getOwnPropertySymbols(v).length) throw new Error('Invalid keys');
    seen.add(v);
    const output: RecordValue | unknown[] = Array.isArray(v) ? [] : {};
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
      if (Array.isArray(v) && key === 'length') continue;
      if (['__proto__', 'constructor', 'prototype'].includes(key) || !('value' in descriptor) || !descriptor.enumerable) throw new Error('Invalid property');
      if (Array.isArray(v) && !/^(0|[1-9]\d*)$/.test(key)) throw new Error('Invalid array property');
      (output as RecordValue)[key] = copy(descriptor.value, depth + 1);
    }
    if (Array.isArray(v) && Object.keys(output).length !== v.length) throw new Error('Sparse array');
    seen.delete(v); return output;
  }
  return copy(value, 0);
}

export function encodeCheckpoint(state: GameState, engine: EngineCheckpoint): SimulationCheckpoint {
  const encoding = { undefinedPaths: [] as string[], negativeZeroPaths: [] as string[] };
  function copy(value: unknown, path: string): unknown {
    if (value === undefined) { encoding.undefinedPaths.push(path); return undefined; }
    if (typeof value === 'number' && Object.is(value, -0)) { encoding.negativeZeroPaths.push(path); return 0; }
    if (Array.isArray(value)) return value.map((item, i) => copy(item, `${path}.${i}`));
    if (value !== null && typeof value === 'object') {
      const result: RecordValue = {};
      for (const [key, item] of Object.entries(value)) { const cloned = copy(item, path ? `${path}.${key}` : key); if (cloned !== undefined) result[key] = cloned; }
      return result;
    }
    return value;
  }
  return { ...(copy({ version: 1, state, engine }, '') as Omit<SimulationCheckpoint, 'encoding'>), encoding };
}

function sameAthlete(value: Athlete, canonical: Athlete) {
  return shape(value, Object.keys(canonical)) && Object.keys(canonical).every(key => (value as unknown as RecordValue)[key] === (canonical as unknown as RecordValue)[key]);
}
function validTeam(team: Team) {
  if (!record(team)) return false;
  const canonical = TEAMS.find(t => t.id === team.id);
  if (!canonical || !shape(team, Object.keys(canonical)) || !Array.isArray(team.players) || !int(team.players.length, 1, 5)) return false;
  if (!Object.keys(canonical).filter(k => k !== 'players').every(k => (team as unknown as RecordValue)[k] === (canonical as unknown as RecordValue)[k])) return false;
  return new Set(team.players.map(p => record(p) ? p.name : null)).size === team.players.length && team.players.every(p => { const athlete = canonical.players.find(q => record(p) && p.name === q.name); return !!athlete && sameAthlete(p, athlete); });
}
function validConfig(config: GameConfig) {
  return shape(config, ['home', 'away', 'mode', 'difficulty', 'quarterLength', 'quarters', 'playersPerTeam', 'seed'], ['targetScore', 'challengeKind', 'dailyChallengeId', 'localMultiplayer'])
    && validTeam(config.home) && validTeam(config.away) && oneOf(config.mode, ['exhibition', 'championship', 'practice', 'challenge']) && oneOf(config.difficulty, ['rookie', 'pro', 'allstar'])
    && num(config.quarterLength, config.mode === 'practice' ? 0 : 0.01, 720) && int(config.quarters, 1, 20) && int(config.playersPerTeam, 1, 5) && int(config.seed, 0, 0xffffffff)
    && optional(config, 'targetScore', v => int(v, 1, 10_000)) && optional(config, 'challengeKind', v => oneOf(v, ['freestyle', 'three', 'inside', 'allaround']))
    && optional(config, 'dailyChallengeId', safeId) && optional(config, 'localMultiplayer', bool);
}
const eventText: Record<string, string[]> = {
  shot: ['For three', 'Jump shot'], score: ['Three pointer', 'Basket'], miss: ['Off the rim'], pass: ['Pass'], steal: ['Steal', 'Pass intercepted'], block: ['Blocked'], rebound: ['Offensive rebound', 'Defensive rebound'],
  whistle: ['Shot clock violation'], buzzer: ['End of quarter'], quarter: ['Overtime', 'Next quarter'], gameover: ['Final'], crossover: ['Crossover'], dunk: ['Slam dunk'], perfect: ['Perfect release'], tip: ['Screen called', 'Tip off', 'Play ball'],
};
function validState(s: GameState): boolean {
  if (!shape(s, ['config', 'players', 'ball', 'score', 'quarter', 'clock', 'shotClock', 'possession', 'controlled', 'phase', 'phaseTime', 'elapsed', 'charging', 'charge', 'shotFeedback', 'events', 'momentum', 'winner', 'lastScorer'], ['controlledAway', 'challengeScore', 'dailyResult']) || !validConfig(s.config)) return false;
  const config = s.config, challenge = config.mode === 'challenge', allaround = challenge && config.challengeKind === 'allaround';
  const solo = config.mode === 'practice' || challenge && !allaround, local = config.mode === 'exhibition' && config.localMultiplayer === true;
  const count = allaround ? 3 : challenge ? 1 : config.playersPerTeam, size = count * (solo ? 1 : 2);
  const player = (v: unknown) => int(v, 0, size - 1), side = (v: unknown) => oneOf(v, solo ? [0] : [0, 1]);
  if (!Array.isArray(s.players) || s.players.length !== size || !s.players.every((p, id) => {
    const roster = id < count ? config.home.players : config.away.players;
    return shape(p, ['id', 'side', 'slot', 'athlete', 'x', 'z', 'vx', 'vz', 'facing', 'stamina', 'jump', 'action', 'actionTime', 'cooldown', 'stats']) && p.id === id && p.slot === id % count && p.side === Math.floor(id / count)
      && sameAthlete(p.athlete, roster[p.slot % roster.length]) && num(p.x, -13.5, 13.5) && num(p.z, -7, 7) && num(p.vx, -25, 25) && num(p.vz, -25, 25) && num(p.facing, -Math.PI, Math.PI)
      && num(p.stamina, 0, 100) && num(p.jump, 0, 1.1) && oneOf(p.action, ['idle', 'run', 'shoot', 'dunk', 'block', 'steal', 'crossover']) && num(p.actionTime, 0, 1) && num(p.cooldown, 0, 2)
      && shape(p.stats, ['points', 'assists', 'rebounds', 'steals', 'blocks', 'fgm', 'fga', 'tpm', 'tpa', 'turnovers']) && Object.values(p.stats).every(v => int(v)) && p.stats.fgm <= p.stats.fga && p.stats.tpm <= p.stats.tpa && p.stats.tpm <= p.stats.fgm && p.stats.tpa <= p.stats.fga && p.stats.points === p.stats.fgm * 2 + p.stats.tpm;
  })) return false;
  if (!pair(s.score, v => int(v)) || !int(s.quarter, 1, 1_000_000) || !num(s.clock, 0, Math.max(60, config.quarterLength)) || !num(s.shotClock, 0, 24) || !side(s.possession) || !int(s.controlled, 0, count - 1)
    || !oneOf(s.phase, ['intro', 'playing', 'inbound', 'halftime', 'finished']) || !num(s.phaseTime, -0.02, 3) || !num(s.elapsed) || !bool(s.charging) || !num(s.charge, 0, 1.12) || !pair(s.momentum, v => num(v, 0, 100))
    || !nullable(s.winner, side) || !nullable(s.lastScorer, player) || (local ? !int(s.controlledAway, count, size - 1) : Object.hasOwn(s, 'controlledAway')) || !optional(s, 'challengeScore', v => int(v))) return false;
  if (s.score.some((points, sideIndex) => points !== s.players.filter(p => p.side === sideIndex).reduce((sum, p) => sum + p.stats.points, 0))) return false;
  if ((s.phase === 'finished') !== (s.winner !== null)) return false;
  if (s.phase === 'finished' && s.winner !== (solo || challenge && s.score[0] === s.score[1] ? 0 : s.score[0] > s.score[1] ? 0 : 1)) return false;
  if (s.shotFeedback !== null && !(shape(s.shotFeedback, ['text', 'quality', 'timing', 'contest', 'perfect', 'ttl']) && oneOf(s.shotFeedback.text, ['Slam dunk', 'Perfect release', 'Early release', 'Late release']) && num(s.shotFeedback.quality, 0, 1) && num(s.shotFeedback.timing, 0, 1.12) && num(s.shotFeedback.contest, 0, 1) && bool(s.shotFeedback.perfect) && num(s.shotFeedback.ttl, 0, 2.3))) return false;
  if (!optional(s, 'dailyResult', value => { const r = value as NonNullable<GameState['dailyResult']>; return shape(r, ['id', 'score', 'medal', 'bestScore', 'improved']) && safeId(r.id) && int(r.score) && oneOf(r.medal, ['none', 'bronze', 'silver', 'gold']) && int(r.bestScore) && bool(r.improved); })) return false;
  const b = s.ball;
  if (!shape(b, ['x', 'y', 'z', 'owner', 'state', 'progress', 'startX', 'startZ', 'startY', 'endX', 'endZ', 'endY', 'duration', 'arc'], ['from', 'target', 'made', 'points']) || !num(b.x, -16, 16) || !num(b.z, -8, 8) || !num(b.y, 0, 20)
    || !nullable(b.owner, player) || !oneOf(b.state, ['held', 'pass', 'shot', 'loose', 'dead']) || !num(b.progress, 0, 1) || !num(b.startX, -16, 16) || !num(b.endX, -16, 16) || !num(b.startZ, -8, 8) || !num(b.endZ, -8, 8)
    || !num(b.startY, 0, 20) || !num(b.endY, 0, 20) || !num(b.duration, 0.01, 5) || !num(b.arc, 0, 12) || !optional(b, 'from', player) || !optional(b, 'target', player) || !optional(b, 'made', bool) || !optional(b, 'points', v => oneOf(v, [2, 3]))) return false;
  if ((b.state === 'held') !== (b.owner !== null) || b.owner !== null && s.players[b.owner].side !== s.possession) return false;
  if (b.state === 'shot' && (!player(b.from) || !bool(b.made) || !oneOf(b.points, [2, 3]))) return false;
  if (b.state === 'pass' && (!player(b.from) || !player(b.target) || b.from === b.target || s.players[b.from!].side !== s.players[b.target!].side)) return false;
  if (s.charging && (s.phase !== 'playing' || b.state !== 'held' || ![s.controlled, local ? s.controlledAway : -1].includes(b.owner!))) return false;
  if (!s.charging && s.charge !== 0) return false;
  if (!Array.isArray(s.events) || s.events.length > 64 || !s.events.every((e, i) => shape(e, ['id', 'type', 'text'], ['side', 'player', 'value']) && int(e.id, 1) && (i === 0 || e.id > s.events[i - 1].id) && Object.hasOwn(eventText, e.type) && eventText[e.type].includes(e.text) && optional(e, 'side', side) && optional(e, 'player', player) && optional(e, 'value', v => int(v)))) return false;
  return true;
}

function validEngine(e: EngineCheckpoint, s: GameState) {
  if (!shape(e, ['seed', 'eventId', 'possessionAge', 'ownerAge', 'previousOwner', 'lastPass', 'looseVelocity', 'looseAge', 'pendingPeriod', 'shotBlocked', 'screenPlayer', 'screenTime', 'screenPlan', 'cuts', 'nextCutAt', 'ballProtectedUntil', 'chargingPlayer', 'passChallenges', 'challengeSpot', 'stunned', 'aiTargets', 'aiDecision'])) return false;
  const player = (v: unknown) => int(v, 0, s.players.length - 1), time = (v: unknown) => num(v, 0, s.elapsed + 10);
  const ids = (v: unknown) => Array.isArray(v) && v.length <= s.players.length && v.every(player) && new Set(v).size === v.length;
  const map = (v: unknown, validate: (value: unknown) => boolean) => Array.isArray(v) && v.length <= s.players.length && v.every(entry => Array.isArray(entry) && entry.length === 2 && player(entry[0]) && validate(entry[1])) && new Set(v.map(entry => entry[0])).size === v.length;
  if (!int(e.seed, 0, Number.MAX_SAFE_INTEGER) || !int(e.eventId) || s.events.some(event => event.id > e.eventId) || !time(e.possessionAge) || !time(e.ownerAge) || !nullable(e.previousOwner, player) || !time(e.looseAge) || !bool(e.pendingPeriod) || !bool(e.shotBlocked)
    || !nullable(e.screenPlayer, player) || !num(e.screenTime, 0, 5.4) || !pair(e.nextCutAt, time) || !time(e.ballProtectedUntil) || !nullable(e.chargingPlayer, player) || !ids(e.passChallenges) || !int(e.challengeSpot)) return false;
  if (s.charging ? e.chargingPlayer !== s.ball.owner : e.chargingPlayer !== null) return false;
  if (!shape(e.looseVelocity, ['x', 'y', 'z']) || !Object.values(e.looseVelocity).every(v => num(v, -100, 100))) return false;
  if (e.lastPass !== null && !(shape(e.lastPass, ['from', 'to', 'time']) && player(e.lastPass.from) && player(e.lastPass.to) && e.lastPass.from !== e.lastPass.to && s.players[e.lastPass.from].side === s.players[e.lastPass.to].side && num(e.lastPass.time, 0, s.elapsed))) return false;
  if ((e.screenPlayer === null) !== (e.screenPlan === null) || (e.screenPlayer === null) !== (e.screenTime === 0)) return false;
  const p = e.screenPlan;
  if (p !== null && !(shape(p, ['owner', 'defender', 'x', 'z', 'phase', 'phaseTime', 'usedAt', 'rollX', 'rollZ', 'contacted']) && player(p.owner) && player(p.defender) && s.players[p.owner].side === s.players[e.screenPlayer!].side && s.players[p.owner].side !== s.players[p.defender].side
    && num(p.x, -13.5, 13.5) && num(p.z, -7, 7) && oneOf(p.phase, ['approach', 'set', 'roll']) && num(p.phaseTime, 0, 6) && nullable(p.usedAt, v => num(v, 0, s.elapsed)) && num(p.rollX, -14, 14) && num(p.rollZ, -7, 7) && ids(p.contacted))) return false;
  return map(e.cuts, value => { const cut = value as CutCheckpoint; return shape(cut, ['phase', 'x', 'z', 'finishX', 'finishZ', 'remaining']) && oneOf(cut.phase, ['entry', 'finish']) && num(cut.x, -14, 14) && num(cut.z, -7, 7) && num(cut.finishX, -14, 14) && num(cut.finishZ, -7, 7) && num(cut.remaining, 0, 2.1); })
    && map(e.stunned, v => num(v, 0, 1)) && map(e.aiDecision, time)
    && map(e.aiTargets, value => { const target = value as { x: number; z: number; style: number }; return shape(target, ['x', 'z', 'style']) && num(target.x, -14, 14) && num(target.z, -7, 7) && num(target.style, 0, 1); });
}

/** Returns a detached validated snapshot. Invalid, future-version or foreign-roster data is rejected. */
export function decodeCheckpoint(raw: unknown): SimulationCheckpoint | null {
  try {
    const checkpoint = untrustedCopy(raw) as SimulationCheckpoint;
    if (!shape(checkpoint, ['version', 'state', 'engine', 'encoding']) || checkpoint.version !== 1 || !validState(checkpoint.state) || !validEngine(checkpoint.engine, checkpoint.state)) return null;
    const encoding = checkpoint.encoding;
    if (!shape(encoding, ['undefinedPaths', 'negativeZeroPaths']) || !Array.isArray(encoding.undefinedPaths) || !Array.isArray(encoding.negativeZeroPaths) || encoding.undefinedPaths.length > 256 || encoding.negativeZeroPaths.length > 512) return null;
    const optionalPath = /^state\.(?:config\.(?:targetScore|challengeKind|dailyChallengeId|localMultiplayer)|ball\.(?:from|target|made|points)|(?:controlledAway|challengeScore|dailyResult)|events\.(?:0|[1-9]\d*)\.(?:side|player|value))$/;
    function parent(path: unknown): [RecordValue, string] | null {
      if (typeof path !== 'string' || path.length > 120 || !/^(state|engine)(?:\.[A-Za-z0-9_]+)+$/.test(path)) return null;
      const keys = path.split('.'); let target: unknown = checkpoint;
      for (const key of keys.slice(0, -1)) { if ((!record(target) && !Array.isArray(target)) || !Object.hasOwn(target, key)) return null; target = (target as RecordValue)[key]; }
      return record(target) || Array.isArray(target) ? [target as RecordValue, keys.at(-1)!] : null;
    }
    if (new Set([...encoding.undefinedPaths, ...encoding.negativeZeroPaths]).size !== encoding.undefinedPaths.length + encoding.negativeZeroPaths.length) return null;
    for (const path of encoding.undefinedPaths) { const location = parent(path); if (!optionalPath.test(path) || !location || Object.hasOwn(location[0], location[1])) return null; location[0][location[1]] = undefined; }
    for (const path of encoding.negativeZeroPaths) { const location = parent(path); if (!location || !Object.hasOwn(location[0], location[1]) || location[0][location[1]] !== 0) return null; location[0][location[1]] = -0; }
    return checkpoint;
  } catch { return null; }
}
