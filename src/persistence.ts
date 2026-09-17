import { ACHIEVEMENTS, TEAMS } from './data';
import type { CareerStats, GameState, MatchRecord, SaveData, Settings } from './types';

export const SAVE_KEY = 'nba-after-hours.save.v1';
const BACKUP_KEY = `${SAVE_KEY}.backup`;
const MAX_STAT = 1_000_000_000;
const TEAM_IDS = new Set(TEAMS.map(t => t.id));
const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map(a => a.id));
let memorySave: SaveData | undefined;

export function defaultSave(): SaveData {
  return {
    version: 1,
    settings: { locale: 'zh', volume: 0.55, music: true, sfx: true, camera: 'broadcast', quality: 'high', difficulty: 'pro', quarterLength: 60, reducedMotion: false, showControls: true },
    career: { games: 0, wins: 0, losses: 0, points: 0, threes: 0, assists: 0, steals: 0, championships: 0, bestScore: 0 },
    history: [], achievements: [], favoriteTeam: 'lal', challengeBests: {}, playedTeams: [],
  };
}

const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const number = (v: unknown, fallback = 0, max = MAX_STAT) => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : fallback;
const boolean = (v: unknown, fallback: boolean) => typeof v === 'boolean' ? v : fallback;
const text = (v: unknown, fallback = '', max = 180) => typeof v === 'string' ? v.slice(0, max) : fallback;
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => typeof v === 'string' && options.includes(v as T) ? v as T : fallback;
const validTeam = (v: unknown, fallback: string) => typeof v === 'string' && TEAM_IDS.has(v) ? v : fallback;

