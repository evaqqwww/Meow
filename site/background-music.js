export function createBackgroundMusic(audioElement) {
  if (typeof audioElement?.play !== 'function' || typeof audioElement?.pause !== 'function') {
    return { start: async () => false, pause() {}, resume: async () => false };
  }

  audioElement.loop = true;
  let activated = false;
  let wanted = false;
  let playing = false;
  let request = 0;
  let pending = null;

  function pauseNative() {
    try { audioElement.pause(); } catch {}
  }

  function play() {
    wanted = true;
    if (pending) return pending;
    if (playing && audioElement.paused !== true) return Promise.resolve(true);
    const current = ++request;
    let result;
    try {
      // Keep native play inside the caller's user gesture.
      result = audioElement.play();
    } catch {
      playing = false;
      return Promise.resolve(false);
    }
    pending = Promise.resolve(result).then(() => {
      if (current !== request) {
        // A newer play still wants this same element; never pause it for an old request.
        if (!wanted) pauseNative();
        return false;
      }
      pending = null;
      playing = true;
      return true;
    }, () => {
      if (current === request) {
        pending = null;
        playing = false;
      }
      return false;
    });
    return pending;
  }

  return {
    start() {
      activated = true;
      return play();
    },
    pause() {
      wanted = false;
      request += 1;
      pending = null;
      playing = false;
      pauseNative();
    },
    resume() {
      return activated ? play() : Promise.resolve(false);
    },
  };
}
