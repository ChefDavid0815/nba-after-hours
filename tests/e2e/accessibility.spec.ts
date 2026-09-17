import {test,expect,type Page} from '@playwright/test';

const url=process.env.NBA_TEST_URL??'http://127.0.0.1:5173';
async function practice(page:Page){
  await page.goto(url);await page.locator('button[data-mode="practice"]').click();await page.locator('[data-start]').click();
  await page.waitForFunction(()=>(window as any).__NBA.state()?.phase==='playing');
}

test('the visible HUD pause button pauses, and its resume button restores play without input errors',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await practice(page);
  await page.locator('[data-pause]').click();await expect(page.locator('.pause-shell')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__NBA.status().paused)).toBe(true);
  const time=await page.evaluate(()=>(window as any).__NBA.state().elapsed);
  await page.waitForTimeout(200);expect(await page.evaluate(()=>(window as any).__NBA.state().elapsed)).toBe(time);
  await page.locator('[data-resume]').click();await expect(page.locator('.pause-shell')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>(window as any).__NBA.state().elapsed)).toBeGreaterThan(time);
  expect(errors).toEqual([]);
});

test('settings, help and roster trap Tab, restore their launch button, and survive a language change',async({page})=>{
  await page.goto(url);
  for(const trigger of ['[data-settings]','[data-help]','[data-roster="home"]']){
    await page.locator(trigger).first().click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
    const first=dialog.locator('button:not([disabled]),input,select').first();
    const last=dialog.locator('button:not([disabled]),input,select').last();
    await first.focus();await page.keyboard.press('Shift+Tab');await expect(last).toBeFocused();
    await page.keyboard.press('Tab');await expect(first).toBeFocused();
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.locator(trigger).first()).toBeFocused();
    await page.locator(trigger).first().click();await page.getByRole('dialog').getByRole('button',{name:'EN',exact:true}).click();
    await page.keyboard.press('Escape');await expect(page.locator(trigger).first()).toBeFocused();
    await page.getByRole('button',{name:'中文',exact:true}).click();
  }
});

test('controller B closes a pause help dialog before it resumes the match',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await practice(page);
  await page.locator('[data-pause]').click();await page.locator('[data-help]').click();
  await page.evaluate(()=>{
    const pad={connected:true,index:0,id:'Accessibility controller',mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
    (window as any).__a11yPad=pad;Object.defineProperty(navigator,'getGamepads',{value:()=>[pad],configurable:true});
  });
  await page.waitForTimeout(100);await page.evaluate(()=>{(window as any).__a11yPad.buttons[1].pressed=true;});
  await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__NBA.status().paused)).toBe(true);
  await expect(page.locator('[data-help]')).toBeFocused();
  await page.evaluate(()=>{(window as any).__a11yPad.buttons[1].pressed=false;});await page.waitForTimeout(100);
  await page.evaluate(()=>{(window as any).__a11yPad.buttons[1].pressed=true;});await expect(page.locator('.pause-shell')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).__NBA.status().paused)).toBe(false);expect(errors).toEqual([]);
});

test('Chinese and English menus and dialogs fit desktop, portrait, and landscape screens',async({page})=>{
  await page.goto(url);
  for(const size of [{width:390,height:844},{width:844,height:390},{width:1440,height:1000}]){
    await page.setViewportSize(size);
    for(const language of ['zh','en']){
      await page.locator(`button[data-locale="${language}"]`).click();
      for(const mode of ['exhibition','championship','practice','challenge']){
        await page.locator(`button[data-mode="${mode}"]`).click();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(size.width);
        for(const button of await page.locator('.mode-card,[data-start],[data-tutorial]').all()){
          const box=(await button.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width+1);
          const metrics=await button.evaluate(el=>({text:el.textContent,scroll:el.scrollWidth,width:el.clientWidth}));
          expect(metrics.scroll<=metrics.width+2,JSON.stringify(metrics)).toBe(true);
        }
      }
      await page.locator('button[data-mode="exhibition"]').click();
      await page.screenshot({path:`artifacts/a11y-menu-${size.width}-${language}.png`});
      for(const trigger of ['[data-settings]','[data-help]','[data-roster="home"]']){
        const viaPause=trigger==='[data-help]'&&!await page.locator(trigger).first().isVisible();
        if(viaPause){await page.locator('[data-start]').click();await page.locator('[data-pause]').click();}
        await page.locator(trigger).first().click();const dialog=page.getByRole('dialog');
        const box=(await dialog.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width+1);
        expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
        if(trigger==='[data-help]')await page.screenshot({path:`artifacts/a11y-help-${size.width}-${language}.png`});
        await page.keyboard.press('Escape');
        if(viaPause)await page.locator('[data-quit]').click();
      }
    }
  }
});
