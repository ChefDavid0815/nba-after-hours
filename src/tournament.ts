import { TEAMS, getTeam } from './data';
import { getLineup, normalizeLineup } from './roster';
import type { Difficulty } from './types';

export interface TournamentMatch {
  id: string;
  round: number;
  homeId: string | null;
  awayId: string | null;
  score: [number, number] | null;
}
export interface TournamentConfig {
  difficulty: Difficulty;
  quarterLength: number;
  playersPerTeam: number;
  seed: number;
  homeLineup?: number[];
}
export interface Tournament {
  version: 1;
  id: string;
  userTeamId: string;
  round: 1 | 2 | 3 | 4;
  teams: string[];
  bracket: TournamentMatch[][];
  config: TournamentConfig;
  completed: boolean;
  eliminated: boolean;
  createdAt: string;
}
export interface TournamentFixture {
  /** The playable game always presents the user as the home side. */
  homeId: string;
  awayId: string;
  round: 1 | 2 | 3 | 4;
  matchId: string;
}
export interface TournamentResult { champion: boolean; eliminated: boolean; }

export const TOURNAMENT_KEY = 'nba-after-hours.tournament.v1';
const BACKUP_KEY = `${TOURNAMENT_KEY}.backup`;
const teamIds = new Set(TEAMS.map(team => team.id));
let memoryTournament: Tournament | null = null;

