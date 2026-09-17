import type { BallState, GameEvent, GameState, PlayerState, Side } from './types';

export const REPLAY_FPS = 30;
export const REPLAY_BUFFER_SECONDS = 8;
export const REPLAY_HIGHLIGHT_SECONDS = 4.5;
export const MAX_REPLAY_FRAMES = REPLAY_FPS * REPLAY_BUFFER_SECONDS + 1;

export interface ReplayPlayerFrame {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  stamina: number;
  jump: number;
  action: PlayerState['action'];
  actionTime: number;
  cooldown: number;
}
export interface ReplayFrame {
  /** Seconds from the beginning of this clip; internal recorder frames use its local timeline. */
  time: number;
  players: readonly ReplayPlayerFrame[];
  ball: Readonly<BallState>;
  score: readonly [number, number];
  quarter: number;
  clock: number;
  shotClock: number;
  possession: Side;
  controlled: number;
  controlledAway?: number;
  phase: GameState['phase'];
  phaseTime: number;
  elapsed: number;
  charging: boolean;
  charge: number;
  momentum: readonly [number, number];
  winner: Side | null;
  lastScorer: number | null;
}
export interface ReplayClip {
  readonly id: string;
  readonly type: GameEvent['type'];
  readonly side?: Side;
  readonly player?: number;
  readonly duration: number;
  readonly baseState: GameState;
  readonly frames: readonly ReplayFrame[];
}

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const mix = (a: number, b: number, amount: number) => finite(a) + (finite(b, finite(a)) - finite(a)) * amount;
const mixAngle = (a: number, b: number, amount: number) => {
  a = finite(a); b = finite(b, a);
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * amount;
};

function snapshot(state: GameState, time: number): ReplayFrame {
  return {
    time,
    players: state.players.map(player => ({ id: player.id, x: player.x, z: player.z, vx: player.vx, vz: player.vz, facing: player.facing, stamina: player.stamina, jump: player.jump, action: player.action, actionTime: player.actionTime, cooldown: player.cooldown })),
    ball: { ...state.ball }, score: [...state.score], quarter: state.quarter, clock: state.clock, shotClock: state.shotClock,
    possession: state.possession, controlled: state.controlled, controlledAway: state.controlledAway, phase: state.phase, phaseTime: state.phaseTime, elapsed: state.elapsed,
    charging: state.charging, charge: state.charge, momentum: [...state.momentum], winner: state.winner, lastScorer: state.lastScorer,
  };
}

function copyBase(state: GameState): GameState {
  const copyTeam = (team: GameState['config']['home']) => ({ ...team, players: team.players.map(player => ({ ...player })) });
  return {
    ...state,
    config: { ...state.config, home: copyTeam(state.config.home), away: copyTeam(state.config.away) },
    players: state.players.map(player => ({ ...player, athlete: { ...player.athlete }, stats: { ...player.stats } })),
    ball: { ...state.ball }, score: [...state.score], momentum: [...state.momentum],
    shotFeedback: state.shotFeedback ? { ...state.shotFeedback } : null,
    dailyResult: state.dailyResult ? { ...state.dailyResult } : undefined,
    // A replay is visual playback; recorded game events must never be emitted a second time.
    events: [],
  };
}
function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) freezeDeep(nested);
  }
  return value;
}

/** Bounded, renderer-independent highlight capture. Call reset when starting a new match. */
export class ReplayRecorder {
  private buffer: (ReplayFrame | undefined)[] = new Array(MAX_REPLAY_FRAMES);
  private head = 0;
  private length = 0;
  private time = 0;
  private accumulator = 0;
  private lastElapsed: number | null = null;
  private lastState: GameState | null = null;
  private lastConfig: GameState['config'] | null = null;
  private matchKey: string | null = null;
  private highlight: ReplayClip | null = null;
  private generation = 0;

  get frameCount(): number { return this.length; }
  get bufferedDuration(): number {
    return this.length < 2 ? 0 : Math.max(0, this.frame(this.length - 1)!.time - this.frame(0)!.time);
  }

  record(state: GameState, dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (state.config !== this.lastConfig) {
      const key = [state.config.seed, state.config.home.id, state.config.away.id, state.config.mode, ...state.players.map(player => `${player.id}:${player.athlete.name}`)].join('|');
      if (this.matchKey !== null && this.matchKey !== key) this.reset();
      this.matchKey = key; this.lastConfig = state.config;
    }
    const elapsed = Number.isFinite(state.elapsed) ? state.elapsed : null;
    if (elapsed !== null && this.lastElapsed !== null && elapsed < this.lastElapsed - 0.0001) {
      this.reset();
      this.lastConfig = state.config;
      this.matchKey = [state.config.seed, state.config.home.id, state.config.away.id, state.config.mode, ...state.players.map(player => `${player.id}:${player.athlete.name}`)].join('|');
    }
    // elapsed catches externally advanced simulations; dt also records intro/inbound animations.
    const elapsedDelta = elapsed !== null && this.lastElapsed !== null ? elapsed - this.lastElapsed : 0;
    const step = Math.min(60, elapsedDelta > 0 ? elapsedDelta : dt);
    this.time += step; this.accumulator += step;
    this.lastElapsed = elapsed; this.lastState = state;
    if (this.length === 0 || this.accumulator + 1e-8 >= 1 / REPLAY_FPS) {
      this.push(snapshot(state, this.time));
      this.accumulator %= 1 / REPLAY_FPS;
      // Floating-point remainders just below an interval must not produce 60fps duplicate captures.
      if (this.accumulator > 1 / REPLAY_FPS - 1e-8) this.accumulator = 0;
    }
    this.trim();
  }

