import test from 'node:test';
import assert from 'node:assert/strict';
import { getTeam } from '../src/data';
import { getLineup } from '../src/roster';
import { createSimulation } from '../src/simulation';
import { MAX_REPLAY_FRAMES, REPLAY_BUFFER_SECONDS, REPLAY_FPS, ReplayRecorder, sampleReplay } from '../src/replay';
import type { GameState } from '../src/types';

function game(seed = 1): GameState {
  const state = createSimulation({ home: getLineup(getTeam('lal')), away: getLineup(getTeam('bos')), mode: 'exhibition', difficulty: 'pro', quarterLength: 60, quarters: 4, playersPerTeam: 3, seed }).state;
  state.phase = 'playing'; state.events = [];
  return state;
}
function captureMotion(recorder: ReplayRecorder, state: GameState, seconds: number, fps = 60) {
  const start = state.elapsed;
  for (let frame = 1; frame <= seconds * fps; frame++) {
    state.elapsed = start + frame / fps;
    state.players[0].x = state.elapsed * 2; state.players[0].z = state.elapsed * -0.5;
    state.ball.x = state.elapsed * 3; state.ball.y = 1 + Math.sin(state.elapsed);
    state.clock = Math.max(0, 60 - state.elapsed); recorder.record(state, 1 / fps);
  }
}
const score = { id: 4, type: 'score' as const, text: '', side: 0 as const, player: 1, value: 2 };

test('no highlight exists before a basket or with an insufficient history', () => {
  const recorder = new ReplayRecorder(); const state = game();
  assert.equal(recorder.getHighlight(), null);
  recorder.markHighlight(score); assert.equal(recorder.getHighlight(), null);
  recorder.record(state, 1 / 60); recorder.markHighlight(score); assert.equal(recorder.getHighlight(), null);
  captureMotion(recorder, state, 1);
  recorder.markHighlight({ ...score, type: 'pass' }); assert.equal(recorder.getHighlight(), null);
  recorder.markHighlight(score); assert.ok(recorder.getHighlight());
});

test('position, ball, elevation, stamina and shortest facing angle interpolate accurately', () => {
  const recorder = new ReplayRecorder(); const state = game();
  Object.assign(state.players[0], { x: 0, z: 0, vx: 0, vz: 0, facing: 179 * Math.PI / 180, jump: 0, stamina: 100, action: 'run' });
  Object.assign(state.ball, { x: 0, y: 1, z: 0, state: 'shot', owner: null });
  state.elapsed = 0; state.clock = 50; recorder.record(state, 1 / REPLAY_FPS);
  Object.assign(state.players[0], { x: 10, z: 4, vx: 8, vz: 2, facing: -179 * Math.PI / 180, jump: 2, stamina: 80, action: 'dunk' });
  Object.assign(state.ball, { x: 10, y: 3, z: 4 });
  state.elapsed = 1 / REPLAY_FPS; state.clock = 40; state.score = [2, 0]; recorder.record(state, 1 / REPLAY_FPS); recorder.markHighlight(score);
  const clip = recorder.getHighlight()!; const halfway = sampleReplay(clip, clip.duration / 2);
  assert.equal(halfway.players[0].x, 5); assert.equal(halfway.players[0].z, 2);
  assert.equal(halfway.players[0].vx, 4); assert.equal(halfway.players[0].jump, 1); assert.equal(halfway.players[0].stamina, 90);
  assert.ok(Math.abs(Math.abs(halfway.players[0].facing) - Math.PI) < 1e-10);
  assert.equal(halfway.ball.x, 5); assert.equal(halfway.ball.y, 2); assert.equal(halfway.clock, 45);
  assert.equal(halfway.players[0].action, 'run'); assert.deepEqual(halfway.score, [0, 0]);
  assert.equal(sampleReplay(clip, clip.duration).players[0].action, 'dunk'); assert.deepEqual(sampleReplay(clip, clip.duration).score, [2, 0]);
});

