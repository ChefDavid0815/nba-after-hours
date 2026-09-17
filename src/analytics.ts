import type { GameEvent, GameState, Side } from './types';

export type ShotResult = 'pending' | 'made' | 'missed' | 'blocked';

export interface ShotRecord {
  /** The launch event, including dunk launches which do not emit a second shot event. */
  readonly eventId: number;
  readonly player: number;
  readonly playerName: string;
  readonly side: Side;
  /** Original world-space coordinates. Null means the launch was delivered after its ball data was lost. */
  readonly x: number | null;
  readonly z: number | null;
  readonly points: 2 | 3;
  readonly kind: 'shot' | 'dunk';
  readonly quarter: number;
  readonly clock: number | null;
  readonly elapsed: number;
  /** AI opponents currently expose no feedback; unavailable measurements are never reconstructed. */
  readonly quality: number | null;
  readonly contest: number | null;
  readonly timing: number | null;
  readonly perfect: boolean | null;
  readonly result: ShotResult;
  readonly resolvedAt: number | null;
  readonly blockedBy: number | null;
}

export interface QuarterScore {
  readonly quarter: number;
  readonly score: readonly [number, number];
}

export interface ScoringRun {
  readonly side: Side;
  readonly points: number;
  readonly baskets: number;
  readonly startElapsed: number;
  readonly endElapsed: number;
  readonly startQuarter: number;
  readonly endQuarter: number;
  readonly startScore: readonly [number, number];
  readonly endScore: readonly [number, number];
}

export interface MatchAnalytics {
  readonly shots: readonly ShotRecord[];
  readonly quarters: readonly QuarterScore[];
  readonly score: readonly [number, number];
  /** Largest observed lead for each side, including intermediate baskets in the same batch. */
  readonly maxLead: readonly [number, number];
  readonly maxRun: readonly [number, number];
  readonly bestRuns: readonly [ScoringRun | null, ScoringRun | null];
  readonly currentRun: ScoringRun | null;
  /** Points already on the scoreboard when recording began, or whose score events were missed. */
  readonly untrackedPoints: readonly [number, number];
}

export interface MatchAnalyticsRecorder {
  reset(): void;
  /** Call once after each simulation update with that update's drained events. */
  record(state: GameState, events: GameEvent[]): void;
  /** Immutable, detached snapshot; subsequent recording cannot alter it. */
  snapshot(): MatchAnalytics;
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type MutableShot = Mutable<ShotRecord>;
type MutableRun = Omit<Mutable<ScoringRun>, 'startScore' | 'endScore'> & { startScore: [number, number]; endScore: [number, number] };
const isSide = (value: unknown): value is Side => value === 0 || value === 1;
const pointsOf = (event: GameEvent): 2 | 3 | null => event.value === 2 || event.value === 3 ? event.value : null;
const finite = (value: number | undefined): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const positive = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
const periodOf = (value: number) => Number.isInteger(value) && value > 0 ? value : 1;
const cloneRun = (run: MutableRun | null): MutableRun | null => run ? { ...run, startScore: [...run.startScore], endScore: [...run.endScore] } : null;
function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) freezeDeep(nested);
  }
  return value;
}

