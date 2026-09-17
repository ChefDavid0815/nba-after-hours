import { TEAMS, getTeam } from './data';
import type { Athlete, Locale, Team } from './types';

export type LineupIndices = [number, number, number];

/** Signature trios mix ball handling, scoring and an interior presence; all five remain selectable. */
export const THREE_ON_THREE_LINEUPS: Record<string, LineupIndices> = {
  atl: [0, 2, 4], bos: [0, 2, 4], bkn: [0, 2, 4], cha: [0, 3, 4], chi: [1, 2, 3],
  cle: [1, 2, 3], dal: [0, 3, 4], den: [0, 3, 4], det: [0, 2, 4], gsw: [0, 1, 4],
  hou: [1, 2, 4], ind: [0, 1, 3], lac: [0, 2, 3], lal: [0, 1, 4], mem: [0, 3, 4],
  mia: [1, 2, 3], mil: [2, 3, 4], min: [1, 3, 4], nop: [0, 3, 4], nyk: [0, 2, 4],
  okc: [0, 2, 3], orl: [0, 1, 4], phi: [0, 2, 4], phx: [0, 1, 4], por: [0, 1, 4],
  sac: [0, 2, 3], sas: [0, 1, 3], tor: [0, 1, 4], uta: [0, 1, 3], was: [0, 1, 4],
};

function availableRoster(team: Team): Athlete[] {
  return team.players.length >= 3 ? team.players : getTeam(team.id).players;
}

/** Preserve valid user choices, discard duplicates, then fill from the team's signature trio. */
export function normalizeLineup(team: Team, indices?: readonly number[]): LineupIndices {
  const players = availableRoster(team);
  const choices = [...(Array.isArray(indices) ? indices : []), ...(THREE_ON_THREE_LINEUPS[team.id] ?? [0, 1, 2]), ...players.map((_, index) => index)];
  const result: number[] = [];
  for (const choice of choices) {
    if (Number.isInteger(choice) && choice >= 0 && choice < players.length && !result.includes(choice)) result.push(choice);
    if (result.length === 3) break;
  }
  return result as LineupIndices;
}

/** The returned team and athletes are copies, so a match cannot mutate the master roster. */
export function getLineup(team: Team, indices?: readonly number[]): Team {
  const players = availableRoster(team);
  return { ...team, players: normalizeLineup(team, indices).map(index => ({ ...players[index] })) };
}

export const LINEUP_KEY = 'nba-after-hours.lineups.v1';
let memoryLineups: Record<string, LineupIndices> = {};

function readLineups(): Record<string, LineupIndices> {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return memoryLineups;
    const raw = storage.getItem(LINEUP_KEY);
    if (!raw) { memoryLineups = {}; return memoryLineups; }
    if (raw.length > 16_000) return memoryLineups;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return memoryLineups;
    const parsed = data as { version?: unknown; teams?: unknown };
    if (parsed.version !== 1 || !parsed.teams || typeof parsed.teams !== 'object' || Array.isArray(parsed.teams)) return memoryLineups;
    const result: Record<string, LineupIndices> = {};
    const teams = parsed.teams as Record<string, unknown>;
    for (const team of TEAMS) if (Array.isArray(teams[team.id])) result[team.id] = normalizeLineup(team, teams[team.id] as number[]);
    memoryLineups = result;
  } catch { /* Selection still works in browsers that block persistent storage. */ }
  return memoryLineups;
}

/** Loads three original roster indices, so the UI can render all five players and their selection. */
export function loadLineup(team: Team): LineupIndices {
  return normalizeLineup(team, readLineups()[team.id]);
}

export function saveLineup(teamId: string, indices: readonly number[]): LineupIndices {
  const team = TEAMS.find(item => item.id === teamId);
  if (!team) return normalizeLineup(getTeam('lal'));
  const choices = normalizeLineup(team, indices);
  const lineups = readLineups();
  memoryLineups = { ...lineups, [teamId]: choices };
  try { globalThis.localStorage?.setItem(LINEUP_KEY, JSON.stringify({ version: 1, teams: memoryLineups })); } catch { /* Memory fallback remains available. */ }
  return [...choices];
}

export interface LineupRating {
  overall: number;
  shooting: number;
  finishing: number;
  speed: number;
  defense: number;
}
export function lineupRating(team: Team): LineupRating {
  const players = team.players.length ? team.players : getTeam(team.id).players;
  const average = (key: 'shooting' | 'finishing' | 'speed' | 'defense') => Math.round(players.reduce((total, player) => total + Math.max(0, Math.min(100, Number.isFinite(player[key]) ? player[key] : 70)), 0) / players.length);
  const rating = { shooting: average('shooting'), finishing: average('finishing'), speed: average('speed'), defense: average('defense') };
  return { overall: Math.round(rating.shooting * 0.28 + rating.finishing * 0.28 + rating.speed * 0.18 + rating.defense * 0.26), ...rating };
}

