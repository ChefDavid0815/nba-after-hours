import { COURT, type GameState, type PlayerState } from './types';

export type CoachCueKey = 'coachReleaseNow' | 'coachHoldRelease' | 'coachChaseLoose' | 'coachBeatClock' | 'coachBlockShot' | 'coachBoxOut' | 'coachOpenTeammate' | 'coachCreateSpace' | 'coachDriveLane' | 'coachTakeOpenShot' | 'coachDefendBall' | 'coachCloseOut';
export interface CoachCue { key: CoachCueKey; priority: number; }
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const hoop = { x: COURT.hoopX, z: 0 };
const cue = (key: CoachCueKey, priority: number): CoachCue => ({ key, priority });

/** Read-only coaching decisions. Presentation may throttle low-priority changes to avoid flicker. */
export function getCoachCue(state: GameState): CoachCue | null {
  if (state.phase !== 'playing') return null;
  const p = state.players.find(player => player.id === state.controlled);
  if (!p) return null;
  const ball = state.ball;
  const owner = ball.owner === null ? null : state.players.find(player => player.id === ball.owner);
  if (state.charging && owner?.id === p.id) return state.charge >= 0.625 ? cue('coachReleaseNow', 100) : cue('coachHoldRelease', 94);
  if (ball.state === 'loose') return cue('coachChaseLoose', 96);
  if (ball.state === 'shot') {
    const shooter = state.players.find(player => player.id === ball.from);
    if (shooter?.side !== p.side && ball.progress < 0.4 && distance(p, ball) < 2.4 && p.cooldown <= 0) return cue('coachBlockShot', 90);
    return cue('coachBoxOut', 70);
  }
  if (state.possession !== p.side) {
    if (!owner) return cue('coachCloseOut', 60);
    return distance(p, owner) < 1.7 ? cue('coachDefendBall', 72) : cue('coachCloseOut', 60);
  }
  if (owner?.id !== p.id) return cue('coachCreateSpace', 45);
  const timedPossession = state.config.mode !== 'practice' && (state.config.mode !== 'challenge' || state.config.challengeKind === 'allaround');
  if (state.config.mode !== 'practice' && (state.clock < 3 || (timedPossession && state.shotClock < 4))) return cue('coachBeatClock', 92);

  const defenders = state.players.filter(player => player.side !== p.side);
  const nearestDistance = (player: PlayerState) => defenders.reduce((d, defender) => Math.min(d, distance(player, defender)), Infinity);
  const ownSpace = nearestDistance(p);
  const openTeammate = state.players.some(teammate => teammate.side === p.side && teammate.id !== p.id && distance(teammate, hoop) < 8.3 && nearestDistance(teammate) > 2.0 && nearestDistance(teammate) > ownSpace + 0.65);
  if (ownSpace < 2.0 && openTeammate) return cue('coachOpenTeammate', 78);
  if (distance(p, hoop) > 8.5) return cue('coachDriveLane', 50);
  if (ownSpace > 2.2) return cue('coachTakeOpenShot', 74);
  return cue('coachCreateSpace', 58);
}
