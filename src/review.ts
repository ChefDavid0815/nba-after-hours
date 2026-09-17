import './review.css';
import type {MatchAnalytics,ShotRecord} from './analytics';
import {playerName} from './data';
import {COURT,type GameState,type Locale} from './types';

const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const copy={zh:{title:'每一次出手，都有答案。',eyebrow:'比赛复盘',close:'关闭复盘',all:'双方',player:'球员',allPlayers:'所有球员',made:'命中',missed:'未进',blocked:'被封盖',pending:'飞行中',fg:'投篮',three:'三分',green:'绿窗命中',lead:'最大领先',run:'最长得分高潮',quarters:'每节比分',chart:'投篮分布',noShots:'还没有出手。继续比赛后再回来查看。',shots:'最近出手',who:'球员',result:'结果',distance:'距离',timing:'出手时机',court:'双方真实出手位置。圆点表示命中，叉号表示未进，菱形表示被封盖。',back:'返回',period:'节',unknown:'—'},en:{title:'Every shot tells a story.',eyebrow:'MATCH REVIEW',close:'Close review',all:'Both teams',player:'Player',allPlayers:'All players',made:'Made',missed:'Missed',blocked:'Blocked',pending:'In flight',fg:'FIELD GOALS',three:'THREE-POINTERS',green:'PERFECT MAKES',lead:'BIGGEST LEAD',run:'BEST SCORING RUN',quarters:'POINTS BY QUARTER',chart:'SHOT CHART',noShots:'No attempts yet. Come back after taking a shot.',shots:'RECENT ATTEMPTS',who:'PLAYER',result:'RESULT',distance:'DISTANCE',timing:'RELEASE',court:'Actual shot locations. Circles are makes, crosses are misses, and diamonds are blocks.',back:'BACK',period:'Q',unknown:'—'}};