/** Never pass unvalidated localStorage data into the game, including after schema upgrades. */
export function normalizeSave(raw: unknown): SaveData {
  const fresh = defaultSave();
  const data = object(raw);
  const settings = object(data.settings);
  const career = object(data.career);
  fresh.settings = {
    locale: oneOf(settings.locale, ['zh', 'en'], fresh.settings.locale),
    volume: typeof settings.volume === 'number' && Number.isFinite(settings.volume) ? Math.max(0, Math.min(1, settings.volume)) : fresh.settings.volume,
    music: boolean(settings.music, true), sfx: boolean(settings.sfx, true),
    camera: oneOf(settings.camera, ['broadcast', 'courtside', 'overhead'], fresh.settings.camera),
    quality: oneOf(settings.quality, ['low', 'high'], fresh.settings.quality),
    difficulty: oneOf(settings.difficulty, ['rookie', 'pro', 'allstar'], fresh.settings.difficulty),
    quarterLength: Math.max(30, number(settings.quarterLength, fresh.settings.quarterLength, 720)),
    reducedMotion: boolean(settings.reducedMotion, false), showControls: boolean(settings.showControls, true),
  };
  for (const key of Object.keys(fresh.career) as (keyof CareerStats)[]) fresh.career[key] = number(career[key]);
  fresh.favoriteTeam = validTeam(data.favoriteTeam, fresh.favoriteTeam);
  if (Array.isArray(data.achievements)) fresh.achievements = [...new Set(data.achievements.filter((id): id is string => typeof id === 'string' && ACHIEVEMENT_IDS.has(id)))];
  if (Array.isArray(data.history)) {
    const ids = new Set<string>();
    fresh.history = data.history.slice(0, 1000).map(v => normalizeMatch(v)).filter((v): v is MatchRecord => {
      if (!v || ids.has(v.id)) return false;
      ids.add(v.id); return true;
    }).slice(0, 50);
  }
  const played = Array.isArray(data.playedTeams) ? data.playedTeams.filter((id): id is string => typeof id === 'string' && TEAM_IDS.has(id)) : [];
  const historicalTeams = fresh.history.filter(match => match.mode !== 'practice' && match.mode !== 'challenge').map(match => match.home);
  fresh.playedTeams = [...new Set([...played, ...historicalTeams])].slice(0, 30);
  const bests = object(data.challengeBests);
  for (const key of Object.keys(bests).slice(0, 64)) {
    if (/^[a-zA-Z0-9_-]{1,64}$/.test(key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') fresh.challengeBests[key] = number(bests[key]);
  }
  return fresh;
}

function normalizeMatch(raw: unknown): MatchRecord | null {
  const value = object(raw);
  const id = text(value.id);
  if (!id || !TEAM_IDS.has(text(value.home)) || !TEAM_IDS.has(text(value.away)) || !Array.isArray(value.score) || value.score.length !== 2) return null;
  const date = text(value.date, '', 40);
  if (!date || !Number.isFinite(Date.parse(date))) return null;
  return {
    id, date: new Date(date).toISOString(), home: text(value.home), away: text(value.away),
    score: [number(value.score[0], 0, 9999), number(value.score[1], 0, 9999)],
    won: boolean(value.won, false), mode: oneOf(value.mode, ['exhibition', 'championship', 'challenge', 'practice'], 'exhibition'),
    difficulty: oneOf(value.difficulty, ['rookie', 'pro', 'allstar'], 'pro'),
    points: number(value.points), assists: number(value.assists), rebounds: number(value.rebounds),
  };
}

function parseSave(raw: string | null): SaveData | null {
  if (!raw || raw.length > 2_000_000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const value = object(parsed);
    if (!Object.keys(value).length || !value.settings || !value.career) return null;
    return normalizeSave(value);
  } catch { return null; }
}

export function loadSave(): SaveData {
  try {
    const stored = parseSave(globalThis.localStorage?.getItem(SAVE_KEY)) ?? parseSave(globalThis.localStorage?.getItem(BACKUP_KEY));
    if (stored) { memorySave = stored; return normalizeSave(stored); }
  } catch { /* Sandboxed browsers and private mode may deny storage. */ }
  return memorySave ? normalizeSave(memorySave) : defaultSave();
}

export function saveProgress(save: SaveData): void {
  const clean = normalizeSave(save);
  memorySave = clean;
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    const old = storage.getItem(SAVE_KEY);
    if (parseSave(old)) {
      try { storage.setItem(BACKUP_KEY, old!); } catch { /* Main save takes priority when quota is tight. */ }
    }
    storage.setItem(SAVE_KEY, JSON.stringify(clean));
  } catch { /* In-memory progress remains usable even when the disk write fails. */ }
}

function matchId(state: GameState): string {
  // No wall-clock dependency: pause/resume and repeated result rendering cannot count twice.
  return [state.config.seed, state.config.mode, state.config.home.id, state.config.away.id, state.config.quarters, state.config.quarterLength, ...state.score, Math.round(state.elapsed * 1000)].join('-');
}

/** Mutates the supplied save once per finished game; the caller chooses when to persist it. */
export function recordMatch(save: SaveData, state: GameState): string[] {
  if (state.phase !== 'finished' || state.config.mode === 'practice') return [];
  const id = matchId(state);
  if (save.history.some(h => h.id === id)) return [];
  const own = state.players.filter(p => p.side === 0);
  const sum = (key: keyof typeof own[number]['stats']) => own.reduce((total, p) => Math.min(MAX_STAT, total + number(p.stats[key])), 0);
  const score: [number, number] = [number(state.score[0], 0, 9999), number(state.score[1], 0, 9999)];
  const won = state.winner === 0;
  const record: MatchRecord = { id, date: new Date().toISOString(), home: state.config.home.id, away: state.config.away.id, score, won, mode: state.config.mode, difficulty: state.config.difficulty, points: score[0], assists: sum('assists'), rebounds: sum('rebounds') };
  save.history.unshift(record); save.history = save.history.slice(0, 50);
  save.favoriteTeam = state.config.home.id;
  if (state.config.mode === 'challenge') {
    const key = `score-${state.config.difficulty}`;
    save.challengeBests[key] = Math.max(number(save.challengeBests[key]), score[0]);
    return [];
  }
  save.playedTeams = [...new Set([...(save.playedTeams ?? []), ...save.history.filter(match => match.mode !== 'practice' && match.mode !== 'challenge').map(match => match.home)])].filter(id => TEAM_IDS.has(id));
  const career = save.career;
  const add = (key: keyof CareerStats, amount: number) => { career[key] = Math.min(MAX_STAT, number(career[key]) + amount); };
  add('games', 1); add(won ? 'wins' : 'losses', 1);
  add('points', score[0]); add('threes', sum('tpm')); add('assists', sum('assists')); add('steals', sum('steals'));
  career.bestScore = Math.max(number(career.bestScore), score[0]);
  const conditions: Record<string, boolean> = {
    first_win: career.wins >= 1, ten_wins: career.wins >= 10, century_points: career.points >= 100,
    thirty_points: score[0] >= 30, sharpshooter: career.threes >= 25, playmaker: career.assists >= 25,
    pickpocket: career.steals >= 10, allstar_win: won && state.config.difficulty === 'allstar' && !state.config.localMultiplayer,
    world_tour: save.playedTeams.length >= 10, clean_game: won && sum('turnovers') === 0,
    champion: career.championships > 0,
  };
  return unlockAchievements(save, Object.keys(conditions).filter(key => conditions[key]));
}

export function unlockAchievements(save: SaveData, ids: string[]): string[] {
  const unlocked = [...new Set(ids)].filter(id => ACHIEVEMENT_IDS.has(id) && !save.achievements.includes(id));
  save.achievements.push(...unlocked);
  return unlocked;
}

/** Call only after winning the last round, never after individual tournament games. */
export function recordChampionship(save: SaveData): string[] {
  save.career.championships = Math.min(MAX_STAT, number(save.career.championships) + 1);
  return unlockAchievements(save, ['champion']);
}

export function updateSettings(save: SaveData, changes: Partial<Settings>): Settings {
  save.settings = normalizeSave({ ...save, settings: { ...save.settings, ...changes } }).settings;
  saveProgress(save);
  return save.settings;
}
