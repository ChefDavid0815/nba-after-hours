import './save-manager.css';
import {exportProfile,inspectProfile,importProfile,MAX_PROFILE_BYTES,PROFILE_ERROR_MESSAGES,type ProfileInspection,type ProfileSummary} from './profile';
import type {Locale} from './types';

const labels={zh:{title:'把你的进度带走。',eyebrow:'备份与恢复',description:'设置、生涯战绩、成就、阵容、杯赛和每日纪录都保存在本机。导出一份备份，可以迁移到另一台设备或浏览器。',export:'导出备份',exportDescription:'下载一个 JSON 文件，妥善保存即可。',download:'下载进度备份',import:'恢复备份',importDescription:'选择本游戏导出的 JSON 文件，先核对其中的进度。',choose:'选择备份文件',restore:'导入并刷新游戏',replace:'导入会替换当前本机进度，并重新打开游戏。',done:'备份已生成，正在下载。',ready:'备份已验证，可以导入。',loading:'正在读取备份…',games:'比赛',wins:'胜利',achievements:'成就',daily:'每日纪录',lineups:'自选阵容',round:'杯赛轮次',none:'无进行中的杯赛',close:'关闭',file:'备份文件',error:'无法处理备份',limit:'JSON · 最大 1 MiB'},en:{title:'Take your progress with you.',eyebrow:'BACKUP & RESTORE',description:'Settings, career records, achievements, lineups, tournaments, and daily records stay on this device. Export a backup to move them to another device or browser.',export:'EXPORT PROGRESS',exportDescription:'Download a JSON backup and keep it somewhere safe.',download:'DOWNLOAD BACKUP',import:'RESTORE PROGRESS',importDescription:'Choose a JSON file exported by this game, then review its progress.',choose:'CHOOSE BACKUP FILE',restore:'IMPORT & RELOAD GAME',replace:'Import replaces local progress and reloads the game.',done:'Your backup is ready and downloading.',ready:'This backup has been validated and is ready to import.',loading:'Reading backup…',games:'GAMES',wins:'WINS',achievements:'ACHIEVEMENTS',daily:'DAILY RECORDS',lineups:'CUSTOM LINEUPS',round:'TOURNAMENT ROUND',none:'No active tournament',close:'Close',file:'Backup file',error:'Could not process backup',limit:'JSON · UP TO 1 MiB'}};
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

export function createSaveManager(onImported=()=>location.reload()){
  const backdrop=document.createElement('div');backdrop.className='save-backdrop';backdrop.hidden=true;document.body.append(backdrop);
  let opened=false,locale:Locale='zh',previousFocus:HTMLElement|null=null,fileText='',inspection:ProfileInspection|null=null,generation=0;
  const inertElements:HTMLElement[]=[];
  const close=()=>{opened=false;generation++;backdrop.hidden=true;fileText='';inspection=null;inertElements.splice(0).forEach(el=>el.inert=false);previousFocus?.focus({preventScroll:true});};
  const summary=(data:ProfileSummary)=>{const c=labels[locale];return `<div class="save-summary">${[[c.games,data.games],[c.wins,data.wins],[c.achievements,data.achievements],[c.daily,data.dailyRecords],[c.lineups,data.lineupTeams]].map(([name,value])=>`<div><span>${name}</span><b>${value}</b></div>`).join('')}</div><p class="save-tournament">${data.tournamentActive?`${c.round} ${data.tournamentRound} / 4`:c.none}</p>`;};
  const message=(text:string,error=false)=>{const status=backdrop.querySelector<HTMLElement>('[data-save-status]')!;status.textContent=text;status.classList.toggle('is-error',error);};
  const render=()=>{
    const c=labels[locale],exported=exportProfile();
    backdrop.innerHTML=`<section class="save-panel" role="dialog" aria-modal="true" aria-labelledby="save-title"><header><div><p>${c.eyebrow}</p><h2 id="save-title">${c.title}</h2></div><button type="button" data-save-close aria-label="${c.close}">×</button></header><p class="save-description">${c.description}</p><div class="save-sections"><section><h3>${c.export}</h3><p>${c.exportDescription}</p>${exported.ok?summary(exported.summary):`<p class="save-error">${PROFILE_ERROR_MESSAGES[exported.code][locale]}</p>`}<button type="button" data-export ${exported.ok?'':'disabled'}>${c.download}<span>↓</span></button></section><section><h3>${c.import}</h3><p>${c.importDescription}</p><input type="file" accept=".json,application/json" data-backup-file aria-label="${c.file}" hidden><button type="button" data-choose>${c.choose}<span>↑</span></button><small class="save-file-limit">${c.limit}</small><div data-import-preview></div><button type="button" data-import hidden>${c.restore}</button></section></div><p class="save-status" data-save-status role="status" aria-live="polite"></p></section>`;
    backdrop.querySelector('[data-save-close]')!.addEventListener('click',close);
    backdrop.querySelector('[data-export]')!.addEventListener('click',()=>{
      const result=exportProfile();if(!result.ok){message(PROFILE_ERROR_MESSAGES[result.code][locale],true);return;}
      const blob=new Blob([result.text],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=`nba-after-hours-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);message(c.done);
    });
    const input=backdrop.querySelector<HTMLInputElement>('[data-backup-file]')!,restore=backdrop.querySelector<HTMLButtonElement>('[data-import]')!;
    backdrop.querySelector('[data-choose]')!.addEventListener('click',()=>input.click());
    input.addEventListener('change',async()=>{
      const file=input.files?.[0];if(!file)return;const thisGeneration=++generation;inspection=null;fileText='';restore.hidden=true;
      backdrop.querySelector('[data-import-preview]')!.innerHTML='';
      if(file.size>MAX_PROFILE_BYTES){message(PROFILE_ERROR_MESSAGES.too_large[locale],true);return;}
      message(c.loading);
      try{
        const text=await file.text();if(!opened||thisGeneration!==generation)return;
        const checked=inspectProfile(text);if(!checked.ok){message(PROFILE_ERROR_MESSAGES[checked.code][locale],true);return;}
        fileText=text;inspection=checked;
        backdrop.querySelector('[data-import-preview]')!.innerHTML=`<p class="save-file-name">${escape(file.name)}</p>${summary(checked.summary)}<p class="save-replace">${c.replace}</p>`;
        restore.hidden=false;message(c.ready);
      }catch{if(opened&&thisGeneration===generation)message(PROFILE_ERROR_MESSAGES.invalid_json[locale],true);}
    });
    restore.addEventListener('click',()=>{
      if(!inspection?.ok||!fileText)return;const result=importProfile(fileText);
      if(!result.ok){message(PROFILE_ERROR_MESSAGES[result.code][locale],true);return;}
      close();onImported();
    });
  };
  window.addEventListener('keydown',event=>{
    if(!opened)return;
    if(event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
    if(event.code==='Tab'){
      const targets=Array.from(backdrop.querySelectorAll<HTMLElement>('button:not([disabled])')).filter(el=>el.getClientRects().length>0),first=targets[0],last=targets[targets.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  },true);
  backdrop.addEventListener('pointerdown',event=>{if(event.target===backdrop)close();});
  return {get isOpen(){return opened;},close,open(nextLocale:Locale){
    if(opened)close();locale=nextLocale;opened=true;previousFocus=document.activeElement as HTMLElement;
    for(const element of document.querySelectorAll<HTMLElement>('#ui,.tutorial-panel'))if(!element.inert){element.inert=true;inertElements.push(element);}
    backdrop.hidden=false;render();backdrop.querySelector<HTMLButtonElement>('[data-save-close]')?.focus();
  }};
}