  markHighlight(event: GameEvent): void {
    if (event.type !== 'score' || !this.lastState || this.length === 0) return;
    // Include the scoring endpoint even when it falls between the 30fps sampling ticks.
    const endpoint = snapshot(this.lastState, this.time);
    const last = this.frame(this.length - 1)!;
    if (Math.abs(last.time - this.time) < 1e-8) this.buffer[(this.head + this.length - 1) % MAX_REPLAY_FRAMES] = endpoint;
    else this.push(endpoint);
    this.trim();
    if (this.length < 2) return;
    const cutoff = this.time - REPLAY_HIGHLIGHT_SECONDS;
    let start = 0;
    while (start + 1 < this.length && this.frame(start + 1)!.time < cutoff) start++;
    const first = this.frame(start)!;
    const frames: ReplayFrame[] = [];
    for (let index = start; index < this.length; index++) {
      const frame = this.frame(index)!;
      frames.push({ ...frame, time: Math.max(0, frame.time - first.time) });
    }
    const duration = frames[frames.length - 1].time;
    if (duration <= 0) return;
    this.highlight = freezeDeep({
      id: `${this.lastState.config.seed}-${this.generation}-${event.id}-${Math.round(this.time * 1000)}`,
      type: event.type, side: event.side, player: event.player, duration,
      baseState: copyBase(this.lastState), frames,
    });
  }

  getHighlight(): ReplayClip | null { return this.highlight; }

  reset(): void {
    this.buffer = new Array(MAX_REPLAY_FRAMES); this.head = 0; this.length = 0;
    this.time = 0; this.accumulator = 0; this.lastElapsed = null; this.lastState = null;
    this.lastConfig = null; this.matchKey = null; this.highlight = null; this.generation++;
  }

  private frame(index: number): ReplayFrame | undefined { return this.buffer[(this.head + index) % MAX_REPLAY_FRAMES]; }
  private push(frame: ReplayFrame): void {
    if (this.length < MAX_REPLAY_FRAMES) {
      this.buffer[(this.head + this.length) % MAX_REPLAY_FRAMES] = frame; this.length++;
    } else {
      this.buffer[this.head] = frame; this.head = (this.head + 1) % MAX_REPLAY_FRAMES;
    }
  }
  private trim(): void {
    // Retain one boundary sample for interpolation, while keeping the hard capacity bound.
    while (this.length > 1 && (this.frame(1)!.time <= this.time - REPLAY_BUFFER_SECONDS || this.frame(0)!.time < this.time - REPLAY_BUFFER_SECONDS - 1 / REPLAY_FPS)) {
      this.buffer[this.head] = undefined; this.head = (this.head + 1) % MAX_REPLAY_FRAMES; this.length--;
    }
  }
}

/** Produces a fresh dynamic state; all static roster/config data belongs to the frozen clip. */
export function sampleReplay(clip: ReplayClip, time: number): GameState {
  const frames = clip.frames;
  if (frames.length === 0) return copyBase(clip.baseState);
  const at = time === Infinity ? clip.duration : Number.isFinite(time) ? Math.max(0, Math.min(clip.duration, time)) : 0;
  let low = 0, high = frames.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (frames[middle].time <= at) low = middle; else high = middle - 1;
  }
  const from = frames[low]; const to = frames[Math.min(frames.length - 1, low + 1)];
  const amount = to.time > from.time ? Math.max(0, Math.min(1, (at - from.time) / (to.time - from.time))) : 0;
  const discrete = amount >= 1 ? to : from;
  const priorPlayers = new Map(from.players.map(player => [player.id, player]));
  const nextPlayers = new Map(to.players.map(player => [player.id, player]));
  const players = clip.baseState.players.map(base => {
    const first = priorPlayers.get(base.id) ?? nextPlayers.get(base.id);
    const second = nextPlayers.get(base.id) ?? first;
    if (!first || !second) return { ...base, stats: { ...base.stats } };
    const action = amount >= 1 ? second.action : first.action;
    return {
      ...base, stats: { ...base.stats }, x: mix(first.x, second.x, amount), z: mix(first.z, second.z, amount),
      vx: mix(first.vx, second.vx, amount), vz: mix(first.vz, second.vz, amount),
      facing: mixAngle(first.facing, second.facing, amount), stamina: mix(first.stamina, second.stamina, amount), jump: mix(first.jump, second.jump, amount),
      action, actionTime: mix(first.actionTime, second.actionTime, amount), cooldown: mix(first.cooldown, second.cooldown, amount),
    };
  });
  const ball: BallState = { ...discrete.ball };
  for (const key of ['x', 'y', 'z', 'progress', 'startX', 'startZ', 'startY', 'endX', 'endZ', 'endY', 'duration', 'arc'] as const) ball[key] = mix(from.ball[key], to.ball[key], amount);
  return {
    ...clip.baseState, players, ball, score: [...discrete.score], quarter: discrete.quarter,
    clock: from.quarter === to.quarter ? mix(from.clock, to.clock, amount) : discrete.clock,
    shotClock: from.possession === to.possession && from.phase === to.phase ? mix(from.shotClock, to.shotClock, amount) : discrete.shotClock, possession: discrete.possession, controlled: discrete.controlled, controlledAway: discrete.controlledAway,
    phase: discrete.phase, phaseTime: from.phase === to.phase ? mix(from.phaseTime, to.phaseTime, amount) : discrete.phaseTime, elapsed: mix(from.elapsed, to.elapsed, amount),
    charging: discrete.charging, charge: mix(from.charge, to.charge, amount), momentum: [mix(from.momentum[0], to.momentum[0], amount), mix(from.momentum[1], to.momentum[1], amount)],
    winner: discrete.winner, lastScorer: discrete.lastScorer, shotFeedback: null, events: [],
    dailyResult: clip.baseState.dailyResult ? { ...clip.baseState.dailyResult } : undefined,
  };
}
