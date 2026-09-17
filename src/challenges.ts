import { getTeam } from './data';
import type { Locale } from './types';

export type ChallengeKind = 'three' | 'inside' | 'allaround';
export type ChallengeMedal = 'none' | 'bronze' | 'silver' | 'gold';
export interface ChallengeMetrics {
  points: number;
  threes: number;
  paintPoints: number;
  assists: number;
  rebounds: number;
  steals: number;
  blocks: number;
}
export interface DailyChallenge {
  id: string;
  day: string;
  kind: ChallengeKind;
  seed: number;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  teamId: string;
  playerIndex: number;
  duration: 60;
  target: number;
  medalThresholds: { bronze: number; silver: number; gold: number };
}
export interface ChallengeEvaluation { score: number; medal: ChallengeMedal; completed: boolean; }
export interface ChallengeProgress {
  id: string;
  day: string;
  kind: ChallengeKind;
  score: number;
  medal: ChallengeMedal;
  completed: boolean;
  attempts: number;
  bestMetrics: ChallengeMetrics;
  updatedAt: string;
  recentRunIds: string[];
}
export interface DailyProgress {
  day: string;
  entries: ChallengeProgress[];
  completed: number;
  goldMedals: number;
}
export interface ChallengeRecordResult {
  progress: ChallengeProgress;
  improved: boolean;
  newMedal: boolean;
}

export const DAILY_CHALLENGE_KEY = 'nba-after-hours.daily-challenges.v1';
export const CHALLENGE_KINDS: readonly ChallengeKind[] = ['three', 'inside', 'allaround'];
const MEDALS: ChallengeMedal[] = ['none', 'bronze', 'silver', 'gold'];
const MAX_VALUE = 1_000_000;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
let memoryProgress: ChallengeProgress[] = [];

/** Calendar day in the device's local timezone. No network clock or UTC rollover is involved. */
export function getLocalDay(date: Date = new Date()): string {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) date = new Date();
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function validDay(day: unknown): day is string {
  if (typeof day !== 'string') return false;
  const match = DAY_PATTERN.exec(day);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), date = Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || date < 1 || date > 31) return false;
  const check = new Date(year, month - 1, date, 12);
  return check.getFullYear() === year && check.getMonth() === month - 1 && check.getDate() === date;
}
function dailySeed(day: string, kind: ChallengeKind): number {
  let seed = 2166136261;
  for (const character of `nba-after-hours.daily.v1:${day}:${kind}`) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return seed >>> 0;
}

const ATHLETES: Record<ChallengeKind, readonly (readonly [string, number])[]> = {
  three: [['gsw', 0], ['gsw', 1], ['ind', 1], ['mil', 2], ['por', 0], ['sac', 2], ['bos', 2], ['dal', 3], ['phx', 0], ['cha', 2], ['hou', 1], ['okc', 2]],
  inside: [['lal', 4], ['hou', 4], ['den', 4], ['mil', 3], ['phi', 3], ['orl', 4], ['nop', 3], ['mem', 0], ['chi', 1], ['lac', 3], ['tor', 1], ['sas', 3]],
  allaround: [['cle', 2], ['lal', 0], ['chi', 1], ['den', 4], ['okc', 1], ['mil', 3], ['sas', 3], ['bos', 2], ['phx', 3], ['tor', 4], ['gsw', 0], ['min', 1]],
};
function definitionsForDay(day: string): [DailyChallenge, DailyChallenge, DailyChallenge] {
  return CHALLENGE_KINDS.map(kind => {
    const seed = dailySeed(day, kind);
    const [teamId, playerIndex] = ATHLETES[kind][seed % ATHLETES[kind].length];
    const medalThresholds = kind === 'three' ? { bronze: 3, silver: 6, gold: 9 } : kind === 'inside' ? { bronze: 8, silver: 14, gold: 20 } : { bronze: 10, silver: 18, gold: 28 };
    const name = kind === 'three' ? { zh: '每日三分雨', en: 'Daily Downtown' } : kind === 'inside' ? { zh: '每日篮下统治', en: 'Daily Paint Patrol' } : { zh: '每日全能表现', en: 'Daily All-Around' };
    const description = kind === 'three'
      ? { zh: '60秒外线挑战。只计算命中的三分球，投进9记即可获得金牌。', en: '60 seconds from downtown. Only made threes count. Hit 9 for gold.' }
      : kind === 'inside'
        ? { zh: '60秒近筐挑战。只计算距篮筐3.2米以内的得分，拿到20分获得金牌。', en: '60 seconds in the paint. Only points from within 3.2 metres count. Score 20 for gold.' }
        : { zh: '60秒全能挑战。得分＋2×助攻＋2×抢断＋2×盖帽＋篮板，达到28分获得金牌。', en: '60 seconds of all-around play. Points + 2×assists + 2×steals + 2×blocks + rebounds. Reach 28 for gold.' };
    return { id: `${day}-${kind}`, day, kind, seed, name, description, teamId, playerIndex, duration: 60, target: medalThresholds.bronze, medalThresholds };
  }) as [DailyChallenge, DailyChallenge, DailyChallenge];
}

