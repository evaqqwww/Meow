export function createMeowPlayer({
  sources = [],
  AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext,
  fetch: fetchAudio = globalThis.fetch,
  random = Math.random,
} = {}) {
  const urls = [...sources];
  const bytes = new Map();
  const buffers = new Map();
  let context;
  let activeSource = null;
  let request = 0;
  const supported = typeof AudioContext === 'function';

  function prepareContext() {
    if (!supported) return null;
    if (!context || context.state === 'closed') context = new AudioContext();
    // Start resume in the calling gesture, before fetching or awaiting anything.
    return context.state === 'running' ? Promise.resolve() : Promise.resolve(context.resume());
  }

  function loadBytes(url) {
    if (!bytes.has(url)) {
      const loading = (async () => {
        const response = await fetchAudio(url);
        if (!response.ok) throw new Error('Audio download failed');
        return response.arrayBuffer();
      })();
      bytes.set(url, loading);
      loading.catch(() => { if (bytes.get(url) === loading) bytes.delete(url); });
    }
    return bytes.get(url);
  }

  function decode(url) {
    if (!buffers.has(url)) {
      const downloading = loadBytes(url);
      const decoding = downloading.then((data) => context.decodeAudioData(data.slice(0)));
      buffers.set(url, decoding);
      decoding.catch(() => {
        if (buffers.get(url) === decoding) buffers.delete(url);
        if (bytes.get(url) === downloading) bytes.delete(url);
      });
    }
    return buffers.get(url);
  }

  function stopSource(source) {
    if (!source) return;
    try { source.stop(); } catch {}
    try { source.disconnect(); } catch {}
  }

  function stopActive() {
    const previous = activeSource;
    activeSource = null;
    stopSource(previous);
  }

  return {
    async preload() {
      if (!supported || !urls.length) return false;
      try {
        await Promise.all(urls.map(loadBytes));
        return true;
      } catch { return false; }
    },
    async unlock() {
      try {
        const ready = prepareContext();
        if (!ready) return false;
        await ready;
        return true;
      } catch { return false; }
    },
    async playRandom() {
      const current = ++request;
      stopActive();
      let source;
      try {
        if (!supported || !urls.length) return false;
        const url = urls[Math.floor(random() * urls.length)];
        if (!url) return false;
        const ready = prepareContext();
        const [, buffer] = await Promise.all([ready, decode(url)]);
        if (current !== request) return false;
        source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.onended = () => {
          if (activeSource === source) activeSource = null;
          try { source.disconnect(); } catch {}
        };
        activeSource = source;
        source.start();
        return true;
      } catch {
        if (activeSource === source) activeSource = null;
        stopSource(source);
        return false;
      }
    },
    stop() {
      request += 1;
      stopActive();
    },
  };
}
