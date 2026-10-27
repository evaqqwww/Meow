import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
let fixtureNumber = 0;
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function fixture(t, { reducedMotion = false } = {}) {
  const animations = [];
  const effects = [];
  const document = new EventTarget();
  document.hidden = false;
  document.activeElement = null;
  const window = new EventTarget();
  window.matchMedia = () => ({ matches: reducedMotion });

  class Element extends EventTarget {
    constructor(id) {
      super();
      this.id = id;
      this.style = {};
      this.dataset = {};
      this.value = '';
      this.open = false;
      this.attributes = new Map();
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    focus() { document.activeElement = this; effects.push(`${this.id}:focus`); }
    blur() { if (document.activeElement === this) document.activeElement = null; }
    showModal() { this.open = true; effects.push(`${this.id}:showModal`); }
    close() { this.open = false; }
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
  const globals = { document, window, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} };
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
    animations, effects, document, window,
    element: (id) => elements.get(id),
    phase: () => elements.get('scene').dataset.phase,
    clickCat: () => elements.get('cat-button').dispatchEvent(new Event('click')),
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
