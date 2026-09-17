import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
const root=join(homedir(),'.agent-browser','browsers');
const executablePath=process.env.NBA_CHROME||readdirSync(root).filter(n=>n.startsWith('chrome-')).map(n=>join(root,n,'chrome.exe')).find(existsSync);
const browser=await chromium.launch({headless:true,executablePath});
const reports=[];mkdirSync('artifacts/performance',{recursive:true});
try{
  for(const count of [3,5])for(const quality of ['high','low']){
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1.5});
    await page.goto(process.env.NBA_URL||'http://127.0.0.1:28024');
    await page.locator('[data-settings]').click();await page.locator('#quality').selectOption(quality);await page.keyboard.press('Escape');
    await page.locator('#format').selectOption(String(count));await page.locator('[data-start]').click();
    await page.waitForTimeout(4000);
    const metrics=await page.evaluate(async()=>{
      const gl=document.querySelector('canvas').getContext('webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info');
      const gpu=info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):'unknown';
      const intervals=[];let prior=performance.now();const started=prior;
      await new Promise(resolve=>{const sample=(now)=>{intervals.push(now-prior);prior=now;if(now-started<7000)requestAnimationFrame(sample);else resolve();};requestAnimationFrame(sample);});
      intervals.sort((a,b)=>a-b);
      return {gpu,averageFPS:intervals.length/(prior-started)*1000,medianMs:intervals[Math.floor(intervals.length*.5)],p95Ms:intervals[Math.floor(intervals.length*.95)],status:window.__NBA.status()};
    });
    await page.screenshot({path:`artifacts/performance/${count}v${count}-${quality}.png`});
    const report={count,quality,...metrics};reports.push(report);console.log(JSON.stringify(report));await page.close();
  }
  writeFileSync('artifacts/performance/report.json',JSON.stringify(reports,null,2));
}finally{await browser.close();}

