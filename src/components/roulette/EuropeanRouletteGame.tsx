import { type CSSProperties, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, History, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import {
  getGetDarkAceBootstrapQueryKey,
  getGetDarkAceTableQueryKey,
  getListDarkAceTableBetsQueryKey,
  getListDarkAceTableResultsQueryKey,
  useCancelDarkAceTableBets,
  useGetDarkAceTable,
  useListDarkAceTableBets,
  useListDarkAceTableResults,
  usePlaceDarkAceTableBet,
} from "@workspace/api-client-react";
import type { DarkAceTableBet, DarkAceTableResult } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { animateStakeChipFlight } from "@/lib/stake-chip-flight";
import { getEuropeanRouletteStopAngles, getEuropeanRouletteTouchTarget, normalizeWheelAngle } from "../../lib/roulette-visuals";
import { getGameCountdownTone } from "../../lib/game-countdown";
import { playGameCountdownTick } from "../../lib/game-countdown-audio";
import { startRouletteBallSound, unlockRouletteBallAudio } from "./roulette-ball-audio";
import { WIN_CELEBRATION_DURATION_MS, type WinCelebrationInput } from "../WinCelebration";
import "../GameCountdown.css";
import "./EuropeanRouletteGame.css";

export interface EuropeanRouletteGameProps {
  balance?: number;
  gameEnabled?: boolean;
  onBalanceChange?: (balance: number) => void;
  onBack?: () => void;
  onWin?: (event: WinCelebrationInput) => void;
}

const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const CHIPS = [5_000, 10_000, 25_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000, 10_000_000];
const MAX_ROUND_STAKE = 250_000_000;
const PAGE_SIZE = 18;
const fmt = new Intl.NumberFormat("ru-RU");
const compactFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const money = (amount: number) => `${fmt.format(amount)} кредитов`;
const compactBalance = (amount: number) => {
  const safeAmount = Math.max(0, Math.floor(amount));
  if (safeAmount >= 1_000_000) {
    const millions = fmt.format(Math.floor(safeAmount / 1_000_000));
    const thousandths = String(Math.floor((safeAmount % 1_000_000) / 1_000)).padStart(3, "0");
    return `${millions}.${thousandths}м`;
  }
  if (safeAmount >= 1_000) return `${fmt.format(Math.floor(safeAmount / 1_000))}к`;
  return fmt.format(safeAmount);
};
const compactStake = (amount: number) => amount >= 1_000_000
  ? `${compactFmt.format(amount / 1_000_000)}М`
  : amount >= 1_000 ? `${compactFmt.format(amount / 1_000)}К` : fmt.format(amount);
const chipTone = (amount: number) => amount >= 1_000_000
  ? "gold"
  : amount >= 250_000
    ? "violet"
    : amount >= 100_000
      ? "blue"
      : amount >= 25_000
        ? "red"
        : "green";
const SOUND_STORAGE_KEY = "dark-ace.european-roulette.ball-sound";

function colorOf(number: number) {
  return number === 0 ? "green" : RED_NUMBERS.has(number) ? "red" : "black";
}

function pointAt(radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return { x: 100 + radius * Math.cos(radians), y: 100 + radius * Math.sin(radians) };
}

function wheelSlice(index: number) {
  const step = 360 / WHEEL_ORDER.length;
  const start = -90 + index * step;
  const end = start + step;
  const outerStart = pointAt(94, start);
  const outerEnd = pointAt(94, end);
  const innerEnd = pointAt(62, end);
  const innerStart = pointAt(62, start);
  const label = pointAt(78, start + step / 2);
  return {
    path: `M ${outerStart.x} ${outerStart.y} A 94 94 0 0 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A 62 62 0 0 0 ${innerStart.x} ${innerStart.y} Z`,
    label,
    angle: start + step / 2,
  };
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось выполнить действие. Попробуйте ещё раз.";
}

function Wheel({
  result,
  personalResult,
  spinning,
  idle,
  angle,
  ballAngle,
  spinDuration,
}: {
  result: number | null;
  personalResult: string | null;
  spinning: boolean;
  idle: boolean;
  angle: number;
  ballAngle: number;
  spinDuration: number;
}) {
  const resultColor = result === null ? null : colorOf(result);
  return (
    <div
      className={`er-wheel-stage${idle ? " is-idle" : ""}${spinning ? " is-spinning" : ""}${result !== null ? " has-result" : ""}`}
      aria-label={result === null || spinning ? "Колесо европейской рулетки" : `Результат европейской рулетки: ${result}, ${resultColor}`}
    >
      <div className="er-wheel-shell">
        <div className="er-wheel-rotor" style={{ transform: `rotate(${angle}deg)`, transitionDuration: `${spinDuration}ms` }}>
          <svg className="er-wheel-art" viewBox="0 0 200 200" role="img" aria-label="Колесо европейской рулетки с числами от нуля до тридцати шести">
            <circle cx="100" cy="100" r="98" className="er-wheel-rim" />
            {WHEEL_ORDER.map((number, index) => {
              const slice = wheelSlice(index);
              return (
                <g key={number}>
                  <path d={slice.path} className={`er-pocket pocket-${colorOf(number)}`} />
                  <text
                    x={slice.label.x}
                    y={slice.label.y}
                    className="er-pocket-number"
                    transform={`rotate(${slice.angle + 90}, ${slice.label.x}, ${slice.label.y})`}
                  >
                    {number}
                  </text>
                </g>
              );
            })}
            <circle cx="100" cy="100" r="61" className="er-wheel-inner-ring" />
            <circle cx="100" cy="100" r="49" className="er-wheel-hub" />
            <circle cx="100" cy="100" r="42" className="er-wheel-hub-line" />
            <text x="100" y="96" className="er-wheel-brand">DARK</text>
            <text x="100" y="111" className="er-wheel-brand er-wheel-brand-small">ACE · EU</text>
            <circle cx="100" cy="100" r="4" className="er-wheel-center" />
          </svg>
        </div>
        {result !== null && !spinning && (
    <div className={`er-wheel-center-result outcome-${resultColor}`} aria-live="polite" data-testid="status-round-result">
            <span>ВЫПАЛО</span>
            <strong>{result}</strong>
            <small className={`er-wheel-outcome outcome-${resultColor}`}>{resultColor === "red" ? "КРАСНОЕ" : resultColor === "black" ? "ЧЁРНОЕ" : "ЗЕРО"}</small>
            {personalResult && <small className="er-wheel-personal-result">{personalResult}</small>}
          </div>
        )}
        <div className="er-ball-orbit" style={{ transform: `rotate(${ballAngle}deg)`, transitionDuration: `${spinDuration}ms` }}>
          <span className="er-ball" />
        </div>
      </div>
      <div className="er-wheel-caption">
        <span>{spinning ? "КОЛЕСО ВРАЩАЕТСЯ" : "ЕВРОПЕЙСКАЯ · ОДИН НОЛЬ"}</span>
      </div>
    </div>
  );
}

function NumberBoard({
  stakes,
  disabled,
  onBet,
}: {
  stakes: Map<string, number>;
  disabled: boolean;
  onBet: (target: string, flightTarget: HTMLElement | { x: number; y: number }) => void;
}) {
  const cell = (target: string, label: string | number, kind: string, testId: string, numberPosition?: number) => {
    const stake = stakes.get(target) ?? 0;
    const positionStyle: CSSProperties | undefined = numberPosition === undefined ? undefined : {
      "--er-desktop-column": String(Math.ceil(numberPosition / 3)),
      "--er-desktop-row": String(3 - ((numberPosition - 1) % 3)),
      "--er-phone-column": String(((numberPosition - 1) % 3) + 1),
      "--er-phone-row": String(Math.ceil(numberPosition / 3)),
    } as CSSProperties;
    return (
      <button
        key={target}
        type="button"
        className={`er-bet-cell${numberPosition === undefined ? "" : " er-number-cell"} ${kind}${stake > 0 ? " has-stake" : ""}`}
        style={positionStyle}
        disabled={disabled}
        onClick={numberPosition === undefined ? (event) => onBet(target, event.currentTarget) : undefined}
        aria-label={`${label}${stake ? `, ставка ${fmt.format(stake)} кредитов` : ""}`}
        data-testid={testId}
        data-number={numberPosition}
      >
        <span>{label}</span>
        {stake > 0 && <small className={`er-bet-chip-label chip-tone-${chipTone(stake)}`}>{compactStake(stake)}</small>}
      </button>
    );
  };

  const handleNumberGridClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const clickedButton = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("button[data-number]")
      : null;
    if (event.detail === 0 && clickedButton) {
      onBet(`straight:${clickedButton.dataset.number}`, clickedButton);
      return;
    }

    const cells = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-number]")]
      .map((button) => ({ button, number: Number(button.dataset.number), rect: button.getBoundingClientRect() }));
    if (!cells.length) return;
    const { clientX, clientY } = event;
    const closest = cells.reduce((best, cell) => {
      const dx = Math.max(cell.rect.left - clientX, 0, clientX - cell.rect.right);
      const dy = Math.max(cell.rect.top - clientY, 0, clientY - cell.rect.bottom);
      const distance = Math.hypot(dx, dy);
      return distance < best.distance ? { cell, distance } : best;
    }, { cell: cells[0]!, distance: Number.POSITIVE_INFINITY });
    if (closest.distance > 14) return;

    const { cell: base } = closest;
    const edgeX = Math.min(Math.abs(clientX - base.rect.left), Math.abs(base.rect.right - clientX))
      <= Math.max(5, Math.min(15, base.rect.width * 0.18));
    const edgeY = Math.min(Math.abs(clientY - base.rect.top), Math.abs(base.rect.bottom - clientY))
      <= Math.max(4, Math.min(9, base.rect.height * 0.22));
    const horizontalDirection = edgeX ? (clientX < (base.rect.left + base.rect.right) / 2 ? -1 : 1) : 0;
    const verticalDirection = edgeY ? (clientY < (base.rect.top + base.rect.bottom) / 2 ? -1 : 1) : 0;

    const findAdjacent = (origin: typeof base, dx: number, dy: number) => {
      if (!dx && !dy) return null;
      const originX = (origin.rect.left + origin.rect.right) / 2;
      const originY = (origin.rect.top + origin.rect.bottom) / 2;
      let nearest: typeof base | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const candidate of cells) {
        if (candidate.number === origin.number) continue;
        const centerX = (candidate.rect.left + candidate.rect.right) / 2;
        const centerY = (candidate.rect.top + candidate.rect.bottom) / 2;
        const deltaX = centerX - originX;
        const deltaY = centerY - originY;
        if (dx && (deltaX * dx <= 0 || Math.abs(deltaY) > Math.max(2, origin.rect.height * 0.3))) continue;
        if (dy && (deltaY * dy <= 0 || Math.abs(deltaX) > Math.max(2, origin.rect.width * 0.3))) continue;
        const axisDistance = dx ? Math.abs(deltaX) : Math.abs(deltaY);
        const edgeGap = dx
          ? axisDistance - (origin.rect.width + candidate.rect.width) / 2
          : axisDistance - (origin.rect.height + candidate.rect.height) / 2;
        if (edgeGap > 14 || axisDistance >= nearestDistance) continue;
        nearest = candidate;
        nearestDistance = axisDistance;
      }
      return nearest;
    };

    if (edgeX && edgeY) {
      const horizontal = findAdjacent(base, horizontalDirection, 0);
      const vertical = findAdjacent(base, 0, verticalDirection);
      const diagonalFromHorizontal = horizontal && findAdjacent(horizontal, 0, verticalDirection);
      const diagonalFromVertical = vertical && findAdjacent(vertical, horizontalDirection, 0);
      if (horizontal && vertical && diagonalFromHorizontal
        && diagonalFromHorizontal.number === diagonalFromVertical?.number) {
        onBet(getEuropeanRouletteTouchTarget(base.number, horizontal.number, vertical.number, diagonalFromHorizontal.number), { x: clientX, y: clientY });
        return;
      }
    }

    if (edgeX || edgeY) {
      const horizontal = edgeX ? findAdjacent(base, horizontalDirection, 0) : null;
      const vertical = edgeY ? findAdjacent(base, 0, verticalDirection) : null;
      if (horizontal || vertical) {
        onBet(getEuropeanRouletteTouchTarget(base.number, horizontal?.number ?? null, vertical?.number ?? null), { x: clientX, y: clientY });
        return;
      }
    }
    onBet(getEuropeanRouletteTouchTarget(base.number), { x: clientX, y: clientY });
  };

  const multiBetMarkers = [...stakes.entries()].flatMap(([target, amount]) => {
    const [kind, values = ""] = target.split(":");
    if (kind !== "split" && kind !== "corner") return [];
    const numbers = values.split(",").map(Number).filter((number) => number >= 1 && number <= 36);
    if (numbers.length !== (kind === "split" ? 2 : 4)) return [];
    const desktopPositions = numbers.map((number) => ({
      column: Math.ceil(number / 3),
      row: 3 - ((number - 1) % 3),
    }));
    const phonePositions = numbers.map((number) => ({
      column: ((number - 1) % 3) + 1,
      row: Math.ceil(number / 3),
    }));
    const style: CSSProperties = {
      "--er-desktop-column": String(Math.min(...desktopPositions.map((position) => position.column))),
      "--er-desktop-column-span": String(Math.max(...desktopPositions.map((position) => position.column)) - Math.min(...desktopPositions.map((position) => position.column)) + 1),
      "--er-desktop-row": String(Math.min(...desktopPositions.map((position) => position.row))),
      "--er-desktop-row-span": String(Math.max(...desktopPositions.map((position) => position.row)) - Math.min(...desktopPositions.map((position) => position.row)) + 1),
      "--er-phone-column": String(Math.min(...phonePositions.map((position) => position.column))),
      "--er-phone-column-span": String(Math.max(...phonePositions.map((position) => position.column)) - Math.min(...phonePositions.map((position) => position.column)) + 1),
      "--er-phone-row": String(Math.min(...phonePositions.map((position) => position.row))),
      "--er-phone-row-span": String(Math.max(...phonePositions.map((position) => position.row)) - Math.min(...phonePositions.map((position) => position.row)) + 1),
    } as CSSProperties;
    return [{ target, amount, style }];
  });

  return (
    <section className="er-board" aria-label="Поле ставок рулетки">
      <div className="er-number-layout">
        {cell("straight:0", "0", "number-green", "bet-number-0")}
        <div
          className="er-number-grid"
          onClick={handleNumberGridClick}
          aria-label="Центр числа — ставка на него, край между числами — на пару, угол — на четыре числа"
        >
          {Array.from({ length: 36 }, (_, index) => {
            const number = index + 1;
            const style = RED_NUMBERS.has(number) ? "number-red" : "number-black";
            return cell(`straight:${number}`, number, style, `bet-number-${number}`, number);
          })}
          {multiBetMarkers.map(({ target, amount, style }) => (
            <div key={target} className={`er-multi-bet-marker chip-tone-${chipTone(amount)}`} style={style} aria-hidden="true">
              <span>{compactStake(amount)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="er-column-bets" aria-label="Ставки на колонку">
        {[1, 2, 3].map((column) => cell(`column:${column}`, `2 к 1 · ${column}`, "column-cell", `bet-column-${column}`))}
      </div>
      <div className="er-dozens" aria-label="Ставки на дюжины">
        {[1, 2, 3].map((dozen) => cell(`dozen:${dozen}`, `${(dozen - 1) * 12 + 1}–${dozen * 12}`, "dozen-cell", `bet-dozen-${dozen}`))}
      </div>
      <div className="er-outside-bets" aria-label="Ставки на внешние исходы">
        {cell("range:low", "1–18", "outside-cell", "bet-low")}
        {cell("parity:even", "ЧЁТ", "outside-cell", "bet-even")}
        {cell("color:red", "КРАСНОЕ", "outside-red", "bet-red")}
        {cell("color:black", "ЧЁРНОЕ", "outside-black", "bet-black")}
        {cell("parity:odd", "НЕЧЁТ", "outside-cell", "bet-odd")}
        {cell("range:high", "19–36", "outside-cell", "bet-high")}
      </div>
    </section>
  );
}

export default function EuropeanRouletteGame({ balance, gameEnabled = true, onBalanceChange, onBack, onWin }: EuropeanRouletteGameProps) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [chip, setChip] = useState(CHIPS[1]);
  const [clock, setClock] = useState(Date.now());
  const [wheelAngle, setWheelAngle] = useState(0);
  const [ballAngle, setBallAngle] = useState(0);
  const [optimisticStakes, setOptimisticStakes] = useState<Map<string, number>>(() => new Map());
  const [pendingBetRequests, setPendingBetRequests] = useState(0);
  const [betErrorMessage, setBetErrorMessage] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<"results" | "bets">("results");
  const [historyOffset, setHistoryOffset] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(SOUND_STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const animatedRound = useRef<number | null>(null);
  const stopBallSound = useRef<(() => void) | null>(null);
  const optimisticStakesRef = useRef<Map<string, number>>(new Map());
  const optimisticRoundRef = useRef<number | null>(null);
  const tableRefreshTimer = useRef<number | null>(null);
  const table = useGetDarkAceTable({
    query: {
      queryKey: getGetDarkAceTableQueryKey(),
      refetchInterval: (query) => query.state.data?.round?.status === "spinning" ? 650 : 1_400,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  });
  const placeBet = usePlaceDarkAceTableBet();
  const cancelBets = useCancelDarkAceTableBets();
  const historyParams = { offset: historyOffset, limit: PAGE_SIZE };
  const resultsHistory = useListDarkAceTableResults(historyParams, {
    query: { queryKey: getListDarkAceTableResultsQueryKey(historyParams), enabled: historyOpen && historyTab === "results" },
  });
  const betsHistory = useListDarkAceTableBets(historyParams, {
    query: { queryKey: getListDarkAceTableBetsQueryKey(historyParams), enabled: historyOpen && historyTab === "bets" },
  });
  const playerBetSummaries = useMemo(() => summarizePlayerBets(betsHistory.data?.bets ?? []), [betsHistory.data?.bets]);
  const snapshot = table.data;
  const round = snapshot?.round;
  const spinning = round?.status === "spinning";
  const resultAge = round?.completedAt ? clock - Date.parse(round.completedAt) : -1;
  const resultVisible = round?.status === "completed" && resultAge >= 0 && resultAge < 3_000;
  const closed = !round || round.status !== "open";
  const serverStakesByTarget = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const bet of snapshot?.myCurrentBets ?? []) grouped.set(bet.target, (grouped.get(bet.target) ?? 0) + bet.totalAmount);
    return grouped;
  }, [snapshot?.myCurrentBets]);
  const stakesByTarget = useMemo(() => {
    const grouped = new Map(serverStakesByTarget);
    for (const [target, amount] of optimisticStakes) {
      grouped.set(target, Math.max(grouped.get(target) ?? 0, amount));
    }
    return grouped;
  }, [serverStakesByTarget, optimisticStakes]);
  const myStake = useMemo(
    () => [...stakesByTarget.values()].reduce((total, amount) => total + amount, 0),
    [stakesByTarget],
  );
  const activeBalance = balance ?? undefined;
  const remaining = round?.bettingClosesAt ? Math.max(0, Math.ceil((Date.parse(round.bettingClosesAt) - clock) / 1000)) : 0;
  const displaySpinning = spinning || round?.status === "completed";
  const latestPersonal = snapshot?.myRecentResult;
  const notifiedPersonalRound = useRef<number | null>(null);
  const wheelSpinDuration = spinning && round?.spinEndsAt
    ? Math.max(80, Date.parse(round.spinEndsAt) - clock)
    : 0;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (round?.status === "open") {
      playGameCountdownTick(`european-roulette:${round.roundNumber}`, remaining);
    }
  }, [round?.status, round?.roundNumber, remaining]);

  useEffect(() => () => {
    if (tableRefreshTimer.current !== null) window.clearTimeout(tableRefreshTimer.current);
  }, []);

  useEffect(() => {
    const currentRound = round?.roundNumber ?? null;
    if (optimisticRoundRef.current !== currentRound) {
      optimisticRoundRef.current = currentRound;
      optimisticStakesRef.current = new Map();
      setOptimisticStakes(new Map());
      return;
    }

    const next = new Map(optimisticStakesRef.current);
    let changed = false;
    for (const [target, expectedTotal] of next) {
      if ((serverStakesByTarget.get(target) ?? 0) >= expectedTotal) {
        next.delete(target);
        changed = true;
      }
    }
    if (changed) {
      optimisticStakesRef.current = next;
      setOptimisticStakes(next);
    }
  }, [round?.roundNumber, serverStakesByTarget]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? "on" : "off");
    } catch {
      // Sound still works for this session when storage is unavailable.
    }
  }, [soundEnabled]);

  useEffect(() => {
    stopBallSound.current?.();
    stopBallSound.current = null;
    if (!spinning || !soundEnabled || !round?.spinStartedAt || !round.spinEndsAt) return;
    const spinStartedAt = Date.parse(round.spinStartedAt);
    const spinEndsAt = Date.parse(round.spinEndsAt);
    if (!Number.isFinite(spinStartedAt) || !Number.isFinite(spinEndsAt)) return;
    stopBallSound.current = startRouletteBallSound(spinEndsAt - spinStartedAt, clock - spinStartedAt);
    return () => {
      stopBallSound.current?.();
      stopBallSound.current = null;
    };
  }, [spinning, round?.roundNumber, round?.spinStartedAt, round?.spinEndsAt, soundEnabled]);

  useEffect(() => {
    if (!snapshot?.serverNow) return;
    const drift = Date.parse(snapshot.serverNow) - Date.now();
    setClock(Date.now() + drift);
  }, [snapshot?.serverNow]);

  useEffect(() => {
    if (!latestPersonal || latestPersonal.stake <= 0 || latestPersonal.profit === 0 || !onWin) return;
    const announce = () => onWin({
      eventId: `roulette:${latestPersonal.roundNumber}`,
      outcome: latestPersonal.profit > 0 ? "win" : "loss",
      amount: latestPersonal.profit > 0 ? latestPersonal.payout : Math.abs(latestPersonal.profit),
    });
    if (notifiedPersonalRound.current === null) {
      notifiedPersonalRound.current = latestPersonal.roundNumber;
      const ageMs = snapshot?.serverNow
        ? Date.parse(snapshot.serverNow) - Date.parse(latestPersonal.completedAt)
        : Number.POSITIVE_INFINITY;
      if (ageMs >= -1_000 && ageMs <= WIN_CELEBRATION_DURATION_MS) announce();
      return;
    }
    if (notifiedPersonalRound.current === latestPersonal.roundNumber) return;
    notifiedPersonalRound.current = latestPersonal.roundNumber;
    announce();
  }, [latestPersonal?.roundNumber, latestPersonal?.stake, latestPersonal?.payout, latestPersonal?.profit, latestPersonal?.completedAt, snapshot?.serverNow, onWin]);

  useEffect(() => {
    if (!round || round.status === "open" || round.resultNumber === null || round.resultNumber === undefined) {
      if (round?.status === "open") animatedRound.current = null;
      return;
    }
    if (animatedRound.current === round.roundNumber) return;
    animatedRound.current = round.roundNumber;
    const resultIndex = WHEEL_ORDER.indexOf(round.resultNumber);
    if (resultIndex < 0) return;
    const target = getEuropeanRouletteStopAngles(resultIndex, round.roundNumber, WHEEL_ORDER.length);
    if (round.status === "completed") {
      setWheelAngle(target.wheelAngle);
      setBallAngle(target.ballAngle);
      return;
    }
    const start = wheelAngle % 360;
    const delta = normalizeWheelAngle(target.wheelAngle - normalizeWheelAngle(start));
    setWheelAngle((previous) => previous + 5 * 360 + delta);
    setBallAngle((previous) => {
      const reverseDelta = normalizeWheelAngle(normalizeWheelAngle(previous) - target.ballAngle);
      return previous - 6 * 360 - reverseDelta;
    });
  }, [round?.roundNumber, round?.status, round?.resultNumber, round?.spinEndsAt, clock]);

  useEffect(() => {
    if (round?.status !== "completed" || !round.completedAt) return;
    const remainingHold = Math.max(0, 4_000 - (clock - Date.parse(round.completedAt)));
    if (!remainingHold) return;
    const timer = window.setTimeout(() => void table.refetch(), remainingHold);
    return () => window.clearTimeout(timer);
  }, [round?.status, round?.completedAt, clock]);

  useEffect(() => {
    setHistoryOffset(0);
  }, [historyTab]);

  const invalidateGame = () => {
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceTableQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListDarkAceTableBetsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListDarkAceTableResultsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
  };

  const updateOptimisticStake = (target: string, amount: number | null) => {
    const next = new Map(optimisticStakesRef.current);
    if (amount === null) next.delete(target);
    else next.set(target, amount);
    optimisticStakesRef.current = next;
    setOptimisticStakes(next);
  };

  const scheduleTableRefresh = () => {
    if (tableRefreshTimer.current !== null) window.clearTimeout(tableRefreshTimer.current);
    tableRefreshTimer.current = window.setTimeout(() => {
      tableRefreshTimer.current = null;
      void queryClient.invalidateQueries({ queryKey: getGetDarkAceTableQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
    }, 120);
  };

  const submitBet = (target: string, flightTarget: HTMLElement | { x: number; y: number }) => {
    const amount = chip;
    const effectiveStakeTotal = new Set([
      ...serverStakesByTarget.keys(),
      ...optimisticStakesRef.current.keys(),
    ]);
    const currentTotal = [...effectiveStakeTotal].reduce(
      (total, stakeTarget) => total + Math.max(
        serverStakesByTarget.get(stakeTarget) ?? 0,
        optimisticStakesRef.current.get(stakeTarget) ?? 0,
      ),
      0,
    );
    const serverTargetStake = serverStakesByTarget.get(target) ?? 0;
    const currentTargetStake = Math.max(serverTargetStake, optimisticStakesRef.current.get(target) ?? 0);
    if (!gameEnabled || closed || currentTotal + amount > MAX_ROUND_STAKE || (activeBalance !== undefined && amount > activeBalance) || !Number.isSafeInteger(amount) || amount < 100 || amount % 100 !== 0) return;
    animateStakeChipFlight(flightTarget);
    if (soundEnabled) unlockRouletteBallAudio();
    const key = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-roulette`;
    setBetErrorMessage("");
    updateOptimisticStake(target, currentTargetStake + amount);
    setPendingBetRequests((pending) => pending + 1);
    void placeBet.mutateAsync({ data: { target, amount, idempotencyKey: key } })
      .then(() => {
        scheduleTableRefresh();
      })
      .catch((error: unknown) => {
        setBetErrorMessage(errorText(error));
        const currentFloor = optimisticStakesRef.current.get(target) ?? serverTargetStake;
        const nextFloor = Math.max(serverStakesByTarget.get(target) ?? 0, currentFloor - amount);
        updateOptimisticStake(target, nextFloor > (serverStakesByTarget.get(target) ?? 0) ? nextFloor : null);
        scheduleTableRefresh();
      })
      .finally(() => {
        setPendingBetRequests((pending) => Math.max(0, pending - 1));
      });
  };
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) unlockRouletteBallAudio();
    else {
      stopBallSound.current?.();
      stopBallSound.current = null;
    }
  };
  const cancelAll = () => {
    if (closed || cancelBets.isPending || pendingBetRequests > 0 || myStake <= 0) return;
    cancelBets.mutate(undefined, {
      onSuccess: (response) => {
        onBalanceChange?.(response.balance);
        optimisticStakesRef.current = new Map();
        setOptimisticStakes(new Map());
        invalidateGame();
      },
    });
  };
  const goBack = () => onBack ? onBack() : setLocation("/");
  const feedbackError = betErrorMessage || (cancelBets.isError ? errorText(cancelBets.error) : "");
  const feedbackMessage = feedbackError
    || (pendingBetRequests > 0 ? `Принимается ставок: ${pendingBetRequests}` : "")
    || (myStake >= MAX_ROUND_STAKE ? "Достигнут лимит ставок на раунд." : "");

  if (table.isLoading && !snapshot) {
    return <main className="er-game er-loading" aria-label="Загрузка рулетки">
      <div className="er-skeleton er-skeleton-header" />
      <div className="er-skeleton er-skeleton-wheel" />
      <div className="er-skeleton er-skeleton-board" />
      <div className="er-skeleton er-skeleton-controls" />
    </main>;
  }
  if (table.isError && !snapshot) {
    return <main className="er-game er-state-card" role="alert">
      <span className="er-kicker">ПОДКЛЮЧЕНИЕ К СТОЛУ</span>
      <h1>Рулетка временно недоступна</h1>
      <p>{errorText(table.error)}</p>
      <button type="button" className="er-primary-action" onClick={() => void table.refetch()} data-testid="button-retry-table">Повторить</button>
    </main>;
  }

  return (
    <main className={`er-game${displaySpinning ? " round-spinning" : ""}`} data-testid="european-roulette-game">
      <header className="er-header">
        <button type="button" className="er-back" onClick={goBack} aria-label="Назад" data-testid="button-roulette-back"><ArrowLeft size={18} /></button>
        <div className="er-title">
          <h1 className="sr-only">Рулетка</h1>
        </div>
      </header>

      <section className="er-table-top">
        <div className="er-round-state" data-testid="status-round">
          <span className={`er-live-dot${spinning ? " is-moving" : ""}`} />
          <div>
            <b>{spinning ? "РАУНД КРУТИТСЯ" : round?.status === "completed" ? "РАУНД ЗАВЕРШЁН" : !gameEnabled ? "ИГРА ОТКЛЮЧЕНА" : "ПРИЁМ СТАВОК"}</b>
            <small>{round ? `РАУНД ${fmt.format(round.roundNumber)}` : "Ожидание нового раунда"}</small>
          </div>
        </div>
        <button
          type="button"
          className={`er-sound-toggle${soundEnabled ? "" : " is-muted"}`}
          onClick={toggleSound}
          aria-label={soundEnabled ? "Отключить звук шарика" : "Включить звук шарика"}
          aria-pressed={soundEnabled}
          data-testid="button-roulette-sound"
        >
          {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
        <div className="er-round-info">
          <div className="er-round-meta">
            {round?.status === "open" && <span className={`er-countdown game-countdown-timer ${getGameCountdownTone(remaining)}`}><Clock3 size={13} /> {remaining}s</span>}
            <span>{fmt.format(snapshot?.roundBetCount ?? 0)} ставок · {money(snapshot?.roundTotalStake ?? 0)}</span>
          </div>
        </div>
      </section>

      <section className="er-play-area">
        <div className="er-wheel-column">
          <Wheel
            result={resultVisible ? round?.resultNumber ?? null : null}
            personalResult={resultVisible && latestPersonal && latestPersonal.roundNumber === round?.roundNumber && latestPersonal.stake > 0
              ? latestPersonal.profit > 0 ? `+${compactStake(latestPersonal.payout)} кредитов` : `−${compactStake(Math.abs(latestPersonal.profit))} кредитов`
              : null}
            spinning={spinning}
            idle={round?.status === "open"}
            angle={wheelAngle}
            ballAngle={ballAngle}
            spinDuration={wheelSpinDuration}
          />
        </div>

        <div className="er-board-column">
          <NumberBoard stakes={stakesByTarget} disabled={!gameEnabled || closed || myStake + chip > MAX_ROUND_STAKE || (activeBalance !== undefined && chip > activeBalance)} onBet={submitBet} />
          <div className="er-controls">
            <div className="er-chip-picker" aria-label="Выбрать размер фишки" data-stake-chip-source data-stake-chip-amount={fmt.format(chip)}>
              <span className="er-chip-label">ФИШКА</span>
              {CHIPS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className={`er-chip${chip === amount ? " selected" : ""}`}
                  onClick={() => setChip(amount)}
                  disabled={displaySpinning || !gameEnabled}
                  aria-pressed={chip === amount}
                  data-testid={`button-chip-${amount}`}
                >
                  {amount >= 1_000_000 ? `${fmt.format(amount / 1_000_000)} М` : `${fmt.format(amount / 1_000)} К`}
                </button>
              ))}
              <span className="er-inside-bet-guide" aria-label="В центре клетки — одно число, на краю — два числа, в углу — четыре">
                1 · ЦЕНТР<br />2 · КРАЙ<br />4 · УГОЛ
              </span>
            </div>
            <div className="er-actions">
              <div className="er-total-stake">
                <small>ВАША СТАВКА</small>
                <strong>{money(myStake)}</strong>
              </div>
              <button type="button" className="er-cancel-action" onClick={cancelAll} disabled={closed || myStake <= 0 || cancelBets.isPending || pendingBetRequests > 0} data-testid="button-cancel-bets">
                <RotateCcw size={14} /> {cancelBets.isPending ? "Возврат…" : "Отменить ставки"}
              </button>
              <button type="button" className="er-history-action" onClick={() => setHistoryOpen(true)} data-testid="button-open-history" aria-label="Открыть историю рулетки">
                <History size={15} /><span>История</span>
              </button>
            </div>
          </div>
          <div
            className={`er-bet-feedback${feedbackError ? " is-error" : ""}`}
            role={feedbackError ? "alert" : "status"}
            aria-live="polite"
            data-testid={feedbackError ? "status-bet-error" : "status-bet-feedback"}
            title={feedbackMessage || undefined}
          >
            {feedbackMessage || "\u00a0"}
          </div>
        </div>
      </section>

      {round?.status === "open" && (snapshot?.recentWinners?.length ?? 0) > 0 && (
        <section className="er-recent-winners" aria-label="Семь крупнейших выплат прошлого раунда" data-testid="roulette-recent-winners">
          <span className="er-kicker">ТОП-7 ПРОШЛОГО РАУНДА</span>
          <div className="er-recent-winners-grid">
            {snapshot?.recentWinners?.slice(0, 7).map((winner, index) => (
              <div className="er-recent-winner" key={`${winner.username ?? winner.displayName}-${index}`} title={`${winner.displayName}: выплата ${money(winner.payout)}`}>
                <i>{index + 1}</i>
                <b>{winner.username ? `@${winner.username}` : winner.displayName}</b>
                <strong>+{compactStake(winner.payout)}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="er-footer">
        <div className="er-recent">
          <span className="er-kicker">ПОСЛЕДНИЕ РЕЗУЛЬТАТЫ</span>
          <div className="er-result-strip" aria-label="Последние результаты рулетки">
            {(snapshot?.recentResults ?? [])
              .filter((item) => !resultVisible || item.roundNumber !== round?.roundNumber)
              .slice(0, 9)
              .map((item) => <ResultPill key={`${item.roundNumber}-${item.resultNumber}`} result={item} />)}
            {!snapshot?.recentResults?.length && <span className="er-no-results">Завершённых раундов пока нет</span>}
          </div>
        </div>
        <div className="er-rules">37 секторов · выплата на число — 35:1</div>
      </footer>

      {historyOpen && (
        <div className="er-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryOpen(false); }}>
          <section className="er-history-modal" role="dialog" aria-modal="true" aria-labelledby="er-history-heading" data-testid="dialog-roulette-history">
            <header className="er-history-header">
              <div><span className="er-kicker">ИСТОРИЯ СТОЛА</span><h2 id="er-history-heading">История рулетки</h2></div>
              <button type="button" className="er-close" onClick={() => setHistoryOpen(false)} aria-label="Закрыть историю"><X size={18} /></button>
            </header>
            <div className="er-history-tabs" role="tablist" aria-label="Тип истории">
              <button type="button" role="tab" aria-selected={historyTab === "results"} onClick={() => setHistoryTab("results")} data-testid="tab-history-results">Результаты</button>
              <button type="button" role="tab" aria-selected={historyTab === "bets"} onClick={() => setHistoryTab("bets")} data-testid="tab-history-bets">Ставки</button>
            </div>
            <div className="er-history-content" role="tabpanel">
              {historyTab === "results" ? (
                resultsHistory.isLoading ? <HistorySkeleton /> : resultsHistory.isError
                  ? <HistoryError message={errorText(resultsHistory.error)} retry={() => void resultsHistory.refetch()} />
                  : (resultsHistory.data?.results.length ?? 0) === 0 ? <div className="er-empty-history">Результатов пока нет.</div>
                    : <div className="er-history-list">{resultsHistory.data?.results.map((item) => (
                      <div className="er-history-row" key={`${item.roundNumber}-${item.resultNumber}`}>
                        <ResultPill result={item} />
                        <b>Раунд {fmt.format(item.roundNumber)}</b>
                        <span>{item.noBets ? "Без ставок" : `${fmt.format(item.betCount)} ставок`}</span>
                        <time>{new Date(item.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                      </div>
                    ))}</div>
              ) : (
                betsHistory.isLoading ? <HistorySkeleton /> : betsHistory.isError
                  ? <HistoryError message={errorText(betsHistory.error)} retry={() => void betsHistory.refetch()} />
                  : playerBetSummaries.length === 0 ? <div className="er-empty-history">Завершённых ставок пока нет.</div>
                    : <div className="er-history-list">{playerBetSummaries.map((summary) => <BetPlayerSummaryRow key={summary.key} summary={summary} />)}</div>
              )}
            </div>
            <div className="er-history-pagination">
              <span>{historyTab === "results" ? `${resultsHistory.data?.total ?? 0} результатов` : `${playerBetSummaries.length} игроков`}</span>
              <div>
                <button type="button" disabled={historyOffset === 0} onClick={() => setHistoryOffset(Math.max(0, historyOffset - PAGE_SIZE))} aria-label="Предыдущая страница"><ChevronLeft size={16} /></button>
                <button
                  type="button"
                  disabled={historyTab === "results" ? !resultsHistory.data?.hasMore : !betsHistory.data?.hasMore}
                  onClick={() => setHistoryOffset(historyOffset + PAGE_SIZE)}
                  aria-label="Следующая страница"
                ><ChevronRight size={16} /></button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function ResultPill({ result }: { result: Pick<DarkAceTableResult, "resultNumber"> }) {
  const number = result.resultNumber;
  return <span className={`er-result-pill result-${colorOf(number)}`} aria-label={`Результат ${number}`}>{number}</span>;
}

type PlayerBetSummary = {
  key: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  roundNumber: number;
  resultNumber: number;
  betCount: number;
  netProfit: number;
};

function summarizePlayerBets(bets: DarkAceTableBet[]): PlayerBetSummary[] {
  const summaries = new Map<string, PlayerBetSummary>();
  for (const bet of bets) {
    if (bet.profit === null || bet.resultNumber === null) continue;
    const username = bet.username?.trim() || null;
    const playerKey = username
      ? `username:${username.toLocaleLowerCase()}`
      : `name:${bet.displayName.trim().toLocaleLowerCase()}:${bet.avatarUrl ?? ""}`;
    const key = `${bet.roundNumber}:${playerKey}`;
    const summary = summaries.get(key) ?? {
      key,
      displayName: bet.displayName,
      username: bet.username,
      avatarUrl: bet.avatarUrl,
      roundNumber: bet.roundNumber,
      resultNumber: bet.resultNumber,
      betCount: 0,
      netProfit: 0,
    };
    summary.betCount += 1;
    summary.netProfit += bet.profit;
    summaries.set(key, summary);
  }
  return [...summaries.values()];
}

function BetPlayerSummaryRow({ summary }: { summary: PlayerBetSummary }) {
  const profitText = summary.netProfit > 0
    ? `+${compactStake(summary.netProfit)}`
    : summary.netProfit < 0
      ? `−${compactStake(Math.abs(summary.netProfit))}`
      : "0";
  const profitTone = summary.netProfit > 0 ? "positive" : summary.netProfit < 0 ? "negative" : "neutral";
  const resultColor = colorOf(summary.resultNumber);
  const playerName = summary.username ? `@${summary.username.replace(/^@/, "")}` : summary.displayName;
  return (
    <div className="er-history-row er-player-history-row">
      <HistoryAvatar name={summary.displayName} avatarUrl={summary.avatarUrl} />
      <div className="er-player-history-identity" title={summary.displayName}>
        <b>{playerName}</b>
        <small>Раунд {fmt.format(summary.roundNumber)}</small>
      </div>
      <div className="er-player-history-result" title={`Выпало ${summary.resultNumber}, ${resultColor}`}>
        <ResultPill result={{ resultNumber: summary.resultNumber }} />
        <small className={`er-player-result-color result-${resultColor}`}>
          {resultColor === "red" ? "красное" : resultColor === "black" ? "чёрное" : "зелёное"}
        </small>
      </div>
      <span className="er-player-bet-count">{summary.betCount} {pluralizeBets(summary.betCount)}</span>
      <strong className={`er-player-net-${profitTone}`}>{profitText}</strong>
    </div>
  );
}

function HistoryAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <span className="er-history-avatar" aria-hidden="true">
      {avatarUrl && !imageFailed
        ? <img src={avatarUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} />
        : name.trim().slice(0, 1).toLocaleUpperCase() || "?"}
    </span>
  );
}

function pluralizeBets(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return "ставок";
  if (lastDigit === 1) return "ставка";
  if (lastDigit >= 2 && lastDigit <= 4) return "ставки";
  return "ставок";
}

function HistorySkeleton() {
  return <div className="er-history-skeleton" aria-label="Загрузка истории">{Array.from({ length: 5 }, (_, index) => <i key={index} />)}</div>;
}

function HistoryError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="er-history-error" role="alert"><span>{message}</span><button type="button" onClick={retry}>Повторить</button></div>;
}
