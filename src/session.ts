import {restoreSimulation,type CheckpointSimulation,type SimulationCheckpoint} from './simulation';
import {getTournamentMatch,type Tournament} from './tournament';
import {getTeam} from './data';
import type {UIActions} from './types';
import type {MatchAnalytics} from './analytics';

export const SESSION_KEY='nba-after-hours.session.v1';
const MAX_BYTES=1_048_576;
export interface SessionStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void;}
export interface SavedSession {
  version:1;savedAt:string;checkpoint:SimulationCheckpoint;analytics?:unknown;
  tournamentId?:string;matchId?:string;round?:number;
}
export interface RestoredSession {saved:SavedSession;simulation:CheckpointSimulation;options:Parameters<UIActions['start']>[0];}
const storageOrNull=(storage?:SessionStorage|null)=>{if(storage!==undefined)return storage;try{return globalThis.localStorage??null;}catch{return null;}};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

export function restoreSession(saved:unknown,tournament: Tournament|null=null):RestoredSession|null{
  if(!object(saved)||saved.version!==1||typeof saved.savedAt!=='string'||saved.savedAt.length>32||!Number.isFinite(Date.parse(saved.savedAt)))return null;
  if(Object.keys(saved).some(key=>!['version','savedAt','checkpoint','analytics','tournamentId','matchId','round'].includes(key)))return null;
  const simulation=restoreSimulation(saved.checkpoint);if(!simulation)return null;
  const state=simulation.state,config=state.config;
  if(!['exhibition','championship'].includes(config.mode)||state.phase==='finished')return null;
  if(config.mode==='championship'){
    const fixture=tournament?getTournamentMatch(tournament):null;
    if(!tournament||!fixture||tournament.id!==saved.tournamentId||fixture.matchId!==saved.matchId||fixture.round!==saved.round||fixture.homeId!==config.home.id||fixture.awayId!==config.away.id)return null;
  }else if(saved.tournamentId!==undefined||saved.matchId!==undefined||saved.round!==undefined)return null;
  const lineup=(side:'home'|'away')=>config[side].players.map(player=>getTeam(config[side].id).players.findIndex(athlete=>athlete.name===player.name));
  const options:Parameters<UIActions['start']>[0]={home:config.home.id,away:config.away.id,mode:config.mode,difficulty:config.difficulty,quarterLength:config.quarterLength,playersPerTeam:config.playersPerTeam,homeLineup:lineup('home'),awayLineup:lineup('away'),localMultiplayer:config.localMultiplayer};
  return {saved:saved as unknown as SavedSession,simulation,options};
}

export function loadSession(tournament:Tournament|null=null,storage?:SessionStorage|null):RestoredSession|null{
  const selected=storageOrNull(storage);if(!selected)return null;
  try{const raw=selected.getItem(SESSION_KEY);if(!raw||raw.length>MAX_BYTES)return null;return restoreSession(JSON.parse(raw),tournament);}catch{return null;}
}

export function storeSession(simulation:CheckpointSimulation,analytics:MatchAnalytics,tournament:Tournament|null=null,storage?:SessionStorage|null):{ok:true;saved:SavedSession}|{ok:false;code:'not_resumable'|'storage_unavailable'|'write_failed'}{
  const state=simulation.state;if(!['exhibition','championship'].includes(state.config.mode)||state.phase==='finished')return {ok:false,code:'not_resumable'};
  const fixture=tournament?getTournamentMatch(tournament):null;
  if(state.config.mode==='championship'&&(!tournament||!fixture||fixture.homeId!==state.config.home.id||fixture.awayId!==state.config.away.id))return {ok:false,code:'not_resumable'};
  const selected=storageOrNull(storage);if(!selected)return {ok:false,code:'storage_unavailable'};
  try{
    const saved:SavedSession={version:1,savedAt:new Date().toISOString(),checkpoint:simulation.checkpoint(),analytics,...(state.config.mode==='championship'?{tournamentId:tournament!.id,matchId:fixture!.matchId,round:fixture!.round}:{})};
    const serialized=JSON.stringify(saved);if(serialized.length>MAX_BYTES)return {ok:false,code:'write_failed'};
    selected.setItem(SESSION_KEY,serialized);if(selected.getItem(SESSION_KEY)!==serialized)return {ok:false,code:'write_failed'};
    return {ok:true,saved};
  }catch{return {ok:false,code:'write_failed'};}
}

/** expectedSeed prevents a completed challenge or unrelated match from deleting a saved competitive game. */
export function clearSession(expectedSeed?:number,storage?:SessionStorage|null):void{
  const selected=storageOrNull(storage);if(!selected)return;
  try{
    if(expectedSeed!==undefined){const raw=selected.getItem(SESSION_KEY);if(!raw||raw.length>MAX_BYTES)return;const saved=JSON.parse(raw);if(saved?.checkpoint?.state?.config?.seed!==expectedSeed)return;}
    selected.removeItem(SESSION_KEY);
  }catch{/* A denied store must not interrupt gameplay. */}
}

export function sessionSummary(session:RestoredSession|null):ReturnType<NonNullable<UIActions['savedMatch']>>{
  if(!session)return null;const state=session.simulation.state;return {home:state.config.home.id,away:state.config.away.id,score:[...state.score],quarter:state.quarter,clock:state.clock,mode:state.config.mode,savedAt:session.saved.savedAt,localMultiplayer:state.config.localMultiplayer};
}