/** Event-sourced match review. Call reset() for every new match, including a tournament round. */
export function createMatchAnalytics(): MatchAnalyticsRecorder {
  let shots: MutableShot[] = [];
  let quarters = new Map<number, [number, number]>();
  let score: [number, number] = [0, 0];
  let maxLead: [number, number] = [0, 0];
  let bestRuns: [MutableRun | null, MutableRun | null] = [null, null];
  let currentRun: MutableRun | null = null;
  let activeShot: MutableShot | null = null;
  let seen = new Set<number>();
  let initialized = false;

  const quarterScore = (quarter: number) => {
    let entry = quarters.get(quarter);
    if (!entry) { entry = [0, 0]; quarters.set(quarter, entry); }
    return entry;
  };
  const updateLeads = () => {
    maxLead[0] = Math.max(maxLead[0], score[0] - score[1]);
    maxLead[1] = Math.max(maxLead[1], score[1] - score[0]);
  };
  const pending = (player: number | undefined, side: Side) => activeShot?.result === 'pending' && (player === undefined || activeShot.player === player) && activeShot.side === side ? activeShot : null;

  return {
    reset() {
      shots = []; quarters = new Map(); score = [0, 0]; maxLead = [0, 0];
      bestRuns = [null, null]; currentRun = null; activeShot = null; seen = new Set(); initialized = false;
    },

    record(state, events) {
      const fresh = events.filter(event => {
        if (!Number.isInteger(event.id) || event.id < 0 || seen.has(event.id)) return false;
        seen.add(event.id); return true;
      }).sort((a, b) => a.id - b.id);
      const observedScore: [number, number] = [positive(state.score[0]), positive(state.score[1])];
      const added: [number, number] = [0, 0];
      for (const event of fresh) if (event.type === 'score' && isSide(event.side) && pointsOf(event)) added[event.side] += pointsOf(event)!;
      const before: [number, number] = [Math.max(0, observedScore[0] - added[0]), Math.max(0, observedScore[1] - added[1])];
      // A missing segment cannot establish a scoring streak. Keep actual points without inventing events.
      if (!initialized || before[0] !== score[0] || before[1] !== score[1]) currentRun = null;
      initialized = true; score = before; updateLeads();

      const firstTransition = fresh.find(event => event.type === 'quarter' && Number.isInteger(event.value) && event.value! > 1);
      // finishShot emits score/miss before nextPeriod mutates state.quarter in the same update.
      let quarter = firstTransition ? firstTransition.value! - 1 : periodOf(state.quarter);
      quarterScore(quarter);
      const launches = fresh.filter(event => event.type === 'shot' || event.type === 'dunk');
      const lastLaunch = launches[launches.length - 1];
      const elapsed = positive(state.elapsed);

      for (const event of fresh) {
        if (event.type === 'quarter') {
          quarter = periodOf(event.value ?? state.quarter); quarterScore(quarter); continue;
        }
        if (event.type === 'shot' || event.type === 'dunk') {
          const player = state.players.find(player => player.id === event.player);
          const side = isSide(event.side) ? event.side : player?.side;
          const points = pointsOf(event);
          if (!player || !isSide(side) || !points) continue;
          // Older launches in a delayed multi-event batch no longer own the current ball coordinates.
          const intact = event === lastLaunch && state.ball.state !== 'pass' && state.ball.from === player.id && state.ball.points === points && !fresh.some(later => later.id > event.id && later.type === 'pass');
          const feedback = intact && (side === 0 || state.config.localMultiplayer) ? state.shotFeedback : null;
          activeShot = {
            eventId: event.id, player: player.id, playerName: player.athlete.name, side,
            x: intact ? finite(state.ball.startX) : null, z: intact ? finite(state.ball.startZ) : null,
            points, kind: event.type, quarter, clock: intact && quarter === state.quarter ? finite(state.clock) : null, elapsed,
            quality: feedback ? finite(feedback.quality) : null, contest: feedback ? finite(feedback.contest) : null,
            timing: feedback ? finite(feedback.timing) : null, perfect: feedback ? feedback.perfect : null,
            result: 'pending', resolvedAt: null, blockedBy: null,
          };
          shots.push(activeShot);
          continue;
        }
        if (event.type === 'block' && isSide(event.side)) {
          const blocked = pending(undefined, event.side === 0 ? 1 : 0);
          if (blocked) { blocked.result = 'blocked'; blocked.resolvedAt = elapsed; blocked.blockedBy = event.player ?? null; }
          continue;
        }
        if ((event.type === 'score' || event.type === 'miss') && isSide(event.side)) {
          const shot = pending(event.player, event.side);
          if (shot) { shot.result = event.type === 'score' ? 'made' : 'missed'; shot.resolvedAt = elapsed; }
          if (event.type !== 'score') continue;
          const points = pointsOf(event);
          if (!points) continue;
          const side = event.side; const scoringQuarter = shot?.quarter ?? quarter;
          const priorScore: [number, number] = [...score];
          score[side] += points; quarterScore(scoringQuarter)[side] += points; updateLeads();
          if (!currentRun || currentRun.side !== side) {
            currentRun = { side, points, baskets: 1, startElapsed: elapsed, endElapsed: elapsed, startQuarter: scoringQuarter, endQuarter: scoringQuarter, startScore: priorScore, endScore: [...score] };
          } else {
            currentRun.points += points; currentRun.baskets++; currentRun.endElapsed = elapsed;
            currentRun.endQuarter = scoringQuarter; currentRun.endScore = [...score];
          }
          if (!bestRuns[side] || currentRun.points > bestRuns[side]!.points) bestRuns[side] = cloneRun(currentRun);
        }
      }
      // The scoreboard is authoritative, but unknown points never become fabricated shot records or runs.
      score = observedScore; updateLeads(); quarterScore(periodOf(state.quarter));
    },

    snapshot() {
      const periodScores = [...quarters].sort(([a], [b]) => a - b).map(([quarter, score]) => ({ quarter, score: [...score] as [number, number] }));
      const tracked = periodScores.reduce<[number, number]>((total, entry) => [total[0] + entry.score[0], total[1] + entry.score[1]], [0, 0]);
      return freezeDeep({
        shots: shots.map(shot => ({ ...shot })), quarters: periodScores, score: [...score] as [number, number],
        maxLead: [...maxLead] as [number, number], maxRun: [bestRuns[0]?.points ?? 0, bestRuns[1]?.points ?? 0] as [number, number],
        bestRuns: [cloneRun(bestRuns[0]), cloneRun(bestRuns[1])] as [ScoringRun | null, ScoringRun | null], currentRun: cloneRun(currentRun),
        untrackedPoints: [Math.max(0, score[0] - tracked[0]), Math.max(0, score[1] - tracked[1])] as [number, number],
      });
    },
  };
}
