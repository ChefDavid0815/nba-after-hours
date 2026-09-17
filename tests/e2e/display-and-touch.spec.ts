import {test,expect} from '@playwright/test';

test('high DPI and resize keep the entire canvas inside the viewport',async({browser})=>{
  const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:2});
  const page=await context.newPage();
  try{
    await page.goto('http://127.0.0.1:5173');
    for(const size of [{width:1280,height:800},{width:900,height:600},{width:390,height:844}]){
      await page.setViewportSize(size);
      await expect.poll(()=>page.locator('#court').boundingBox()).toMatchObject({x:0,y:0,width:size.width,height:size.height});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(size.width);
    }
  }finally{await context.close();}
});

test('touch joystick moves, release stops, and touch shooting reaches the simulation',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const page=await context.newPage();
  try{
    await page.goto('http://127.0.0.1:5173');
    await page.locator('button[data-mode="practice"]').click();await page.locator('[data-start]').click();
    await page.waitForFunction(()=>(window as any).__NBA.state()?.phase==='playing');
    await expect(page.locator('.touch-controls')).toBeVisible();
    const client=await context.newCDPSession(page);
    const stick=(await page.locator('.touch-stick').boundingBox())!;
    const before=await page.evaluate(()=>(window as any).__NBA.state().players[0].x);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:stick.x+stick.width*.82,y:stick.y+stick.height/2,id:1}]});
    await page.waitForTimeout(400);
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const after=await page.evaluate(()=>(window as any).__NBA.state().players[0].x);
    expect(after).toBeGreaterThan(before+.6);
    await page.waitForTimeout(250);
    expect(await page.evaluate(()=>(window as any).__NBA.state().players[0].x)).toBeCloseTo(after,1);
    const button=(await page.locator('.touch-shoot').boundingBox())!;
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:button.x+button.width/2,y:button.y+button.height/2,id:2}]});
    await page.waitForTimeout(700);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>(window as any).__NBA.state().players[0].stats.fga>0);
    await page.screenshot({path:'artifacts/touch-landscape.png'});
    await page.getByRole('button',{name:'EN',exact:true}).click();
    await expect(page.locator('.touch-shoot')).toHaveText('SHOOT');
  }finally{await context.close();}
});
