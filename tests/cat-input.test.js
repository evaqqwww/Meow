import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
let fixtureNumber = 0;
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function fixture(t, { reducedMotion = false, audio = false, music = false } = {}) {
  const animations = [];
  const effects = [];
  const sounds = [];
  const musicEvents = [];
  const callbacks = new Map();
  let time = 0;
  let nextFrame = 0;
  const document = new EventTarget();
  document.hidden = false;
  document.activeElement = null;
  const window = new EventTarget();
  window.matchMedia = () => ({ matches: reducedMotion });
  if (audio) window.AudioContext = class {
    state = 'suspended';
    destination = {};
    resume() { this.state = 'running'; return Promise.resolve(); }
    decodeAudioData() { return Promise.resolve({}); }
    createBufferSource() {
      return { connect() {}, disconnect() {}, start() { sounds.push(this); }, stop() {} };
    }
  };

  class Element extends EventTarget {
    constructor(id) {
      super();
      this.id = id;
      this.style = {};
      this.dataset = {};
      this.value = '';
      this.open = false;
      this.attributes = new Map();
      if (music && id === 'background-music') {
        this.paused = true;
        this.currentTime = 0;
        this.play = () => { musicEvents.push('play'); this.paused = false; return Promise.resolve(); };
        this.pause = () => { musicEvents.push('pause'); this.paused = true; };
      }
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    focus() { document.activeElement = this; effects.push(`${this.id}:focus`); }
    blur() { if (document.activeElement === this) document.activeElement = null; }
    showModal() { this.open = true; effects.push(`${this.id}:showModal`); }
    close() { this.open = false; }
    setPointerCapture() {}
    animate(_keyframes, options) {
      let resolve;
      let reject;
      const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
      // Cleanup can cancel a fixture even when an assertion fails before the app awaits it.
      finished.catch(() => {});
      const animation = {
        options,
        finished,
        playState: 'running',
        finish() { if (this.playState === 'running') { this.playState = 'finished'; resolve(); } },
        cancel() { if (this.playState === 'running') { this.playState = 'idle'; reject(new Error('Animation cancelled')); } },
      };
      animations.push(animation);
      return animation;
    }
  }

  const elements = new Map(ids.map((id) => [id, new Element(id)]));
  document.getElementById = (id) => elements.get(id) ?? null;
  const globals = {
    document, window,
    requestAnimationFrame(callback) { callbacks.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    ...(audio ? {
      performance: { now: () => time },
      fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
    } : {}),
  };
  const originals = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(async () => {
    for (const animation of animations) animation.cancel();
    await settle();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const url = new URL('../site/app.js', import.meta.url);
  url.searchParams.set('case', String(++fixtureNumber));
  await import(url.href);

  return {
    animations, effects, sounds, musicEvents, document, window,
    element: (id) => elements.get(id),
    phase: () => elements.get('scene').dataset.phase,
    clickCat: () => elements.get('cat-button').dispatchEvent(new Event('click')),
    pawPointer(type) {
      const event = new Event(type, { cancelable: true });
      Object.assign(event, { isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1 });
      elements.get('paw-button').dispatchEvent(event);
    },
    advance(milliseconds, { tick = true } = {}) {
      time = milliseconds;
      if (!tick) return;
      const scheduled = [...callbacks.values()];
      callbacks.clear();
      for (const callback of scheduled) callback();
    },
    submit(text) {
      elements.get('message-input').value = text;
      elements.get('message-form').dispatchEvent(new Event('submit', { cancelable: true }));
    },
  };
}

test('waits for the cat rebound before opening input and ignores repeated clicks', { concurrency: false }, async (t) => {
  const f = await fixture(t);
  f.clickCat();
  assert.equal(f.phase(), 'editing');
  assert.equal(f.element('message-dialog').open, false, 'the dialog must wait for the rebound');
  assert.equal(f.document.activeElement, null, 'input focus must also wait');
  assert.equal(f.animations.length, 1);
  assert.equal(f.animations[0].options.duration, 250);
  f.clickCat();
  await settle();
  assert.equal(f.animations.length, 1);
  assert.equal(f.element('message-dialog').open, false);
  f.animations[0].finish();
  await settle();
  assert.equal(f.element('message-dialog').open, true);
  assert.equal(f.document.activeElement, f.element('message-input'));
  assert.deepEqual(f.effects, ['message-dialog:showModal', 'message-input:focus']);
});

test('cancelling the rebound, blurring, or hiding restores idle without a late dialog', { concurrency: false }, async (t) => {
  for (const interruption of ['animation cancellation', 'window blur', 'page hidden']) {
    await t.test(interruption, { concurrency: false }, async (t) => {
      const f = await fixture(t);
      f.clickCat();
      assert.equal(f.animations.length, 1, 'a cancellable rebound must be running');
      if (interruption === 'animation cancellation') f.animations[0].cancel();
      else if (interruption === 'window blur') f.window.dispatchEvent(new Event('blur'));
      else { f.document.hidden = true; f.document.dispatchEvent(new Event('visibilitychange')); }
      await settle();
      assert.equal(f.phase(), 'idle');
      f.animations[0].finish();
      await settle();
      assert.equal(f.element('message-dialog').open, false);
      assert.deepEqual(f.effects, []);
      f.document.hidden = false;
      f.clickCat();
      assert.equal(f.phase(), 'editing', 'cancellation must release the pending-open lock');
      assert.equal(f.animations.length, 2);
      f.animations[1].finish();
      await settle();
      assert.equal(f.element('message-dialog').open, true);
    });
  }
});

test('cancelling an edit rebound restores ready and retains the prepared message', { concurrency: false }, async (t) => {
  const f = await fixture(t);
  f.clickCat();
  assert.equal(f.animations.length, 1);
  f.animations[0].finish();
  await settle();
  f.submit('保留这句心事');
  assert.equal(f.phase(), 'ready');
  f.clickCat();
  assert.equal(f.phase(), 'editing');
  assert.equal(f.animations.length, 2);
  f.window.dispatchEvent(new Event('blur'));
  await settle();
  assert.equal(f.phase(), 'ready');
  assert.equal(f.element('message-dialog').open, false);
  f.clickCat();
  f.animations[2].finish();
  await settle();
  assert.equal(f.element('message-dialog').open, true);
  assert.equal(f.element('message-input').value, '保留这句心事');
});

test('reduced motion opens and focuses input synchronously without animating', { concurrency: false }, async (t) => {
  const f = await fixture(t, { reducedMotion: true });
  f.clickCat();
  assert.equal(f.element('message-dialog').open, true);
  assert.equal(f.document.activeElement, f.element('message-input'));
  assert.equal(f.animations.length, 0);
});

test('meows once on an accepted cat click and once on a completed high five', { concurrency: false }, async (t) => {
  const f = await fixture(t, { audio: true });
  await settle();
  assert.equal(f.sounds.length, 0, 'loading the page must stay silent');
  f.clickCat();
  await settle();
  assert.equal(f.sounds.length, 1, 'the accepted click should meow before opening input');
  f.clickCat();
  await settle();
  assert.equal(f.sounds.length, 1, 'a repeated click during the rebound is ignored');
  f.animations[0].finish();
  await settle();
  f.submit('愿你平安喜乐');

  f.pawPointer('pointerdown');
  f.advance(500);
  f.pawPointer('pointerup');
  await settle();
  assert.equal(f.phase(), 'ready');
  assert.equal(f.sounds.length, 1, 'an interrupted hold must not play the completion meow');

  f.pawPointer('pointerdown');
  f.advance(2299);
  await settle();
  assert.equal(f.sounds.length, 1, 'the meow must wait for all 1800 ms');
  f.advance(2300);
  await settle();
  assert.equal(f.phase(), 'reply');
  assert.equal(f.sounds.length, 2);
  assert.equal(f.element('speech').hidden, true, 'the blessing bubble is temporarily hidden');
  assert.ok(f.element('speech-text').textContent, 'the reply timing and sound still use the generated blessing');
  f.advance(2400);
  f.pawPointer('pointerup');
  f.advance(3400);
  await settle();
  assert.equal(f.phase(), 'idle');
  assert.equal(f.sounds.length, 2, 'holding, releasing, and reversing must not replay it');
});

test('plays the completion meow when release crosses the deadline between render frames', { concurrency: false }, async (t) => {
  const f = await fixture(t, { audio: true });
  f.clickCat();
  f.animations[0].finish();
  await settle();
  f.submit('慢慢来，喵');
  f.pawPointer('pointerdown');
  f.advance(1800, { tick: false });
  f.pawPointer('pointerup');
  await settle();
  assert.equal(f.phase(), 'returning');
  assert.equal(f.sounds.length, 2, 'completion is audible even if the reply phase was skipped by release');
});

test('background music starts on page interaction, coexists with meows, and resumes after hiding', { concurrency: false }, async (t) => {
  const f = await fixture(t, { audio: true, music: true });
  const music = f.element('background-music');
  assert.ok(music, 'the page needs its looping background audio element');
  f.document.dispatchEvent(new Event('visibilitychange'));
  await settle();
  assert.deepEqual(f.musicEvents, [], 'opening or returning to an untouched page must stay silent');
  f.document.dispatchEvent(new Event('click'));
  await settle();
  assert.equal(music.loop, true);
  assert.equal(music.paused, false);
  assert.deepEqual(f.musicEvents, ['play']);
  music.currentTime = 12;
  f.document.dispatchEvent(new Event('click'));
  f.clickCat();
  f.animations[0].finish();
  await settle();
  f.submit('愿你平安喜乐');
  f.pawPointer('pointerdown');
  f.advance(1800);
  await settle();
  assert.equal(f.sounds.length, 2, 'the click and high-five meows must still play');
  assert.deepEqual(f.musicEvents, ['play'], 'cat sounds must not restart or replace the music');
  assert.equal(music.currentTime, 12);
  f.document.hidden = true;
  f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(music.paused, true);
  assert.equal(music.currentTime, 12);
  f.document.hidden = false;
  f.document.dispatchEvent(new Event('visibilitychange'));
  await settle();
  assert.equal(music.paused, false);
  assert.deepEqual(f.musicEvents, ['play', 'pause', 'play']);
  assert.equal(music.currentTime, 12, 'returning should continue the same track position');
});
