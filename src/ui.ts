import type { Difficulty, GameState, GameUI, Locale, Mode, PlayerState, SaveData, Settings, Team, UIActions } from './types';
import { ACHIEVEMENTS, getTeam, playerName, ROSTER_NOTE } from './data';
import { getTournamentChampion, getTournamentMatch, loadTournament } from './tournament';
import { loadLineup, normalizeLineup, playerStyle, saveLineup } from './roster';
import { getCoachCue, type CoachCueKey } from './coach';
import { DAILY_OFFLINE_NOTE, getChallengeById, getDailyChallenges, getLocalDay, loadDailyProgress, type ChallengeKind } from './challenges';
import { t, teamName, translateEvent, type TranslationKey } from './i18n';
import { hasCompletedTutorial } from './tutorial';
import './tutorial.css';

const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const icons = {
  ball: '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="16" stroke="currentColor" stroke-width="2"/><path d="M4 20h32M20 4v32M9 8c13 5 13 19 0 24M31 8c-13 5-13 19 0 24" stroke="currentColor" stroke-width="1.6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.8"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 17h16" stroke="currentColor" stroke-width="1.5"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/></svg>',
  trophy: '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M10 5h12v8a6 6 0 0 1-12 0V5ZM10 8H5v4a5 5 0 0 0 5 5M22 8h5v4a5 5 0 0 1-5 5M16 19v7m-6 1h12" stroke="currentColor" stroke-width="1.7"/></svg>',
  target: '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="11" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="16" r="6" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="16" r="1.8" fill="currentColor"/></svg>',
  bolt: '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m18 3-12 16h9l-1 10 12-17h-9l1-9Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.6"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3"/></svg>',
};
const modes: Mode[] = ['exhibition', 'championship', 'practice', 'challenge'];
const modeIcon = {exhibition: icons.ball, championship: icons.trophy, practice: icons.target, challenge: icons.bolt};
const modeDescription: Record<Mode, TranslationKey> = {exhibition:'exhibitionDescription', championship:'championshipDescription', practice:'practiceDescription', challenge:'challengeDescription'};
const modeTip: Record<Mode, TranslationKey> = {exhibition:'tipText', championship:'championshipTip', practice:'practiceTip', challenge:'challengeTip'};
const modeStart: Record<Mode, TranslationKey> = {exhibition:'play', championship:'startChampionship', practice:'startPractice', challenge:'startChallenge'};
const teamRating = (team: Team, stat: 'offense' | 'defense' | 'pace'): number => Math.round(team.players.reduce((sum, p) => sum + (stat === 'offense' ? (p.shooting + p.finishing) / 2 : stat === 'defense' ? p.defense : p.speed), 0) / Math.max(1, team.players.length));
const clockText = (clock: number): string => `${Math.floor(Math.max(0, clock) / 60)}:${String(Math.floor(Math.max(0, clock) % 60)).padStart(2, '0')}`;
const percentage = (made: number, attempts: number): string => attempts ? `${Math.round(made / attempts * 100)}%` : '—';

