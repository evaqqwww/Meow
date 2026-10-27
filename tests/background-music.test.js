import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundMusic } from '../site/background-music.js';

function fixture() {
  const requests = [];
  let position = 37.5;
  let volume = 0.18;
  let positionWrites = 0;
  let volumeWrites = 0;
  const audio = {
    paused: true,
    loop: false,
    pauses: 0,
    throwNext: false,
    get currentTime() { return position; },
    set currentTime(value) { positionWrites += 1; position = value; },
    get volume() { return volume; },
    set volume(value) { volumeWrites += 1; volume = value; },
    play() {
      if (this.throwNext) { this.throwNext = false; throw new Error('Playback blocked'); }
      this.paused = false;
      let resolve;
      let reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      requests.push({
        finish: () => { this.paused = false; resolve(); },
        fail: () => reject(new Error('Playback blocked')),
      });
      return promise;
    },
    pause() { this.pauses += 1; this.paused = true; },
  };
  const music = createBackgroundMusic(audio);
  return { audio, music, requests, writes: () => ({ position: positionWrites, volume: volumeWrites }) };
}

test('starts native play synchronously in the gesture and loops without changing volume or position', async () => {
  const f = fixture();
  const starting = f.music.start();
  assert.equal(f.requests.length, 1, 'native play must run before start returns');
  assert.equal(f.audio.loop, true);
  assert.equal(f.audio.volume, 0.18);
  assert.equal(f.audio.currentTime, 37.5);
  f.requests[0].finish();
  assert.equal(await starting, true);
  assert.deepEqual(f.writes(), { position: 0, volume: 0 });
});

test('repeated starts share pending playback and never restart an already playing track', async () => {
  const f = fixture();
  const first = f.music.start();
  const second = f.music.start();
  assert.equal(f.requests.length, 1);
  f.requests[0].finish();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(await f.music.start(), true);
  assert.equal(await f.music.resume(), true);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.writes(), { position: 0, volume: 0 });
});

test('resume is silent before activation but restores a previously paused track at its position', async () => {
  const f = fixture();
  assert.equal(await f.music.resume(), false);
  assert.equal(f.requests.length, 0);
  const first = f.music.start();
  f.requests[0].finish();
  await first;
  f.music.pause();
  assert.equal(f.audio.paused, true);
  const resumed = f.music.resume();
  assert.equal(f.requests.length, 2);
  f.requests[1].finish();
  assert.equal(await resumed, true);
  assert.equal(f.audio.currentTime, 37.5);
  assert.deepEqual(f.writes(), { position: 0, volume: 0 });
});

test('pausing invalidates a pending play and prevents a late success from restoring sound', async () => {
  const f = fixture();
  const pending = f.music.start();
  assert.equal(f.requests.length, 1);
  f.music.pause();
  f.requests[0].finish();
  assert.equal(await pending, false);
  assert.equal(f.audio.paused, true);
  const resumed = f.music.resume();
  assert.equal(f.requests.length, 2);
  f.requests[1].finish();
  assert.equal(await resumed, true);
  assert.equal(f.audio.paused, false);
});

test('stale success or failure cannot cancel a newer resumed play', async (t) => {
  for (const settlement of ['finish', 'fail']) {
    await t.test(settlement, async () => {
      const f = fixture();
      const old = f.music.start();
      f.music.pause();
      const resumed = f.music.resume();
      assert.equal(f.requests.length, 2);
      f.requests[0][settlement]();
      assert.equal(await old, false);
      assert.equal(f.audio.paused, false, 'the new request must not be paused by the old one');
      f.requests[1].finish();
      assert.equal(await resumed, true);
      assert.equal(await f.music.start(), true);
      assert.equal(f.requests.length, 2, 'an old completion must not clear the new playback state');
    });
  }
});

test('failed native play is contained and a later gesture can retry', async (t) => {
  for (const failure of ['rejection', 'throw']) {
    await t.test(failure, async () => {
      const f = fixture();
      if (failure === 'throw') f.audio.throwNext = true;
      const first = f.music.start();
      if (failure === 'rejection') f.requests[0].fail();
      assert.equal(await first, false);
      const next = f.music.start();
      f.requests.at(-1).finish();
      assert.equal(await next, true);
      assert.deepEqual(f.writes(), { position: 0, volume: 0 });
    });
  }
});

test('missing native play or pause support is a harmless no-op', async () => {
  for (const audio of [null, {}, { play() { throw new Error('Must not play without pause support'); } }]) {
    const music = createBackgroundMusic(audio);
    assert.equal(await music.start(), false);
    assert.equal(await music.resume(), false);
    assert.doesNotThrow(() => music.pause());
  }
});