export function getDailyChallenges(date: Date = new Date()): [DailyChallenge, DailyChallenge, DailyChallenge] {
  return definitionsForDay(getLocalDay(date));
}
export function getChallengeById(id: string): DailyChallenge | null {
  const match = /^(\d{4}-\d{2}-\d{2})-(three|inside|allaround)$/.exec(id);
  if (!match || !validDay(match[1])) return null;
  return definitionsForDay(match[1]).find(definition => definition.kind === match[2]) ?? null;
}
const integer = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(MAX_VALUE, Math.floor(value))) : 0;

export function normalizeChallengeMetrics(input: Partial<ChallengeMetrics> | unknown): ChallengeMetrics {
  const values = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Partial<ChallengeMetrics> : {};
  return { points: integer(values.points), threes: integer(values.threes), paintPoints: integer(values.paintPoints), assists: integer(values.assists), rebounds: integer(values.rebounds), steals: integer(values.steals), blocks: integer(values.blocks) };
}

/** Pure score calculation: callers supply real shot-location accounting for paintPoints. */
export function evaluateChallenge(definition: DailyChallenge, input: Partial<ChallengeMetrics>): ChallengeEvaluation {
  const metrics = normalizeChallengeMetrics(input);
  const score = definition.kind === 'three' ? metrics.threes : definition.kind === 'inside' ? metrics.paintPoints : Math.min(MAX_VALUE, metrics.points + 2 * metrics.assists + 2 * metrics.steals + 2 * metrics.blocks + metrics.rebounds);
  const medal: ChallengeMedal = score >= definition.medalThresholds.gold ? 'gold' : score >= definition.medalThresholds.silver ? 'silver' : score >= definition.medalThresholds.bronze ? 'bronze' : 'none';
  return { score, medal, completed: score >= definition.target };
}

function copyProgress(entry: ChallengeProgress): ChallengeProgress {
  return { ...entry, bestMetrics: { ...entry.bestMetrics }, recentRunIds: [...entry.recentRunIds] };
}
function validRunId(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,120}$/.test(value); }
function limitHistory(entries: ChallengeProgress[]): ChallengeProgress[] {
  const ordered = [...entries].sort((a, b) => b.day.localeCompare(a.day) || a.kind.localeCompare(b.kind));
  const days = new Set<string>();
  return ordered.filter(entry => { if (!days.has(entry.day) && days.size >= 90) return false; days.add(entry.day); return true; }).slice(0, 270);
}

export function normalizeChallengeProgress(raw: unknown): ChallengeProgress[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const data = raw as { version?: unknown; entries?: unknown };
  if (data.version !== 1 || !Array.isArray(data.entries)) return [];
  const result = new Map<string, ChallengeProgress>();
  for (const input of data.entries.slice(0, 3000)) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) continue;
    const entry = input as Record<string, unknown>;
    if (typeof entry.id !== 'string') continue;
    const definition = getChallengeById(entry.id);
    if (!definition || entry.day !== definition.day || entry.kind !== definition.kind || !entry.bestMetrics || typeof entry.bestMetrics !== 'object' || Array.isArray(entry.bestMetrics)) continue;
    const bestMetrics = normalizeChallengeMetrics(entry.bestMetrics);
    const evaluation = evaluateChallenge(definition, bestMetrics);
    const previous = result.get(definition.id);
    const clean: ChallengeProgress = {
      id: definition.id, day: definition.day, kind: definition.kind, ...evaluation,
      attempts: Math.max(1, integer(entry.attempts)), bestMetrics,
      updatedAt: typeof entry.updatedAt === 'string' && Number.isFinite(Date.parse(entry.updatedAt)) ? new Date(entry.updatedAt).toISOString() : `${definition.day}T00:00:00.000Z`,
      recentRunIds: Array.isArray(entry.recentRunIds) ? [...new Set(entry.recentRunIds.filter(validRunId))].slice(-32) : [],
    };
    if (!previous || clean.score > previous.score) result.set(clean.id, clean);
    if (previous) {
      const selected = result.get(clean.id)!;
      selected.attempts = Math.max(previous.attempts, clean.attempts);
      selected.recentRunIds = [...new Set([...previous.recentRunIds, ...clean.recentRunIds])].slice(-32);
    }
  }
  return limitHistory([...result.values()]);
}

