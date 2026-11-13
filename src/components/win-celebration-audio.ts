type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;
let applauseBufferPromise: Promise<AudioBuffer | null> | null = null;
let applauseSource: AudioBufferSourceNode | null = null;
let fallbackAudio: HTMLAudioElement | null = null;
let pendingApplause = false;
let pendingFallbackRetry = false;
let playbackGeneration = 0;

function getApplauseUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}audio/win-applause.mp3`;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

function getFallbackAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  fallbackAudio ??= new Audio(getApplauseUrl());
  fallbackAudio.preload = "auto";
  fallbackAudio.volume = 0.78;
  fallbackAudio.setAttribute("playsinline", "");
  if (fallbackAudio.networkState === HTMLMediaElement.NETWORK_EMPTY) fallbackAudio.load();
  return fallbackAudio;
}

function loadApplauseBuffer(): Promise<AudioBuffer | null> {
  const context = getAudioContext();
  if (!context) return Promise.resolve(null);
  if (applauseBufferPromise) return applauseBufferPromise;

  applauseBufferPromise = fetch(getApplauseUrl())
    .then((response) => {
      if (!response.ok) throw new Error(`Applause audio request failed: ${response.status}`);
      return response.arrayBuffer();
    })
    .then((data) => context.decodeAudioData(data))
    .catch(() => {
      applauseBufferPromise = null;
      return null;
    });
  return applauseBufferPromise;
}

export function prepareWinCelebrationAudio(): void {
  void loadApplauseBuffer();
  getFallbackAudio();
}

export function unlockWinCelebrationAudio(): void {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    void context.resume().catch(() => undefined);
  }

  const audio = getFallbackAudio();
  if (pendingFallbackRetry && audio) {
    playFallbackAudio();
    return;
  }
  if (audio?.paused) {
    audio.muted = true;
    void audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    }).catch(() => {
      audio.muted = false;
    });
  }
}

export function playWinCelebrationApplause(): void {
  stopWinCelebrationApplause();
  const generation = playbackGeneration;
  pendingApplause = true;
  const context = getAudioContext();
  if (!context) {
    playFallbackAudio();
    return;
  }

  void loadApplauseBuffer().then(async (buffer) => {
    if (generation !== playbackGeneration) return;
    if (!buffer) {
      playFallbackAudio();
      return;
    }
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") {
      playFallbackAudio();
      return;
    }

    stopWinCelebrationApplause();
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = 0.72;
    source.connect(gain);
    gain.connect(context.destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (applauseSource === source) applauseSource = null;
    };
    applauseSource = source;
    source.start();
    pendingApplause = false;
  }).catch(() => {
    if (generation === playbackGeneration) playFallbackAudio();
  });
}

export function stopWinCelebrationApplause(): void {
  playbackGeneration += 1;
  pendingApplause = false;
  pendingFallbackRetry = false;
  if (applauseSource) {
    try {
      applauseSource.stop();
    } catch {
      // The clip may have ended between the stop request and this call.
    }
    applauseSource.disconnect();
    applauseSource = null;
  }
  if (fallbackAudio) {
    fallbackAudio.pause();
    fallbackAudio.currentTime = 0;
  }
}

function playFallbackAudio(): void {
  const audio = getFallbackAudio();
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
  audio.muted = false;
  void audio.play().then(() => {
    pendingApplause = false;
    pendingFallbackRetry = false;
  }).catch(() => {
    // Keep the request pending so the next user gesture can retry playback.
    pendingApplause = true;
    pendingFallbackRetry = true;
  });
}
