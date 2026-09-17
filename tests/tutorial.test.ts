import test from 'node:test';
import assert from 'node:assert/strict';
import { createTutorialTracker, advanceTutorial, TUTORIAL_STEPS } from '../src/tutorial.ts';
import { createSimulation } from '../src/simulation.ts';
import { getTeam } from '../src/data.ts';
import { EMPTY_INPUT, type InputFrame, type GameState } from '../src/types.ts';

function session() {
  const sim = createSimulation({home: getTeam('gsw'), away: getTeam('lal'), mode:'practice', difficulty:'rookie', quarterLength:120, quarters:4, playersPerTeam:1, seed:42});
  let tracker = createTutorialTracker(sim.state);
  const tick = (input: Partial<InputFrame> = {}) => {
    sim.update(1/60, {...EMPTY_INPUT, ...input}); tracker = advanceTutorial(tracker, sim.state);
  };
  const run = (seconds: number, input: Partial<InputFrame> = {}) => {
    for(let time = 0; time < seconds - 1e-8; time += 1/60) tick(input);
  };
  const moveTo = (x: number, z = 0) => {
    for(let i=0;i<1000;i++) {
      const p=sim.state.players[0], dx=x-p.x, dz=z-p.z, d=Math.hypot(dx,dz);
      if(d<.09) { tick(); return; }
      tick({moveX:dx/d,moveZ:dz/d});
    }
    assert.fail('Could not reach tutorial position');
  };
  const shoot = (seconds=.7) => {
    tick({shootPressed:true,shootHeld:true}); run(seconds-1/60,{shootHeld:true}); tick({shootReleased:true});
  };
  run(1.5);
  return {sim,tick,run,moveTo,shoot,get tracker(){return tracker;}};
}

test('all five tutorial objectives complete through real movement, sprinting, and made shots', () => {
  const s=session();
  s.run(.85,{moveX:-1}); assert.equal(s.tracker.step,1);
  s.run(.6,{moveX:1,sprint:true}); assert.equal(s.tracker.step,2);
  s.moveTo(7); s.shoot(); assert.equal(s.tracker.step,3);
  assert.equal(s.sim.state.shotFeedback?.perfect,true);
  for(let attempt=0;attempt<5&&s.tracker.step===3;attempt++) {
    s.run(2); if(s.tracker.step===3) s.shoot();
  }
  assert.equal(s.tracker.step,4, 'a green release followed by an actual make finishes lesson four');
  s.run(2); s.moveTo(5);
  for(let attempt=0;attempt<5&&s.tracker.step===4;attempt++) {s.shoot();s.run(2);}
  assert.equal(s.tracker.step,TUTORIAL_STEPS.length);
  assert.ok(s.sim.state.players[0].stats.tpm>0);
});

test('waiting, teleporting, and inbound placement do not earn movement progress', () => {
  const s=session(); s.run(5); assert.equal(s.tracker.distance,0);
  s.sim.state.players[0].x=-10; s.tick(); assert.equal(s.tracker.distance,0);
  s.sim.state.phase='inbound'; s.sim.state.phaseTime=.01; s.tick(); assert.equal(s.tracker.distance,0);
});

test('a crossover and ordinary running do not satisfy the sprint lesson', () => {
  const s=session(); s.run(.85,{moveX:-1}); assert.equal(s.tracker.step,1);
  s.tick({moveX:1,crossoverPressed:true});s.run(.8,{moveX:1});
  assert.equal(s.tracker.distance,0); assert.equal(s.tracker.step,1);
  s.run(.7,{moveX:-1,sprint:true}); assert.equal(s.tracker.step,2);
});

test('earlier practice stats do not finish later tutorial lessons', () => {
  const s=session(); Object.assign(s.sim.state.players[0].stats,{fga:9,fgm:8,tpm:4});s.sim.state.score[0]=20;
  let tracker=createTutorialTracker(s.sim.state);
  tracker={...tracker,step:2};
  assert.equal(advanceTutorial(tracker,s.sim.state).step,2);
  tracker={...tracker,step:4};
  assert.equal(advanceTutorial(tracker,s.sim.state).step,4);
});

test('a perfect miss cannot be paired with a later nonperfect make', () => {
  const s=session();
  let tracker={...createTutorialTracker(s.sim.state),step:3};
  const state=structuredClone(s.sim.state), p=state.players[0];
  p.stats.fga++; state.ball.state='shot';state.ball.from=p.id;
  state.shotFeedback={text:'Perfect release',perfect:true,timing:.7,quality:.9,contest:0,ttl:2};
  tracker=advanceTutorial(tracker,state); assert.ok(tracker.pendingGreen);
  state.ball.state='loose';tracker=advanceTutorial(tracker,state);assert.equal(tracker.pendingGreen,null);
  p.stats.fga++;state.ball.state='shot';state.shotFeedback.perfect=false;tracker=advanceTutorial(tracker,state);
  p.stats.fgm++;state.score[0]+=2;state.ball.state='dead';tracker=advanceTutorial(tracker,state);
  assert.equal(tracker.step,3);
});

test('feedback alone never earns a green make, and the tracker is read-only', () => {
  const s=session(); const state=structuredClone(s.sim.state);
  state.shotFeedback={text:'Perfect release',perfect:true,timing:.7,quality:1,contest:0,ttl:2};
  const deepFreeze=(value:unknown):void=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(deepFreeze);}};
  deepFreeze(state);const before=JSON.stringify(state);
  const tracker={...createTutorialTracker(state),step:3};Object.freeze(tracker);
  assert.equal(advanceTutorial(tracker,state as GameState).step,3);
  assert.equal(JSON.stringify(state),before);
});
