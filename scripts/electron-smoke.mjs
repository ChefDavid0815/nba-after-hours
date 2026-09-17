import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const executablePath=process.env.NBA_NATIVE_EXE;
const folder=executablePath?'artifacts/native-packaged':'artifacts/native';
const app=await electron.launch({executablePath,args:executablePath?[]:['.'],env:{...process.env,NBA_HEADLESS_TEST:'1',NBA_VISIBLE_TEST:'1',...(executablePath?{PORTABLE_EXECUTABLE_DIR:fileURLToPath(new URL('../artifacts/native-packaged',import.meta.url))}:{} )}});
try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.waitForSelector('[data-start]');
  await page.waitForTimeout(300);
  mkdirSync(folder,{recursive:true});
  await page.screenshot({path:`${folder}/menu.png`});
  await page.locator('button[data-mode="practice"]').click();
  console.log(JSON.stringify({practiceSelected:await page.locator('button[data-mode="practice"]').getAttribute('aria-pressed')}));
  await page.locator('[data-start]').click();
  await page.waitForFunction(()=>window.__NBA?.state()?.phase==='playing',{timeout:15000});
  const before=await page.evaluate(()=>window.__NBA.state().players[0].x);
  await page.keyboard.down('KeyD');await page.waitForTimeout(450);await page.keyboard.up('KeyD');
  const after=await page.evaluate(()=>window.__NBA.state().players[0].x);console.log(JSON.stringify({before,after,status:await page.evaluate(()=>window.__NBA.status()),visibility:await page.evaluate(()=>document.visibilityState)}));assert(after>before+.6,'Native keyboard movement must reach the game');
  await page.keyboard.down('Space');await page.waitForTimeout(700);await page.keyboard.up('Space');
  await page.waitForFunction(()=>window.__NBA.state().players[0].stats.fga>0);
  await page.screenshot({path:`${folder}/court.png`});
  const stats=await page.evaluate(()=>window.__NBA.status());
  assert.deepEqual(errors,[]);
  const application=await app.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged,path:app.getAppPath()}));
  const result={passed:true,errors,stats,application};writeFileSync(`${folder}/report.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await app.close();}