export function createMatchReview(){
  const backdrop=document.createElement('div');backdrop.className='review-backdrop';backdrop.hidden=true;document.body.append(backdrop);
  let current:{data:MatchAnalytics;state:GameState;locale:Locale}|null=null,team='all',player='all';
  let previousFocus:HTMLElement|null=null;const inertElements:HTMLElement[]=[];
  const close=()=>{if(!current)return;current=null;backdrop.hidden=true;inertElements.splice(0).forEach(el=>el.inert=false);previousFocus?.focus({preventScroll:true});};
  const render=()=>{
    if(!current)return;const {data,state,locale}=current,c=copy[locale];
    const name=(shot:ShotRecord)=>{const p=state.players.find(p=>p.id===shot.player);return p?playerName(p.athlete,locale):shot.playerName;};
    const selected=data.shots.filter(shot=>(team==='all'||shot.side===Number(team))&&(player==='all'||shot.player===Number(player)));
    const finished=selected.filter(shot=>shot.result!=='pending'),made=finished.filter(shot=>shot.result==='made'),threes=finished.filter(shot=>shot.points===3);
    const percentage=(makes:number,total:number)=>total?`${Math.round(makes/total*100)}%`:'—';
    const format=(makes:number,total:number)=>`${makes}<small> / ${total}</small><em>${percentage(makes,total)}</em>`;
    const color=(side:number)=>side===0?'#d4f979':'#ff9b6c';
    const shotLabel=(shot:ShotRecord)=>`${name(shot)} · ${c[shot.result]} · ${shot.points}${locale==='zh'?' 分':' PTS'}`;
    const dots=selected.filter(shot=>shot.x!==null&&shot.z!==null).map(shot=>{
      const x=(shot.x!+14)*20,y=(shot.z!+7.5)*20,title=escape(shotLabel(shot)),ink=color(shot.side);
      const marker=shot.result==='made'?`<circle r="5.2" fill="${ink}" stroke="#10222b" stroke-width="1.5"/>`:shot.result==='blocked'?`<path d="M0 -6 6 0 0 6 -6 0Z" fill="none" stroke="${ink}" stroke-width="2"/>`:shot.result==='pending'?`<circle r="5" fill="none" stroke="${ink}" stroke-dasharray="2 2"/>`:`<path d="M-4 -4 4 4 M4 -4 -4 4" stroke="${ink}" stroke-width="2"/>`;
      return `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)})" tabindex="0" role="img" aria-label="${title}"><title>${title}</title>${marker}</g>`;
    }).join('');
    const players=state.players.filter(p=>team==='all'||p.side===Number(team));
    if(player!=='all'&&!players.some(p=>String(p.id)===player))player='all';
    const rows=selected.slice(-12).reverse().map(shot=>{
      const distance=shot.x===null||shot.z===null?'—':`${Math.hypot((shot.side===0?COURT.hoopX:-COURT.hoopX)-shot.x,shot.z).toFixed(1)} m`;
      return `<tr><td><span class="review-team-dot" style="background:${color(shot.side)}"></span>${escape(name(shot))}</td><td class="result-${shot.result}">${c[shot.result]} <small>${shot.points}</small></td><td>${distance}</td><td>${shot.timing===null?'—':shot.perfect?(locale==='zh'?'完美':'PERFECT'):`${shot.timing.toFixed(2)} s`}</td></tr>`;
    }).join('');
    backdrop.innerHTML=`<section class="review-panel" role="dialog" aria-modal="true" aria-labelledby="review-heading"><header><div><p>${c.eyebrow}</p><h2 id="review-heading">${c.title}</h2></div><button type="button" data-close aria-label="${c.close}">×</button></header><div class="review-filter"><div class="review-team-filter">${[['all',c.all],['0',state.config.home.abbr],['1',state.config.away.abbr]].map(([value,label])=>`<button type="button" data-side="${value}" aria-pressed="${team===value}">${label}</button>`).join('')}</div><label>${c.player}<select data-player><option value="all">${c.allPlayers}</option>${players.map(p=>`<option value="${p.id}" ${player===String(p.id)?'selected':''}>${escape(playerName(p.athlete,locale))}</option>`).join('')}</select></label></div><div class="review-stats"><div><span>${c.fg}</span><strong>${format(made.length,finished.length)}</strong></div><div><span>${c.three}</span><strong>${format(threes.filter(s=>s.result==='made').length,threes.length)}</strong></div><div><span>${c.green}</span><strong>${made.filter(s=>s.perfect).length}<small> ${locale==='zh'?'球':'MAKES'}</small></strong></div></div><div class="review-chart-wrap"><h3>${c.chart}</h3><svg class="review-court" viewBox="-12 -12 584 324" role="img" aria-label="${c.court}"><defs><pattern id="court-planks" width="35" height="15" patternUnits="userSpaceOnUse"><path d="M0 0H35V15" fill="none" stroke="#fff" stroke-opacity=".025"/></pattern></defs><rect width="560" height="300" rx="2" fill="#102832"/><rect width="560" height="300" fill="url(#court-planks)"/><g fill="none" stroke="#91b6b9" stroke-opacity=".32" stroke-width="1.5"><rect x="0" y="0" width="560" height="300"/><path d="M280 0V300"/><circle cx="280" cy="150" r="36.6"/><path d="M0 101H116V199H0 M560 101H444V199H560"/><circle cx="116" cy="150" r="36.6"/><circle cx="444" cy="150" r="36.6"/><path d="M0 16H49 A135 135 0 0 1 49 284H0 M560 16H511 A135 135 0 0 0 511 284H560"/><circle cx="37" cy="150" r="5" stroke="#e29768"/><circle cx="523" cy="150" r="5" stroke="#e29768"/><path d="M23 130V170 M537 130V170"/></g>${dots}</svg><div class="review-legend"><span><i class="made"></i>${c.made}</span><span><i class="missed">×</i>${c.missed}</span><span><i class="blocked">◇</i>${c.blocked}</span></div>${selected.length?'':`<p class="review-empty">${c.noShots}</p>`}</div><div class="review-bottom"><section><h3>${c.quarters}</h3><div class="review-table-scroll"><table class="quarter-table"><thead><tr><th></th>${data.quarters.map(q=>`<th>${q.quarter<=4?'Q'+q.quarter:'OT'+(q.quarter-4)}</th>`).join('')}<th>Σ</th></tr></thead><tbody>${[state.config.home,state.config.away].map((t,i)=>`<tr><th>${t.abbr}</th>${data.quarters.map(q=>`<td>${q.score[i]}</td>`).join('')}<td><b>${state.score[i]}</b></td></tr>`).join('')}</tbody></table></div><div class="review-runs">${[state.config.home,state.config.away].map((t,i)=>`<div><b style="color:${color(i)}">${t.abbr}</b><span>${c.lead}<strong>+${data.maxLead[i]}</strong></span><span>${c.run}<strong>${data.maxRun[i]}–0</strong></span></div>`).join('')}</div></section><section><h3>${c.shots}</h3><div class="review-table-scroll"><table><thead><tr><th>${c.who}</th><th>${c.result}</th><th>${c.distance}</th><th>${c.timing}</th></tr></thead><tbody>${rows||`<tr><td colspan="4">${c.noShots}</td></tr>`}</tbody></table></div></section></div><footer><button type="button" data-close>${c.back} <kbd>ESC</kbd></button></footer></section>`;
    backdrop.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',close));
    backdrop.querySelectorAll<HTMLButtonElement>('[data-side]').forEach(button=>button.addEventListener('click',()=>{team=button.dataset.side!;player='all';render();backdrop.querySelector<HTMLButtonElement>(`[data-side="${team}"]`)?.focus();}));
    backdrop.querySelector<HTMLSelectElement>('[data-player]')!.addEventListener('change',event=>{player=(event.target as HTMLSelectElement).value;render();backdrop.querySelector<HTMLSelectElement>('[data-player]')?.focus();});
  };
  window.addEventListener('keydown',event=>{
    if(!current)return;
    if(event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
    if(event.code==='Tab'){
      const targets=Array.from(backdrop.querySelectorAll<HTMLElement>('button,select,[tabindex="0"]'));const first=targets[0],last=targets[targets.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  },true);
  backdrop.addEventListener('pointerdown',event=>{if(event.target===backdrop)close();});
  return {get isOpen(){return !!current;},close,open(data:MatchAnalytics,state:GameState,locale:Locale){
    if(current)close();previousFocus=document.activeElement as HTMLElement;current={data,state,locale};team='all';player='all';
    for(const element of document.querySelectorAll<HTMLElement>('#ui,.tutorial-panel'))if(!element.inert){element.inert=true;inertElements.push(element);}
    backdrop.hidden=false;render();backdrop.querySelector<HTMLButtonElement>('[data-close]')?.focus();
  }};
}