export type PlayerStyleId = 'playmaker' | 'sharpshooter' | 'slasher' | 'shot_creator' | 'stretch_big' | 'post_scorer' | 'rim_protector' | 'two_way';
export interface PlayerStyle {
  readonly id: PlayerStyleId;
  readonly name: Readonly<Record<Locale, string>>;
  readonly description: Readonly<Record<Locale, string>>;
  /** Tendencies are independent values between zero and one, not a probability distribution. */
  readonly driveBias: number;
  readonly passBias: number;
  readonly threeBias: number;
  readonly preferredDistance: number;
  readonly releaseMultiplier: number;
  readonly paintPresence: number;
}

function style(id: PlayerStyleId, zh: string, en: string, descriptionZh: string, descriptionEn: string, driveBias: number, passBias: number, threeBias: number, preferredDistance: number, releaseMultiplier: number, paintPresence: number): PlayerStyle {
  return Object.freeze({ id, name: Object.freeze({ zh, en }), description: Object.freeze({ zh: descriptionZh, en: descriptionEn }), driveBias, passBias, threeBias, preferredDistance, releaseMultiplier, paintPresence });
}

export const PLAYER_STYLES: Readonly<Record<PlayerStyleId, PlayerStyle>> = Object.freeze({
  playmaker: style('playmaker', '球场指挥官', 'Floor general', '观察空位，组织挡拆，让队友进入节奏。', 'Finds the open teammate and runs the pick and roll.', 0.48, 0.92, 0.35, 5.7, 0.98, 0.15),
  sharpshooter: style('sharpshooter', '外线神射手', 'Sharpshooter', '无球跑动拉开空间，抓住机会快速出手。', 'Creates spacing and turns open looks into quick threes.', 0.22, 0.52, 0.92, 7.0, 0.88, 0.08),
  slasher: style('slasher', '突破终结者', 'Slasher', '利用速度杀入禁区，在篮筐上方完成终结。', 'Attacks open lanes with speed and explosive finishes.', 0.94, 0.42, 0.2, 3.1, 0.94, 0.52),
  shot_creator: style('shot_creator', '自主得分手', 'Shot creator', '用运球创造空间，兼顾中距离与外线进攻。', 'Creates separation off the dribble and scores at every level.', 0.7, 0.49, 0.64, 5.4, 0.96, 0.25),
  stretch_big: style('stretch_big', '空间型内线', 'Stretch big', '向外拉开防线，用投篮与挡拆惩罚对手。', 'Pulls defenders out of the paint with shooting and pick-and-pop play.', 0.27, 0.57, 0.76, 6.2, 1.06, 0.42),
  post_scorer: style('post_scorer', '低位进攻核心', 'Post scorer', '在近筐区域接球，以脚步、力量和手感得分。', 'Establishes position inside and scores with footwork and touch.', 0.74, 0.42, 0.04, 2.3, 1.12, 0.96),
  rim_protector: style('rim_protector', '篮下守护者', 'Rim protector', '守护禁区，争抢篮板，为持球人设置掩护。', 'Protects the paint, controls the glass and sets strong screens.', 0.53, 0.6, 0.04, 2.4, 1.1, 1),
  two_way: style('two_way', '攻防一体', 'Two-way force', '用防守创造转换机会，攻守两端保持威胁。', 'Turns defensive pressure into balanced scoring opportunities.', 0.63, 0.6, 0.45, 4.9, 1, 0.45),
});

