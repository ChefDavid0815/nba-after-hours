import './styles.css';
import './input.css';
import './replay.css';
import { CourtRenderer } from './renderer';
import { GameInput } from './input';
import { createSimulation, type CheckpointSimulation } from './simulation';
import { createUI } from './ui';
import { TEAMS, getTeam } from './data';
import { loadSave, saveProgress, recordMatch, recordChampionship } from './persistence';
import { GameAudio } from './audio';
import { createTournament, loadTournament, saveTournament, getTournamentMatch, advanceTournament, type Tournament } from './tournament';
import { getLineup, loadLineup } from './roster';
import { getDailyChallenges, evaluateChallenge, recordChallengeResult, type DailyChallenge, type ChallengeMetrics } from './challenges';
import { ReplayRecorder, sampleReplay, type ReplayClip } from './replay';
import { createTutorial } from './tutorial';
import { createMatchAnalytics } from './analytics';
import { createMatchReview } from './review';
import { createSaveManager } from './save-manager';
import { loadSession, storeSession, restoreSession, clearSession, sessionSummary } from './session';
import { COURT, EMPTY_INPUT, type GameConfig, type GameState, type GameUI, type Settings, type UIActions } from './types';

const save=loadSave();
const canvas=document.querySelector<HTMLCanvasElement>('#court')!;
const root=document.querySelector<HTMLElement>('#ui')!;
let renderer:CourtRenderer;
try { renderer=new CourtRenderer(canvas,save.settings); }
catch(error){
  root.innerHTML=`<div style="position:fixed;inset:0;display:grid;place-content:center;background:#0b111a;color:#f0eadf;font-family:Arial;padding:40px"><h1>NBA AFTER HOURS</h1><p>需要启用浏览器硬件加速才能进入 3D 球场。</p><p>Please enable hardware acceleration in your browser to enter the 3D court.</p><button onclick="location.reload()">重试 / Retry</button></div>`;
  console.error(error); throw error;
}
const input=new GameInput();
const audio=new GameAudio();
const replays=new ReplayRecorder();
const tutorial=createTutorial();
const analytics=createMatchAnalytics();
const review=createMatchReview();
const saveManager=createSaveManager(()=>{simulation=null;clearSession();location.reload();});
let replayPlayback:{clip:ReplayClip;time:number}|null=null;
const replayBanner=document.createElement('div');replayBanner.className='replay-banner';replayBanner.hidden=true;document.body.append(replayBanner);
audio.setSettings(save.settings);
let simulation:CheckpointSimulation|null=null;
let paused=false;
let resultShown=false;
let ui:GameUI;
let tournament:Tournament|null=loadTournament();
let savedSession=loadSession(tournament);
let autosaveTick=0,saveFailureReported=false;
let tournamentMatchId:string|undefined;
let playedRound=1;
let currentDaily:DailyChallenge|null=null;
let challengePaintPoints=0;
let challengeRunId='';
let previousOptions:Parameters<UIActions['start']>[0]|null=null;
let uiTick=0;
let playTime=0;
let frames=0,frameTime=0,lastFPS=60;

