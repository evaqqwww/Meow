import { createInteraction } from './interaction.js';

const app = createInteraction();
const $ = (id) => document.getElementById(id);
const scene = $('scene');
const catButton = $('cat-button');
const catImage = $('cat-image');
const paw = $('paw-button');
const dialog = $('message-dialog');
const input = $('message-input');
const restImage = new URL('./assets/cat-rest.png', import.meta.url).href;
const replyImage = new URL('./assets/cat-paw.png', import.meta.url).href;
let activePointer = null;
let activeKey = null;
let frame = 0;
let previousPhase = '';

function render() {
  const { phase, text, progress } = app.state;
  scene.dataset.phase = phase;
  $('ring-progress').style.strokeDashoffset = String(1 - progress);
  if (phase === 'holding') {
    $('paw-label').textContent = `再等 ${Math.ceil((1 - progress) * 3)} 秒`;
  }
  if (phase === previousPhase) return;
  previousPhase = phase;
  const responding = phase === 'reply';
  catButton.disabled = phase === 'holding' || responding;
  catImage.src = responding ? replyImage : restImage;
  catImage.alt = responding ? '举起粉色肉垫回应你的三花小猫' : '闭着眼睛休息的三花小猫';
  $('speech').hidden = !responding;
  $('speech-text').textContent = responding ? text : '';
  $('paw-wrap').hidden = !['ready', 'holding'].includes(phase);
  $('cat-invitation').hidden = phase !== 'idle';
  $('step-1').classList.toggle('is-active', ['idle', 'editing'].includes(phase));
  $('step-2').classList.toggle('is-active', ['ready', 'holding'].includes(phase));
  $('step-3').classList.toggle('is-active', responding);
  const hints = {
    idle: '点点小猫，把心里的话轻轻放下。',
    editing: '不着急，小猫在认真听。',
    ready: '心事收到了。按住粉色肉垫，等一个回音。',
    holding: '就这样轻轻按着，小猫正在酝酿回音…',
    reply: '喵，你的话，小猫听见了。',
  };
  $('guide-text').textContent = hints[phase];
  if (phase === 'ready') {
    $('paw-label').textContent = '按住肉垫 3 秒';
    $('paw-subtitle').textContent = '松开后会重新计时';
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
  if (['holding', 'reply'].includes(app.state.phase)) frame = requestAnimationFrame(animate);
}

function startHold() {
  if (!app.beginHold()) return false;
  render();
  if (!frame) frame = requestAnimationFrame(animate);
  return true;
}

function cancelHold() {
  app.cancelHold();
  activePointer = null;
  activeKey = null;
  if (app.state.phase !== 'reply' && frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  render();
}

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
  app.endHold();
  cancelHold();
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
paw.addEventListener('keyup', (event) => { if (event.key === activeKey) { event.preventDefault(); app.endHold(); cancelHold(); } });
paw.addEventListener('blur', () => { if (activeKey !== null) cancelHold(); });
window.addEventListener('blur', cancelHold);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelHold();
  else { app.tick(); render(); }
});
render();
