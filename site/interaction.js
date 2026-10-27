import { pickBlessing } from './blessings.js';

export function createInteraction({ now = () => performance.now(), random = Math.random } = {}) {
  let state = { phase: 'idle', text: '', replyText: '', progress: 0 };
  let holdStarted = 0;
  let replyStarted = 0;
  const set = (changes) => { state = { ...state, ...changes }; };
  const advance = () => {
    const time = now();
    if (state.phase === 'holding') {
      const progress = Math.min(1, Math.max(0, (time - holdStarted) / 3000));
      set({ progress });
      if (progress === 1) {
        replyStarted = time;
        set({ phase: 'reply', replyText: pickBlessing({ random, exclude: state.text }) });
      }
    } else if (state.phase === 'reply' && time - replyStarted >= 1000) {
      state = { phase: 'idle', text: '', replyText: '', progress: 0 };
    }
    return { ...state };
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
      set({ phase: 'holding', progress: 0 });
      return true;
    },
    cancelHold() {
      if (state.phase === 'holding') set({ phase: 'ready', progress: 0 });
    },
    endHold() {
      if (state.phase === 'holding') {
        advance();
        if (state.phase === 'holding') set({ phase: 'ready', progress: 0 });
      }
    },
    tick: advance,
  };
}