export function createUI(root: HTMLElement, teams: Team[], save: SaveData, actions: UIActions): GameUI {
  root.classList.add('ui-root');
  root.innerHTML = '<div class="game-hud" hidden></div><div class="ui-overlay"></div><div class="global-tools"></div><div class="toast-stack" aria-live="polite" aria-atomic="false"></div>';
  const overlay = root.querySelector<HTMLElement>('.ui-overlay')!;
  const hud = root.querySelector<HTMLElement>('.game-hud')!;
  const globalTools = root.querySelector<HTMLElement>('.global-tools')!;
  const toastStack = root.querySelector<HTMLElement>('.toast-stack')!;
  let locale: Locale = save.settings.locale === 'en' ? 'en' : 'zh';
  let screen: 'menu' | 'pause' | 'result' | null = 'menu';
  let subpanel: 'settings' | 'help' | 'career' | 'bracket' | 'roster' | null = null;
  let mode: Mode = 'exhibition';
  let homeId = teams.find(team => team.id === save.favoriteTeam)?.id ?? teams.find(team => team.abbr === 'LAL')?.id ?? teams[0].id;
  let awayId = teams.find(team => team.abbr === 'BOS' && team.id !== homeId)?.id ?? teams.find(team => team.id !== homeId)!.id;
  let playersPerTeam = 3;
  let localMultiplayer = false;
  let latestState: GameState | null = null;
  let championship: {round: number; total: number; champion: boolean} | undefined;
  let hudSignature = '';
  let previousFocus: HTMLElement | null = null;
  let previousFocusSelector = '';
  let previousFocusIndex = 0;
  let rosterSide: 'home' | 'away' = 'home';
  let rosterSelection: number[] = [];
  const soloPlayers: Record<string,number> = {};
  let eventSeed: number | null = null;
  let eventState: GameState | null = null;
  let lastEventId = 0;
  let coachKey: CoachCueKey | null = null;
  let coachChangedAt = 0;
  let shotSide = 0;
  let previousFeedback: GameState['shotFeedback'] = null;
  const tr = (key: TranslationKey, vars?: Record<string, string | number>): string => t(locale, key, vars);
  const home = (): Team => teams.find(team => team.id === homeId)!;
  const away = (): Team => teams.find(team => team.id === awayId)!;
  const setText = (selector: string, text: string): void => { const element = hud.querySelector<HTMLElement>(selector); if (element && element.textContent !== text) element.textContent = text; };

  function settingsChanged(patch: Partial<Settings>): void {
    Object.assign(save.settings, patch);
    actions.settings({...save.settings});
    root.classList.toggle('reduce-motion', save.settings.reducedMotion);
  }
  function setLocale(value: Locale): void {
    locale = value;
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    settingsChanged({locale});
    hudSignature = '';
    render();
    if (latestState) update(latestState);
  }
  function localeControl(): string {
    return `<div class="language-toggle" aria-label="语言 / Language"><button type="button" data-locale="zh" class="${locale === 'zh' ? 'active' : ''}" aria-pressed="${locale === 'zh'}">中文</button><span>/</span><button type="button" data-locale="en" class="${locale === 'en' ? 'active' : ''}" aria-pressed="${locale === 'en'}">EN</button></div>`;
  }
  function bindLocale(scope: ParentNode): void { scope.querySelectorAll<HTMLButtonElement>('[data-locale]').forEach(button => button.addEventListener('click', () => setLocale(button.dataset.locale as Locale))); }
  function renderTools(): void {
    globalTools.innerHTML = screen ? '' : `${localeControl()}<button type="button" class="icon-button hud-pause" data-pause aria-label="${tr('pause')}" title="${tr('pause')} · Esc">${icons.pause}</button>`;
    bindLocale(globalTools);
    globalTools.querySelector('[data-pause]')?.addEventListener('click', () => window.dispatchEvent(new KeyboardEvent('keydown', {code:'Escape', key:'Escape', bubbles:true})));
  }
  function brand(): string { return `<div class="brand"><span class="brand-icon">${icons.ball}</span><span>NBA<span class="brand-light">AFTER HOURS</span></span><span class="brand-mark">26</span></div>`; }
  function teamOptions(selected: string): string { return teams.map(team => `<option value="${esc(team.id)}" ${team.id === selected ? 'selected' : ''}>${esc(teamName(team, locale))}</option>`).join(''); }
  function teamCard(team: Team, side: 'home' | 'away'): string {
    const solo=mode==='practice'||mode==='challenge';
    const indices=solo?[soloPlayers[team.id]??loadLineup(team)[0]]:playersPerTeam===5?team.players.map((_,index)=>index):side==='home'||(localMultiplayer&&mode==='exhibition')?loadLineup(team):normalizeLineup(team);
    const selectedPlayers=indices.map(index=>team.players[index]);
    const ratingTeam={...team,players:selectedPlayers};
    return `<div class="team-select-card ${side}" style="--team-color:${esc(team.primary)};--team-accent:${esc(team.accent)}"><div class="team-badge" aria-hidden="true"><span>${esc(team.abbr)}</span><i></i></div><div class="team-select-body"><label for="team-${side}" class="micro-label">${tr(localMultiplayer&&mode==='exhibition'?(side==='home'?'playerOneTeam':'playerTwoTeam'):side)}</label><div class="select-wrap team-select-wrap"><select id="team-${side}" data-team="${side}" aria-label="${tr(side === 'home' ? 'homeTeam' : 'awayTeam')}">${teamOptions(team.id)}</select></div><div class="team-ratings">${(['offense','defense','pace'] as const).map(stat => `<span>${tr(stat)} <b>${teamRating(ratingTeam, stat)}</b></span>`).join('')}</div><div class="lineup-preview"><span>${selectedPlayers.map(player=>esc(playerName(player,locale))).join(' / ')}</span><button type="button" data-roster="${side}" aria-label="${esc(teamName(team,locale))} ${tr('roster')}">${tr('roster')} ↗</button></div></div></div>`;
  }
  function selectField(label: TranslationKey, id: string, options: Array<[string | number, string]>, value: string | number): string {
    return `<label class="select-field" for="${id}"><span class="micro-label">${tr(label)}</span><span class="select-wrap"><select id="${id}">${options.map(([v, text]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${text}</option>`).join('')}</select></span></label>`;
  }
  function savedTournamentBanner(): string {
    const tournament = loadTournament();
    if (!tournament || (tournament.completed && mode !== 'championship')) return '';
    const fixture = getTournamentMatch(tournament);
    return `<div class="tournament-resume-bar"><span class="resume-trophy">${icons.trophy}</span><div><strong>${tr(tournament.completed ? 'tournamentComplete' : 'tournamentSaved')}</strong><small>${esc(teamName(getTeam(tournament.userTeamId),locale))} · ${tr('round',{n:tournament.round,total:4})}${fixture ? ` · ${esc(getTeam(fixture.awayId).abbr)}` : ''}</small></div><button type="button" class="text-button" data-bracket>${tr('bracket')}</button>${fixture && actions.resumeTournament ? `<button type="button" class="secondary-button" data-resume-tournament>${tr('tournamentContinue')}${icons.arrow}</button>` : ''}</div>`;
  }
  function savedMatchBanner(): string {
    const match=actions.savedMatch?.();
    if(!match||!actions.resumeMatch)return '';
    const homeTeam=getTeam(match.home),awayTeam=getTeam(match.away),date=new Date(match.savedAt);
    const savedDate=Number.isFinite(date.getTime())?date.toLocaleString(locale==='zh'?'zh-CN':'en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
    const period=match.mode==='practice'?tr('practice'):tr(match.quarter>4?'overtime':'quarter',{n:match.quarter>4?match.quarter-4:match.quarter});
    return `<section class="saved-match-card" aria-label="${tr('unfinishedGame')}"><div class="saved-match-intro"><span class="saved-match-indicator" aria-hidden="true"></span><div><strong>${tr('unfinishedGame')}</strong><small>${tr(match.localMultiplayer?'localMatch':match.mode)}${savedDate?` · <time datetime="${esc(match.savedAt)}">${esc(tr('savedAt',{date:savedDate}))}</time>`:''}</small></div></div><div class="saved-match-score"><span title="${esc(teamName(homeTeam,locale))}">${esc(homeTeam.abbr)}</span><strong>${match.score[0]}<i>:</i>${match.score[1]}</strong><span title="${esc(teamName(awayTeam,locale))}">${esc(awayTeam.abbr)}</span><small>${period} · ${match.mode==='practice'?'∞':clockText(match.clock)}</small></div><button type="button" class="primary-button" data-resume-match>${tr('resumeSavedMatch')}${icons.arrow}</button></section>`;
  }
  function bindTournamentButtons(scope: ParentNode): void {
    scope.querySelectorAll('[data-bracket]').forEach(button=>button.addEventListener('click',()=>openSubpanel('bracket')));
    scope.querySelectorAll('[data-resume-tournament]').forEach(button=>button.addEventListener('click',()=>{hideOverlay();actions.resumeTournament?.();}));
  }
  function careerContent(): string {
    const career=save.career;
    const stats: Array<[TranslationKey, string | number]> = [['games',career.games],['wins',career.wins],['winRate',career.games?`${Math.round(career.wins/career.games*100)}%`:'—'],['championships',career.championships],['totalPoints',career.points],['totalAssists',career.assists]];
    return `<p class="help-subtitle">${tr('careerDescription')}</p><div class="career-summary">${stats.map(([label,value])=>`<div><strong>${value}</strong><span>${tr(label)}</span></div>`).join('')}</div><div class="section-heading"><h3>${tr('achievements')}</h3><span>${save.achievements.length} / ${ACHIEVEMENTS.length}</span></div><div class="achievement-grid">${ACHIEVEMENTS.map(achievement=>{const unlocked=save.achievements.includes(achievement.id);return `<article class="achievement-card ${unlocked?'is-unlocked':''}"><span class="achievement-icon" aria-hidden="true">${esc(achievement.icon)}</span><div><strong>${esc(achievement.name[locale])}</strong><p>${esc(achievement.description[locale])}</p><span>${tr(unlocked?'unlocked':'locked')}</span></div></article>`;}).join('')}</div><div class="section-heading history-heading"><h3>${tr('history')}</h3><span>${tr('savedLocally')}</span></div>${save.history.length?`<div class="history-list">${save.history.slice(0,10).map(record=>`<div class="history-row"><span class="history-outcome ${record.won?'won':''}">${tr(record.won?'recordWin':'recordLoss')}</span><div><strong>${esc(teamName(getTeam(record.home),locale))} <i>vs</i> ${esc(teamName(getTeam(record.away),locale))}</strong><small>${new Date(record.date).toLocaleDateString(locale==='zh'?'zh-CN':'en-US',{month:'short',day:'numeric'})} · ${tr(record.mode)} · ${tr(record.difficulty)}</small></div><b>${record.score[0]}<i>:</i>${record.score[1]}</b></div>`).join('')}</div>`:`<div class="history-empty">${icons.ball}<p>${tr('historyEmpty')}</p></div>`}`;
  }
  function bracketContent(): string {
    const tournament=loadTournament();
    if(!tournament)return `<p class="help-subtitle">${tr('championshipTip')}</p>`;
    const championId=getTournamentChampion(tournament),fixture=getTournamentMatch(tournament);
    const titles: TranslationKey[]=['round16','quarterfinals','semifinals','finals'];
    return `<p class="help-subtitle">${tr('tournamentFormat')}</p><div class="bracket-status"><span class="micro-label">${tr(championId?'championTeam':'yourTeam')}</span><strong>${esc(teamName(getTeam(championId??tournament.userTeamId),locale))}</strong>${fixture?`<span>${tr('nextOpponent')} · ${esc(teamName(getTeam(fixture.awayId),locale))}</span>`:''}</div><div class="bracket-scroll"><div class="tournament-bracket">${tournament.bracket.map((round,index)=>`<section class="bracket-column"><h3>${tr(titles[index])}</h3><div class="bracket-round-games">${round.map(match=>`<div class="bracket-match ${match.id===fixture?.matchId?'is-next':''}">${([match.homeId,match.awayId] as const).map((id,side)=>{const team=id?getTeam(id):null,winner=Boolean(match.score&&match.score[side]>match.score[side===0?1:0]);return `<div class="bracket-team ${id===tournament.userTeamId?'user-team':''} ${winner?'match-winner':''}"><span class="bracket-team-mark" style="--team-color:${team?.primary??'#203540'}">${team?.abbr??'—'}</span><span>${team?esc(teamName(team,locale)):tr('awaiting')}</span><strong>${match.score?match.score[side]:'—'}</strong></div>`;}).join('')}</div>`).join('')}</div></section>`).join('')}</div></div>${fixture&&actions.resumeTournament?`<button type="button" class="primary-button bracket-continue" data-resume-tournament>${tr('tournamentContinue')}${icons.arrow}</button>`:''}`;
  }
  function dailyChallengesContent():string {
    const progress=loadDailyProgress();
    const medals={none:'medalNone',bronze:'medalBronze',silver:'medalSilver',gold:'medalGold'} as const;
    return `<section class="daily-section"><div class="section-heading"><h2>${tr('dailyChallenges')}</h2><span>${tr('dailyRefresh')} · ${getLocalDay()}</span></div><div class="daily-cards">${getDailyChallenges().map((definition,index)=>{
      const team=getTeam(definition.teamId),athlete=team.players[definition.playerIndex],entry=progress.entries.find(item=>item.id===definition.id);
      return `<button type="button" class="daily-card" data-daily="${definition.kind}"><span class="daily-card-top"><span class="daily-index">0${index+1}</span><span class="daily-medal ${entry?.medal??'none'}">${entry?.medal&&entry.medal!=='none'?tr(medals[entry.medal]):tr('dailyFixed')}</span></span><strong>${esc(definition.name[locale])}</strong><span class="daily-athlete">${esc(playerName(athlete,locale))}<small>${esc(team.abbr)}</small></span><span class="daily-description">${esc(definition.description[locale])}</span><span class="daily-thresholds"><i class="bronze"></i>${definition.medalThresholds.bronze}<i class="silver"></i>${definition.medalThresholds.silver}<i class="gold"></i>${definition.medalThresholds.gold}${entry?`<b>${tr('best')} ${entry.score}</b>`:''}</span><span class="daily-card-action">${tr('dailyStart')}${icons.arrow}</span></button>`;
    }).join('')}</div><p class="daily-note">${esc(DAILY_OFFLINE_NOTE[locale])}</p></section>`;
  }
  function renderMenu(): void {
    const c=save.career,solo=mode==='practice'||mode==='challenge';
    const opponentSetting=mode==='exhibition'?selectField('opponentType','opponent-type',[['cpu',tr('computerOpponent')],['local',tr('localOpponent')]],localMultiplayer?'local':'cpu'):'';
    const teamSection=solo?`<div class="teams-row solo-teams">${teamCard(home(),'home')}<div class="solo-session-info"><span class="micro-label">${tr('soloSession')}</span><strong>${mode==='challenge'?'60':'∞'}<small>${tr(mode==='challenge'?'seconds':'unlimited')}</small></strong><span>${tr(mode==='challenge'?'challengeTip':'practiceTip')}</span></div></div>`:`<div class="teams-row">${teamCard(home(),'home')}<span class="versus">VS</span>${teamCard(away(),'away')}</div>`;
    overlay.innerHTML=`<main class="menu-shell ${mode==='exhibition'?'has-opponent-setting':''}" data-mode="${mode}">
      <header class="menu-header">${brand()}<div class="header-actions"><button class="text-button" type="button" data-career>${tr('career')}</button><button class="text-button" type="button" data-help>${tr('controls')}</button>${localeControl()}<button class="icon-button" type="button" data-settings aria-label="${tr('settings')}" title="${tr('settings')}">${icons.settings}</button></div></header>
      <section class="menu-hero"><div class="hero-copy"><div class="eyebrow"><span class="status-dot"></span>${tr('eyebrow')}</div><h1><span>${tr('heroTop')}</span><span>${tr('heroBottom')}</span></h1><p class="hero-description">${tr('heroDescription')}</p><div class="mode-grid" role="group" aria-label="${tr('selectMode')}">${modes.map(item=>`<button type="button" class="mode-card ${mode===item?'selected':''}" data-mode="${item}" aria-pressed="${mode===item}"><span class="mode-icon">${modeIcon[item]}</span><span><strong>${tr(item)}</strong><small>${tr(modeDescription[item])}</small></span><i class="mode-selected-dot"></i></button>`).join('')}</div></div><aside class="hero-court" aria-label="${tr('courtReady')}"><div class="court-live"><span class="status-dot"></span>${tr('courtReady')}<span>01 / 30</span></div><div class="court-caption"><span class="vertical-rule"></span><div><span class="micro-label">${esc(home().arena)}</span><strong>${esc(home().abbr)} ${solo?'':`<span>vs</span> ${esc(away().abbr)}`}</strong><small>${tr('builtForTheGame')}</small></div></div></aside></section>
      ${savedMatchBanner()}
      ${savedTournamentBanner()}
      <section class="matchup-panel ${mode==='challenge'?'challenge-matchup':''}" aria-label="${tr(mode==='challenge'?'dailyChallenges':'matchup')}">
        ${mode==='challenge'?dailyChallengesContent():''}
        <div class="matchup-heading"><span class="micro-label">${tr(mode==='challenge'?'freeChallenge':'matchup')}</span><span class="matchup-line"></span><span class="matchup-index">${String(teams.length).padStart(2,'0')} TEAMS / ONE GAME</span></div>
        ${teamSection}
        <div class="matchup-settings ${solo?'solo-settings':''}">${opponentSetting}${selectField('difficulty','difficulty',[['rookie',tr('rookie')],['pro',tr('pro')],['allstar',tr('allstar')]],save.settings.difficulty)}${selectField('quarterLength','quarter-length',[[60,`1 ${tr('minute')}`],[120,`2 ${tr('minute')}`],[180,`3 ${tr('minute')}`],[300,`5 ${tr('minute')}`]],save.settings.quarterLength)}${selectField('format','format',[[3,tr('threeOnThree')],[5,tr('fiveOnFive')]],playersPerTeam)}<button type="button" class="primary-button start-button" data-start><span>${tr(modeStart[mode])}</span>${icons.arrow}</button></div>
        <div class="menu-tip"><span>${tr('tip')}</span><p>${tr(mode==='exhibition'&&localMultiplayer?'localControlsHint':modeTip[mode])}</p></div>
        ${mode==='practice'?`<div class="tutorial-menu-card"><div class="tutorial-menu-copy"><strong>${tr('tutorialTitle')}${hasCompletedTutorial()?`<span class="tutorial-menu-completed">✓ ${tr('tutorialCompleted')}</span>`:''}</strong><p>${tr('tutorialMenuHint')}</p></div><button type="button" class="secondary-button" data-tutorial>${tr(hasCompletedTutorial()?'tutorialReplay':'tutorialStart')}${icons.arrow}</button></div>`:''}
      </section>
      <footer class="menu-footer"><button type="button" class="career-strip" data-career><span class="micro-label">${tr('career')}</span><strong>${c.wins}<small>${tr('wins')}</small></strong><strong>${c.championships}<small>${tr('championships')}</small></strong><strong>${c.bestScore}<small>${tr('bestScore')}</small></strong></button><div class="footer-note"><span class="save-indicator"></span>${tr('savedLocally')}<small>${tr('unofficial')}</small></div></footer>
    </main>`;
    bindLocale(overlay);bindTournamentButtons(overlay);
    overlay.querySelector('[data-resume-match]')?.addEventListener('click',()=>actions.resumeMatch?.());
    overlay.querySelectorAll<HTMLButtonElement>('button[data-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode as Mode;render();overlay.querySelector<HTMLButtonElement>(`button[data-mode="${mode}"]`)?.focus({preventScroll:true});}));
    overlay.querySelectorAll<HTMLSelectElement>('[data-team]').forEach(select=>select.addEventListener('change',()=>{
      const side=select.dataset.team;
      if(side==='home'){const previous=homeId;homeId=select.value;if(awayId===homeId)awayId=previous;save.favoriteTeam=homeId;settingsChanged({});}
      else{const previous=awayId;awayId=select.value;if(homeId===awayId)homeId=previous;}
      render();overlay.querySelector<HTMLSelectElement>(`[data-team="${side}"]`)?.focus({preventScroll:true});
    }));
    overlay.querySelector<HTMLSelectElement>('#opponent-type')?.addEventListener('change',event=>{localMultiplayer=(event.target as HTMLSelectElement).value==='local';render();overlay.querySelector<HTMLSelectElement>('#opponent-type')?.focus({preventScroll:true});});
    overlay.querySelector<HTMLSelectElement>('#difficulty')!.addEventListener('change',event=>settingsChanged({difficulty:(event.target as HTMLSelectElement).value as Difficulty}));
    overlay.querySelector<HTMLSelectElement>('#quarter-length')!.addEventListener('change',event=>settingsChanged({quarterLength:Number((event.target as HTMLSelectElement).value)}));
    overlay.querySelector<HTMLSelectElement>('#format')!.addEventListener('change',event=>{playersPerTeam=Number((event.target as HTMLSelectElement).value);render();overlay.querySelector<HTMLSelectElement>('#format')?.focus({preventScroll:true});});
    overlay.querySelectorAll<HTMLButtonElement>('[data-roster]').forEach(button=>button.addEventListener('click',()=>openRoster(button.dataset.roster as 'home'|'away')));
    const begin=(dailyChallenge?:ChallengeKind,tutorial=false)=>{hideOverlay();actions.start({home:homeId,away:awayId,mode,difficulty:save.settings.difficulty,quarterLength:save.settings.quarterLength,playersPerTeam,homeLineup:solo?[soloPlayers[homeId]??loadLineup(home())[0]]:playersPerTeam===3?loadLineup(home()):undefined,dailyChallenge,localMultiplayer:mode==='exhibition'&&localMultiplayer,awayLineup:mode==='exhibition'&&localMultiplayer&&playersPerTeam===3?loadLineup(away()):undefined,tutorial});};
    overlay.querySelector('[data-start]')!.addEventListener('click',()=>begin());
    overlay.querySelector('[data-tutorial]')?.addEventListener('click',()=>begin(undefined,true));
    overlay.querySelectorAll<HTMLButtonElement>('[data-daily]').forEach(button=>button.addEventListener('click',()=>begin(button.dataset.daily as ChallengeKind)));
    overlay.querySelectorAll('[data-career]').forEach(button=>button.addEventListener('click',()=>openSubpanel('career')));
    overlay.querySelector('[data-settings]')!.addEventListener('click',()=>openSubpanel('settings'));
    overlay.querySelector('[data-help]')!.addEventListener('click',()=>openSubpanel('help'));
  }
  function toggleRow(key: keyof Settings, label: TranslationKey): string {
    const checked = Boolean(save.settings[key]);
    return `<label class="toggle-row"><span>${tr(label)}</span><input type="checkbox" data-setting="${key}" ${checked ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label>`;
  }
  function settingsContent(): string {
    const s = save.settings;
    return `<div class="settings-language"><span class="micro-label">${tr('language')}</span>${localeControl()}</div><div class="settings-section"><h3>${tr('sound')}</h3><label class="volume-row" for="volume"><span>${tr('volume')}</span><output id="volume-value">${Math.round(s.volume * 100)}%</output><input id="volume" type="range" min="0" max="1" step="0.05" value="${s.volume}"></label>${toggleRow('music','music')}${toggleRow('sfx','sfx')}</div><div class="settings-section"><h3>${tr('display')}</h3>${selectField('camera','camera',[['broadcast',tr('broadcast')],['courtside',tr('courtside')],['overhead',tr('overhead')]],s.camera)}${selectField('quality','quality',[['high',tr('high')],['low',tr('low')]],s.quality)}${toggleRow('reducedMotion','reducedMotion')}${toggleRow('showControls','showControls')}</div>${actions.manageSave?`<div class="settings-save-section"><h3>${tr('saveData')}</h3><button type="button" class="secondary-button" data-manage-save>${tr('backupRestore')}${icons.arrow}</button><p>${tr('backupRestoreHint')}</p></div>`:''}`;
  }
  function bindSettings(scope: ParentNode): void {
    bindLocale(scope);
    scope.querySelector('[data-manage-save]')?.addEventListener('click',()=>actions.manageSave?.());
    scope.querySelector<HTMLInputElement>('#volume')?.addEventListener('input', event => {const volume = Number((event.target as HTMLInputElement).value); settingsChanged({volume}); const output = scope.querySelector('#volume-value'); if(output) output.textContent = `${Math.round(volume * 100)}%`;});
    scope.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(input => input.addEventListener('change', () => settingsChanged({[input.dataset.setting!]: input.checked})));
    scope.querySelector<HTMLSelectElement>('#camera')?.addEventListener('change', event => settingsChanged({camera:(event.target as HTMLSelectElement).value as Settings['camera']}));
    scope.querySelector<HTMLSelectElement>('#quality')?.addEventListener('change', event => settingsChanged({quality:(event.target as HTMLSelectElement).value as Settings['quality']}));
  }
  function controlRow(keys: string[], label: TranslationKey): string {return `<div class="control-row"><span class="key-group">${keys.map(key => `<kbd>${key}</kbd>`).join('')}</span><span>${tr(label)}</span></div>`;}
  function localHelpContent():string {
    if(!(latestState?.config.localMultiplayer??(mode==='exhibition'&&localMultiplayer)))return '';
    const pair=(key:string,first:TranslationKey,second:TranslationKey)=>`<div class="control-row"><kbd>${key}</kbd><span>${tr(first)} / ${tr(second)}</span></div>`;
    return `<section class="local-help"><h3>${tr('playerTwoControls')}</h3><p>${tr('localControlsHint')}</p><div>${controlRow(['↑','←','↓','→'],'move')}${pair('U','shoot','block')}${pair('I','pass','switch')}${pair('O','crossover','steal')}${controlRow(['R SHIFT'],'sprint')}${controlRow(['H'],'screen')}${controlRow(['Y'],'switch')}</div></section>`;
  }
  function controllerHelpContent():string {
    const pair=(key:string,first:TranslationKey,second:TranslationKey)=>`<div class="control-row"><kbd>${key}</kbd><span>${tr(first)} / ${tr(second)}</span></div>`;
    return `<section class="controller-help"><h3>${tr('gamepadControls')}</h3><p>${tr('controllerNote')}</p><div>${controlRow(['L STICK'],'move')}${pair('A','shoot','block')}${pair('X','pass','switch')}${pair('B','crossover','steal')}${controlRow(['Y'],'screen')}${controlRow(['RT'],'sprint')}${controlRow(['LB'],'switch')}${controlRow(['START'],'pause')}${controlRow(['R / VIEW'],'replayControl')}${controlRow(['F'],'fullscreen')}</div></section>`;
  }
  function helpContent(): string {
    return `<p class="help-subtitle">${tr('helpSubtitle')}</p><div class="help-columns"><section><h3>${tr('movementControls')}</h3>${controlRow(['W','A','S','D'],'move')}${controlRow(['↑','←','↓','→'],'move')}${controlRow(['SHIFT'],'sprint')}${controlRow(['ESC'],'pause')}<div class="control-row"><span class="key-group"><kbd>C</kbd></span><span>${tr('camera')}</span></div><div class="control-row"><span class="key-group"><kbd>M</kbd></span><span>${tr('sound')}</span></div></section><section><h3>${tr('offenseControls')}</h3>${controlRow(['SPACE'],'shoot')}${controlRow(['J'],'pass')}${controlRow(['K'],'crossover')}${controlRow(['L'],'screen')}<p>${tr('helpPassing')}</p></section><section><h3>${tr('defenseControls')}</h3>${controlRow(['J','TAB'],'switch')}${controlRow(['K'],'steal')}${controlRow(['SPACE'],'block')}<p>${tr('helpDefense')}</p></section></div>${localHelpContent()}${controllerHelpContent()}<div class="help-shot"><div class="help-meter"><span></span><i></i></div><p>${tr('helpOffense')}</p></div>`;
  }
  function rosterContent(): string {
    const team=rosterSide==='home'?home():away(),solo=mode==='practice'||mode==='challenge',count=solo?1:playersPerTeam;
    const editable=(rosterSide==='home'||(localMultiplayer&&mode==='exhibition'))&&count!==5;
    return `<div class="roster-heading"><div class="team-badge" style="--team-color:${esc(team.primary)};--team-accent:${esc(team.accent)}"><span>${esc(team.abbr)}</span><i></i></div><div><h3>${esc(teamName(team,locale))}</h3><p>${tr(solo?'rosterChooseSolo':count===5?'rosterFull':'rosterChoose')}</p></div><strong data-roster-count>${tr('rosterSelected',{n:rosterSelection.length,total:count})}</strong></div><div class="roster-list">${team.players.map((athlete,index)=>{const style=playerStyle(athlete),selected=rosterSelection.includes(index);return `<button type="button" class="roster-player ${selected?'is-selected':''}" data-roster-player="${index}" aria-pressed="${selected}" ${editable?'':'disabled'}><span class="roster-jersey" style="--team-color:${esc(team.primary)}">${athlete.number}</span><span class="roster-player-info"><strong>${esc(playerName(athlete,locale))}</strong><small>${athlete.role} · ${athlete.height.toFixed(2)} m · ${esc(style.name[locale])}</small><span class="roster-style">${esc(style.description[locale])}</span></span><span class="roster-ratings">${(['shooting','finishing','speed','defense'] as const).map(stat=>`<span><small>${tr(stat)}</small><strong>${athlete[stat]}</strong><i style="--rating:${athlete[stat]}%"></i></span>`).join('')}</span><span class="roster-pick">${selected?'✓':'+'}</span></button>`;}).join('')}</div><p class="roster-note">${editable&&count===3?tr('rosterChooseHint')+' ':''}${esc(ROSTER_NOTE[locale])}</p>${editable?`<button type="button" class="primary-button roster-save" data-save-roster ${rosterSelection.length===count?'':'disabled'}>${tr('rosterSave')}${icons.arrow}</button>`:''}`;
  }
  function openRoster(side:'home'|'away'):void {
    rosterSide=side;const team=side==='home'?home():away();const solo=mode==='practice'||mode==='challenge';
    rosterSelection=solo?[soloPlayers[team.id]??loadLineup(team)[0]]:playersPerTeam===5?team.players.map((_,index)=>index):[...(side==='home'||(localMultiplayer&&mode==='exhibition')?loadLineup(team):normalizeLineup(team))];
    openSubpanel('roster');
  }
  function bindRoster(scope:ParentNode):void {
    const solo=mode==='practice'||mode==='challenge',count=solo?1:playersPerTeam;
    scope.querySelectorAll<HTMLButtonElement>('[data-roster-player]').forEach(button=>button.addEventListener('click',()=>{
      const index=Number(button.dataset.rosterPlayer);
      if(solo)rosterSelection=[index];
      else if(rosterSelection.includes(index))rosterSelection=rosterSelection.filter(value=>value!==index);
      else if(rosterSelection.length<count)rosterSelection.push(index);
      renderSubpanel();
      overlay.querySelector<HTMLButtonElement>(`[data-roster-player="${index}"]`)?.focus();
    }));
    scope.querySelector('[data-save-roster]')?.addEventListener('click',()=>{
      if(rosterSelection.length!==count)return;
      if(solo){soloPlayers[homeId]=rosterSelection[0];saveLineup(homeId,[rosterSelection[0],...loadLineup(home()).filter(index=>index!==rosterSelection[0])]);}
      else saveLineup(rosterSide==='home'?homeId:awayId,rosterSelection);
      subpanel=null;render();
    });
  }
  function openSubpanel(panel: Exclude<typeof subpanel,null>): void {
    previousFocus = document.activeElement as HTMLElement;
    const attribute=['data-settings','data-help','data-career','data-bracket','data-roster'].find(key=>previousFocus?.hasAttribute(key));
    previousFocusSelector=attribute?`[${attribute}="${CSS.escape(previousFocus.getAttribute(attribute)??'')}"]`:'';
    previousFocusIndex=previousFocusSelector?Array.from(overlay.querySelectorAll(previousFocusSelector)).indexOf(previousFocus):0;
    subpanel = panel; renderSubpanel();
  }
  function closeSubpanel():void {
    subpanel=null;overlay.querySelector('.subpanel-backdrop')?.remove();
    overlay.querySelectorAll<HTMLElement>(':scope > main').forEach(element=>{element.inert=false;});
    if(previousFocus?.isConnected)previousFocus.focus();
    else if(previousFocusSelector)overlay.querySelectorAll<HTMLElement>(previousFocusSelector)[Math.max(0,previousFocusIndex)]?.focus();
  }
  function renderSubpanel(): void {
    overlay.querySelector('.subpanel-backdrop')?.remove();
    if (!subpanel) return;
    const title:TranslationKey=subpanel==='settings'?'settings':subpanel==='help'?'helpTitle':subpanel==='career'?'career':subpanel==='roster'?'rosterTitle':'bracket';
    const backdrop = document.createElement('div'); backdrop.className = `subpanel-backdrop ${subpanel}-backdrop`;
    const content=subpanel==='settings'?settingsContent():subpanel==='help'?helpContent():subpanel==='career'?careerContent():subpanel==='roster'?rosterContent():bracketContent();
    backdrop.innerHTML = `<section class="dialog-panel ${subpanel}-panel" role="dialog" aria-modal="true" aria-label="${tr(title)}"><header><div><span class="micro-label">NBA AFTER HOURS</span><h2>${tr(title)}</h2></div><div class="dialog-tools">${subpanel!=='settings'?localeControl():''}<button type="button" class="icon-button" data-close aria-label="${tr('close')}">${icons.close}</button></div></header>${content}<button type="button" class="secondary-button dialog-done" data-close>${tr('close')}</button></section>`;
    overlay.append(backdrop);
    overlay.querySelectorAll<HTMLElement>(':scope > main').forEach(element=>{element.inert=true;});
    backdrop.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', closeSubpanel));
    if (subpanel === 'settings') bindSettings(backdrop);
    else bindLocale(backdrop);
    if (subpanel === 'bracket') bindTournamentButtons(backdrop);
    if (subpanel === 'roster') bindRoster(backdrop);
    backdrop.querySelector<HTMLButtonElement>('[data-close]')?.focus();
  }
  function renderPause(): void {
    if (!latestState) return;
    const state = latestState;
    overlay.innerHTML = `<main class="pause-shell"><section class="pause-primary"><div class="eyebrow"><span class="status-dot"></span>${tr('timeout')}</div><h1>${tr('paused')}</h1><div class="pause-score"><span>${esc(state.config.home.abbr)}</span><strong>${state.score[0]}<i>:</i>${state.score[1]}</strong><span>${esc(state.config.away.abbr)}</span></div><p class="pause-period">${periodText(state)} <span>·</span> ${clockText(state.clock)}</p><div class="pause-actions"><button type="button" class="primary-button" data-resume>${tr('resume')}${icons.arrow}</button>${actions.review?`<button type="button" class="secondary-button" data-review>${tr('reviewGame')}${icons.target}</button>`:''}<button type="button" class="secondary-button" data-restart>${tr('restart')}</button><button type="button" class="text-button" data-help>${tr('controls')}</button><button type="button" class="text-button muted" data-quit>${tr('quit')}</button></div><small class="pause-esc"><kbd>ESC</kbd> ${tr('resume')}</small></section><section class="pause-settings"><h2>${tr('settings')}</h2>${settingsContent()}</section></main>`;
    bindSettings(overlay);
    overlay.querySelector('[data-resume]')!.addEventListener('click', () => {hideOverlay();actions.resume();});
    overlay.querySelector('[data-restart]')!.addEventListener('click', () => {hideOverlay();actions.restart();});
    overlay.querySelector('[data-quit]')!.addEventListener('click', () => actions.quit());
    overlay.querySelector('[data-help]')!.addEventListener('click', () => openSubpanel('help'));
    overlay.querySelector('[data-review]')?.addEventListener('click', () => actions.review?.());
  }
  function periodText(state: GameState): string {return state.quarter > state.config.quarters ? tr('overtime',{n:state.quarter-state.config.quarters}) : tr('quarter',{n:state.quarter});}
  function statsTable(players: PlayerState[], team: Team): string {
    return `<section class="boxscore-team"><h3><span style="background:${esc(team.accent)}"></span>${esc(teamName(team,locale))}</h3><div class="table-scroll"><table><thead><tr>${(['player','points','rebounds','assists','steals','blocks','fieldGoals','threePointers'] as TranslationKey[]).map(key=>`<th scope="col">${tr(key)}</th>`).join('')}</tr></thead><tbody>${players.map(player=>`<tr><th scope="row"><span class="player-number">${player.athlete.number}</span>${esc(playerName(player.athlete,locale))}</th><td class="pts-cell">${player.stats.points}</td><td>${player.stats.rebounds}</td><td>${player.stats.assists}</td><td>${player.stats.steals}</td><td>${player.stats.blocks}</td><td>${player.stats.fgm}/${player.stats.fga}</td><td>${player.stats.tpm}/${player.stats.tpa}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function dailyResultContent(state:GameState):string {
    const result=state.dailyResult;
    if(!result)return '';
    const definition=getChallengeById(result.id),medalKey=({none:'medalNone',bronze:'medalBronze',silver:'medalSilver',gold:'medalGold'} as const)[result.medal];
    return `<section class="daily-result-card ${result.medal}"><span class="medal-medallion" aria-hidden="true">${icons.trophy}</span><div class="daily-result-title"><span class="micro-label">${tr(result.improved?'personalBest':'dailyComplete')}</span><h2>${definition?esc(definition.name[locale]):tr('dailyChallenges')}</h2><p>${tr(medalKey)} · ${tr('dailyScoreHint')}</p></div><div class="daily-result-points"><strong>${result.score}</strong><span>${tr('challengeScore')}</span></div><div class="daily-result-best"><span>${tr('best')}</span><strong>${result.bestScore}</strong></div></section>`;
  }
  function renderResult(): void {
    if (!latestState) return;
    const state=latestState,won=state.winner===0,champion=championship?.champion;
    const solo=state.config.mode==='practice'||(state.config.mode==='challenge'&&state.config.challengeKind!=='allaround');
    const own=state.players.filter(player=>player.side===0),opponent=state.players.filter(player=>player.side===1);
    const leader=[...(state.config.localMultiplayer&&state.winner===1?opponent:own)].sort((a,b)=>(b.stats.points+b.stats.assists*1.5+b.stats.rebounds)-(a.stats.points+a.stats.assists*1.5+a.stats.rebounds))[0];
    const totals=(list:PlayerState[],field:'fgm'|'fga'|'tpm'|'tpa'|'assists'|'rebounds')=>list.reduce((sum,player)=>sum+player.stats[field],0);
    const resultTitle:TranslationKey=champion?'champion':state.config.mode==='practice'?'practiceComplete':state.config.mode==='challenge'?'challengeComplete':state.winner===null?'draw':won?'victory':'defeat';
    const summaryRows:Array<[TranslationKey,string,string]>=[['fieldGoalRate',percentage(totals(own,'fgm'),totals(own,'fga')),percentage(totals(opponent,'fgm'),totals(opponent,'fga'))],['threePointRate',percentage(totals(own,'tpm'),totals(own,'tpa')),percentage(totals(opponent,'tpm'),totals(opponent,'tpa'))],['assists',String(totals(own,'assists')),String(totals(opponent,'assists'))],['rebounds',String(totals(own,'rebounds')),String(totals(opponent,'rebounds'))]];
    const titleText=state.config.localMultiplayer&&state.winner!==null?tr('localWinner',{player:tr(state.winner===0?'playerOne':'playerTwo')}):tr(resultTitle);
    const best=save.challengeBests[`score-${state.config.difficulty}`]??state.score[0];
    const resultScore=solo
      ? `<div class="solo-final-score"><div><strong>${state.score[0]}</strong><span>${tr('pointsShort')}</span></div><div class="solo-final-team"><span class="final-team-badge" style="--team-color:${esc(state.config.home.primary)}">${esc(state.config.home.abbr)}</span><span>${esc(teamName(state.config.home,locale))}</span></div>${state.dailyResult?'':`<div class="solo-best"><span class="micro-label">${tr('best')}</span><strong>${best}</strong></div>`}</div>`
      : `<div class="final-score"><div><span class="final-team-badge" style="--team-color:${esc(state.config.home.primary)}">${esc(state.config.home.abbr)}</span><span>${esc(teamName(state.config.home,locale))}</span></div><strong>${state.score[0]}<i>:</i>${state.score[1]}</strong><div><span class="final-team-badge" style="--team-color:${esc(state.config.away.primary)}">${esc(state.config.away.abbr)}</span><span>${esc(teamName(state.config.away,locale))}</span></div></div>`;
    const summary=solo
      ? `<div class="solo-result-stats">${([['fieldGoalRate',percentage(totals(own,'fgm'),totals(own,'fga'))],['threePointRate',percentage(totals(own,'tpm'),totals(own,'tpa'))],['fieldGoals',`${totals(own,'fgm')} / ${totals(own,'fga')}`],['threePointers',`${totals(own,'tpm')} / ${totals(own,'tpa')}`]] as Array<[TranslationKey,string]>).map(([label,value])=>`<div><strong>${value}</strong><span>${tr(label)}</span></div>`).join('')}</div>`
      : `<div class="summary-stats"><div class="summary-labels"><span>${esc(state.config.home.abbr)}</span><span>${tr('teamStats')}</span><span>${esc(state.config.away.abbr)}</span></div>${summaryRows.map(([label,a,b])=>`<div class="summary-stat"><strong>${a}</strong><span>${tr(label)}</span><strong>${b}</strong></div>`).join('')}</div>`;
    overlay.innerHTML=`<main class="result-shell ${won||champion||solo||state.config.localMultiplayer?'is-victory':''}">
      <header class="result-header">${brand()}${localeControl()}</header>
      <section class="result-hero"><div><div class="eyebrow">${championship?tr('round',{n:championship.round,total:championship.total}):tr('final')}</div><h1>${champion?`<span class="result-trophy">${icons.trophy}</span>`:''}${titleText}</h1><p>${tr(state.config.localMultiplayer?'localResultDescription':champion?'championDescription':solo?'victoryDescription':won?'victoryDescription':'defeatDescription')}</p></div>${resultScore}</section>
      ${dailyResultContent(state)}
      <section class="result-overview">${leader?`<div class="leader-card"><span class="micro-label">${tr('gameLeader')}</span><div><span class="leader-jersey">${leader.athlete.number}</span><h2>${esc(playerName(leader.athlete,locale))}</h2></div><p><strong>${leader.stats.points}<small>${tr('pointsShort')}</small></strong><strong>${leader.stats.rebounds}<small>${tr('reboundsShort')}</small></strong><strong>${leader.stats.assists}<small>${tr('assistsShort')}</small></strong></p></div>`:''}${summary}</section>
      <section class="boxscore-section"><h2>${tr('boxscore')}</h2>${statsTable(own,state.config.home)}${solo?'':statsTable(opponent,state.config.away)}</section>
      <footer class="result-actions"><span class="micro-label">${tr('savedLocally')}</span>${championship?`<button type="button" class="text-button" data-bracket>${tr('bracket')}</button>`:''}${actions.review?`<button type="button" class="secondary-button" data-review>${tr('reviewGame')}</button>`:''}<button type="button" class="secondary-button" data-menu>${tr('returnMenu')}</button><button type="button" class="primary-button" data-next>${tr(championship&&won&&!champion?'nextRound':'rematch')}${icons.arrow}</button></footer>
    </main>`;
    bindLocale(overlay);bindTournamentButtons(overlay);
    overlay.querySelector('[data-menu]')!.addEventListener('click',()=>actions.quit());
    overlay.querySelector('[data-review]')?.addEventListener('click',()=>actions.review?.());
    overlay.querySelector('[data-next]')!.addEventListener('click',()=>{hideOverlay();if(championship&&won&&!champion)actions.nextRound();else actions.restart();});
  }
  function render(): void {
    root.dataset.locale = locale;
    root.classList.toggle('reduce-motion',save.settings.reducedMotion);
    overlay.dataset.screen = screen ?? '';
    overlay.hidden = screen === null;
    if (screen === 'menu') renderMenu();
    else if (screen === 'pause') renderPause();
    else if (screen === 'result') renderResult();
    else overlay.innerHTML = '';
    renderTools();
    if (subpanel) renderSubpanel();
  }
  function renderHud(state: GameState): void {
    hud.innerHTML = `<div class="scoreboard"><div class="score-team home-score" style="--team-color:${esc(state.config.home.primary)};--team-accent:${esc(state.config.home.accent)}"><span class="possession-dot"></span><span class="score-abbr">${esc(state.config.home.abbr)}</span><strong data-home-score>0</strong></div><div class="score-time"><span data-period></span><strong data-clock></strong></div><div class="score-team away-score" style="--team-color:${esc(state.config.away.primary)};--team-accent:${esc(state.config.away.accent)}"><strong data-away-score>0</strong><span class="score-abbr">${esc(state.config.away.abbr)}</span><span class="possession-dot"></span></div><div class="shot-clock"><span>${tr('shotClock')}</span><strong data-shot-clock></strong></div></div><div class="game-mode-label"><span class="live-dot"></span>${tr('live')}<i></i>${tr(state.config.mode)}</div><div class="phase-banner" hidden></div><div class="player-panel"><span class="controlled-number"></span><div class="controlled-info"><span class="micro-label">${tr('yourPlayer')}</span><strong data-player-name></strong><div class="stamina-track" role="meter" aria-label="${tr('stamina')}" aria-valuemin="0" aria-valuemax="100"><span></span></div></div><div class="player-live-stats"><strong data-player-points>0</strong><span>${tr('pointsShort')}</span></div></div><div class="shot-meter-panel" hidden><div class="shot-meter-title"><span>${tr('shotTiming')}</span><strong>${tr('release')}</strong></div><div class="shot-meter"><span class="shot-meter-fill"></span><span class="perfect-zone"></span><i class="shot-meter-needle"></i></div><div class="shot-meter-caption"><span>0</span><span>${tr('perfect')}</span><span>1</span></div></div><div class="shot-feedback" hidden><strong></strong><span></span></div><div class="hud-controls"><span><kbd>WASD</kbd>${tr('move')}</span><span><kbd>SPACE</kbd><span data-shoot-label>${tr('shoot')}</span></span><span><kbd>J</kbd><span data-pass-label>${tr('pass')}</span></span><span><kbd>K</kbd><span data-steal-label>${tr('crossover')}</span></span><span><kbd>SHIFT</kbd>${tr('sprint')}</span></div>`;
  }
  function update(state: GameState): void {
    latestState = state;
    if (screen === 'menu' || screen === 'result') {hud.hidden=true;return;}
    if(eventState!==state||eventSeed!==state.config.seed){eventState=state;eventSeed=state.config.seed;lastEventId=0;coachKey=null;coachChangedAt=0;previousFeedback=null;shotSide=0;toastStack.innerHTML='';}
    hud.hidden=false;
    const signature = `${locale}/${state.config.home.id}/${state.config.away.id}/${state.config.mode}/${state.config.challengeKind}/${state.config.dailyChallengeId}/${state.config.localMultiplayer}`;
    if (signature !== hudSignature) {
      hudSignature=signature;renderHud(state);
      hud.classList.toggle('is-solo',state.config.mode==='practice'||(state.config.mode==='challenge'&&state.config.challengeKind!=='allaround'));
      hud.classList.toggle('is-local',Boolean(state.config.localMultiplayer));
      hud.insertAdjacentHTML('beforeend',`<div class="coach-panel" hidden><span class="micro-label">${tr('coach')}</span><strong></strong></div>`);
      hud.querySelector('.player-panel')!.insertAdjacentHTML('beforeend',`<div class="heat-panel" title="${tr('heatHint')}"><span>${tr('heat')}</span><div class="heat-bars" role="meter" aria-label="${tr('heat')}" aria-valuemin="0" aria-valuemax="100">${Array.from({length:5},()=>'<i></i>').join('')}</div></div>`);
      const daily=state.config.dailyChallengeId?getChallengeById(state.config.dailyChallengeId):null;
      hud.classList.toggle('has-daily',Boolean(daily));toastStack.classList.toggle('has-daily',Boolean(daily));
      if(daily)hud.insertAdjacentHTML('beforeend',`<div class="daily-score-panel"><div><span>${esc(daily.name[locale])}</span><strong data-daily-score>0</strong><small data-daily-target></small></div><div class="daily-goal-track"><span></span></div></div>`);
      if(state.config.localMultiplayer){
        setText('.controlled-info>.micro-label',`P1 · ${tr('yourPlayer')}`);
        hud.querySelector('.game-mode-label')!.innerHTML=`<span class="live-dot"></span>${tr('live')}<i></i>${tr('localMatch')}`;
        hud.insertAdjacentHTML('beforeend',`<div class="player-panel away-player-panel"><span class="controlled-number" data-p2-number></span><div class="controlled-info"><span class="micro-label">P2 · ${tr('yourPlayer')}</span><strong data-p2-name></strong><div class="stamina-track" role="meter" aria-label="${tr('playerTwo')} ${tr('stamina')}" aria-valuemin="0" aria-valuemax="100"><span></span></div></div><div class="player-live-stats"><strong data-p2-points>0</strong><span>${tr('pointsShort')}</span></div></div><div class="hud-controls p2-controls"><b>P2</b><span><kbd>↑←↓→</kbd>${tr('move')}</span><span><kbd>U</kbd><span data-p2-shoot>${tr('shoot')}</span></span><span><kbd>I</kbd><span data-p2-pass>${tr('pass')}</span></span><span><kbd>O</kbd><span data-p2-steal>${tr('steal')}</span></span><span><kbd>R SHIFT</kbd>${tr('sprint')}</span></div>`);
        hud.querySelector('.hud-controls')!.insertAdjacentHTML('afterbegin','<b>P1</b>');
      }
    }
    setText('[data-home-score]',String(state.score[0]));setText('[data-away-score]',String(state.score[1]));
    setText('[data-period]',state.config.mode==='practice'?tr('practice'):state.config.mode==='challenge'?tr('challenge'):periodText(state));setText('[data-clock]',state.config.mode==='practice'?'∞':clockText(state.clock));setText('[data-shot-clock]',String(Math.max(0,Math.ceil(state.shotClock))));
    hud.querySelector('.home-score')?.classList.toggle('has-possession',state.possession===0);
    hud.querySelector('.away-score')?.classList.toggle('has-possession',state.possession===1);
    hud.querySelector('.shot-clock')?.classList.toggle('urgent',state.shotClock<=5);
    hud.querySelector('.score-time')?.classList.toggle('urgent',state.config.mode!=='practice'&&state.clock<=10);
    const player = state.players.find(item=>item.id===state.controlled);
    if (player) {
      setText('[data-player-name]',playerName(player.athlete,locale));setText('.controlled-number',String(player.athlete.number));setText('[data-player-points]',String(player.stats.points));
      const bar = hud.querySelector<HTMLElement>('.stamina-track > span')!;const stamina = Math.max(0,Math.min(1,player.stamina > 1 ? player.stamina/100 : player.stamina));bar.style.transform=`scaleX(${stamina})`;bar.parentElement!.setAttribute('aria-valuenow',String(Math.round(stamina*100)));bar.parentElement!.classList.toggle('low-stamina',stamina<.3);
    }
    const playerTwo=state.config.localMultiplayer?state.players.find(item=>item.id===state.controlledAway):undefined;
    if(playerTwo){
      setText('[data-p2-name]',playerName(playerTwo.athlete,locale));setText('[data-p2-number]',String(playerTwo.athlete.number));setText('[data-p2-points]',String(playerTwo.stats.points));
      const stamina=Math.max(0,Math.min(1,playerTwo.stamina>1?playerTwo.stamina/100:playerTwo.stamina));
      const track=hud.querySelector<HTMLElement>('.away-player-panel .stamina-track')!;track.setAttribute('aria-valuenow',String(Math.round(stamina*100)));track.classList.toggle('low-stamina',stamina<.3);track.querySelector<HTMLElement>('span')!.style.transform=`scaleX(${stamina})`;
      setText('[data-p2-shoot]',tr(state.possession===1?'shoot':'block'));setText('[data-p2-pass]',tr(state.possession===1?'pass':'switch'));setText('[data-p2-steal]',tr(state.possession===1?'crossover':'steal'));
      hud.querySelector<HTMLElement>('.p2-controls')!.hidden=!save.settings.showControls;
    }
    const phase = hud.querySelector<HTMLElement>('.phase-banner')!;const phaseKey = state.phase==='intro' ? 'intro' : state.phase==='halftime' ? 'halftime' : null;phase.hidden=!phaseKey;if(phaseKey)phase.textContent=tr(phaseKey);
    const meter = hud.querySelector<HTMLElement>('.shot-meter-panel')!;meter.hidden=!state.charging;
    if (state.charging) {const charge=Math.min(1,Math.max(0,state.charge));shotSide=state.players.find(item=>item.id===state.ball.owner)?.side??0;meter.querySelector<HTMLElement>('.shot-meter-fill')!.style.transform=`scaleX(${charge})`;meter.querySelector<HTMLElement>('.shot-meter-needle')!.style.left=`${charge*100}%`;meter.classList.toggle('in-zone',charge>=.625&&charge<=.775);meter.classList.toggle('is-p2',state.config.localMultiplayer&&shotSide===1);setText('.shot-meter-title>span',`${state.config.localMultiplayer?`P${shotSide+1} · `:''}${tr('shotTiming')}`);}
    const feedback = hud.querySelector<HTMLElement>('.shot-feedback')!;feedback.hidden=!state.shotFeedback||state.charging;
    if(state.shotFeedback&&!state.charging){const f=state.shotFeedback;if(f!==previousFeedback){shotSide=state.players.find(item=>item.id===state.ball.from)?.side??shotSide;previousFeedback=f;}const text=f.perfect?tr('perfect'):translateEvent(locale,f.text);feedback.querySelector('strong')!.textContent=`${state.config.localMultiplayer?`P${shotSide+1} · `:''}${text}`;const contest=f.contest<.12?'wideOpen':f.contest<.4?'open':f.contest<.7?'contested':'smothered';feedback.querySelector('span')!.textContent=`${tr(contest)} · ${tr('shotQuality')} ${Math.round(f.quality*100)}%`;feedback.classList.toggle('perfect-feedback',f.perfect);}
    const offense = state.possession===0;
    setText('[data-shoot-label]',tr(offense?'shoot':'block'));setText('[data-pass-label]',tr(offense?'pass':'switch'));setText('[data-steal-label]',tr(offense?'crossover':'steal'));
    hud.querySelector<HTMLElement>('.hud-controls')!.hidden=!save.settings.showControls;
    const coach=hud.querySelector<HTMLElement>('.coach-panel')!,cue=getCoachCue(state);
    coach.hidden=!save.settings.showControls||!cue||Boolean(state.config.localMultiplayer);
    if(cue&&(cue.priority>=90||coachKey===null||state.elapsed-coachChangedAt>.85)){
      if(coachKey!==cue.key){coachKey=cue.key;coachChangedAt=state.elapsed;}
      coach.querySelector('strong')!.textContent=tr(cue.key);
      coach.classList.toggle('coach-urgent',cue.priority>=90);
    }
    const heat=Math.max(0,Math.min(100,state.momentum[0]));
    hud.querySelector('.heat-bars')!.setAttribute('aria-valuenow',String(Math.round(heat)));
    hud.querySelectorAll('.heat-bars>i').forEach((bar,index)=>bar.classList.toggle('lit',heat>index*20));
    hud.querySelector('.heat-panel')!.classList.toggle('is-hot',heat>=70);
    const daily=state.config.dailyChallengeId?getChallengeById(state.config.dailyChallengeId):null;
    if(daily){
      const score=state.challengeScore??0,thresholds=daily.medalThresholds;
      const next=score<thresholds.bronze?'bronze':score<thresholds.silver?'silver':'gold';
      setText('[data-daily-score]',String(score));
      setText('[data-daily-target]',`${tr(next==='bronze'?'medalBronze':next==='silver'?'medalSilver':'medalGold')} ${thresholds[next]}`);
      hud.querySelector<HTMLElement>('.daily-goal-track>span')!.style.transform=`scaleX(${Math.min(1,score/thresholds.gold)})`;
      hud.querySelector('.daily-score-panel')!.classList.toggle('gold',score>=thresholds.gold);
    }
    for(const event of state.events){
      if(event.id<=lastEventId)continue;
      lastEventId=event.id;
      if(!['score','dunk','perfect','steal','block','whistle','quarter','tip'].includes(event.type))continue;
      const scorer=event.player===undefined?undefined:state.players.find(item=>item.id===event.player);
      const message=translateEvent(locale,event.text,event.type)+(scorer&&event.type!=='tip'?` · ${playerName(scorer.athlete,locale)}`:'');
      notify(message,event.type,true);
    }
  }
  function hideOverlay(): void {screen=null;subpanel=null;render();if(latestState)update(latestState);}
  function notify(text: string, type?: string, localized=false): void {
    if(screen==='menu')return;
    const toast=document.createElement('div');toast.className=`game-toast ${['score','dunk','perfect','steal','block','whistle','gameover','quarter'].includes(type??'')?`toast-${type}`:''}`;toast.textContent=localized?text:translateEvent(locale,text,type);toastStack.append(toast);
    while(toastStack.children.length>3)toastStack.firstElementChild?.remove();
    window.setTimeout(()=>{toast.classList.add('leaving');window.setTimeout(()=>toast.remove(),250);},type==='score'||type==='dunk'?2200:1600);
  }
  root.addEventListener('pointerdown', event=>{if((event.target as HTMLElement).closest('button,input,select,a'))event.stopPropagation();});
  window.addEventListener('keydown',event=>{
    if(!subpanel)return;
    if(event.code==='Escape'){
      event.preventDefault();event.stopImmediatePropagation();closeSubpanel();return;
    }
    if(event.code==='Tab'){
      const dialog=overlay.querySelector('.dialog-panel');
      const focusables=Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,[tabindex="0"]')??[]).filter(element=>element.getClientRects().length);
      if(!focusables.length)return;
      const first=focusables[0],last=focusables[focusables.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  },true);
  root.addEventListener('keydown', event=>{if(screen!==null&&(event.target as HTMLElement).matches('button,input,select')&&event.code!=='Escape')event.stopPropagation();if(event.code==='Escape'&&subpanel){event.stopImmediatePropagation();subpanel=null;overlay.querySelector('.subpanel-backdrop')?.remove();previousFocus?.focus();}});
  document.documentElement.lang=locale==='zh'?'zh-CN':'en';
  render();
  return {
    showMenu(){screen='menu';subpanel=null;championship=undefined;latestState=null;hud.hidden=true;toastStack.innerHTML='';render();},
    showPause(state){latestState=state;screen='pause';subpanel=null;render();},
    hideOverlay, update,
    showResult(state, championshipInfo){latestState=state;championship=championshipInfo;screen='result';subpanel=null;hud.hidden=true;toastStack.innerHTML='';render();},
    notify,
  };
}













