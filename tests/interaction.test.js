import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInteraction } from '../site/interaction.js';
import { BLESSINGS } from '../site/blessings.js';

function setup({ random = () => 0 } = {}) {
  let time = 0;
  const interaction = createInteraction({ now: () => time, random });
  return { interaction, setTime: (value) => { time = value; }, at: (value) => { time = value; return interaction.tick(); } };
}

test('only confirmed nonempty input reveals a paw', () => {
  const { interaction: app } = setup();
  assert.equal(app.state.phase, 'idle');
  assert.equal(app.beginHold(), false);
  app.openInput();
  assert.equal(app.confirmInput('   '), false);
  assert.equal(app.state.phase, 'editing');
  assert.equal(app.confirmInput('x'.repeat(121)), false);
  assert.equal(app.confirmInput('  愿你好梦  '), true);
  assert.equal(app.state.phase, 'ready');
  assert.equal(app.state.text, '愿你好梦');
});

test('requires an uninterrupted 3000 ms and keeps the reply for 1000 ms', () => {
  const { interaction: app, at } = setup();
  app.openInput(); app.confirmInput('今天也要开心');
  assert.equal(app.beginHold(), true);
  at(2999);
  assert.equal(app.state.phase, 'holding');
  assert.ok(app.state.progress < 1);
  at(3000);
  assert.equal(app.state.phase, 'reply');
  assert.equal(app.state.text, '今天也要开心');
  at(3999); assert.equal(app.state.phase, 'reply');
  at(4000);
  assert.deepEqual(app.state, { phase: 'idle', text: '', replyText: '', progress: 0 });
});

test('releasing early clears progress instead of accumulating hold time', () => {
  const { interaction: app, at } = setup();
  app.openInput(); app.confirmInput('喵'); app.beginHold();
  at(2500); app.cancelHold();
  assert.equal(app.state.phase, 'ready');
  assert.equal(app.state.progress, 0);
  at(7000); app.beginHold();
  at(9999); assert.equal(app.state.phase, 'holding');
  at(10000); assert.equal(app.state.phase, 'reply');
});

test('repeated start and editing cannot restart an active hold or reply', () => {
  const { interaction: app, at } = setup();
  app.openInput(); app.confirmInput('原样 <script> & 中文'); app.beginHold();
  at(2000);
  assert.equal(app.beginHold(), false);
  assert.equal(app.openInput(), false);
  assert.equal(app.confirmInput('覆盖'), false);
  at(3000);
  assert.equal(app.state.phase, 'reply');
  app.cancelHold();
  assert.equal(app.state.phase, 'reply');
  assert.equal(app.state.text, '原样 <script> & 中文');
  at(4000);
  app.openInput(); app.confirmInput('新心事'); app.beginHold();
  at(7000); assert.equal(app.state.text, '新心事');
  at(8000); assert.equal(app.state.phase, 'idle');
});

test('canceling input restores the previous prepared message', () => {
  const { interaction: app } = setup();
  app.openInput(); app.cancelInput();
  assert.equal(app.state.phase, 'idle');
  app.openInput(); app.confirmInput('第一段话');
  app.openInput(); app.cancelInput();
  assert.equal(app.state.phase, 'ready');
  assert.equal(app.state.text, '第一段话');
  app.openInput(); app.confirmInput('修改后的话');
  assert.equal(app.state.text, '修改后的话');
});

test('release after 3000 ms completes even before the next animation frame', () => {
  const { interaction: app, at, setTime } = setup();
  app.openInput(); app.confirmInput('喵'); app.beginHold();
  at(2995);
  setTime(3001);
  app.endHold();
  assert.equal(app.state.phase, 'reply');
  at(4000); assert.equal(app.state.phase, 'reply');
  at(4001); assert.equal(app.state.phase, 'idle');
});

test('early release and background cancellation never complete a delayed hold', () => {
  const { interaction: app, setTime } = setup();
  app.openInput(); app.confirmInput('喵'); app.beginHold();
  setTime(2999); app.endHold();
  assert.equal(app.state.phase, 'ready');
  app.beginHold(); setTime(12000); app.cancelHold(); app.tick();
  assert.equal(app.state.phase, 'ready');
  assert.equal(app.state.progress, 0);
});

test('draws one blessing after a completed hold and keeps it stable until reset', () => {
  let draws = 0;
  const { interaction: app, at } = setup({ random: () => { draws += 1; return 0.5; } });
  app.openInput(); app.confirmInput('这是输入的心事，不是祝福语。'); app.beginHold();
  at(2999);
  assert.equal(app.state.replyText, '');
  assert.equal(draws, 0);
  at(3000);
  const blessing = app.state.replyText;
  assert.equal(typeof blessing, 'string');
  assert.ok(blessing.trim().length > 0);
  assert.notEqual(blessing, app.state.text);
  assert.equal(app.state.text, '这是输入的心事，不是祝福语。');
  assert.equal(draws, 1);
  at(3500); at(3999);
  assert.equal(app.state.replyText, blessing);
  assert.equal(draws, 1);
  at(4000);
  assert.equal(app.state.phase, 'idle');
  assert.equal(app.state.replyText, '');
  assert.equal(app.state.text, '');
});

test('an interrupted hold does not draw a blessing before the next successful attempt', () => {
  let draws = 0;
  const { interaction: app, at } = setup({ random: () => { draws += 1; return 0; } });
  app.openInput(); app.confirmInput('想说的话'); app.beginHold();
  at(2500); app.cancelHold();
  assert.equal(draws, 0);
  assert.equal(app.state.replyText, '');
  at(5000); app.beginHold(); at(8000);
  assert.equal(app.state.phase, 'reply');
  assert.equal(draws, 1);
  at(9000);
  app.openInput(); app.confirmInput('第二句话'); app.beginHold(); at(12000);
  assert.equal(app.state.phase, 'reply');
  assert.equal(draws, 2);
});

test('even input matching a preset receives a different blessing', () => {
  const { interaction: app, at } = setup();
  app.openInput(); app.confirmInput(BLESSINGS[0]); app.beginHold();
  at(3000);
  assert.equal(app.state.phase, 'reply');
  assert.notEqual(app.state.replyText, app.state.text);
  assert.ok(BLESSINGS.includes(app.state.replyText));
});
