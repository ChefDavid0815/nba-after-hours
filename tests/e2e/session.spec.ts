import {test,expect} from '@playwright/test';

test('refresh restores the exact paused game, shot review, and live keyboard control',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('[data-start]').click();
  await page.waitForFunction(()=>(window as any).__NBA.state()?.phase==='playing');
  await page.keyboard.down('KeyD');await page.waitForTimeout(600);await page.keyboard.up('KeyD');
  await page.keyboard.down('Space');await page.waitForTimeout(700);await page.keyboard.up('Space');
  await page.waitForFunction(()=>(window as any).__NBA.insights().shots.length>0);
  await page.keyboard.press('Escape');
  const before=await page.evaluate(()=>({state:(window as any).__NBA.state(),review:(window as any).__NBA.insights()}));
  await page.reload();await expect(page.locator('[data-resume-match]')).toBeVisible();
  await page.locator('[data-resume-match]').click();
  const restored=await page.evaluate(()=>({state:(window as any).__NBA.state(),review:(window as any).__NBA.insights(),paused:(window as any).__NBA.status().paused}));
  expect(restored.paused).toBe(true);expect(restored.state).toEqual(before.state);expect(restored.review).toEqual(before.review);
  await page.locator('[data-review]').click();await expect(page.locator('.review-panel')).toBeVisible();
  await page.keyboard.press('Escape');expect(await page.evaluate(()=>(window as any).__NBA.status().paused)).toBe(true);
  await page.keyboard.press('Escape');await page.keyboard.down('KeyD');await page.waitForTimeout(300);await page.keyboard.up('KeyD');
  expect(await page.evaluate(()=>(window as any).__NBA.state().elapsed)).toBeGreaterThan(before.state.elapsed);
  await page.screenshot({path:'artifacts/session-resumed.png'});expect(errors).toEqual([]);
});

test('saved championship resumes its current fixture and practice preserves the competitive save',async({page})=>{
  await page.goto('/');await page.locator('button[data-mode="championship"]').click();await page.locator('[data-start]').click();
  await page.waitForFunction(()=>(window as any).__NBA.state()?.phase==='playing');
  await page.keyboard.press('Escape');
  const saved=await page.evaluate(()=>({session:JSON.parse(localStorage.getItem('nba-after-hours.session.v1')!),cup:localStorage.getItem('nba-after-hours.tournament.v1')}));
  await page.locator('[data-quit]').click();
  await page.locator('button[data-mode="practice"]').click();await page.locator('[data-start]').click();
  await page.waitForFunction(()=>(window as any).__NBA.state()?.phase==='playing');await page.keyboard.press('Escape');await page.locator('[data-quit]').click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('nba-after-hours.session.v1')!).checkpoint)).toEqual(saved.session.checkpoint);
  await page.reload();await page.locator('[data-resume-match]').click();
  const restored=await page.evaluate(()=>(window as any).__NBA.state());
  expect(restored.config.mode).toBe('championship');expect(restored.config.away.id).toBe(saved.session.checkpoint.state.config.away.id);
  expect(await page.evaluate(()=>localStorage.getItem('nba-after-hours.tournament.v1'))).toEqual(saved.cup);
});
