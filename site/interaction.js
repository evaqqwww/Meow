import { pickBlessing } from './blessings.js';

export const WAIT_DURATION_MS = 1000;
export const ANIMATION_DURATION_MS = 800;
export const HOLD_DURATION_MS = WAIT_DURATION_MS + ANIMATION_DURATION_MS;
const FRAME_DURATION_MS = ANIMATION_DURATION_MS / 4;

export function createInteraction({ now = () => performance.now(), random = Math.random } = {}) {
  let state = { phase: 'idle', text: '', replyText: '', progress: 0, frameIndex: 0 };
  let holdStarted = 0;
  let replyStarted = 0;
  let returnStarted = 0;
  let returnFromFrame = 0;
  let completed = false;
  const set = (changes) => { state = { ...state, ...changes }; };
  const advance = () => {
    const time = now();
    if (state.phase === 'holding') {
      const elapsed = Math.max(0, time - holdStarted);
      const progress = Math.min(1, elapsed / HOLD_DURATION_MS);
      const frameIndex = Math.min(4, Math.floor(Math.max(0, elapsed - WAIT_DURATION_MS) / FRAME_DURATION_MS));
      set({ progress, frameIndex });
      if (progress === 1) {
        completed = true;
        replyStarted = time;
        set({ phase: 'reply', replyText: pickBlessing({ random, exclude: state.text }) });
      }
    }
    if (completed && state.replyText && time - replyStarted >= 1000) set({ replyText: '' });
    if (state.phase === 'returning') {
      const frameIndex = Math.max(0, returnFromFrame - Math.floor(Math.max(0, time - returnStarted) / FRAME_DURATION_MS));
      set({ frameIndex });
      if (frameIndex === 0) {
        if (!completed) set({ phase: 'ready' });
        else if (!state.replyText) {
          state = { phase: 'idle', text: '', replyText: '', progress: 0, frameIndex: 0 };
          completed = false;
        }
      }
    }
  };
  const reverse = () => {
    if (!['holding', 'reply'].includes(state.phase)) return;
    returnStarted = now();
    returnFromFrame = state.frameIndex;
    set({ phase: returnFromFrame > 0 ? 'returning' : 'ready', progress: 0 });
  };

  return {
    get state() { return { ...state }; },
    openInput() {
      if (!['idle', 'ready'].includes(state.phase)) return false;
      set({ phase: 'editing' });
      return true;
    },
    confirmInput(value) {
      if (state.phase !== 'editing' || typeof value !== 'string') return false;
      const text = value.trim();
      if (!text || text.length > 120) return false;
      set({ phase: 'ready', text, progress: 0 });
      return true;
    },
    cancelInput() {
      if (state.phase === 'editing') set({ phase: state.text ? 'ready' : 'idle' });
    },
    beginHold() {
      if (state.phase !== 'ready') return false;
      holdStarted = now();
      completed = false;
      set({ phase: 'holding', progress: 0, frameIndex: 0, replyText: '' });
      return true;
    },
    cancelHold() {
      reverse();
    },
    endHold() {
      if (['holding', 'reply'].includes(state.phase)) {
        advance();
        reverse();
      }
    },
    tick: advance,
  };
}
