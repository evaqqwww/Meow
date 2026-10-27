import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMeowPlayer } from '../site/meow-audio.js';

const SOURCES = Array.from({ length: 8 }, (_, index) => `https://audio.invalid/meow-${index}.mp3`);
const settle = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture({ failOnce, decode, fetchAudio, initialState = 'suspended' } = {}) {
  const events = [];
  const contexts = [];
  const nodes = [];
  const fetches = [];
  const decodes = [];
  let random = 0;
  let failed = false;
  const shouldFail = (stage) => {
    if (failOnce !== stage || failed) return false;
    failed = true;
    return true;
  };
  class AudioContext {
    constructor() {
      events.push('context');
      this.state = initialState;
      this.destination = {};
      contexts.push(this);
    }
    resume() {
      events.push('resume');
      if (shouldFail('resume')) return Promise.reject(new Error('Resume denied'));
      this.state = 'running';
      return Promise.resolve();
    }
    decodeAudioData(bytes) {
      const id = new Uint8Array(bytes)[0];
      events.push('decode');
      decodes.push(id);
      if (shouldFail('decode')) return Promise.reject(new Error('Decode failed'));
      return decode ? decode(id) : Promise.resolve({ id });
    }
    createBufferSource() {
      const node = {
        playing: false,
        stops: 0,
        disconnects: 0,
        connect(destination) { assert.equal(destination, contexts.at(-1).destination); },
        start() {
          if (shouldFail('start')) throw new Error('Start failed');
          this.playing = true;
          events.push(`start:${this.buffer.id}`);
        },
        stop() { this.stops += 1; this.playing = false; },
        disconnect() { this.disconnects += 1; },
      };
      nodes.push(node);
      return node;
    }
  }
  const fetch = (source) => {
    events.push('fetch');
    fetches.push(source);
    if (shouldFail('fetch')) return Promise.reject(new Error('Network failed'));
    if (fetchAudio) return fetchAudio(source);
    return Promise.resolve({ ok: true, arrayBuffer: async () => Uint8Array.of(SOURCES.indexOf(source)).buffer });
  };
  const player = createMeowPlayer({ sources: SOURCES, AudioContext, fetch, random: () => random });
  return { player, events, contexts, nodes, fetches, decodes, choose: (value) => { random = value; } };
}

test('preloads all eight files without opening an audio context or playing', async () => {
  const f = fixture();
  assert.equal(await f.player.preload(), true);
  assert.deepEqual(new Set(f.fetches), new Set(SOURCES));
  assert.equal(f.contexts.length, 0);
  assert.deepEqual(f.decodes, []);
  await f.player.preload();
  assert.equal(f.fetches.length, 8, 'successful network bytes should be reused');
  assert.deepEqual(f.nodes, []);
});

test('creates and resumes the context synchronously before asynchronous loading and decoding', async () => {
  const download = deferred();
  const f = fixture({ fetchAudio: () => download.promise });
  const playing = f.player.playRandom();
  assert.deepEqual(f.events.slice(0, 2), ['context', 'resume']);
  assert.equal(f.nodes.length, 0);
  download.resolve({ ok: true, arrayBuffer: async () => Uint8Array.of(0).buffer });
  assert.equal(await playing, true);
  assert.ok(f.events.indexOf('resume') < f.events.indexOf('decode'));
  assert.equal(f.nodes[0].playing, true);
});

test('unlock starts resume in the gesture without fetching or sounding and running contexts need no resume', async () => {
  const f = fixture();
  const unlocking = f.player.unlock();
  assert.deepEqual(f.events, ['context', 'resume']);
  assert.equal(await unlocking, true);
  assert.equal(await f.player.unlock(), true);
  assert.deepEqual(f.events, ['context', 'resume']);
  assert.equal(f.nodes.length, 0);
  assert.equal(await f.player.playRandom(), true);
  assert.equal(f.events.filter((event) => event === 'resume').length, 1);
});

test('can select every meow and both random endpoints while caching decodes and replacing the previous voice', async () => {
  const f = fixture({ initialState: 'running' });
  const selected = [];
  for (let index = 0; index < 8; index += 1) {
    f.choose((index + 0.5) / 8);
    assert.equal(await f.player.playRandom(), true);
    selected.push(f.nodes.at(-1).buffer.id);
    assert.equal(f.nodes.filter((node) => node.playing).length, 1);
  }
  assert.deepEqual(selected, [0, 1, 2, 3, 4, 5, 6, 7]);
  f.choose(0);
  await f.player.playRandom();
  assert.equal(f.nodes.at(-1).buffer.id, 0);
  f.choose(1 - Number.EPSILON);
  await f.player.playRandom();
  assert.equal(f.nodes.at(-1).buffer.id, 7);
  assert.equal(f.fetches.length, 8);
  assert.equal(f.decodes.length, 8);
  assert.equal(f.contexts.length, 1);
  assert.equal(f.events.includes('resume'), false);
  assert.ok(f.nodes.slice(0, -1).every((node) => node.stops === 1 && node.disconnects >= 1));
  f.player.stop();
  assert.equal(f.nodes.filter((node) => node.playing).length, 0);
});

test('a newer request and stop both invalidate slow older audio before it can sound', async () => {
  const slowDecode = deferred();
  const f = fixture({ decode: (id) => id === 0 ? slowDecode.promise : Promise.resolve({ id }) });
  const old = f.player.playRandom();
  await settle();
  assert.deepEqual(f.decodes, [0]);
  f.choose(0.2);
  assert.equal(await f.player.playRandom(), true);
  assert.equal(f.nodes.at(-1).buffer.id, 1);
  slowDecode.resolve({ id: 0 });
  assert.equal(await old, false);
  assert.deepEqual(f.events.filter((event) => event.startsWith('start:')), ['start:1']);

  const download = deferred();
  const waiting = fixture({ fetchAudio: () => download.promise });
  const pending = waiting.player.playRandom();
  waiting.player.stop();
  download.resolve({ ok: true, arrayBuffer: async () => Uint8Array.of(0).buffer });
  assert.equal(await pending, false);
  assert.equal(waiting.nodes.length, 0);
});

test('audio failures return false without throwing and a later attempt can retry', async (t) => {
  for (const failure of ['fetch', 'decode', 'resume', 'start']) {
    await t.test(failure, async () => {
      const f = fixture({ failOnce: failure });
      assert.equal(await f.player.playRandom(), false);
      assert.equal(f.nodes.filter((node) => node.playing).length, 0);
      assert.equal(await f.player.playRandom(), true);
      assert.equal(f.nodes.filter((node) => node.playing).length, 1);
    });
  }
});

test('without Web Audio all operations are harmless and preload never fetches', async () => {
  let fetches = 0;
  const player = createMeowPlayer({ sources: SOURCES, AudioContext: null, fetch: () => { fetches += 1; throw new Error('Unexpected fetch'); } });
  assert.equal(await player.preload(), false);
  assert.equal(await player.unlock(), false);
  assert.equal(await player.playRandom(), false);
  assert.doesNotThrow(() => player.stop());
  assert.equal(fetches, 0);
});
