import { DAILY_CHALLENGE_KEY, normalizeChallengeProgress, type ChallengeProgress } from './challenges';
import { TEAMS } from './data';
import { defaultSave, normalizeSave, SAVE_KEY } from './persistence';
import { LINEUP_KEY, normalizeLineup, type LineupIndices } from './roster';
import { normalizeTournament, TOURNAMENT_KEY, type Tournament } from './tournament';
import type { Locale, SaveData } from './types';

export const PROFILE_FORMAT = 'nba-after-hours.profile';
export const PROFILE_VERSION = 1;
export const MAX_PROFILE_BYTES = 1_048_576;
export const TUTORIAL_COMPLETED_KEY = 'nba-after-hours.tutorial.completed.v1';
const SAVE_BACKUP_KEY = `${SAVE_KEY}.backup`;
const TOURNAMENT_BACKUP_KEY = `${TOURNAMENT_KEY}.backup`;
/** Import/export never enumerates, clears, or accesses any other application's storage. */
export const PROFILE_STORAGE_KEYS = [SAVE_KEY, SAVE_BACKUP_KEY, TOURNAMENT_KEY, TOURNAMENT_BACKUP_KEY, LINEUP_KEY, DAILY_CHALLENGE_KEY, TUTORIAL_COMPLETED_KEY] as const;
type StorageKey = typeof PROFILE_STORAGE_KEYS[number];
export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface TutorialCompletion { version: 1; completed: boolean; completedAt?: string; }
export interface ProfileData {
  save: SaveData;
  tournament: Tournament | null;
  lineups: { version: 1; teams: Record<string, LineupIndices> };
  daily: { version: 1; entries: ChallengeProgress[] };
  tutorial: TutorialCompletion | null;
}
export interface ProfileDocument {
  format: typeof PROFILE_FORMAT;
  version: typeof PROFILE_VERSION;
  exportedAt: string;
  data: ProfileData;
}
export interface ProfileSummary {
  games: number; wins: number; achievements: number; historyMatches: number; locale: Locale;
  tournamentRound: number | null; tournamentActive: boolean; lineupTeams: number; dailyRecords: number; tutorialCompleted: boolean;
}
export type ProfileErrorCode = 'too_large' | 'invalid_json' | 'unsafe_keys' | 'unsupported_format' | 'unsupported_version' | 'invalid_structure' |
  'invalid_save' | 'invalid_tournament' | 'invalid_lineups' | 'invalid_daily' | 'invalid_tutorial' |
  'storage_unavailable' | 'storage_read_failed' | 'storage_write_failed' | 'rollback_failed';
export type ProfileWarningCode = 'save_recovered_from_backup' | 'tournament_recovered_from_backup';
export type ProfileFailure = { ok: false; code: ProfileErrorCode };
export type ProfileInspection = { ok: true; profile: ProfileDocument; summary: ProfileSummary } | ProfileFailure;
export type ProfileExport = { ok: true; text: string; summary: ProfileSummary; warnings: ProfileWarningCode[] } | ProfileFailure;
export type ProfileImport = { ok: true; summary: ProfileSummary; reloadRequired: true } | ProfileFailure;

