export type Side = 0 | 1;
export type Mode = 'exhibition' | 'championship' | 'practice' | 'challenge';
export type Difficulty = 'rookie' | 'pro' | 'allstar';
export type CameraMode = 'broadcast' | 'courtside' | 'overhead';
export type ChallengeKind = 'freestyle' | 'three' | 'inside' | 'allaround';
export interface Athlete {
  name: string; shortName: string; number: number; role: string;
  shooting: number; finishing: number; speed: number; defense: number; height: number;
  skin: string; hair: 'short' | 'bald' | 'curly';
}
export interface Team {
  id: string; city: string; name: string; abbr: string; conference: 'East' | 'West';
  primary: string; secondary: string; accent: string; arena: string; tagline: string;
  players: Athlete[];
}
export interface GameConfig {
  home: Team; away: Team; mode: Mode; difficulty: Difficulty;
  quarterLength: number; quarters: number; playersPerTeam: number; seed: number;
  targetScore?: number;
  challengeKind?: ChallengeKind;
  dailyChallengeId?: string;
  localMultiplayer?: boolean;
}
export interface PlayerStats { points: number; assists: number; rebounds: number; steals: number; blocks: number; fgm: number; fga: number; tpm: number; tpa: number; turnovers: number; }
export interface PlayerState {
  id: number; side: Side; slot: number; athlete: Athlete;
  x: number; z: number; vx: number; vz: number; facing: number;
  stamina: number; jump: number; action: 'idle' | 'run' | 'shoot' | 'dunk' | 'block' | 'steal' | 'crossover';
  actionTime: number; cooldown: number; stats: PlayerStats;
}
export interface BallState {
  x: number; y: number; z: number; owner: number | null;
  state: 'held' | 'pass' | 'shot' | 'loose' | 'dead';
  from?: number; target?: number; progress: number;
  startX: number; startZ: number; startY: number; endX: number; endZ: number; endY: number;
  duration: number; arc: number; made?: boolean; points?: number;
}
export interface GameEvent { id: number; type: 'shot' | 'score' | 'miss' | 'pass' | 'steal' | 'block' | 'rebound' | 'whistle' | 'buzzer' | 'quarter' | 'gameover' | 'crossover' | 'dunk' | 'perfect' | 'tip'; text: string; side?: Side; player?: number; value?: number; }
export interface ShotFeedback { text: string; quality: number; timing: number; contest: number; perfect: boolean; ttl: number; }
export interface GameState {
  config: GameConfig; players: PlayerState[]; ball: BallState;
  score: [number, number]; quarter: number; clock: number; shotClock: number;
  possession: Side; controlled: number; phase: 'intro' | 'playing' | 'inbound' | 'halftime' | 'finished';
  phaseTime: number; elapsed: number; charging: boolean; charge: number;
  shotFeedback: ShotFeedback | null; events: GameEvent[]; momentum: [number, number];
  winner: Side | null; lastScorer: number | null;
  controlledAway?: number;
  challengeScore?: number;
  dailyResult?: {id:string;score:number;medal:'none'|'bronze'|'silver'|'gold';bestScore:number;improved:boolean};
}
export interface InputFrame {
  moveX: number; moveZ: number; sprint: boolean; shootHeld: boolean;
  shootPressed: boolean; shootReleased: boolean; passPressed: boolean;
  switchPressed: boolean; stealPressed: boolean; blockPressed: boolean;
  crossoverPressed: boolean; callScreenPressed: boolean;
  passTarget?: number;
}
export interface Simulation {
  state: GameState;
  update(dt: number, input: InputFrame, awayInput?: InputFrame): void;
  drainEvents(): GameEvent[];
}
export type Locale = 'zh' | 'en';
export interface Settings { locale: Locale; volume: number; music: boolean; sfx: boolean; camera: CameraMode; quality: 'low' | 'high'; difficulty: Difficulty; quarterLength: number; reducedMotion: boolean; showControls: boolean; }
export interface MatchRecord { id: string; date: string; home: string; away: string; score: [number, number]; won: boolean; mode: Mode; difficulty: Difficulty; points: number; assists: number; rebounds: number; }
export interface CareerStats { games: number; wins: number; losses: number; points: number; threes: number; assists: number; steals: number; championships: number; bestScore: number; }
export interface SaveData { version: number; settings: Settings; career: CareerStats; history: MatchRecord[]; achievements: string[]; favoriteTeam: string; challengeBests: Record<string, number>; playedTeams?: string[]; }
export interface UIActions {
  start(config: {home: string; away: string; mode: Mode; difficulty: Difficulty; quarterLength: number; playersPerTeam: number; homeLineup?: number[]; awayLineup?: number[]; dailyChallenge?: Exclude<ChallengeKind,'freestyle'>; localMultiplayer?: boolean; tutorial?: boolean}): void;
  resume(): void; restart(): void; quit(): void; settings(settings: Settings): void;
  nextRound(): void;
  resumeTournament?(): void;
  review?(): void;
}
export interface GameUI {
  showMenu(): void; showPause(state: GameState): void; hideOverlay(): void;
  update(state: GameState): void; showResult(state: GameState, championship?: {round: number; total: number; champion: boolean}): void;
  notify(text: string, type?: string): void;
}
export const EMPTY_INPUT: InputFrame = {moveX:0,moveZ:0,sprint:false,shootHeld:false,shootPressed:false,shootReleased:false,passPressed:false,switchPressed:false,stealPressed:false,blockPressed:false,crossoverPressed:false,callScreenPressed:false};
export const COURT = { halfLength: 14, halfWidth: 7.5, hoopX: 12.15, hoopY: 3.05, threeRadius: 6.75 };
