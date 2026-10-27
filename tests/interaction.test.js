import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInteraction } from '../site/interaction.js';
import { BLESSINGS } from '../site/blessings.js';

function setup({ random = () => 0 } = {}) {
  let time = 0;
  const interaction = createInteraction({ now: () => time, random });
  return { interaction, setTime: (value) => { time = value; }, at: (value) => { time = value; return interaction.tick(); } };
}
function prepare(app, text = '今天也要开心') { app.openInput(); app.confirmInput(text); }

test('only confirmed nonempty input reveals the paw', () => {
  const { interaction: app } = setup();
  assert.equal(app.state.phase, 'idle'); assert.equal(app.beginHold(), false);
  app.openInput();
  assert.equal(app.confirmInput('   '), false);
  assert.equal(app.confirmInput('x'.repeat(121)), false);
  assert.equal(app.state.phase, 'editing');
  assert.equal(app.confirmInput('  愿你好梦  '), true);
  assert.equal(app.state.phase, 'ready'); assert.equal(app.state.text, '愿你好梦');
});

test('waits 300 ms then plays the five frames over 800 ms', () => {
  const { interaction: app, at } = setup(); prepare(app); app.beginHold();
  for (const [time, frame] of [[0, 0], [299, 0], [300, 0], [499, 0], [500, 1], [700, 2], [900, 3], [1099, 3], [1100, 4]]) {
    at(time); assert.equal(app.state.frameIndex, frame, 'frame at ' + time + ' ms');
  }
  assert.equal(app.state.phase, 'reply'); assert.ok(app.state.replyText);
});

test('releasing before animation starts resets immediately without a blessing', () => {
  let draws = 0;
  const { interaction: app, at } = setup({ random: () => { draws += 1; return 0; } });
  prepare(app); app.beginHold(); at(299); app.endHold();
  assert.equal(app.state.phase, 'ready'); assert.equal(app.state.frameIndex, 0);
  assert.equal(app.state.progress, 0); assert.equal(draws, 0);
});

test('an early release reverses from the current frame and preserves the input', () => {
  let draws = 0;
  const { interaction: app, at } = setup({ random: () => { draws += 1; return 0; } });
  prepare(app, '未说完的心事'); app.beginHold(); at(750); app.endHold();
  assert.equal(app.state.phase, 'returning'); assert.equal(app.state.frameIndex, 2);
  assert.equal(app.state.progress, 0); assert.equal(app.beginHold(), false); assert.equal(app.openInput(), false);
  at(949); assert.equal(app.state.frameIndex, 2);
  at(950); assert.equal(app.state.frameIndex, 1);
  at(1149); assert.equal(app.state.phase, 'returning');
  at(1150); assert.equal(app.state.phase, 'ready'); assert.equal(app.state.frameIndex, 0);
  assert.equal(app.state.text, '未说完的心事'); assert.equal(draws, 0);
  app.beginHold(); at(2249); assert.equal(app.state.phase, 'holding');
  at(2250); assert.equal(app.state.phase, 'reply'); assert.equal(draws, 1);
});

test('the blessing expires after one second but the held cat stays on the last frame', () => {
  let draws = 0;
  const { interaction: app, at } = setup({ random: () => { draws += 1; return 0.5; } });
  prepare(app, '这是一句心事'); app.beginHold();
  at(1099); assert.equal(app.state.replyText, ''); assert.equal(draws, 0);
  at(1100); const blessing = app.state.replyText;
  assert.ok(BLESSINGS.includes(blessing)); assert.notEqual(blessing, app.state.text);
  at(2099); assert.equal(app.state.replyText, blessing);
  at(2100); assert.equal(app.state.replyText, '');
  at(9000); assert.equal(app.state.phase, 'reply'); assert.equal(app.state.frameIndex, 4);
  assert.equal(app.state.text, '这是一句心事'); assert.equal(draws, 1);
});

test('releasing a completed hold reverses all five frames in 800 ms then resets', () => {
  const { interaction: app, at } = setup(); prepare(app); app.beginHold(); at(1100); at(2200); app.endHold();
  assert.equal(app.state.phase, 'returning');
  for (const [time, frame] of [[2200, 4], [2399, 4], [2400, 3], [2600, 2], [2800, 1]]) {
    at(time); assert.equal(app.state.frameIndex, frame);
  }
  at(3000);
  assert.deepEqual(app.state, { phase: 'idle', text: '', replyText: '', progress: 0, frameIndex: 0 });
});

test('the blessing keeps its original lifetime when released just after completion', () => {
  const { interaction: app, at } = setup(); prepare(app); app.beginHold(); at(1100); app.endHold();
  const blessing = app.state.replyText;
  at(1900); assert.equal(app.state.frameIndex, 0); assert.equal(app.state.phase, 'returning');
  assert.equal(app.state.replyText, blessing);
  at(2099); assert.equal(app.state.replyText, blessing);
  at(2100); assert.equal(app.state.replyText, ''); assert.equal(app.state.phase, 'idle');
});

test('release after 1100 ms completes even between animation frames', () => {
  const { interaction: app, at, setTime } = setup(); prepare(app); app.beginHold(); at(1095); setTime(1101); app.endHold();
  assert.equal(app.state.phase, 'returning'); assert.equal(app.state.frameIndex, 4); assert.ok(app.state.replyText);
  at(1901); assert.equal(app.state.frameIndex, 0);
  at(2100); assert.ok(app.state.replyText);
  at(2101); assert.equal(app.state.replyText, ''); assert.equal(app.state.phase, 'idle');
});

test('background cancellation reverses the displayed pose without completing a delayed hold', () => {
  let draws = 0;
  const { interaction: app, at, setTime } = setup({ random: () => { draws += 1; return 0; } });
  prepare(app); app.beginHold(); at(700); setTime(10000); app.cancelHold();
  assert.equal(app.state.phase, 'returning'); assert.equal(app.state.frameIndex, 2);
  at(10400); assert.equal(app.state.phase, 'ready'); assert.equal(app.state.frameIndex, 0); assert.equal(draws, 0);
});

test('canceling input preserves an already prepared message', () => {
  const { interaction: app } = setup(); app.openInput(); app.cancelInput(); assert.equal(app.state.phase, 'idle');
  prepare(app, '第一段话'); app.openInput(); app.cancelInput();
  assert.equal(app.state.phase, 'ready'); assert.equal(app.state.text, '第一段话');
  app.openInput(); app.confirmInput('修改后的话'); assert.equal(app.state.text, '修改后的话');
});

test('repeated holds cannot restart a cycle and a later cycle draws a new blessing', () => {
  let draws = 0;
  const { interaction: app, at } = setup({ random: () => { draws += 1; return draws === 1 ? 0 : 0.9; } });
  prepare(app, BLESSINGS[0]); app.beginHold(); at(700);
  assert.equal(app.beginHold(), false); assert.equal(app.openInput(), false); assert.equal(app.confirmInput('覆盖'), false);
  at(1100); const first = app.state.replyText; assert.notEqual(first, BLESSINGS[0]);
  app.endHold(); at(2100);
  prepare(app, '第二段话'); app.beginHold(); at(3200);
  assert.equal(draws, 2); assert.notEqual(app.state.replyText, first);
});