function random(seed: number): () => number {
  let value = seed >>> 0 || 0x9e3779b9;
  return () => {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}
function shuffle<T>(items: T[], next: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
function bracketFromTeams(teams: string[]): TournamentMatch[][] {
  return [8, 4, 2, 1].map((count, round) => Array.from({ length: count }, (_, index) => ({
    id: `r${round + 1}-m${index + 1}`, round: round + 1,
    homeId: round === 0 ? teams[index * 2] : null,
    awayId: round === 0 ? teams[index * 2 + 1] : null,
    score: null,
  })));
}
function winner(match: TournamentMatch): string | null {
  return match.score ? match.score[0] > match.score[1] ? match.homeId : match.awayId : null;
}
function fillNextRound(tournament: Tournament, roundIndex: number): void {
  if (roundIndex >= 3) return;
  const current = tournament.bracket[roundIndex];
  for (let index = 0; index < tournament.bracket[roundIndex + 1].length; index++) {
    const match = tournament.bracket[roundIndex + 1][index];
    match.homeId = winner(current[index * 2]); match.awayId = winner(current[index * 2 + 1]);
  }
}

export function createTournament(homeId: string, initialOpponent: string, difficulty: Difficulty, quarterLength: number, playersPerTeam: number, seed: number): Tournament {
  homeId = getTeam(homeId).id;
  const next = random(Number.isFinite(seed) ? seed : Date.now());
  const candidates = shuffle(TEAMS.map(team => team.id).filter(id => id !== homeId), next);
  const opponent = teamIds.has(initialOpponent) && initialOpponent !== homeId ? initialOpponent : candidates[0];
  const teams = shuffle([homeId, opponent, ...candidates.filter(id => id !== opponent).slice(0, 14)], next);
  // Keep the chosen first opponent while randomizing the user's position in the full bracket.
  const userIndex = teams.indexOf(homeId); const opponentIndex = teams.indexOf(opponent);
  const pairedIndex = userIndex ^ 1;
  [teams[pairedIndex], teams[opponentIndex]] = [teams[opponentIndex], teams[pairedIndex]];
  const normalizedSeed = Number.isFinite(seed) ? seed >>> 0 : Date.now() >>> 0;
  const createdAt = new Date().toISOString();
  return {
    version: 1, id: `cup-${normalizedSeed.toString(36)}-${Date.now().toString(36)}`, userTeamId: homeId, round: 1,
    teams, bracket: bracketFromTeams(teams),
    config: { difficulty: ['rookie', 'pro', 'allstar'].includes(difficulty) ? difficulty : 'pro', quarterLength: Number.isFinite(quarterLength) ? Math.max(30, Math.min(720, Math.round(quarterLength))) : 60, playersPerTeam: playersPerTeam === 5 ? 5 : 3, seed: normalizedSeed },
    completed: false, eliminated: false, createdAt,
  };
}

export function getTournamentMatch(tournament: Tournament): TournamentFixture | null {
  if (tournament.completed || tournament.eliminated) return null;
  const match = tournament.bracket[tournament.round - 1]?.find(game => !game.score && (game.homeId === tournament.userTeamId || game.awayId === tournament.userTeamId));
  if (!match?.homeId || !match.awayId) return null;
  return { homeId: tournament.userTeamId, awayId: match.homeId === tournament.userTeamId ? match.awayId : match.homeId, round: tournament.round, matchId: match.id };
}

export function getTournamentChampion(tournament: Tournament): string | null {
  return winner(tournament.bracket[3][0]);
}

function simulateScore(tournament: Tournament, game: TournamentMatch): [number, number] {
  const next = random(tournament.config.seed ^ (game.round * 0x45d9f3b) ^ ((Number(game.id.split('-m')[1]) + 17) * 0x119de1f3));
  const strength = (id: string) => {
    const team = getTeam(id);
    const players = tournament.config.playersPerTeam === 3 ? getLineup(team).players : team.players;
    return players.reduce((total, player) => total + player.shooting * 0.34 + player.finishing * 0.29 + player.defense * 0.25 + player.speed * 0.12, 0) / players.length;
  };
  const edge = (strength(game.homeId!) - strength(game.awayId!)) * 0.18;
  const scale = tournament.config.quarterLength / 60;
  const base = (tournament.config.playersPerTeam === 3 ? 30 : 26) * scale;
  const jitter = () => ((next() + next() + next()) / 3 - 0.5) * 20 * Math.sqrt(scale);
  let home = Math.max(3, Math.round(base + edge * scale + jitter()));
  let away = Math.max(3, Math.round(base - edge * scale + jitter()));
  // Simulated games also play overtime: knockout brackets never advance from a tie.
  if (home === away) { if (next() < 0.5) home += 2; else away += 2; }
  return [home, away];
}
function simulateRound(tournament: Tournament, roundIndex: number): void {
  for (const game of tournament.bracket[roundIndex]) {
    if (!game.score && game.homeId && game.awayId) game.score = simulateScore(tournament, game);
  }
  fillNextRound(tournament, roundIndex);
}

/**
 * userScore is always [user, opponent], independent of the saved bracket's home/away slot.
 * Pass the fixture's matchId to make retried result handling safe after the round advances.
 * Invalid/tied results throw before touching the tournament. Persistence is explicit.
 */
export function advanceTournament(tournament: Tournament, userScore: [number, number], expectedMatchId?: string): TournamentResult {
  if (tournament.completed) return { champion: !tournament.eliminated, eliminated: tournament.eliminated };
  const fixture = getTournamentMatch(tournament);
  if (!fixture) throw new Error('Tournament has no playable fixture.');
  if (expectedMatchId !== undefined && expectedMatchId !== fixture.matchId) return { champion: false, eliminated: tournament.eliminated };
  if (!validScore(userScore)) throw new RangeError('A completed knockout game needs two distinct integer scores between 0 and 9999.');
  const game = tournament.bracket[tournament.round - 1].find(match => match.id === fixture.matchId)!;
  game.score = game.homeId === tournament.userTeamId ? [...userScore] : [userScore[1], userScore[0]];
  const lost = userScore[0] < userScore[1];
  const roundIndex = tournament.round - 1;
  simulateRound(tournament, roundIndex);
  if (lost) {
    tournament.completed = true; tournament.eliminated = true;
    for (let remaining = roundIndex + 1; remaining < 4; remaining++) simulateRound(tournament, remaining);
    return { champion: false, eliminated: true };
  }
  if (tournament.round === 4) {
    tournament.completed = true;
    return { champion: true, eliminated: false };
  }
  tournament.round = (tournament.round + 1) as Tournament['round'];
  return { champion: false, eliminated: false };
}

function object(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
}
function validScore(score: unknown): score is [number, number] {
  return Array.isArray(score) && score.length === 2 && score.every(value => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9999) && score[0] !== score[1];
}

/** Rebuilds participant links from verified winners; stored links cannot inject another team. */
export function normalizeTournament(raw: unknown): Tournament | null {
  const data = object(raw);
  if (!data || data.version !== 1 || typeof data.userTeamId !== 'string' || !teamIds.has(data.userTeamId)) return null;
  if (!Array.isArray(data.teams) || data.teams.length !== 16 || !data.teams.every(id => typeof id === 'string' && teamIds.has(id)) || new Set(data.teams).size !== 16 || !data.teams.includes(data.userTeamId)) return null;
  if (!Array.isArray(data.bracket) || data.bracket.length !== 4) return null;
  const config = object(data.config);
  if (!config || !['rookie', 'pro', 'allstar'].includes(String(config.difficulty)) || typeof config.quarterLength !== 'number' || !Number.isInteger(config.quarterLength) || config.quarterLength < 30 || config.quarterLength > 720 || (config.playersPerTeam !== 3 && config.playersPerTeam !== 5) || typeof config.seed !== 'number' || !Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff) return null;
  if (typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt)) || typeof data.id !== 'string' || !/^cup-[a-z0-9-]{1,80}$/.test(data.id)) return null;
  const tournament: Tournament = {
    version: 1, id: data.id, userTeamId: data.userTeamId, round: 1, teams: [...data.teams] as string[],
    bracket: bracketFromTeams(data.teams as string[]), config: { difficulty: config.difficulty as Difficulty, quarterLength: config.quarterLength, playersPerTeam: config.playersPerTeam, seed: config.seed },
    completed: false, eliminated: false, createdAt: new Date(data.createdAt).toISOString(),
  };
  if (Array.isArray(config.homeLineup)) tournament.config.homeLineup = normalizeLineup(getTeam(tournament.userTeamId), config.homeLineup);
  let firstOpenRound = 5;
  let eliminatedRound = 0;
  for (let round = 0; round < 4; round++) {
    const savedRound = data.bracket[round];
    if (!Array.isArray(savedRound) || savedRound.length !== tournament.bracket[round].length) return null;
    let scored = 0;
    for (let index = 0; index < savedRound.length; index++) {
      const saved = object(savedRound[index]); const game = tournament.bracket[round][index];
      if (!saved || saved.id !== game.id || saved.round !== game.round || saved.homeId !== game.homeId || saved.awayId !== game.awayId) return null;
      if (saved.score !== null) {
        if (!game.homeId || !game.awayId || !validScore(saved.score) || firstOpenRound < 5) return null;
        game.score = [...saved.score]; scored++;
        if ((game.homeId === tournament.userTeamId || game.awayId === tournament.userTeamId) && winner(game) !== tournament.userTeamId) eliminatedRound = round + 1;
      }
    }
    if (scored !== 0 && scored !== savedRound.length) return null;
    if (scored === 0 && firstOpenRound === 5) firstOpenRound = round + 1;
    fillNextRound(tournament, round);
  }
  if (eliminatedRound && firstOpenRound !== 5) return null;
  tournament.completed = firstOpenRound === 5;
  tournament.eliminated = eliminatedRound > 0;
  tournament.round = (eliminatedRound || Math.min(4, firstOpenRound)) as Tournament['round'];
  if (data.round !== tournament.round || data.completed !== tournament.completed || data.eliminated !== tournament.eliminated) return null;
  return tournament;
}

