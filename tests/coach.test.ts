import test from 'node:test';
import assert from 'node:assert/strict';
import { getCoachCue } from '../src/coach.ts';
import { createSimulation } from '../src/simulation.ts';
import { TEAMS } from '../src/data.ts';

function state() {
  const sim = createSimulation({ home: TEAMS[9], away: TEAMS[13], mode: 'exhibition', difficulty: 'pro', quarterLength: 60, quarters: 4, playersPerTeam: 3, seed: 92 });
  sim.state.phase = 'playing'; return sim.state;
}

test('coach remains silent in transitions and never changes simulation state', () => {
  const s = state(); s.phase = 'inbound';
  assert.equal(getCoachCue(s), null); s.phase = 'playing';
  const before = JSON.stringify(s); getCoachCue(s); assert.equal(JSON.stringify(s), before);
});

test('live release coaching outranks a low shot clock and follows the actual green window', () => {
  const s = state(); s.charging = true; s.charge = 0.5; s.shotClock = 1;
  assert.equal(getCoachCue(s)?.key, 'coachHoldRelease');
  s.charge = 0.65; assert.equal(getCoachCue(s)?.key, 'coachReleaseNow');
  s.charging = false; assert.equal(getCoachCue(s)?.key, 'coachBeatClock');
});

test('coach identifies an available pass only when a teammate has useful space', () => {
  const s = state(); const p = s.players[0]; p.x = 6; p.z = 0;
  s.players[3].x = 6.8; s.players[3].z = 0;
  s.players[1].x = 7; s.players[1].z = 5;
  for (const defender of s.players.slice(4)) { defender.x = -8; defender.z = -5; }
  assert.equal(getCoachCue(s)?.key, 'coachOpenTeammate');
  s.players[4].x = 7.1; s.players[4].z = 5;
  s.players[2].x = -8; assert.equal(getCoachCue(s)?.key, 'coachCreateSpace');
});

test('coach distinguishes loose-ball pursuit, a nearby block, and rebounding', () => {
  const s = state(); s.ball.owner = null; s.ball.state = 'loose';
  assert.equal(getCoachCue(s)?.key, 'coachChaseLoose');
  Object.assign(s.ball, { state: 'shot', from: 3, x: s.players[0].x + 1, z: s.players[0].z, progress: 0.1 });
  assert.equal(getCoachCue(s)?.key, 'coachBlockShot');
  s.ball.progress = 0.8; assert.equal(getCoachCue(s)?.key, 'coachBoxOut');
});

test('open practice shots are encouraged without a fictitious shot-clock warning', () => {
  const s = state(); s.config = { ...s.config, mode: 'practice' }; s.players = [s.players[0]];
  s.players[0].x = 5.8; s.shotClock = 0;
  assert.equal(getCoachCue(s)?.key, 'coachTakeOpenShot');
  s.players[0].x = -4; assert.equal(getCoachCue(s)?.key, 'coachDriveLane');
});
