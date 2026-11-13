let context: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  if (!context || context.state === "closed") {
    context = new AudioContextConstructor();
    noiseBuffer = null;
  }
  return context;
}

export function unlockRouletteBallAudio() {
  const audio = getAudioContext();
  if (audio?.state === "suspended") void audio.resume().catch(() => undefined);
  return audio;
}

function getNoiseBuffer(audio: AudioContext) {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.max(1, Math.floor(audio.sampleRate * 0.026));
  noiseBuffer = audio.createBuffer(1, length, audio.sampleRate);
  const samples = noiseBuffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    const fade = 1 - index / samples.length;
    samples[index] = (Math.random() * 2 - 1) * fade;
  }
  return noiseBuffer;
}

function playBallTick(audio: AudioContext, progress: number) {
  if (audio.state !== "running") return;
  const now = audio.currentTime;

  const noise = audio.createBufferSource();
  noise.buffer = getNoiseBuffer(audio);
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2_400 - progress * 450, now);
  filter.Q.setValueAtTime(1.1, now);
  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.024 - progress * 0.006, now + 0.002);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.026);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(audio.destination);
  noise.start(now);
  noise.stop(now + 0.028);

  const click = audio.createOscillator();
  click.type = "triangle";
  click.frequency.setValueAtTime(1_450 - progress * 350, now);
  const clickGain = audio.createGain();
  clickGain.gain.setValueAtTime(0.0001, now);
  clickGain.gain.exponentialRampToValueAtTime(0.018, now + 0.001);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
  click.connect(clickGain);
  clickGain.connect(audio.destination);
  click.start(now);
  click.stop(now + 0.024);
}

export function startRouletteBallSound(durationMs: number, elapsedMs = 0) {
  const audio = getAudioContext();
  if (!audio || durationMs <= 0) return () => undefined;

  let stopped = false;
  const timers: number[] = [];
  const elapsedAtStart = Math.max(0, Math.min(durationMs, elapsedMs));
  let elapsed = elapsedAtStart;
  const schedule = () => {
    if (stopped || elapsed >= durationMs) return;
    const progress = elapsed / durationMs;
    playBallTick(audio, progress);
    const intervalMs = 90 + 650 * progress ** 2.2;
    elapsed = Math.min(durationMs, elapsed + intervalMs);
    if (elapsed < durationMs) {
      timers.push(window.setTimeout(schedule, intervalMs));
    }
  };
  const start = () => {
    if (!stopped) schedule();
  };

  if (audio.state === "running") start();
  else void audio.resume().then(start).catch(() => undefined);

  return () => {
    stopped = true;
    timers.forEach(window.clearTimeout);
  };
}
