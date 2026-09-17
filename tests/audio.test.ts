import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../src/audio';
import { defaultSave } from '../src/persistence';

class Param {
  value = 0;
  setValueAtTime(value: number) { this.value = value; }
  setTargetAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
}
class Node {
  gain = new Param(); frequency = new Param(); pan = new Param(); Q = new Param();
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  type = ''; buffer: unknown; loop = false; onended: (() => void) | null = null;
  constructor(private context: FakeContext) {}
  connect() { return this; }
  disconnect() {}
  start() { this.context.started++; }
  stop() { this.onended?.(); }
}
class FakeContext {
  static instances: FakeContext[] = [];
  currentTime = 1; sampleRate = 8000; state = 'running'; started = 0;
  destination = new Node(this);
  constructor() { FakeContext.instances.push(this); }
  createGain() { return new Node(this); }
  createDynamicsCompressor() { return new Node(this); }
  createBiquadFilter() { return new Node(this); }
  createOscillator() { return new Node(this); }
  createBufferSource() { return new Node(this); }
  createStereoPanner() { return new Node(this); }
  createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
}

test('audio is safe with no browser audio API and never auto-starts', () => {
  const audio = new GameAudio();
  assert.doesNotThrow(() => { audio.update(1 / 60); audio.play({ id: 1, type: 'score', text: '' }); audio.setSettings(defaultSave().settings); audio.menu(false); audio.unlock(); audio.dispose(); audio.dispose(); });
});

test('gesture unlock, event de-duplication, live mute and disposal are reliable', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeContext });
  try {
    const initialInstances = FakeContext.instances.length;
    const audio = new GameAudio(); audio.update(1 / 60);
    assert.equal(FakeContext.instances.length, initialInstances);
    audio.unlock(); audio.unlock();
    assert.equal(FakeContext.instances.length, initialInstances + 1);
    const context = FakeContext.instances.at(-1)!;
    const initialStarts = context.started;
    audio.play({ id: 1, type: 'score', text: '', side: 0, value: 3 });
    assert.ok(context.started > initialStarts);
    const scoredStarts = context.started;
    audio.play({ id: 1, type: 'score', text: '', side: 0, value: 3 });
    assert.equal(context.started, scoredStarts);
    audio.menu(false); audio.menu(false);
    audio.play({ id: 1, type: 'score', text: '', side: 0, value: 3 });
    assert.ok(context.started > scoredStarts, 'new rounds restart event IDs');
    const nextRoundStarts = context.started;
    audio.setSettings({ ...defaultSave().settings, sfx: false, music: false });
    audio.play({ id: 2, type: 'dunk', text: '' }); audio.update(1 / 60);
    assert.equal(context.started, nextRoundStarts);
    audio.setSettings({ ...defaultSave().settings, volume: 0 });
    audio.play({ id: 3, type: 'whistle', text: '' }); audio.update(1 / 60);
    assert.equal(context.started, nextRoundStarts);
    audio.dispose(); assert.equal(context.state, 'closed');
    assert.doesNotThrow(() => { audio.dispose(); audio.unlock(); audio.update(1 / 60); audio.play({ id: 4, type: 'buzzer', text: '' }); });
    assert.equal(FakeContext.instances.length, initialInstances + 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'AudioContext', original);
    else delete (globalThis as { AudioContext?: unknown }).AudioContext;
  }
});