export const PROFILE_ERROR_MESSAGES: Record<ProfileErrorCode, Record<Locale, string>> = {
  too_large: { zh: '备份文件超过 1 MiB 限制。', en: 'The backup exceeds the 1 MiB limit.' },
  invalid_json: { zh: '无法读取这个 JSON 备份文件。', en: 'This is not a readable JSON backup.' },
  unsafe_keys: { zh: '备份包含不允许的数据字段。', en: 'The backup contains forbidden data fields.' },
  unsupported_format: { zh: '这不是本游戏的进度备份。', en: 'This is not a progress backup for this game.' },
  unsupported_version: { zh: '不支持这个备份版本。', en: 'This backup version is not supported.' },
  invalid_structure: { zh: '备份结构不完整或无效。', en: 'The backup structure is incomplete or invalid.' },
  invalid_save: { zh: '设置或生涯进度无效。', en: 'Settings or career progress are invalid.' },
  invalid_tournament: { zh: '杯赛赛程无效，未导入任何进度。', en: 'The tournament bracket is invalid. No progress was imported.' },
  invalid_lineups: { zh: '自选阵容数据无效。', en: 'Custom lineup data is invalid.' },
  invalid_daily: { zh: '每日挑战纪录无效。', en: 'Daily challenge records are invalid.' },
  invalid_tutorial: { zh: '教学完成纪录无效。', en: 'The tutorial completion record is invalid.' },
  storage_unavailable: { zh: '此环境无法访问本地存档。', en: 'Local progress storage is unavailable.' },
  storage_read_failed: { zh: '无法读取本地存档，未更改任何进度。', en: 'Local progress could not be read. Nothing was changed.' },
  storage_write_failed: { zh: '导入未完成，原有存档已恢复。', en: 'Import failed. The original stored progress was restored.' },
  rollback_failed: { zh: '存储故障导致导入和恢复未能完全完成，请保留备份文件。', en: 'A storage failure prevented a complete import and restoration. Keep your backup file.' },
};

const fail = (code: ProfileErrorCode): ProfileFailure => ({ ok: false, code });
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const isoDate = (value: unknown): value is string => typeof value === 'string' && value.length <= 32 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const same = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => same(value, b[index]));
  return object(a) && object(b) && exactKeys(a, Object.keys(b)) && Object.keys(a).every(key => same(a[key], b[key]));
};

/** Bounded iterative traversal also rejects prototype keys nested in otherwise unused fields. */
function validateTree(value: unknown): ProfileErrorCode | null {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const current = stack.pop()!;
    if (++nodes > 50_000 || current.depth > 20) return 'invalid_structure';
    if (typeof current.value === 'number' && !Number.isFinite(current.value)) return 'invalid_structure';
    if (!current.value || typeof current.value !== 'object') continue;
    for (const [key, nested] of Object.entries(current.value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return 'unsafe_keys';
      stack.push({ value: nested, depth: current.depth + 1 });
    }
  }
  return null;
}

function validateSave(raw: unknown): SaveData | null {
  if (!object(raw) || raw.version !== 1) return null;
  const clean = normalizeSave(raw);
  // playedTeams was added within the existing local save version; old saves reconstruct it from history.
  const candidate = Object.hasOwn(raw, 'playedTeams') ? raw : { ...raw, playedTeams: clean.playedTeams };
  return same(candidate, clean) ? clean : null;
}
function validateLineups(raw: unknown): ProfileData['lineups'] | null {
  if (!object(raw) || !exactKeys(raw, ['version', 'teams']) || raw.version !== 1 || !object(raw.teams) || Object.keys(raw.teams).length > 30) return null;
  const teams: Record<string, LineupIndices> = {};
  for (const [id, indices] of Object.entries(raw.teams)) {
    const team = TEAMS.find(team => team.id === id);
    if (!team || !Array.isArray(indices)) return null;
    const clean = normalizeLineup(team, indices);
    if (!same(clean, indices)) return null;
    teams[id] = clean;
  }
  return { version: 1, teams };
}
function validateDaily(raw: unknown): ProfileData['daily'] | null {
  if (!object(raw) || !exactKeys(raw, ['version', 'entries']) || raw.version !== 1 || !Array.isArray(raw.entries) || raw.entries.length > 270) return null;
  const entries = normalizeChallengeProgress(raw);
  // normalizeChallengeProgress recomputes medals/scores; strict imports reject altered or dropped records.
  if (entries.length !== raw.entries.length) return null;
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  if (!raw.entries.every(entry => object(entry) && typeof entry.id === 'string' && same(entry, byId.get(entry.id)))) return null;
  return { version: 1, entries };
}
function validateTutorial(raw: unknown): TutorialCompletion | null {
  if (!object(raw) || raw.version !== 1 || typeof raw.completed !== 'boolean') return null;
  if (!exactKeys(raw, raw.completedAt === undefined ? ['version', 'completed'] : ['version', 'completed', 'completedAt'])) return null;
  if (raw.completedAt !== undefined && !isoDate(raw.completedAt)) return null;
  return { version: 1, completed: raw.completed, ...(typeof raw.completedAt === 'string' ? { completedAt: raw.completedAt } : {}) };
}
function summary(data: ProfileData): ProfileSummary {
  return {
    games: data.save.career.games, wins: data.save.career.wins, achievements: data.save.achievements.length,
    historyMatches: data.save.history.length, locale: data.save.settings.locale,
    tournamentRound: data.tournament?.round ?? null, tournamentActive: !!data.tournament && !data.tournament.completed,
    lineupTeams: Object.keys(data.lineups.teams).length, dailyRecords: data.daily.entries.length, tutorialCompleted: data.tutorial?.completed ?? false,
  };
}