test('long recordings stay within the ring capacity and highlights contain only the final 4.5 seconds', () => {
  const recorder = new ReplayRecorder(); const state = game(); captureMotion(recorder, state, 180, 60);
  assert.ok(recorder.frameCount <= MAX_REPLAY_FRAMES); assert.ok(recorder.frameCount >= 238);
  assert.ok(recorder.bufferedDuration <= REPLAY_BUFFER_SECONDS + 1 / REPLAY_FPS + 1e-7);
  recorder.markHighlight(score); const clip = recorder.getHighlight()!;
  assert.ok(clip.duration >= 4.5 && clip.duration <= 4.5 + 1 / REPLAY_FPS + 1e-7);
  assert.ok(clip.frames.length <= 138); assert.equal(clip.frames[0].time, 0);
  assert.equal(sampleReplay(clip, clip.duration).players[0].x, 360);
  for (const frame of clip.frames) {
    assert.equal('config' in frame, false);
    assert.equal('athlete' in frame.players[0], false);
    assert.equal('stats' in frame.players[0], false);
  }
});

test('high refresh rates still sample at thirty frames per second', () => {
  const recorder = new ReplayRecorder(); const state = game(); captureMotion(recorder, state, 4, 240);
  assert.ok(recorder.frameCount >= 119 && recorder.frameCount <= 122, `recorded ${recorder.frameCount} frames`);
});

test('clips own their snapshots and sampling never mutates or freezes the live game', () => {
  const recorder = new ReplayRecorder(); const state = game(); captureMotion(recorder, state, 5);
  state.events = [{ ...score }]; recorder.markHighlight(score);
  const clip = recorder.getHighlight()!; const originalName = state.players[0].athlete.name;
  const snapshot = JSON.stringify(clip);
  assert.ok(Object.isFrozen(clip) && Object.isFrozen(clip.baseState.config));
  assert.equal(Object.isFrozen(state), false); assert.equal(Object.isFrozen(state.config), false);
  assert.notEqual(clip.baseState.config, state.config); assert.notEqual(clip.baseState.players[0].athlete, state.players[0].athlete);
  state.players[0].athlete.name = 'Changed'; state.players[0].stats.points = 999; state.ball.x = -999;
  assert.equal(clip.baseState.players[0].athlete.name, originalName);
  const sampled = sampleReplay(clip, 1); sampled.players[0].x = -100; sampled.players[0].stats.points = -10; sampled.ball.x = -100; sampled.score[0] = 100;
  assert.equal(JSON.stringify(clip), snapshot); assert.equal(state.players[0].stats.points, 999);
  assert.deepEqual(sampled.events, []); assert.deepEqual(clip.baseState.events, []);
  captureMotion(recorder, state, 20); assert.equal(recorder.getHighlight(), clip); assert.equal(JSON.stringify(clip), snapshot);
});

test('out-of-range times clamp to clip endpoints and numeric edge cases remain finite', () => {
  const recorder = new ReplayRecorder(); const state = game(); captureMotion(recorder, state, 2); recorder.markHighlight(score);
  const clip = recorder.getHighlight()!; const first = sampleReplay(clip, 0); const last = sampleReplay(clip, clip.duration);
  for (const time of [-10, -Infinity, NaN]) assert.equal(sampleReplay(clip, time).players[0].x, first.players[0].x);
  for (const time of [Infinity, 1000]) assert.equal(sampleReplay(clip, time).players[0].x, last.players[0].x);
  assert.notEqual(first, sampleReplay(clip, 0)); assert.notEqual(first.players, sampleReplay(clip, 0).players);
});

