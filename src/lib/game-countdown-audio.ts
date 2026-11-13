let countdownAudio: AudioContext | null = null;
const playedTicks = new Set<string>();

function getCountdownAudio() {
  if (typeof window === "undefined") return null;
  if (countdownAudio) return countdownAudio;

  const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) return null;

  countdownAudio = new AudioContextConstructor();
  return countdownAudio;
}

function removeUnlockListeners() {
  window.removeEventListener("pointerdown", unlockFromGesture, true);
  window.removeEventListener("touchstart", unlockFromGesture, true);
  window.removeEventListener("keydown", unlockFromGesture, true);
}

function unlockFromGesture() {
  const audio = getCountdownAudio();
  if (!audio) return;
  if (audio.state === "running") {
    removeUnlockListeners();
    return;
  }

  void audio.resume().then(() => {
    if (audio.state === "running") removeUnlockListeners();
  }).catch(() => undefined);
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlockFromGesture, { capture: true, passive: true });
  window.addEventListener("touchstart", unlockFromGesture, { capture: true, passive: true });
  window.addEventListener("keydown", unlockFromGesture, true);
}

function playTick(audio: AudioContext, secondsLeft: number) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const startAt = audio.currentTime;
  const frequency = secondsLeft === 1 ? 880 : secondsLeft === 2 ? 740 : 620;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(secondsLeft === 1 ? 0.075 : 0.055, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.115);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.12);
}

export function playGameCountdownTick(timerKey: string, secondsLeft: number, enabled = true) {
  if (!enabled || secondsLeft < 1 || secondsLeft > 3) return;

  const tickKey = `${timerKey}:${secondsLeft}`;
  if (playedTicks.has(tickKey)) return;
  playedTicks.add(tickKey);
  if (playedTicks.size > 128) {
    const oldest = playedTicks.values().next().value;
    if (oldest) playedTicks.delete(oldest);
  }

  const audio = getCountdownAudio();
  if (!audio) return;
  if (audio.state === "running") {
    playTick(audio, secondsLeft);
    return;
  }
  void audio.resume().then(() => {
    if (audio.state === "running") playTick(audio, secondsLeft);
  }).catch(() => undefined);
}