function start(options:Parameters<UIActions['start']>[0],next=false){
  saveManager.close();review.close();stopReplay();replays.reset();tutorial.hide();analytics.reset();
  audio.unlock();
  currentDaily=options.dailyChallenge?getDailyChallenges().find(item=>item.kind===options.dailyChallenge)??null:null;
  if(currentDaily)options={...options,home:currentDaily.teamId,homeLineup:[currentDaily.playerIndex],mode:'challenge',difficulty:'pro',quarterLength:60,playersPerTeam:currentDaily.kind==='allaround'?3:1};
  challengePaintPoints=0;challengeRunId=`run-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  previousOptions={...options};
  if(options.mode==='championship'&&!next){
    tournament=createTournament(options.home,options.away,options.difficulty,options.quarterLength,options.playersPerTeam,Date.now());
    tournament.config.homeLineup=options.homeLineup??loadLineup(getTeam(options.home));
    saveTournament(tournament);
  }else if(options.mode!=='championship')tournament=null;
  const fixture=tournament?getTournamentMatch(tournament):null;
  tournamentMatchId=fixture?.matchId;playedRound=fixture?.round??1;
  const training=options.mode==='practice'||(options.mode==='challenge'&&currentDaily?.kind!=='allaround');
  const homeTeam=getTeam(options.home),awayTeam=getTeam(fixture?.awayId??options.away);
  const smallLineup=training||options.playersPerTeam===3;
  const config:GameConfig={
    home:smallLineup?getLineup(homeTeam,options.homeLineup??loadLineup(homeTeam)):homeTeam,
    away:smallLineup?getLineup(awayTeam,options.awayLineup):awayTeam,
    mode:options.mode,difficulty:options.difficulty,
    quarterLength:options.mode==='practice'?0:options.mode==='challenge'?60:options.quarterLength,
    quarters:options.mode==='challenge'||training?1:4,playersPerTeam:training?1:options.playersPerTeam,
    seed:currentDaily?.seed??Date.now()%2147483647,
    challengeKind:currentDaily?.kind,dailyChallengeId:currentDaily?.id,
    localMultiplayer:options.mode==='exhibition'&&!!options.localMultiplayer,
  };
  simulation=createSimulation(config);paused=false;resultShown=false;playTime=0;
  autosaveTick=0;saveFailureReported=false;
  renderer.setMatch(simulation.state);input.setMultiplayer(!!config.localMultiplayer);input.setActive(true);audio.menu(false);ui.hideOverlay();
  if(options.tutorial&&config.mode==='practice')tutorial.start(simulation.state,save.settings.locale);
  save.favoriteTeam=options.home;saveProgress(save);
  ui.update(simulation.state);
  autosave();
}
function autosave(reportFailure=false){
  if(!simulation||resultShown||!['exhibition','championship'].includes(simulation.state.config.mode))return;
  const result=storeSession(simulation,analytics.snapshot(),tournament);
  if(result.ok){savedSession=restoreSession(result.saved,tournament);autosaveTick=0;saveFailureReported=false;}
  else if(reportFailure&&!saveFailureReported){saveFailureReported=true;ui.notify(save.settings.locale==='zh'?'无法写入续玩存档，本场仍可继续游玩':'Could not save this match. You can continue playing.');}
}
function resumeMatch(){
  const cup=loadTournament(),restored=loadSession(cup);
  if(!restored){ui.notify(save.settings.locale==='zh'?'这份比赛存档已不可用':'This saved match is no longer available');savedSession=null;ui.showMenu();return;}
  saveManager.close();review.close();stopReplay();tutorial.hide();replays.reset();analytics.reset();
  simulation=restored.simulation;previousOptions=restored.options;savedSession=restored;
  tournament=simulation.state.config.mode==='championship'?cup:null;
  tournamentMatchId=restored.saved.matchId;playedRound=restored.saved.round??1;
  currentDaily=null;challengePaintPoints=0;resultShown=false;paused=true;playTime=simulation.state.elapsed;autosaveTick=0;saveFailureReported=false;
  if(!analytics.restore(restored.saved.analytics))analytics.record(simulation.state,[]);
  renderer.setMatch(simulation.state);input.setMultiplayer(!!simulation.state.config.localMultiplayer);input.setActive(false);audio.unlock();audio.menu(false);
  ui.update(simulation.state);ui.showPause(simulation.state);
}
function pause(){
  if(replayPlayback){stopReplay();return;}
  if(!simulation||simulation.state.phase==='finished')return;
  paused=!paused;input.setActive(!paused);
  tutorial.setVisible(!paused);
  if(paused){autosave(true);ui.showPause(simulation.state);}else ui.hideOverlay();
}
function menu(){
  autosave();
  saveManager.close();review.close();stopReplay();replays.reset();tutorial.hide();
  simulation=null;paused=false;resultShown=false;tournament=loadTournament();savedSession=loadSession(tournament);currentDaily=null;input.setActive(false);
  renderer.setMenu(getTeam(save.favoriteTeam),getTeam('bos'));audio.menu(true);ui.showMenu();
}
function stopReplay(){
  if(!replayPlayback)return;
  replayPlayback=null;replayBanner.hidden=true;renderer.setReplay(false);
  tutorial.setVisible(!paused);
  input.setActive(!!simulation&&!paused&&!resultShown);
  if(simulation)ui.update(simulation.state);
}
function renderReplayBanner(){
  const zh=save.settings.locale==='zh';
  replayBanner.innerHTML=`<div><span class="replay-label">${zh?'精彩回放':'INSTANT REPLAY'}</span><small>${zh?'0.65 倍速 · 比赛计时已暂停':'0.65× SPEED · GAME CLOCK PAUSED'}</small></div><button type="button" aria-label="${zh?'结束回放':'End replay'}">${zh?'返回比赛':'BACK TO GAME'} <kbd>R</kbd></button><span class="replay-progress"></span>`;
  replayBanner.querySelector('button')!.addEventListener('click',stopReplay);
}
function toggleReplay(){
  if(replayPlayback){stopReplay();return;}
  if(!simulation||paused||resultShown)return;
  const clip=replays.getHighlight();
  if(!clip){ui.notify(save.settings.locale==='zh'?'进球后按 R 回看精彩瞬间':'Press R after a basket to replay the highlight');return;}
  replayPlayback={clip,time:0};input.setActive(false);renderer.setReplay(true);renderReplayBanner();replayBanner.hidden=false;
  tutorial.setVisible(false);
}
function challengeMetrics(state:GameState):ChallengeMetrics{
  const own=state.players.filter(p=>p.side===0);
  const sum=(key:'tpm'|'assists'|'rebounds'|'steals'|'blocks')=>own.reduce((total,p)=>total+p.stats[key],0);
  return {points:state.score[0],threes:sum('tpm'),paintPoints:challengePaintPoints,assists:sum('assists'),rebounds:sum('rebounds'),steals:sum('steals'),blocks:sum('blocks')};
}
function updateSettings(settings:Settings){
  save.settings={...settings};saveProgress(save);renderer.settingsChanged(save.settings);audio.setSettings(save.settings);input.setLocale(settings.locale);
  document.documentElement.lang=settings.locale==='zh'?'zh-CN':'en';
  if(replayPlayback)renderReplayBanner();
  if(simulation)tutorial.update(simulation.state,settings.locale);
}
const actions:UIActions={
  start,resume:()=>{if(paused)pause();},restart:()=>{if(previousOptions)start(previousOptions,!!simulation&&simulation.state.phase!=='finished');},quit:menu,
  settings:updateSettings,
  review:()=>{if(simulation){if(!paused&&!resultShown)pause();review.open(analytics.snapshot(),simulation.state,save.settings.locale);}},
  manageSave:()=>{if(simulation&&!paused&&!resultShown)pause();saveProgress(save);saveManager.open(save.settings.locale);},
  resumeMatch,
  savedMatch:()=>sessionSummary(savedSession),
  nextRound:()=>{
    if(!tournament||!previousOptions||!simulation||simulation.state.winner!==0)return;
    if(tournament.completed||tournament.eliminated){menu();return;}
    start(previousOptions,true);
  },
  resumeTournament:()=>{
    tournament=loadTournament();if(!tournament)return;
    const fixture=getTournamentMatch(tournament);if(!fixture)return;
    start({home:fixture.homeId,away:fixture.awayId,mode:'championship',...tournament.config},true);
  },
};
ui=createUI(root,TEAMS,save,actions);
input.onPause=pause;
input.onReplay=toggleReplay;
input.onGesture=()=>audio.unlock();
input.onCamera=()=>{const cameras:Settings['camera'][]=['broadcast','courtside','overhead'];save.settings.camera=cameras[(cameras.indexOf(save.settings.camera)+1)%cameras.length];updateSettings(save.settings);ui.notify(save.settings.locale==='zh'?`镜头：${{broadcast:'转播',courtside:'场边',overhead:'俯视'}[save.settings.camera]}`:`Camera: ${save.settings.camera}`);};
input.onMute=()=>{save.settings.volume=save.settings.volume>0?0:.6;updateSettings(save.settings);ui.notify(save.settings.locale==='zh'?(save.settings.volume?'声音已开启':'已静音'):(save.settings.volume?'Sound on':'Muted'));};
input.onFullscreen=()=>{if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});else void document.documentElement.requestFullscreen().catch(()=>{});};
window.addEventListener('blur',()=>{if(simulation&&!paused&&!resultShown){stopReplay();pause();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&simulation&&!paused&&!resultShown){stopReplay();pause();}});
window.addEventListener('pagehide',()=>autosave());
window.addEventListener('beforeunload',()=>autosave());

function processFrameEvents(state:GameState,dt:number,effects=true){
  replays.record(state,dt);
  tutorial.update(state,save.settings.locale);
  const events=simulation!.drainEvents();
  analytics.record(state,events);
  for(const event of events){
    if(effects){audio.play(event);renderer.event(event);}
    replays.markHighlight(event);
    if(currentDaily&&event.type==='score'&&event.side===0&&Math.hypot(COURT.hoopX-state.ball.startX,state.ball.startZ)<3.2)challengePaintPoints+=event.value??2;
  }
  if(currentDaily)state.challengeScore=evaluateChallenge(currentDaily,challengeMetrics(state)).score;
  return events;
}

let last=performance.now();
function animate(now:number){
  requestAnimationFrame(animate);
  const dt=Math.min(.05,Math.max(.001,(now-last)/1000));last=now;
  input.pollSystem();
  frames++;frameTime+=dt;if(frameTime>=1){lastFPS=Math.round(frames/frameTime);frames=0;frameTime=0;}
  let displayedState:GameState|null=simulation?.state??null;
  if(replayPlayback){
    replayPlayback.time+=dt*.65;
    displayedState=sampleReplay(replayPlayback.clip,replayPlayback.time);
    ui.update(displayedState);
    const progress=replayBanner.querySelector<HTMLElement>('.replay-progress');if(progress)progress.style.transform=`scaleX(${Math.min(1,replayPlayback.time/replayPlayback.clip.duration)})`;
    if(replayPlayback.time>=replayPlayback.clip.duration){stopReplay();displayedState=simulation?.state??null;}
    audio.update(dt);
  }else if(simulation&&!paused&&!resultShown){
    playTime+=dt;
    const state=simulation.state;
    const awayInput=input.sampleSecondary(state.possession===1);
    simulation.update(dt,input.sample(state.possession===0),awayInput);
    const events=processFrameEvents(state,dt);
    // Present the event batch once; HUD derives persistent feedback directly from state.
    state.events=events;
    uiTick+=dt;
    if(uiTick>.065||events.length){ui.update(state);uiTick=0;}
    state.events=[];
    autosaveTick+=dt;if(autosaveTick>=8&&state.phase!=='finished')autosave();
    audio.update(dt,state);
    if(state.phase==='finished'&&!resultShown){
      resultShown=true;input.setActive(false);
      clearSession(state.config.seed);if(savedSession?.simulation.state.config.seed===state.config.seed)savedSession=null;
      const newAchievements=recordMatch(save,state);
      if(currentDaily){
        const evaluation=evaluateChallenge(currentDaily,challengeMetrics(state));
        const result=recordChallengeResult(currentDaily,challengeMetrics(state),challengeRunId);
        state.dailyResult={id:currentDaily.id,score:evaluation.score,medal:evaluation.medal,bestScore:result.progress.score,improved:result.improved};
      }
      const championshipResult=tournament&&state.config.mode==='championship'?advanceTournament(tournament,state.score,tournamentMatchId):null;
      const champion=!!championshipResult?.champion;
      if(champion)newAchievements.push(...recordChampionship(save));
      if(tournament&&championshipResult)saveTournament(tournament);
      saveProgress(save);
      ui.showResult(state,championshipResult?{round:playedRound,total:4,champion}:undefined);
      if(newAchievements.length)ui.notify(save.settings.locale==='zh'?'新成就已解锁':'New achievement unlocked','achievement');
    }
  }else audio.update(dt);
  renderer.update(displayedState,paused?0:dt);
}
updateSettings(save.settings);menu();requestAnimationFrame(animate);

// Read-only snapshots support repeatable playtesting of the exact shipping build.
const testing={
    state:()=>simulation?JSON.parse(JSON.stringify(simulation.state)):null,
    insights:()=>analytics.snapshot(),
    status:()=>({paused,resultShown,replaying:!!replayPlayback,replayAvailable:!!replays.getHighlight(),playTime,fps:lastFPS,settings:save.settings,career:save.career,render:renderer.stats()}),
};
Object.assign(window,{__NBA:testing});
if(import.meta.env.DEV){
  Object.assign(testing,{
    start,
    pause,menu,
    step:(seconds:number,frame={...EMPTY_INPUT})=>{if(simulation){const held={...EMPTY_INPUT,moveX:frame.moveX,moveZ:frame.moveZ,sprint:frame.sprint,shootHeld:frame.shootHeld};for(let t=0;t<seconds;t+=1/60){const dt=Math.min(1/60,seconds-t);simulation.update(dt,t===0?frame:held);processFrameEvents(simulation.state,dt,false);}ui.update(simulation.state);}},
  });
}
