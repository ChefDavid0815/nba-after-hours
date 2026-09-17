import { test, expect } from '@playwright/test';

test('Chinese/English switching, settings persistence, and menu navigation', async ({page}) => {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button',{name:'上场比赛',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'EN',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('[data-start]')).toContainText('TAKE THE COURT');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await page.locator('[data-settings]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#camera').selectOption('overhead');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button',{name:'中文',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
  expect(errors).toEqual([]);
});

test('real keyboard input moves, shoots with timing, pauses and resumes practice', async ({page}) => {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.locator('button[data-mode="practice"]').click();
  await page.locator('[data-start]').click();
  await page.waitForFunction(()=> (window as any).__NBA.state()?.phase==='playing');
  const startX=await page.evaluate(()=> (window as any).__NBA.state().players[0].x);
  await page.keyboard.down('KeyD');await page.waitForTimeout(600);await page.keyboard.up('KeyD');
  const afterX=await page.evaluate(()=> (window as any).__NBA.state().players[0].x);
  expect(afterX).toBeGreaterThan(startX+1);
  await page.keyboard.down('Space');await page.waitForTimeout(700);await page.keyboard.up('Space');
  await page.waitForFunction(()=> (window as any).__NBA.state().players[0].stats.fga===1);
  const shot=await page.evaluate(()=> (window as any).__NBA.state().shotFeedback);
  expect(shot.timing).toBeGreaterThan(.5);expect(shot.timing).toBeLessThan(.9);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=> (window as any).__NBA.status().paused)).toBe(true);
  const elapsed=await page.evaluate(()=> (window as any).__NBA.state().elapsed);
  await page.waitForTimeout(350);
  expect(await page.evaluate(()=> (window as any).__NBA.state().elapsed)).toBe(elapsed);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=> (window as any).__NBA.status().paused)).toBe(false);
  await page.screenshot({path:'artifacts/practice-playtest.png'});
  expect(errors).toEqual([]);
});

test('switching language during a match preserves keyboard control', async ({page}) => {
  await page.goto('/');await page.locator('[data-start]').click();
  await page.waitForFunction(()=> (window as any).__NBA.state()?.phase==='playing');
  await page.getByRole('button',{name:'EN',exact:true}).click();
  const before=await page.evaluate(()=>{const s=(window as any).__NBA.state();return s.players[s.controlled].x;});
  await page.keyboard.down('KeyD');await page.waitForTimeout(400);await page.keyboard.up('KeyD');
  const after=await page.evaluate(()=>{const s=(window as any).__NBA.state();return s.players[s.controlled].x;});
  expect(after).toBeGreaterThan(before+.8);
});

test('standard controller can move, shoot, pause and resume without keyboard assistance', async ({page}) => {
  await page.goto('/');
  await page.evaluate(()=>{
    const pad={connected:true,index:0,id:'Automated standard controller',mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0})),timestamp:0};
    (window as any).__pad=pad;
    Object.defineProperty(navigator,'getGamepads',{value:()=>[pad],configurable:true});
  });
  await page.locator('button[data-mode="practice"]').click();await page.locator('[data-start]').click();
  await page.waitForFunction(()=> (window as any).__NBA.state()?.phase==='playing');
  const button=async(index:number,down:boolean)=>page.evaluate(([i,d])=>{const pad=(window as any).__pad;pad.buttons[i as number]={pressed:d,touched:d,value:d?1:0};},[index,down]);
  const before=await page.evaluate(()=> (window as any).__NBA.state().players[0].x);
  await page.evaluate(()=>{(window as any).__pad.axes[0]=1;});await page.waitForTimeout(350);await page.evaluate(()=>{(window as any).__pad.axes[0]=0;});
  expect(await page.evaluate(()=> (window as any).__NBA.state().players[0].x)).toBeGreaterThan(before+.6);
  await button(9,true);await page.waitForTimeout(100);await button(9,false);await page.waitForTimeout(100);
  expect(await page.evaluate(()=> (window as any).__NBA.status().paused)).toBe(true);
  await button(9,true);await page.waitForTimeout(100);await button(9,false);await page.waitForTimeout(100);
  expect(await page.evaluate(()=> (window as any).__NBA.status().paused)).toBe(false);
  await button(0,true);await page.waitForTimeout(700);await button(0,false);
  await page.waitForFunction(()=> (window as any).__NBA.state().players[0].stats.fga>0);
});

