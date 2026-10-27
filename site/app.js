import { createInteraction, WAIT_DURATION_MS, ANIMATION_DURATION_MS, HOLD_DURATION_MS } from './interaction.js';

const app = createInteraction();
const $ = (id) => document.getElementById(id);
const scene = $('scene');
const catButton = $('cat-button');
const catImage = $('cat-image');
const paw = $('paw-button');
paw.setAttribute('aria-label', `连续按住肉垫${HOLD_DURATION_MS / 1000}秒，听小猫说话`);
const dialog = $('message-dialog');
const input = $('message-input');
const catFrames = [
  'frame-01-start.png', 'frame-02-25pct.png', 'frame-03-50pct.png',
  'frame-04-75pct.png', 'frame-05-end.png',
].map((name) => new URL(`./assets/cat-frames/${name}`, import.meta.url).href);
let activePointer = null;
let activeKey = null;
let frame = 0;
let previousPhase = '';
let previousFrame = -1;
let previousReply = null;

function render() {
  const { phase, replyText, progress, frameIndex } = app.state;
  scene.dataset.phase = phase;
  $('ring-progress').style.strokeDashoffset = String(1 - progress);
  if (phase === 'holding') {
    const remaining = Math.ceil((1 - progress) * HOLD_DURATION_MS / 100) / 10;
    $('paw-label').textContent = `再等 ${remaining.toFixed(1)} 秒`;
  }
  if (frameIndex !== previousFrame) {
    previousFrame = frameIndex;
    catImage.src = catFrames[frameIndex];
    catImage.alt = frameIndex === 0 ? '闭着眼睛休息的三花小猫' : frameIndex === 4 ? '举起粉色肉垫回应你的三花小猫' : '正在活动爪子的三花小猫';
  }
  if (replyText !== previousReply) {
    previousReply = replyText;
    $('speech').hidden = !replyText;
    $('speech-text').textContent = replyText;
  }
  if (phase === previousPhase) return;
  previousPhase = phase;
  catButton.disabled = ['holding', 'reply', 'returning'].includes(phase);
  paw.disabled = phase === 'returning';
  $('paw-wrap').hidden = !['ready', 'holding', 'reply', 'returning'].includes(phase);
  const hints = {
    idle: '点点小猫，把心里的话轻轻放下。',
    editing: '不着急，小猫在认真听。',
    ready: '心事收到了。按住粉色肉垫，等一个回音。',
    holding: '继续按着，小猫正在抬起爪子…',
    reply: '祝福送到了。松开肉垫，小猫会收起爪子。',
    returning: '小猫正在收起爪子，稍等一下。',
  };
  $('guide-text').textContent = hints[phase];
  if (phase === 'ready') {
    $('paw-label').textContent = `按住肉垫 ${HOLD_DURATION_MS / 1000} 秒`;
    $('paw-subtitle').textContent = `${WAIT_DURATION_MS / 1000} 秒等待 · ${ANIMATION_DURATION_MS / 1000} 秒抬爪`;
  } else if (phase === 'reply') {
    $('paw-label').textContent = '松开肉垫';
    $('paw-subtitle').textContent = '小猫会收起爪子';
  } else if (phase === 'returning') {
    $('paw-label').textContent = '正在收起爪子';
    $('paw-subtitle').textContent = '稍等一下，喵';
  }
  if (phase === 'idle') {
    input.value = '';
    $('character-count').textContent = '0';
  }
}

function animate() {
  frame = 0;
  app.tick();
  render();
  scheduleAnimation();
}

function scheduleAnimation() {
  const { phase, replyText } = app.state;
  const needed = ['holding', 'returning'].includes(phase) || Boolean(replyText);
  if (needed && !frame) frame = requestAnimationFrame(animate);
  else if (!needed && frame) { cancelAnimationFrame(frame); frame = 0; }
}

function startHold() {
  if (!app.beginHold()) return false;
  render();
  scheduleAnimation();
  return true;
}

function afterRelease() {
  activePointer = null;
  activeKey = null;
  render();
  scheduleAnimation();
}

function cancelHold() { app.cancelHold(); afterRelease(); }
function endHold() { app.endHold(); afterRelease(); }

catButton.addEventListener('click', () => {
  if (!app.openInput()) return;
  input.value = app.state.text;
  $('character-count').textContent = String(input.value.length);
  $('input-error').textContent = '';
  render();
  dialog.showModal();
  input.focus();
});

function closeInput() {
  app.cancelInput();
  dialog.close();
  render();
}

$('close-dialog').addEventListener('click', closeInput);
dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeInput(); });
dialog.addEventListener('click', (event) => { if (event.target === dialog) {
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeInput();
} });
input.addEventListener('input', () => {
  $('character-count').textContent = String(input.value.length);
  $('input-error').textContent = '';
});
$('message-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!app.confirmInput(input.value)) {
    $('input-error').textContent = '先留下一句话吧。';
    input.focus();
    return;
  }
  input.blur();
  dialog.close();
  render();
});

paw.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0 || activePointer !== null || activeKey !== null) return;
  event.preventDefault();
  if (!startHold()) return;
  activePointer = event.pointerId;
  paw.setPointerCapture(event.pointerId);
});
paw.addEventListener('pointermove', (event) => {
  if (activePointer !== event.pointerId) return;
  if ((event.buttons & 1) === 0) { cancelHold(); return; }
  const box = paw.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) cancelHold();
});
paw.addEventListener('pointerup', (event) => {
  if (event.pointerId !== activePointer) return;
  endHold();
});
for (const type of ['pointercancel', 'lostpointercapture']) {
  paw.addEventListener(type, (event) => { if (event.pointerId === activePointer) cancelHold(); });
}
paw.addEventListener('contextmenu', (event) => event.preventDefault());
paw.addEventListener('keydown', (event) => {
  if (![' ', 'Enter'].includes(event.key)) return;
  event.preventDefault();
  if (!event.repeat && activeKey === null && activePointer === null && startHold()) activeKey = event.key;
});
paw.addEventListener('keyup', (event) => { if (event.key === activeKey) { event.preventDefault(); endHold(); } });
paw.addEventListener('blur', () => { if (activeKey !== null) cancelHold(); });
window.addEventListener('blur', cancelHold);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelHold();
  else { app.tick(); render(); scheduleAnimation(); }
});
render();
