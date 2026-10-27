import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLESSINGS, pickBlessing } from '../site/blessings.js';

test('offers at least twelve distinct short Chinese blessings in a frozen catalogue', () => {
  assert.equal(Object.isFrozen(BLESSINGS), true);
  assert.ok(new Set(BLESSINGS).size >= 12);
  for (const blessing of BLESSINGS) {
    assert.equal(typeof blessing, 'string');
    assert.ok(Array.from(blessing).length >= 8);
    assert.ok(Array.from(blessing).length <= 20);
    assert.match(blessing, /\p{Script=Han}/u);
  }
});

test('selects valid first and last candidates at both ends of the random range', () => {
  assert.equal(pickBlessing({ random: () => 0 }), BLESSINGS[0]);
  assert.equal(pickBlessing({ random: () => 1 - Number.EPSILON }), BLESSINGS.at(-1));
});

test('makes every blessing selectable rather than returning one fixed message', () => {
  const selected = new Set();
  for (let index = 0; index < BLESSINGS.length; index += 1) {
    selected.add(pickBlessing({ random: () => (index + 0.5) / BLESSINGS.length }));
  }
  assert.deepEqual(selected, new Set(BLESSINGS));
});

test('never selects the excluded text at any candidate position', () => {
  for (const exclude of BLESSINGS) {
    for (let index = 0; index < BLESSINGS.length - 1; index += 1) {
      const selected = pickBlessing({
        random: () => (index + 0.5) / (BLESSINGS.length - 1),
        exclude,
      });
      assert.notEqual(selected, exclude);
      assert.ok(BLESSINGS.includes(selected));
    }
    assert.notEqual(pickBlessing({ random: () => 0, exclude }), exclude);
    assert.notEqual(pickBlessing({ random: () => 1 - Number.EPSILON, exclude }), exclude);
  }
});

test('excludes exact matches only', () => {
  assert.equal(pickBlessing({ random: () => 0, exclude: `${BLESSINGS[0]} ` }), BLESSINGS[0]);
});

test('uses a valid default random source when options are omitted', () => {
  assert.ok(BLESSINGS.includes(pickBlessing()));
});