export function inspectProfile(text: string): ProfileInspection {
  if (typeof text !== 'string') return fail('invalid_json');
  if (text.length > MAX_PROFILE_BYTES || new TextEncoder().encode(text).byteLength > MAX_PROFILE_BYTES) return fail('too_large');
  if (!text.trim()) return fail('invalid_json');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return fail('invalid_json'); }
  const treeError = validateTree(raw); if (treeError) return fail(treeError);
  if (!object(raw) || raw.format !== PROFILE_FORMAT) return fail('unsupported_format');
  if (raw.version !== PROFILE_VERSION) return fail('unsupported_version');
  if (!exactKeys(raw, ['format', 'version', 'exportedAt', 'data']) || !isoDate(raw.exportedAt) || !object(raw.data) || !exactKeys(raw.data, ['save', 'tournament', 'lineups', 'daily', 'tutorial'])) return fail('invalid_structure');
  const save = validateSave(raw.data.save); if (!save) return fail('invalid_save');
  const tournament = raw.data.tournament === null ? null : normalizeTournament(raw.data.tournament);
  if (raw.data.tournament !== null && (!tournament || !same(raw.data.tournament, tournament))) return fail('invalid_tournament');
  const lineups = validateLineups(raw.data.lineups); if (!lineups) return fail('invalid_lineups');
  const daily = validateDaily(raw.data.daily); if (!daily) return fail('invalid_daily');
  const tutorial = raw.data.tutorial === null ? null : validateTutorial(raw.data.tutorial);
  if (raw.data.tutorial !== null && !tutorial) return fail('invalid_tutorial');
  const data: ProfileData = { save, tournament, lineups, daily, tutorial };
  return { ok: true, profile: { format: PROFILE_FORMAT, version: PROFILE_VERSION, exportedAt: raw.exportedAt, data }, summary: summary(data) };
}

function resolveStorage(storage?: ProfileStorage | null): ProfileStorage | null {
  try {
    const selected = storage === undefined ? globalThis.localStorage : storage;
    return selected && typeof selected.getItem === 'function' && typeof selected.setItem === 'function' && typeof selected.removeItem === 'function' ? selected : null;
  } catch { return null; }
}
function readAll(storage: ProfileStorage): Map<StorageKey, string | null> | null {
  try {
    const result = new Map<StorageKey, string | null>();
    for (const key of PROFILE_STORAGE_KEYS) {
      const value = storage.getItem(key);
      if (value !== null && typeof value !== 'string') return null;
      result.set(key, value);
    }
    return result;
  } catch { return null; }
}
function parseStored(raw: string | null): unknown {
  if (raw === null) return undefined;
  if (raw.length > MAX_PROFILE_BYTES) return null;
  try { const value: unknown = JSON.parse(raw); return validateTree(value) ? null : value; } catch { return null; }
}