const SIGNATURE_STYLES: Record<string, PlayerStyleId> = {};
const assign = (id: PlayerStyleId, names: string[]) => { for (const name of names) SIGNATURE_STYLES[name] = id; };
assign('playmaker', ['Magic Johnson', 'Chris Paul', 'Jason Kidd', 'Steve Nash', 'Ricky Rubio', 'John Stockton', 'Mark Price', 'Bob Cousy', 'Tyrese Haliburton', 'Oscar Robertson', 'Isiah Thomas', 'Mike Conley', 'Kyle Lowry', 'Tony Parker']);
assign('sharpshooter', ['Stephen Curry', 'Klay Thompson', 'Reggie Miller', 'Ray Allen', 'Peja Stojakovic', 'Dell Curry', 'Glen Rice', 'Damian Lillard', 'Jason Terry', 'Mike Bibby', 'Wally Szczerbiak', 'Rashard Lewis', 'Mitch Richmond']);
assign('slasher', ['Ja Morant', 'Derrick Rose', 'Russell Westbrook', 'Dwyane Wade', 'Giannis Antetokounmpo', 'Zion Williamson', 'Vince Carter', 'Dominique Wilkins', 'Clyde Drexler', 'John Wall', 'Steve Francis', 'David Thompson', 'Julius Erving', 'Blake Griffin', 'Anthony Edwards', 'Amar’e Stoudemire', 'James Worthy', 'DeMar DeRozan']);
assign('shot_creator', ['Michael Jordan', 'Kobe Bryant', 'Kyrie Irving', 'Tracy McGrady', 'Kevin Durant', 'Luka Doncic', 'Devin Booker', 'Carmelo Anthony', 'Paul Pierce', 'Joe Johnson', 'Shai Gilgeous-Alexander', 'Brandon Roy', 'Gilbert Arenas', 'James Harden', 'Allen Iverson', 'Penny Hardaway', 'Trae Young', 'Donovan Mitchell', 'Bradley Beal', 'George Gervin', 'Alex English']);
assign('stretch_big', ['Dirk Nowitzki', 'Kevin Love', 'Chris Bosh', 'Karl-Anthony Towns', 'LaMarcus Aldridge', 'Brook Lopez', 'Rasheed Wallace']);
assign('post_scorer', ['Kareem Abdul-Jabbar', 'Shaquille O’Neal', 'Yao Ming', 'Hakeem Olajuwon', 'Nikola Jokic', 'Moses Malone', 'Patrick Ewing', 'Karl Malone', 'Chris Webber', 'Zach Randolph', 'Bob Pettit', 'Elvin Hayes', 'Willis Reed', 'Tim Duncan', 'Charles Barkley', 'Wilt Chamberlain', 'DeMarcus Cousins', 'Jermaine O’Neal', 'Brad Daugherty', 'Rik Smits']);
assign('rim_protector', ['Dikembe Mutombo', 'Bill Russell', 'Ben Wallace', 'Joakim Noah', 'Tyson Chandler', 'Marc Gasol', 'Dwight Howard', 'Rudy Gobert', 'Alonzo Mourning', 'Serge Ibaka', 'Anthony Davis', 'David Robinson', 'Bill Walton', 'Wes Unseld', 'DeAndre Jordan', 'Steven Adams']);
assign('two_way', ['Scottie Pippen', 'Kawhi Leonard', 'Paul George', 'Jimmy Butler', 'Shane Battier', 'Shawn Marion', 'Andrei Kirilenko', 'Kevin Garnett', 'LeBron James', 'Draymond Green', 'Dennis Rodman', 'Sidney Moncrief', 'Joe Dumars', 'Jrue Holiday', 'Pascal Siakam', 'Grant Hill', 'Manu Ginobili', 'Larry Bird', 'Walt Frazier']);

// These stars combine roles: a passing big should not inherit a traditional centre's shot diet.
const STYLE_VARIANTS: Readonly<Record<string, PlayerStyle>> = Object.freeze({
  'Nikola Jokic': Object.freeze({ ...PLAYER_STYLES.post_scorer, passBias: 0.92, threeBias: 0.43, driveBias: 0.4, preferredDistance: 3.9, paintPresence: 0.76 }),
  'LeBron James': Object.freeze({ ...PLAYER_STYLES.two_way, passBias: 0.85, driveBias: 0.91, threeBias: 0.43, preferredDistance: 4.3 }),
  'Larry Bird': Object.freeze({ ...PLAYER_STYLES.two_way, passBias: 0.78, threeBias: 0.8, driveBias: 0.38, preferredDistance: 6.0 }),
  'Draymond Green': Object.freeze({ ...PLAYER_STYLES.two_way, passBias: 0.9, threeBias: 0.2, driveBias: 0.37, paintPresence: 0.8 }),
  'Tim Duncan': Object.freeze({ ...PLAYER_STYLES.post_scorer, passBias: 0.62, preferredDistance: 3.4 }),
  'Chris Webber': Object.freeze({ ...PLAYER_STYLES.post_scorer, passBias: 0.76, threeBias: 0.16, preferredDistance: 3.7 }),
  'Marc Gasol': Object.freeze({ ...PLAYER_STYLES.rim_protector, passBias: 0.8, threeBias: 0.35, preferredDistance: 4.1 }),
  'Kevin Garnett': Object.freeze({ ...PLAYER_STYLES.two_way, passBias: 0.72, threeBias: 0.15, preferredDistance: 4.1, paintPresence: 0.9 }),
  'Dennis Rodman': Object.freeze({ ...PLAYER_STYLES.two_way, passBias: 0.87, threeBias: 0.01, driveBias: 0.2, preferredDistance: 2.2, paintPresence: 1 }),
});

function inferredStyle(player: Athlete): PlayerStyleId {
  if (player.height >= 2.07 && player.shooting >= 85) return 'stretch_big';
  if (player.height >= 2.05 && player.defense >= 92) return 'rim_protector';
  if (player.role === 'PG') return 'playmaker';
  if (player.shooting >= 91 && player.finishing < 85) return 'sharpshooter';
  if (player.finishing >= 94 && player.speed >= 88) return 'slasher';
  if (player.defense >= 89) return 'two_way';
  if (player.height >= 2.04 && player.finishing >= 85) return 'post_scorer';
  return 'shot_creator';
}

/** Gameplay personalities describe basketball tendencies, not official ratings. */
export function playerStyle(player: Athlete): PlayerStyle {
  return STYLE_VARIANTS[player.name] ?? PLAYER_STYLES[SIGNATURE_STYLES[player.name] ?? inferredStyle(player)];
}

export const getPlayerStyle = playerStyle;