test('invalid dt values are ignored and a huge capture gap cannot retain stale footage', () => {
  const recorder = new ReplayRecorder(); const state = game();
  for (const dt of [0, -1, NaN, Infinity, -Infinity]) recorder.record(state, dt);
  assert.equal(recorder.frameCount, 0); assert.equal(recorder.getHighlight(), null);
  captureMotion(recorder, state, 3); state.elapsed += 500; recorder.record(state, 500);
  assert.equal(recorder.frameCount, 1); assert.equal(recorder.bufferedDuration, 0);
});

test('reset, a new match and a rewound simulation clear all previous frames and highlights', () => {
  const recorder = new ReplayRecorder(); let state = game(); captureMotion(recorder, state, 2); recorder.markHighlight(score);
  recorder.reset(); assert.equal(recorder.frameCount, 0); assert.equal(recorder.getHighlight(), null);
  state = game(); captureMotion(recorder, state, 2); recorder.markHighlight(score);
  const next = game(999); recorder.record(next, 1 / 60);
  assert.equal(recorder.frameCount, 1); assert.equal(recorder.getHighlight(), null);
  captureMotion(recorder, next, 2); recorder.markHighlight(score); next.elapsed = 0; recorder.record(next, 1 / 60);
  assert.equal(recorder.frameCount, 1); assert.equal(recorder.getHighlight(), null);
});

test('possession and period changes step cleanly instead of inventing intermediate clocks', () => {
  const recorder = new ReplayRecorder(); const state = game();
  state.quarter = 1; state.clock = 0; state.shotClock = 0; state.possession = 0; recorder.record(state, 1 / 30);
  state.elapsed += 1 / 30; state.quarter = 2; state.clock = 60; state.shotClock = 24; state.possession = 1; recorder.record(state, 1 / 30); recorder.markHighlight(score);
  const clip = recorder.getHighlight()!; const midpoint = sampleReplay(clip, clip.duration / 2);
  assert.equal(midpoint.quarter, 1); assert.equal(midpoint.clock, 0); assert.equal(midpoint.shotClock, 0);
  assert.equal(sampleReplay(clip, clip.duration).quarter, 2); assert.equal(sampleReplay(clip, clip.duration).clock, 60);
});

test('both players control rings follow recorded selection changes at frame boundaries', () => {
  const recorder = new ReplayRecorder(); const state = game(); state.config.localMultiplayer = true;
  const home = state.players.filter(player => player.side === 0); const away = state.players.filter(player => player.side === 1);
  state.controlled = home[0].id; state.controlledAway = away[0].id; recorder.record(state, 1 / REPLAY_FPS);
  state.elapsed += 1 / REPLAY_FPS; state.controlled = home[1].id; state.controlledAway = away[1].id;
  recorder.record(state, 1 / REPLAY_FPS); recorder.markHighlight(score);
  const clip = recorder.getHighlight()!;
  state.controlled = home[2].id; state.controlledAway = away[2].id;
  const midpoint = sampleReplay(clip, clip.duration / 2); const endpoint = sampleReplay(clip, clip.duration);
  assert.equal(midpoint.controlled, home[0].id); assert.equal(midpoint.controlledAway, away[0].id);
  assert.equal(endpoint.controlled, home[1].id); assert.equal(endpoint.controlledAway, away[1].id);
  assert.equal(state.controlledAway, away[2].id);
});

test('single-player footage has no second-player selection even after multiplayer playback', () => {
  const recorder = new ReplayRecorder(); const multiplayer = game(); multiplayer.config.localMultiplayer = true;
  multiplayer.controlledAway = multiplayer.players.find(player => player.side === 1)!.id;
  captureMotion(recorder, multiplayer, 1); recorder.markHighlight(score);
  assert.equal(sampleReplay(recorder.getHighlight()!, 0).controlledAway, multiplayer.controlledAway);
  recorder.reset(); const singlePlayer = game(2); delete singlePlayer.controlledAway;
  captureMotion(recorder, singlePlayer, 1); recorder.markHighlight(score);
  assert.equal(sampleReplay(recorder.getHighlight()!, 0).controlledAway, undefined);
});
