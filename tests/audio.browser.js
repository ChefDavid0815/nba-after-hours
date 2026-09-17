// Run against Vite with: Get-Content tests/audio.browser.js -Raw | npx agent-browser --session audio-qa eval --stdin
(async () => {
  const { GameAudio } = await import('/src/audio.ts');
  const { defaultSave } = await import('/src/persistence.ts');
  const original = window.AudioContext;
  const sampleRate = 48000;
  const offline = new OfflineAudioContext(2, sampleRate * 18, sampleRate);
  let time = 0;
  let closed = false;
  const adapter = new Proxy(offline, {
    get(target, key) {
      if (key === 'currentTime') return time;
      if (key === 'state') return closed ? 'closed' : 'running';
      if (key === 'close') return async () => { closed = true; };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  window.AudioContext = function () { return adapter; };
  const audio = new GameAudio();
  try {
    audio.setSettings(defaultSave().settings);
    audio.unlock();
    const player = { id: 0, x: 4, vx: 5, vz: 1 };
    const state = { phase: 'playing', players: [player], ball: { owner: 0, state: 'held' }, charging: false };
    const events = ['pass', 'shot', 'score', 'dunk', 'miss', 'whistle', 'buzzer', 'perfect', 'block', 'gameover'];
    for (let frame = 0; frame < 18 * 60; frame++) {
      time = frame / 60;
      if (frame === 3 * 60) audio.menu(false);
      if (frame >= 4 * 60 && frame <= 13 * 60 && frame % 60 === 0) audio.play({ id: frame, type: events[frame / 60 - 4], text: '', side: 0, value: 3 });
      if (frame === 14 * 60) audio.setSettings({ ...defaultSave().settings, volume: 0, music: false, sfx: false });
      audio.update(1 / 60, frame >= 3 * 60 ? state : undefined);
    }
    const result = await offline.startRendering();
    const windows = {};
    for (const [name, from, to] of [['menu', 0.5, 2.5], ['gameplay', 3.5, 13.5], ['muted', 15.5, 17.5]]) {
      let energy = 0; let peak = 0; let count = 0;
      for (let channel = 0; channel < result.numberOfChannels; channel++) {
        const samples = result.getChannelData(channel);
        for (let index = Math.floor(from * sampleRate); index < Math.floor(to * sampleRate); index++) {
          const sample = samples[index];
          if (!Number.isFinite(sample)) throw new Error(`Nonfinite audio sample in ${name}`);
          peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; count++;
        }
      }
      windows[name] = { rms: Math.sqrt(energy / count), peak };
    }
    if (windows.menu.rms < 0.0001) throw new Error('Menu music is silent');
    if (windows.gameplay.rms < 0.0001) throw new Error('Game effects are silent');
    if (windows.gameplay.peak > 0.95 || windows.menu.peak > 0.95) throw new Error('Audio clips');
    if (windows.muted.rms > 0.000001) throw new Error('Master mute leaks audible signal');
    audio.dispose();
    if (!closed) throw new Error('Audio context did not close');
    return { passed: true, sampleRate, duration: result.duration, channels: result.numberOfChannels, windows, disposed: closed };
  } finally {
    audio.dispose(); window.AudioContext = original;
  }
})()