function parse(raw: string | null): Tournament | null {
  if (!raw || raw.length > 100_000) return null;
  try { return normalizeTournament(JSON.parse(raw)); } catch { return null; }
}

export function loadTournament(): Tournament | null {
  try {
    const storage = globalThis.localStorage;
    if (storage) {
      const saved = parse(storage.getItem(TOURNAMENT_KEY)) ?? parse(storage.getItem(BACKUP_KEY));
      if (saved) { memoryTournament = saved; return normalizeTournament(saved); }
      // An explicit removal in another tab should not resurrect an old in-memory cup.
      if (!storage.getItem(TOURNAMENT_KEY) && !storage.getItem(BACKUP_KEY)) { memoryTournament = null; return null; }
    }
  } catch { /* Memory fallback for private or sandboxed browsers. */ }
  return memoryTournament ? normalizeTournament(memoryTournament) : null;
}

export function saveTournament(tournament: Tournament | null): void {
  const clean = tournament ? normalizeTournament(tournament) : null;
  if (tournament && !clean) throw new Error('Refusing to persist an invalid tournament.');
  memoryTournament = clean;
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    if (!clean) { storage.removeItem(TOURNAMENT_KEY); storage.removeItem(BACKUP_KEY); return; }
    const old = storage.getItem(TOURNAMENT_KEY);
    if (parse(old)) { try { storage.setItem(BACKUP_KEY, old!); } catch { /* Prioritize current round. */ } }
    storage.setItem(TOURNAMENT_KEY, JSON.stringify(clean));
  } catch { /* This session retains its tournament even without writable storage. */ }
}