export function exportProfile(storage?: ProfileStorage | null): ProfileExport {
  const selected = resolveStorage(storage); if (!selected) return fail('storage_unavailable');
  const values = readAll(selected); if (!values) return fail('storage_read_failed');
  const warnings: ProfileWarningCode[] = [];
  let save = validateSave(parseStored(values.get(SAVE_KEY)!));
  if (!save) {
    save = validateSave(parseStored(values.get(SAVE_BACKUP_KEY)!));
    if (save) warnings.push('save_recovered_from_backup');
    else if (values.get(SAVE_KEY) !== null || values.get(SAVE_BACKUP_KEY) !== null) return fail('invalid_save');
    else save = defaultSave();
  }
  const tournamentRaw = parseStored(values.get(TOURNAMENT_KEY)!);
  let tournament = normalizeTournament(tournamentRaw);
  if (!tournament) {
    tournament = normalizeTournament(parseStored(values.get(TOURNAMENT_BACKUP_KEY)!));
    if (tournament) warnings.push('tournament_recovered_from_backup');
    else if (values.get(TOURNAMENT_KEY) !== null || values.get(TOURNAMENT_BACKUP_KEY) !== null) return fail('invalid_tournament');
  }
  const lineups = values.get(LINEUP_KEY) === null ? { version: 1 as const, teams: {} } : validateLineups(parseStored(values.get(LINEUP_KEY)!));
  if (!lineups) return fail('invalid_lineups');
  const daily = values.get(DAILY_CHALLENGE_KEY) === null ? { version: 1 as const, entries: [] } : validateDaily(parseStored(values.get(DAILY_CHALLENGE_KEY)!));
  if (!daily) return fail('invalid_daily');
  const tutorial = values.get(TUTORIAL_COMPLETED_KEY) === null ? null : validateTutorial(parseStored(values.get(TUTORIAL_COMPLETED_KEY)!));
  if (values.get(TUTORIAL_COMPLETED_KEY) !== null && !tutorial) return fail('invalid_tutorial');
  const profile: ProfileDocument = { format: PROFILE_FORMAT, version: PROFILE_VERSION, exportedAt: new Date().toISOString(), data: { save, tournament, lineups, daily, tutorial } };
  const text = JSON.stringify(profile, null, 2);
  const inspection = inspectProfile(text); if (!inspection.ok) return inspection;
  return { ok: true, text, summary: inspection.summary, warnings };
}

/** Replace this game's known progress only. Refresh after success to discard old module/live-game caches. */
export function importProfile(text: string, storage?: ProfileStorage | null): ProfileImport {
  const inspected = inspectProfile(text); if (!inspected.ok) return inspected;
  const selected = resolveStorage(storage); if (!selected) return fail('storage_unavailable');
  const originals = readAll(selected); if (!originals) return fail('storage_read_failed');
  const data = inspected.profile.data;
  const save = JSON.stringify(data.save), tournament = data.tournament ? JSON.stringify(data.tournament) : null;
  // Update redundant backups as well, so clearing a cup cannot resurrect one from an old backup.
  const target = new Map<StorageKey, string | null>([
    [SAVE_BACKUP_KEY, save], [TOURNAMENT_BACKUP_KEY, tournament], [LINEUP_KEY, JSON.stringify(data.lineups)],
    [DAILY_CHALLENGE_KEY, JSON.stringify(data.daily)], [TUTORIAL_COMPLETED_KEY, data.tutorial ? JSON.stringify(data.tutorial) : null],
    [TOURNAMENT_KEY, tournament], [SAVE_KEY, save],
  ]);
  const attempted: StorageKey[] = [];
  const write = (key: StorageKey, value: string | null) => value === null ? selected.removeItem(key) : selected.setItem(key, value);
  try {
    for (const [key, value] of target) {
      if (originals.get(key) === value) continue;
      attempted.push(key); // Also roll back a nonstandard storage adapter that throws after mutating.
      write(key, value);
    }
    for (const [key, value] of target) if (selected.getItem(key) !== value) throw new Error('verification');
    return { ok: true, summary: inspected.summary, reloadRequired: true };
  } catch {
    for (const key of attempted.reverse()) {
      let needsRestore = true;
      try { needsRestore = selected.getItem(key) !== originals.get(key); } catch { /* A failed read must not prevent a write-only restoration attempt. */ }
      if (needsRestore) try { write(key, originals.get(key)!); } catch { /* Continue restoring the other keys. */ }
    }
    const restored = readAll(selected);
    return fail(restored && PROFILE_STORAGE_KEYS.every(key => restored.get(key) === originals.get(key)) ? 'storage_write_failed' : 'rollback_failed');
  }
}
