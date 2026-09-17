import {test,expect,type Page} from '@playwright/test';

const url=process.env.NBA_TEST_URL??'http://127.0.0.1:5173';
async function startTutorial(page:Page) {
  await page.goto(url);
  await page.locator('button[data-mode="practice"]').click();
  await page.locator('#team-home').selectOption('gsw');
  await page.locator('[data-tutorial]').click();
  await page.waitForFunction(()=>(window as any).__NBA.state()?.phase==='playing');
}
async function greenShot(page:Page) {
  await page.waitForFunction(()=>{const s=(window as any).__NBA.state();return s.phase==='playing'&&s.ball.state==='held';});
  await page.keyboard.down('Space');
  await page.waitForFunction(()=>(window as any).__NBA.state().charge>=.66,{},{polling:'raf'});
  await page.keyboard.up('Space');
}

test('five lessons complete with real keyboard input and persist the completed tutorial',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await startTutorial(page);
  await expect(page.locator('.tutorial-panel h2')).toHaveText('迈出第一步');
  await page.keyboard.down('KeyA');await expect(page.locator('.tutorial-counter')).toHaveText('第 2 / 5 课');await page.keyboard.up('KeyA');
  await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyD');
  await expect(page.locator('.tutorial-counter')).toHaveText('第 3 / 5 课');
  await page.keyboard.up('KeyD');await page.keyboard.up('ShiftLeft');
  await greenShot(page);await expect(page.locator('.tutorial-counter')).toHaveText('第 4 / 5 课');
  for(let attempt=0;attempt<6;attempt++) {
    await page.waitForTimeout(1400);
    if(await page.locator('.tutorial-counter').textContent()==='第 5 / 5 课')break;
    await greenShot(page);
  }
  await expect(page.locator('.tutorial-counter')).toHaveText('第 5 / 5 课');
  const x=await page.evaluate(()=>(window as any).__NBA.state().players[0].x);
  if(x>5.1){await page.keyboard.down('KeyA');await page.waitForFunction(()=>(window as any).__NBA.state().players[0].x<=5.1);await page.keyboard.up('KeyA');}
  for(let attempt=0;attempt<6;attempt++) {
    await greenShot(page);await page.waitForTimeout(1400);
    if(await page.locator('.tutorial-panel').evaluate(el=>el.classList.contains('is-complete')))break;
  }
  await expect(page.locator('.tutorial-panel')).toHaveClass(/is-complete/);
  await page.getByRole('button',{name:'EN',exact:true}).click();
  await expect(page.locator('.tutorial-panel h2')).toHaveText('Your game starts here.');
  await page.screenshot({path:'artifacts/tutorial-complete.png'});
  await page.locator('.tutorial-panel [data-exit]').click();await expect(page.locator('.tutorial-panel')).toBeHidden();
  expect(await page.evaluate(()=>(window as any).__NBA.state().config.mode)).toBe('practice');
  await page.reload();await page.locator('button[data-mode="practice"]').click();
  await expect(page.locator('[data-tutorial]')).toHaveText('REVISIT TRAINING CAMP');
  expect(errors).toEqual([]);
});

test('tutorial language, collapse, pause, resume, and exit retain an independent free-practice session',async({page})=>{
  await startTutorial(page);
  await page.getByRole('button',{name:'EN',exact:true}).click();
  await expect(page.locator('.tutorial-panel h2')).toHaveText('Take your first step.');
  await page.locator('.tutorial-panel [data-compact]').click();await expect(page.locator('.tutorial-detail')).toBeHidden();
  await page.locator('.tutorial-panel [data-compact]').click();await expect(page.locator('.tutorial-detail')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('.tutorial-panel')).toBeHidden();
  await page.keyboard.press('Escape');await expect(page.locator('.tutorial-panel')).toBeVisible();
  await page.locator('.tutorial-panel [data-exit]').click();await expect(page.locator('.tutorial-panel')).toBeHidden();
  const before=await page.evaluate(()=>(window as any).__NBA.state().players[0].x);
  await page.keyboard.down('KeyD');await page.waitForTimeout(400);await page.keyboard.up('KeyD');
  expect(await page.evaluate(()=>(window as any).__NBA.state().players[0].x)).toBeGreaterThan(before+.5);
});

test('touch tutorial stays inside a landscape screen and gives touch-specific controls',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  try{
    await startTutorial(page);
    await expect(page.locator('.tutorial-touch-hint')).toHaveText('触控：拖动左侧摇杆');
    await expect(page.locator('.tutorial-input kbd')).toBeHidden();
    const panel=(await page.locator('.tutorial-panel').boundingBox())!;
    const stick=(await page.locator('.touch-stick').boundingBox())!;
    const actions=(await page.locator('.touch-actions').boundingBox())!;
    expect(panel.x).toBeGreaterThan(stick.x+stick.width);
    expect(panel.x+panel.width).toBeLessThan(actions.x);
    expect(panel.y+panel.height).toBeLessThan(390);
    await page.screenshot({path:'artifacts/tutorial-touch.png'});
    await page.locator('.tutorial-panel [data-exit]').click();
    await expect(page.locator('.tutorial-panel')).toBeHidden();
    await expect(page.locator('.player-panel')).toBeVisible();
  }finally{await context.close();}
});
