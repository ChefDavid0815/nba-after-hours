import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
const browsers=join(homedir(),'.agent-browser','browsers');
const executablePath=process.env.NBA_CHROME||(existsSync(browsers)?readdirSync(browsers).filter(name=>name.startsWith('chrome-')).map(name=>join(browsers,name,'chrome.exe')).find(existsSync):undefined);
const browser=await chromium.launch({headless:true,executablePath});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const folder=`artifacts/playtest-${stamp}`;mkdirSync(folder,{recursive:true});
const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:folder,size:{width:1280,height:800}}});
const page=await context.newPage();
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const held=new Set();
async function keys(wanted){for(const key of held)if(!wanted.includes(key)){await page.keyboard.up(key);held.delete(key);}for(const key of wanted)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
try{
  await page.goto(process.env.NBA_URL||'http://127.0.0.1:28024');
  await page.locator('#team-home').selectOption(process.env.NBA_HOME||'gsw');
  await page.locator('#team-away').selectOption(process.env.NBA_AWAY||'bos');
  await page.locator('#difficulty').selectOption(process.env.NBA_DIFFICULTY||'pro');
  await page.locator('#format').selectOption(process.env.NBA_FORMAT||'3');
  await page.locator('#quarter-length').selectOption('60');
  await page.locator('[data-start]').click();
  const started=Date.now();let lastReport=0,lastAction=0,lastQuarter=0,shots=0,tick=0;const samples=[];
  while(Date.now()-started<480000){
    const state=await page.evaluate(()=>window.__NBA.state());
    if(!state){await page.waitForTimeout(100);continue;}
    if(state.phase==='finished'){
      await keys([]);await page.waitForTimeout(250);await page.screenshot({path:`${folder}/final.png`});
      const status=await page.evaluate(()=>window.__NBA.status());
      const result={score:state.score,winner:state.winner,elapsed:state.elapsed,wallSeconds:(Date.now()-started)/1000,shots,errors,status,samples,players:state.players.map(p=>({name:p.athlete.name,side:p.side,stats:p.stats}))};
      writeFileSync(`${folder}/report.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({done:true,folder,...result}));break;
    }
    const now=Date.now(),p=state.players[state.controlled],owner=state.ball.owner===null?null:state.players[state.ball.owner];
    let target={x:p.x,z:p.z},sprint=false,shoot=false;
    if(state.phase==='playing'){
      if(state.possession===0&&owner?.id===p.id){
        const defenders=state.players.filter(q=>q.side===1);const closest=Math.min(...defenders.map(q=>distance(p,q)));
        const d=distance(p,{x:12.15,z:0});
        const shouldShoot=d<2.2||(d<7.6&&closest>1.8)||state.shotClock<2;
        if(state.charging){shoot=state.charge<.69;}
        else if(shouldShoot){shoot=true;shots++;}
        else{
          const lane=p.z>=0?-3.2:3.2;
          target={x:10.8,z:d<4?0:lane};sprint=p.stamina>40;
          if(closest<1.1&&now-lastAction>1200){await page.keyboard.press('KeyJ');lastAction=now;}
          else if(closest<1.9&&now-lastAction>1400){await page.keyboard.press('KeyK');lastAction=now;}
        }
      }else if(state.possession===1&&owner){
        target={x:owner.x-1,z:owner.z};sprint=distance(p,target)>2;
        if(distance(p,owner)>5&&now-lastAction>1100){await page.keyboard.press('Tab');lastAction=now;}
        else if(distance(p,owner)<1.4&&now-lastAction>1100){await page.keyboard.press('KeyK');lastAction=now;}
      }else if(state.ball.state==='loose'){target={x:state.ball.x,z:state.ball.z};sprint=true;}
      else if(state.ball.state==='shot'){
        if(state.possession===1&&distance(p,state.ball)<2.4&&state.ball.progress<.35&&now-lastAction>1000){await page.keyboard.press('Space');lastAction=now;}
        target={x:state.possession===0?10.4:-10.4,z:0};sprint=true;
      }
    }
    const wanted=[];if(target.x-p.x>.3)wanted.push('KeyD');if(target.x-p.x<-.3)wanted.push('KeyA');if(target.z-p.z>.3)wanted.push('KeyS');if(target.z-p.z<-.3)wanted.push('KeyW');if(sprint)wanted.push('Shift');if(shoot)wanted.push('Space');await keys(wanted);
    if(state.quarter!==lastQuarter){lastQuarter=state.quarter;await page.screenshot({path:`${folder}/quarter-${lastQuarter}.png`});}
    if(now-lastReport>30000){lastReport=now;const status=await page.evaluate(()=>window.__NBA.status());const sample={seconds:Math.round((now-started)/1000),quarter:state.quarter,clock:Math.round(state.clock),score:state.score,fps:status.fps,render:status.render};samples.push(sample);console.log(JSON.stringify(sample));}
    await page.waitForTimeout(65);tick++;
  }
  if(errors.length)console.error(JSON.stringify({errors}));
}finally{await keys([]).catch(()=>{});await context.close();await browser.close();}
