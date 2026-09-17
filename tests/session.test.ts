import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/simulation';
import {createMatchAnalytics} from '../src/analytics';
import {getTeam} from '../src/data';
import {createTournament,getTournamentMatch} from '../src/tournament';
import {storeSession,loadSession,clearSession,SESSION_KEY,sessionSummary,type SessionStorage} from '../src/session';
import {EMPTY_INPUT,type GameConfig} from '../src/types';

const config=(extra:Partial<GameConfig>={}):GameConfig=>({home:getTeam('gsw'),away:getTeam('bos'),mode:'exhibition',difficulty:'pro',quarterLength:60,quarters:4,playersPerTeam:3,seed:3187,...extra});
function memory(){const data=new Map<string,string>();return {data,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};}

test('competitive session round-trips exact live state and review data',()=>{
  const storage=memory(),sim=createSimulation(config()),analytics=createMatchAnalytics();
  for(let i=0;i<300;i++){sim.update(1/60,{...EMPTY_INPUT,moveX:1});analytics.record(sim.state,sim.drainEvents());}
  assert.equal(storeSession(sim,analytics.snapshot(),null,storage).ok,true);
  const restored=loadSession(null,storage);assert.ok(restored);
  assert.deepEqual(restored.simulation.state,sim.state);
  assert.deepEqual(restored.saved.analytics,JSON.parse(JSON.stringify(analytics.snapshot())));
  assert.deepEqual(sessionSummary(restored)?.score,sim.state.score);
  assert.equal(restored.options.home,'gsw');assert.equal(restored.options.playersPerTeam,3);
  for(let i=0;i<180;i++){sim.update(1/60,EMPTY_INPUT);restored.simulation.update(1/60,EMPTY_INPUT);}
  assert.deepEqual(restored.simulation.state,sim.state);
});

test('a championship checkpoint requires the same active bracket fixture',()=>{
  const storage=memory(),cup=createTournament('gsw','bos','pro',60,3,10),fixture=getTournamentMatch(cup)!;
  const sim=createSimulation(config({mode:'championship',away:getTeam(fixture.awayId)}));
  assert.equal(storeSession(sim,createMatchAnalytics().snapshot(),cup,storage).ok,true);
  assert.ok(loadSession(cup,storage));assert.equal(loadSession(null,storage),null);
  const changed=structuredClone(cup);changed.id+='-other';assert.equal(loadSession(changed,storage),null);
  changed.id=cup.id;changed.completed=true;assert.equal(loadSession(changed,storage),null);
});

test('training and unrelated completed matches preserve the saved competitive game',()=>{
  const storage=memory(),analytics=createMatchAnalytics().snapshot();
  assert.equal(storeSession(createSimulation(config()),analytics,null,storage).ok,true);
  const before=storage.getItem(SESSION_KEY);
  assert.equal(storeSession(createSimulation(config({mode:'practice'})),analytics,null,storage).ok,false);
  assert.equal(storeSession(createSimulation(config({mode:'challenge'})),analytics,null,storage).ok,false);
  clearSession(555,storage);assert.equal(storage.getItem(SESSION_KEY),before);
  clearSession(3187,storage);assert.equal(storage.getItem(SESSION_KEY),null);
});

test('corrupt, oversized, and inaccessible session storage does not break gameplay',()=>{
  const storage=memory();for(const raw of ['not json','{}','x'.repeat(1_048_577)]){storage.setItem(SESSION_KEY,raw);assert.equal(loadSession(null,storage),null);}
  const denied:SessionStorage={getItem(){throw Error('denied');},setItem(){throw Error('denied');},removeItem(){throw Error('denied');}};
  assert.equal(loadSession(null,denied),null);assert.equal(loadSession(null,null),null);
  assert.equal(storeSession(createSimulation(config()),createMatchAnalytics().snapshot(),null,denied).ok,false);
  assert.doesNotThrow(()=>clearSession(undefined,denied));
});
