import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Coins, Volume2, VolumeX, X } from "lucide-react";
import {
  playWinCelebrationApplause,
  prepareWinCelebrationAudio,
  stopWinCelebrationApplause,
  unlockWinCelebrationAudio,
} from "./win-celebration-audio.js";
import "./WinCelebration.css";

export type WinCelebrationInput = {
  eventId: string;
  amount: number;
  outcome?: "win" | "loss";
  caption?: string;
  placement?: "center" | "top";
};

const numberFormat = new Intl.NumberFormat("ru-RU");
const particles = Array.from({ length: 12 }, (_, index) => index);
export const WIN_CELEBRATION_DURATION_MS = 2_000;

let winQueue: WinCelebrationInput[] = [];
const winQueueListeners = new Set<() => void>();

function subscribeToWinQueue(listener: () => void) {
  winQueueListeners.add(listener);
  return () => {
    winQueueListeners.delete(listener);
  };
}

function getCurrentWinEvent() {
  return winQueue[0] ?? null;
}

function notifyWinQueueChanged() {
  for (const listener of winQueueListeners) listener();
}

export function enqueueWinCelebration(event: WinCelebrationInput) {
  if (event.outcome === "loss") return;
  winQueue = [...winQueue, event];
  notifyWinQueueChanged();
}

export function dismissWinCelebration() {
  if (!winQueue.length) return;
  winQueue = winQueue.slice(1);
  notifyWinQueueChanged();
}

export function WinCelebrationHost() {
  const event = useSyncExternalStore(subscribeToWinQueue, getCurrentWinEvent, () => null);
  const [soundEnabled, setSoundEnabled] = useState(readSoundPreference);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    try {
      window.localStorage.setItem("dark-ace.win-applause-v3", soundEnabled ? "on" : "off");
    } catch {
      // In-memory preference still applies if browser storage is unavailable.
    }
  }, [soundEnabled]);

  useEffect(() => {
    prepareWinCelebrationAudio();
    const unlock = () => unlockWinCelebrationAudio();
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("touchstart", unlock, { capture: true, passive: true });
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);

  useEffect(() => {
    if (!event || event.outcome === "loss" || !soundEnabledRef.current) return;
    playWinCelebrationApplause();
  }, [event?.eventId]);

  useEffect(() => {
    if (!event) return;
    const timer = window.setTimeout(dismissWinCelebration, WIN_CELEBRATION_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [event?.eventId]);

  if (!event) return null;
  const isLoss = event.outcome === "loss";

  return createPortal(<div className={`win-celebration-layer${event.placement === "top" ? " placement-top" : ""}`} aria-hidden="false">
    <section className={`win-celebration-card${isLoss ? " outcome-loss" : ""}`} role="status" aria-live="polite" data-testid="win-celebration">
      <div className="win-celebration-particles" aria-hidden="true">
        {particles.map((particle) => <i className={`win-celebration-particle particle-${particle + 1}`} key={particle} />)}
      </div>
      {!isLoss && <button
        type="button"
        className="win-celebration-control win-celebration-sound"
        onClick={() => {
          if (soundEnabled) {
            stopWinCelebrationApplause();
            setSoundEnabled(false);
            return;
          }
          setSoundEnabled(true);
          playWinCelebrationApplause();
        }}
        aria-label={soundEnabled ? "Выключить аплодисменты при выигрыше" : "Включить аплодисменты при выигрыше"}
        title={soundEnabled ? "Выключить звук выигрыша" : "Включить звук выигрыша"}
        data-testid="button-win-celebration-sound"
      >
        {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
      </button>}
      <button type="button" className="win-celebration-control win-celebration-close" onClick={dismissWinCelebration} aria-label="Закрыть поздравление">
        <X size={12} />
      </button>
      <span className="win-celebration-emblem" aria-hidden="true"><Coins size={16} /></span>
      <b className="win-celebration-heading">{isLoss ? "ВЫ ПРОИГРАЛИ" : "🎉 ПОЗДРАВЛЯЕМ, ВЫ ВЫИГРАЛИ!"}</b>
      <strong className="win-celebration-amount">{isLoss ? "−" : "+"}{numberFormat.format(event.amount)} <small>кредитов</small></strong>
      <span className="win-celebration-caption">{event.caption ?? (isLoss ? "ПОТЕРЯННАЯ СУММА СТАВКИ" : "ОБЩАЯ ВЫПЛАТА С УЧЁТОМ СТАВКИ")}</span>
      <div className="win-celebration-progress" aria-hidden="true"><i /></div>
    </section>
  </div>, document.body);
}

function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem("dark-ace.win-applause-v3") !== "off";
  } catch {
    return true;
  }
}
