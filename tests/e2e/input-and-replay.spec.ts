import {test,expect,type Page} from '@playwright/test';

async function startLocal(page:Page){
  await page.goto('/');
  await page.locator('#opponent-type').selectOption('local');
  await page.locator('[data-start]').click();
  await page.waitForFunction(()=>(window as any).__NBA.state()?.phase==='playing');
}
const positions=(page:Page)=>page.evaluate(()=>{const s=(window as any).__NBA.state();return [s.players.find((p:any)=>p.id===s.controlled).x,s.players.find((p:any)=>p.id===s.controlledAway).x];});

test('two keyboard players move independently and defensive input preserves the other shot',async({page})=>{
  await startLocal(page);
  const before=await positions(page);
  await page.keyboard.down('KeyD');await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');await page.keyboard.up('ArrowLeft');
  const after=await positions(page);
  expect(after[0]).toBeGreaterThan(before[0]+.7);
  expect(after[1]).toBeLessThan(before[1]-.7);
  await page.keyboard.down('Space');await page.waitForTimeout(250);
  await page.keyboard.press('KeyU');await page.waitForTimeout(200);
  const charged=await page.evaluate(()=>(window as any).__NBA.state());
  expect(charged.charging).toBe(true);expect(charged.charge).toBeGreaterThan(.3);
  await page.keyboard.up('Space');
  await page.waitForFunction(()=>(window as any).__NBA.state().players.some((p:any)=>p.side===0&&p.stats.fga>0));
});

test('one controller belongs to player two while player one keeps keyboard control',async({page})=>{
  await startLocal(page);
  await page.evaluate(()=>{
    const pad={connected:true,index:0,id:'Standard test controller',mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
    (window as any).__pad=pad;Object.defineProperty(navigator,'getGamepads',{value:()=>[pad],configurable:true});
  });
  await page.waitForTimeout(100);const before=await positions(page);
  await page.evaluate(()=>{(window as any).__pad.axes[0]=-1;});
  await page.keyboard.down('KeyD');await page.waitForTimeout(400);await page.keyboard.up('KeyD');
  await page.evaluate(()=>{(window as any).__pad.axes[0]=0;});
  const after=await positions(page);
  expect(after[0]).toBeGreaterThan(before[0]+.7);expect(after[1]).toBeLessThan(before[1]-.7);
});

test('instant replay freezes the live game and exits without duplicate points',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('button[data-mode="practice"]').click();await page.locator('[data-start]').click();
  await page.waitForFunction(()=>(window as any).__NBA.state()?.phase==='playing');
  for(let attempt=0;attempt<5;attempt++){
    await page.waitForFunction(()=>{const s=(window as any).__NBA.state();return s.phase==='playing'&&s.ball.state==='held';});
    await page.keyboard.down('Space');await page.waitForTimeout(700);await page.keyboard.up('Space');
    await page.waitForTimeout(1800);
    if(await page.evaluate(()=>(window as any).__NBA.status().replayAvailable))break;
  }
  expect(await page.evaluate(()=>(window as any).__NBA.status().replayAvailable)).toBe(true);
  await page.keyboard.press('KeyR');
  await expect(page.locator('.replay-banner')).toBeVisible();
  const start=await page.evaluate(()=>(window as any).__NBA.state());
  await page.waitForTimeout(650);
  const during=await page.evaluate(()=>(window as any).__NBA.state());
  expect(during.elapsed).toBe(start.elapsed);expect(during.score).toEqual(start.score);
  await page.screenshot({path:'artifacts/replay-playtest.png'});
  await page.locator('.replay-banner button').click();
  await expect(page.locator('.replay-banner')).toBeHidden();
  await page.waitForTimeout(200);
  const after=await page.evaluate(()=>(window as any).__NBA.state());
  expect(after.elapsed).toBeGreaterThan(start.elapsed);expect(after.score).toEqual(start.score);
  expect(errors).toEqual([]);
});