function readProgress(): ChallengeProgress[] {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return memoryProgress;
    const raw = storage.getItem(DAILY_CHALLENGE_KEY);
    if (!raw) { memoryProgress = []; return memoryProgress; }
    if (raw.length > 600_000) return memoryProgress;
    const parsed: unknown = JSON.parse(raw);
    memoryProgress = normalizeChallengeProgress(parsed);
  } catch { /* Corrupt/denied storage does not prevent a challenge from being played. */ }
  return memoryProgress;
}
function persistProgress(entries: ChallengeProgress[]): void {
  memoryProgress = limitHistory(entries);
  try { globalThis.localStorage?.setItem(DAILY_CHALLENGE_KEY, JSON.stringify({ version: 1, entries: memoryProgress })); } catch { /* Session bests remain available in memory. */ }
}

export function loadDailyProgress(day: string = getLocalDay()): DailyProgress {
  day = validDay(day) ? day : getLocalDay();
  const entries = readProgress().filter(entry => entry.day === day).map(copyProgress);
  return { day, entries, completed: entries.filter(entry => entry.completed).length, goldMedals: entries.filter(entry => entry.medal === 'gold').length };
}

/** Recording an earlier day's run is valid, including a game that finishes just after midnight. */
export function recordChallengeResult(definition: DailyChallenge, input: Partial<ChallengeMetrics>, runId?: string): ChallengeRecordResult {
  const canonical = getChallengeById(definition.id);
  if (!canonical || canonical.seed !== definition.seed || canonical.kind !== definition.kind || canonical.day !== definition.day || canonical.teamId !== definition.teamId || canonical.playerIndex !== definition.playerIndex) throw new Error('Invalid daily challenge definition.');
  const entries = readProgress().map(copyProgress);
  const previous = entries.find(entry => entry.id === canonical.id);
  if (validRunId(runId) && previous?.recentRunIds.includes(runId)) return { progress: copyProgress(previous), improved: false, newMedal: false };
  const bestMetrics = normalizeChallengeMetrics(input);
  const evaluation = evaluateChallenge(canonical, bestMetrics);
  const improved = !previous || evaluation.score > previous.score;
  const newMedal = MEDALS.indexOf(evaluation.medal) > MEDALS.indexOf(previous?.medal ?? 'none');
  const progress: ChallengeProgress = improved
    ? { id: canonical.id, day: canonical.day, kind: canonical.kind, ...evaluation, attempts: Math.min(MAX_VALUE, (previous?.attempts ?? 0) + 1), bestMetrics, updatedAt: new Date().toISOString(), recentRunIds: [...(previous?.recentRunIds ?? [])] }
    : { ...previous!, attempts: Math.min(MAX_VALUE, previous!.attempts + 1), updatedAt: new Date().toISOString(), recentRunIds: [...previous!.recentRunIds] };
  if (validRunId(runId)) progress.recentRunIds = [...new Set([...progress.recentRunIds, runId])].slice(-32);
  persistProgress([...entries.filter(entry => entry.id !== canonical.id), progress]);
  return { progress: copyProgress(progress), improved, newMedal };
}

export const DAILY_OFFLINE_NOTE: Record<Locale, string> = {
  zh: '每天按设备本地日期更新。相同日期使用固定球星与随机种子，无需联网；纪录保存在当前浏览器。',
  en: 'Refreshes by your device’s local date. Each day has fixed stars and seeds, works offline, and saves records in this browser.',
};

/** A defensive data check for UI consumers, useful if roster contents are extended later. */
export function challengeAthlete(definition: DailyChallenge) {
  const team = getTeam(definition.teamId);
  return team.players[definition.playerIndex] ?? team.players[0];
}
