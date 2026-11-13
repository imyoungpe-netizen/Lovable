import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, LockKeyhole, Plane, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react";
import {
  getGetDarkAceBootstrapQueryKey,
  getGetDarkAceCrashQueryKey,
  useCashoutDarkAceCrashBet,
  useGetDarkAceCrash,
  usePlaceDarkAceCrashBet,
} from "@workspace/api-client-react";
import type { DarkAceCrashSnapshot } from "@workspace/api-client-react";
import { MAX_GAME_STAKE } from "@/lib/game-limits";
import { getStakeChipAmount, getStakeChipOptions, StakeChipPicker, type StakeChipKey } from "@/components/StakeChipPicker";
import type { WinCelebrationInput } from "@/components/WinCelebration";
import { getGameCountdownTone } from "@/lib/game-countdown";
import { playGameCountdownTick } from "@/lib/game-countdown-audio";
import "../GameCountdown.css";
import "./CrashGamePage.css";

type Props = { sessionReady: boolean; liveConnected: boolean; gameEnabled: boolean; balance?: number; onWin: (event: WinCelebrationInput) => void };
const numberFormat = new Intl.NumberFormat("ru-RU");
const credits = (value: number) => `${numberFormat.format(value)} кредитов`;
const compactCredits = (value: number) => {
  const unit = value >= 1_000_000 ? 1_000_000 : value >= 1_000 ? 1_000 : 1;
  const suffix = unit === 1_000_000 ? "м" : unit === 1_000 ? "к" : "";
  const amount = value / unit;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(amount)}${suffix}`;
};
const multiplier = (hundredths: number) => `×${(hundredths / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const idKey = () => typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
const resultDisplayMs = 4_000;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (!/^[\da-f]{64}$/i.test(hex)) throw new Error("Некорректный seed.");
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyCrashResult(result: DarkAceCrashSnapshot["recentResults"][number]): Promise<boolean> {
  if (!result.serverSeedReveal) throw new Error("Дневной seed ещё не раскрыт.");
  if (!globalThis.crypto?.subtle) throw new Error("Проверка недоступна в этом браузере.");
  const seedBytes = hexToBytes(result.serverSeedReveal);
  const commitment = bytesToHex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", seedBytes)));
  const hmacKey = await globalThis.crypto.subtle.importKey(
    "raw",
    seedBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const hmac = new Uint8Array(await globalThis.crypto.subtle.sign(
    "HMAC",
    hmacKey,
    new TextEncoder().encode(result.clientSeed),
  ));
  const sample = BigInt(`0x${bytesToHex(hmac).slice(0, 13)}`);
  const range = 1n << 52n;
  const calculated = Math.max(
    100,
    Math.min(100_000_000, Number((BigInt(10_000 - result.houseEdgeBps) * range) / (100n * (range - sample)))),
  );
  return commitment === result.serverSeedHash && calculated === result.crashMultiplierHundredths;
}

function errorText(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as {
      message?: unknown;
      data?: { message?: unknown; error?: unknown };
      error?: { message?: unknown };
    };
    if (typeof value.data?.error === "string") return value.data.error;
    if (typeof value.data?.message === "string") return value.data.message;
    if (typeof value.error?.message === "string") return value.error.message;
    if (typeof value.message === "string") return value.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Не удалось выполнить действие. Попробуйте ещё раз.";
}

type CrashRound = NonNullable<DarkAceCrashSnapshot["round"]>;
type CrashBet = NonNullable<DarkAceCrashSnapshot["myBet"]>;

function updateSnapshotWithMyBet(
  snapshot: DarkAceCrashSnapshot,
  bet: CrashBet,
  balance: number,
): DarkAceCrashSnapshot {
  const currentBets = snapshot.currentBets.filter((item) => item.betId !== bet.betId);
  currentBets.push(bet);
  currentBets.sort((first, second) => second.amount - first.amount || Date.parse(first.createdAt) - Date.parse(second.createdAt));
  const myBets = [...snapshot.myBets.filter((item) => item.slot !== bet.slot), bet]
    .sort((first, second) => first.slot - second.slot);
  return { ...snapshot, myBet: myBets[0] ?? null, myBets, balance, currentBets };
}

function liveCrashMultiplier(round: CrashRound, serverOffset: number, now: number) {
  if (round.status !== "flying" || !round.flightStartedAt) return round.currentMultiplierHundredths;
  const elapsedSeconds = Math.max(0, (now + serverOffset - Date.parse(round.flightStartedAt)) / 1_000);
  const local = Math.floor(100 * Math.exp((round.growthRateBpsPerSecond / 10_000) * elapsedSeconds));
  return Math.min(100_000_000, Math.max(round.currentMultiplierHundredths, local));
}

function useChartCrashMultiplier(round: CrashRound | null | undefined, serverOffset: number) {
  const [sample, setSample] = useState<number | null>(null);
  const roundRef = useRef(round);
  const offsetRef = useRef(serverOffset);
  roundRef.current = round;
  offsetRef.current = serverOffset;
  useEffect(() => {
    if (!round || round.status !== "flying" || !round.flightStartedAt) {
      setSample(null);
      return;
    }
    const update = () => {
      const currentRound = roundRef.current;
      if (!currentRound || currentRound.status !== "flying") return;
      const value = liveCrashMultiplier(currentRound, offsetRef.current, Date.now());
      setSample((current) => current === value ? current : value);
    };
    update();
    const timer = window.setInterval(update, 33);
    return () => window.clearInterval(timer);
  }, [round?.roundNumber, round?.status, round?.flightStartedAt, round?.growthRateBpsPerSecond]);

  return round?.status === "flying"
    ? sample ?? liveCrashMultiplier(round, serverOffset, Date.now())
    : null;
}

function CrashMultiplierReadout({ round, serverOffset, fallback, testId }: {
  round: CrashRound | null | undefined;
  serverOffset: number;
  fallback: string;
  testId: string;
}) {
  const valueRef = useRef<HTMLElement | null>(null);
  const offsetRef = useRef(serverOffset);
  offsetRef.current = serverOffset;
  useEffect(() => {
    const node = valueRef.current;
    if (!node || !round || round.status !== "flying" || !round.flightStartedAt) {
      if (node) node.textContent = fallback;
      return;
    }

    let lastText = "";
    let lastMultiplier = Math.max(100, round.currentMultiplierHundredths);
    let frame = 0;
    const update = () => {
      const value = Math.max(lastMultiplier, liveCrashMultiplier(round, offsetRef.current, Date.now()));
      lastMultiplier = value;
      const text = multiplier(value);
      if (text !== lastText) {
        node.textContent = text;
        lastText = text;
      }
      frame = window.requestAnimationFrame(update);
    };
    update();
    return () => window.cancelAnimationFrame(frame);
  }, [round?.roundNumber, round?.status, round?.flightStartedAt, round?.growthRateBpsPerSecond, fallback]);

  return <b ref={(node) => { valueRef.current = node; }} data-testid={testId}>{fallback}</b>;
}

function CrashPotentialPayout({ amount, round, serverOffset, testId, className }: {
  amount: number;
  round: CrashRound | null | undefined;
  serverOffset: number;
  testId: string;
  className?: string;
}) {
  const valueRef = useRef<HTMLElement | null>(null);
  const roundRef = useRef(round);
  const offsetRef = useRef(serverOffset);
  roundRef.current = round;
  offsetRef.current = serverOffset;

  useEffect(() => {
    const node = valueRef.current;
    if (!node) return;
    let lastMultiplier = 100;
    let frame = 0;
    const update = () => {
      const currentRound = roundRef.current;
      const multiplierHundredths = currentRound
        ? liveCrashMultiplier(currentRound, offsetRef.current, Date.now())
        : 100;
      lastMultiplier = Math.max(lastMultiplier, multiplierHundredths);
      const text = credits(Math.floor(amount * lastMultiplier / 100));
      if (node.textContent !== text) node.textContent = text;
      if (currentRound?.status === "flying") frame = window.requestAnimationFrame(update);
    };
    update();
    return () => window.cancelAnimationFrame(frame);
  }, [amount, round?.roundNumber, round?.status, round?.flightStartedAt, round?.growthRateBpsPerSecond]);

  const initialMultiplier = round ? Math.max(100, round.currentMultiplierHundredths) : 100;
  return <b ref={(node) => { valueRef.current = node; }} className={className} data-testid={testId}>
    {credits(Math.floor(amount * initialMultiplier / 100))}
  </b>;
}

function CrashCountdownReadout({ roundNumber, bettingClosesAt, serverOffset }: {
  roundNumber: number;
  bettingClosesAt: string;
  serverOffset: number;
}) {
  const valueRef = useRef<HTMLElement | null>(null);
  const offsetRef = useRef(serverOffset);
  offsetRef.current = serverOffset;
  const getSecondsLeft = () => Math.max(0, Math.ceil((Date.parse(bettingClosesAt) - (Date.now() + offsetRef.current)) / 1_000));
  useEffect(() => {
    const node = valueRef.current;
    if (!node) return;
    let lastText = "";
    let lastTone = "";
    let lastCountdownTick = -1;
    let frame = 0;
    const update = () => {
      const secondsLeft = getSecondsLeft();
      if (secondsLeft !== lastCountdownTick) {
        lastCountdownTick = secondsLeft;
        playGameCountdownTick(`crash:${roundNumber}`, secondsLeft);
      }
      const tone = getGameCountdownTone(secondsLeft);
      if (tone !== lastTone) {
        node.className = `crash-countdown-value game-countdown-timer ${tone}`;
        lastTone = tone;
      }
      const text = `${String(secondsLeft).padStart(2, "0")}с`;
      if (text !== lastText) {
        node.textContent = text;
        lastText = text;
      }
      if (secondsLeft > 0) frame = window.requestAnimationFrame(update);
    };
    update();
    return () => window.cancelAnimationFrame(frame);
  }, [roundNumber, bettingClosesAt]);

  return <b ref={(node) => { valueRef.current = node; }} className={`crash-countdown-value game-countdown-timer ${getGameCountdownTone(getSecondsLeft())}`} data-testid="crash-countdown">
    {String(getSecondsLeft()).padStart(2, "0")}с
  </b>;
}

const CrashChart = memo(function CrashChart({ snapshot, serverOffset }: {
  snapshot: DarkAceCrashSnapshot;
  serverOffset: number;
}) {
  const round = snapshot.round;
  const flying = round?.status === "flying";
  const latestResult = snapshot.recentResults[0] ?? null;
  const resultRound = round?.status === "crashed"
    ? round
    : round?.status === "open" && latestResult?.roundNumber === round.roundNumber - 1
      ? latestResult
      : null;
  const [resultNow, setResultNow] = useState(() => Date.now());
  const liveMultiplier = useChartCrashMultiplier(round, serverOffset);
  useEffect(() => {
    if (!resultRound?.completedAt) return;
    const now = Date.now();
    setResultNow(now);
    const resultDeadline = Date.parse(resultRound.completedAt) + resultDisplayMs - serverOffset;
    const timer = window.setTimeout(
      () => setResultNow(Date.now()),
      Math.max(0, resultDeadline - now),
    );
    return () => window.clearTimeout(timer);
  }, [resultRound?.roundNumber, resultRound?.completedAt, serverOffset]);
  const resultAge = resultRound?.completedAt
    ? resultNow + serverOffset - Date.parse(resultRound.completedAt)
    : Number.POSITIVE_INFINITY;
  const showCrash = !!resultRound
    && resultAge >= -1_000
    && resultAge < resultDisplayMs
    && resultRound.crashMultiplierHundredths !== null;
  const displayHundredths = flying ? liveMultiplier : showCrash && resultRound ? resultRound.crashMultiplierHundredths! : null;
  const chartValue = Math.max(100, displayHundredths ?? 100);
  const maxY = Math.max(220, chartValue * 1.18);
  const width = 620;
  const height = 220;
  const plotLeft = 28;
  const plotRight = 548;
  const valueToY = (value: number) => height - 23 - (value - 100) / Math.max(1, maxY - 100) * (height - 55);
  const axisStep = maxY <= 450 ? 50 : maxY <= 1_000 ? 100 : Math.ceil((maxY - 100) / 7 / 50) * 50;
  const axisValues = Array.from({ length: 8 }, (_, index) => 100 + index * axisStep).filter((value) => value <= maxY);
  const points = useMemo(() => {
    const count = 48;
    return Array.from({ length: count + 1 }, (_, index) => {
      const progress = index / count;
      const value = flying ? 100 * Math.pow(chartValue / 100, progress) : 100 + (chartValue - 100) * progress;
      const x = plotLeft + progress * (plotRight - plotLeft);
      const y = height - 23 - (value - 100) / Math.max(1, maxY - 100) * (height - 55);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  }, [chartValue, flying, maxY]);
  const currentX = plotRight;
  const currentY = valueToY(chartValue);

  return <div className={`crash-chart ${flying ? "is-flying" : ""} ${showCrash ? "is-crashed" : ""}`} data-testid="crash-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="График текущего множителя">
      <defs>
        <linearGradient id="crash-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c9aa63" stopOpacity=".22" /><stop offset="1" stopColor="#c9aa63" stopOpacity="0" /></linearGradient>
      </defs>
      {[0, 1, 2, 3].map((line) => <line key={line} x1={plotLeft} x2={plotRight} y1={30 + line * 43} y2={30 + line * 43} className="crash-grid-line" />)}
      {[0, 1, 2, 3, 4].map((line) => <line key={line} x1={plotLeft + (plotRight - plotLeft) * line / 4} x2={plotLeft + (plotRight - plotLeft) * line / 4} y1="22" y2="197" className="crash-grid-line crash-grid-vertical" />)}
      {axisValues.map((value) => <g key={value} className="crash-chart-scale">
        <line x1={plotRight + 3} x2={plotRight + 9} y1={valueToY(value)} y2={valueToY(value)} />
        <text x={width - 4} y={valueToY(value) + 3} textAnchor="end">{multiplier(value)}</text>
      </g>)}
      <path d={`${points} L ${plotRight} 197 L ${plotLeft} 197 Z`} className="crash-chart-fill" />
      <path d={points} className="crash-chart-line" />
      {flying && <circle cx={currentX} cy={currentY} r="4" className="crash-chart-point" />}
      <text x="30" y="18" className="crash-chart-caption">МНОЖИТЕЛЬ · СЕРВЕРНОЕ ЗНАЧЕНИЕ</text>
    </svg>
    <div className={`crash-center ${flying || round?.status === "open" ? "crash-center-live" : ""} ${round?.status === "open" ? "crash-center-countdown" : ""} ${showCrash ? "crash-center-result" : ""}`} aria-live="polite">
      {flying && round
        ? <CrashMultiplierReadout round={round} serverOffset={serverOffset} fallback={multiplier(100)} testId="crash-current-multiplier" />
        : round?.status === "open"
          ? <CrashCountdownReadout roundNumber={round.roundNumber} bettingClosesAt={round.bettingClosesAt} serverOffset={serverOffset} />
          : <b data-testid="crash-current-multiplier">{displayHundredths === null ? "—" : multiplier(displayHundredths)}</b>}
      {round?.status === "open" && <small>ДО СТАРТА</small>}
    </div>
    <div className="crash-chart-axis"><span>×1.00</span><span>{flying ? `Серверный темп · ${numberFormat.format(round.growthRateBpsPerSecond / 100)}% / с` : "Множитель"}</span><span>{displayHundredths !== null ? multiplier(displayHundredths) : "—"}</span></div>
  </div>;
});

function CrashCurrentBets({ snapshot }: { snapshot: DarkAceCrashSnapshot }) {
  const bets = snapshot.currentBets ?? [];
  const grouped = new Map<string, { name: string; bets: CrashBet[] }>();
  for (const bet of bets) {
    const key = bet.username ? `user:${bet.username.toLocaleLowerCase()}` : `name:${bet.displayName.toLocaleLowerCase()}`;
    const group = grouped.get(key) ?? { name: bet.username ? `@${bet.username}` : bet.displayName, bets: [] };
    group.bets.push(bet);
    grouped.set(key, group);
  }
  const allPlayers = [...grouped.entries()]
    .map(([key, group]) => ({ key, ...group }))
    .sort((first, second) =>
      second.bets.reduce((total, bet) => total + bet.amount, 0)
      - first.bets.reduce((total, bet) => total + bet.amount, 0));
  const ownBet = snapshot.myBets[0] ?? snapshot.myBet;
  const ownKey = ownBet
    ? ownBet.username ? `user:${ownBet.username.toLocaleLowerCase()}` : `name:${ownBet.displayName.toLocaleLowerCase()}`
    : null;
  const shownPlayers = allPlayers.slice(0, 5);
  const ownPlayer = ownKey ? allPlayers.find((player) => player.key === ownKey) : undefined;
  if (ownPlayer && !shownPlayers.some((player) => player.key === ownPlayer.key)) {
    if (shownPlayers.length === 5) shownPlayers[4] = ownPlayer;
    else shownPlayers.push(ownPlayer);
  }
  const extraCount = Math.max(0, allPlayers.length - shownPlayers.length);

  return <section className="crash-current-bets" aria-label="Ставки игроков в этом раунде" data-testid="crash-current-bets">
    <div className="crash-current-bets-heading"><span>СТАВКИ ЭТОГО РАУНДА · ТОП 5</span><small>{numberFormat.format(allPlayers.length)} игроков</small></div>
    {!shownPlayers.length
      ? <div className="crash-current-empty">Ставок пока нет</div>
      : <div className="crash-current-bets-list" role="list">
      {shownPlayers.map((player) => <div className="crash-current-player" key={player.key} role="listitem">
        <span className="crash-current-bet-name">{player.name}</span>
        <div className="crash-current-player-slots">
          {[...player.bets].sort((first, second) => first.slot - second.slot).map((bet) => {
            const cashedOut = bet.status === "cashed_out";
            const lost = bet.status === "lost";
            const resultLabel = cashedOut
              ? `ВЫИГРАЛ · ${bet.cashoutMultiplierHundredths !== null ? multiplier(bet.cashoutMultiplierHundredths) : "ЗАБРАЛ"}`
              : lost ? `ПРОИГРАЛ · −${compactCredits(bet.amount)}` : snapshot.round?.status === "open" ? "ОЖИДАЕТ" : "В ПОЛЁТЕ";
            return <span className={`crash-current-player-slot ${cashedOut ? "is-cashed" : lost ? "is-lost" : "is-pending"}`}
              key={bet.betId} data-testid={`crash-current-bet-${bet.betId}`}>
              <b>{compactCredits(bet.amount)}</b><small>{resultLabel}</small>
            </span>;
          })}
        </div>
      </div>)}
      {extraCount > 0 && <small className="crash-current-more">+{numberFormat.format(extraCount)} игроков</small>}
    </div>}
  </section>;
}

function CrashPreviousResults({ snapshot }: { snapshot: DarkAceCrashSnapshot }) {
  const results = snapshot.recentResults.slice(0, 15);
  if (!results.length) return null;
  return <div className="crash-result-strip-wrap" aria-label="Старые множители" data-testid="crash-previous-results">
    <div className="crash-result-strip">
      {results.map((result) => <span className={`crash-result-chip ${result.crashMultiplierHundredths > 300 ? "is-high" : "is-yellow"}`}
        key={result.roundNumber} data-testid={`crash-previous-result-${result.roundNumber}`}>
        <b>{multiplier(result.crashMultiplierHundredths)}</b>
      </span>)}
    </div>
  </div>;
}

function CrashHistory({ snapshot }: { snapshot: DarkAceCrashSnapshot }) {
  const [selectedRound, setSelectedRound] = useState<number | null>(
    snapshot.recentResults[0]?.roundNumber ?? null,
  );
  const [verification, setVerification] = useState<{ roundNumber: number; passed: boolean } | null>(null);
  const [verificationError, setVerificationError] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!snapshot.recentResults.some((result) => result.roundNumber === selectedRound)) {
      setSelectedRound(snapshot.recentResults[0]?.roundNumber ?? null);
    }
  }, [selectedRound, snapshot.recentResults]);
  useEffect(() => {
    setVerification(null);
    setVerificationError("");
  }, [selectedRound]);
  const selected = snapshot.recentResults.find((result) => result.roundNumber === selectedRound);
  const verifySelected = async () => {
    if (!selected || checking) return;
    if (!selected.serverSeedReveal) {
      setVerificationError("Дневной seed раскроется после окончания дня по Москве.");
      return;
    }
    setChecking(true);
    setVerificationError("");
    try {
      setVerification({
        roundNumber: selected.roundNumber,
        passed: await verifyCrashResult(selected),
      });
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : "Не удалось проверить раунд.");
    } finally {
      setChecking(false);
    }
  };
  return <section className="crash-panel crash-history" aria-label="История ставок и выплат" data-testid="crash-history">
    <div className="crash-section-heading"><div><span className="crash-kicker">ИСТОРИЯ · ПОСЛЕДНИЕ 20 РАУНДОВ</span><h3>Топ‑5 выплат</h3></div><span className="crash-count">{snapshot.recentRoundTopWins.length}/5</span></div>
    {snapshot.recentRoundTopWins.length ? <div className="crash-round-wins">
      {snapshot.recentRoundTopWins.slice(0, 5).map((winner, index) => <div className="crash-round-win" key={`${winner.roundNumber}:${winner.displayName}`} data-testid={`crash-round-top-win-${index + 1}`}>
        <span className="crash-round-win-rank">{String(index + 1).padStart(2, "0")}</span>
        <span className="crash-round-win-player" title={winner.username ? `@${winner.username}` : winner.displayName}>
          <b>{winner.username ? `@${winner.username}` : winner.displayName}</b><small>Раунд #{numberFormat.format(winner.roundNumber)}</small>
        </span>
        <span className="crash-round-win-stake"><small>СТАВКА</small><b>{credits(winner.amount)}</b></span>
        <b className="crash-round-win-multiplier">{multiplier(winner.cashoutMultiplierHundredths)}</b>
        <span className="crash-round-win-payout"><small>ВЫПЛАТА</small><b>{credits(winner.payout)}</b></span>
      </div>)}
    </div> : <div className="crash-empty-inline">В последних 20 раундах пока нет выплат</div>}
    <details className="crash-proof-disclosure">
      <summary><ShieldCheck size={13} /> Проверить честность <span>{selected ? `Раунд #${numberFormat.format(selected.roundNumber)}` : "новый раунд"}</span></summary>
      <CrashProof snapshot={snapshot} />
      {selected && <div className="crash-history-proof" data-testid={`crash-history-proof-${selected.roundNumber}`}>
        <b>РАУНД #{numberFormat.format(selected.roundNumber)} · {multiplier(selected.crashMultiplierHundredths)}</b>
        <span>Проверка: SHA-256(seed) = hash; HMAC-SHA-256(seed, client seed) задаёт исход.</span>
        <small>{selected.clientSeed.startsWith("da-daily-v1|")
          ? "Дневной хеш и seed показаны в блоке проверки выше; seed станет доступен после окончания дня по Москве."
          : "Для этого раунда используется прежний отдельный хеш и seed."}</small>
        <small>CLIENT · {selected.clientSeed} · EDGE {(selected.houseEdgeBps / 100).toLocaleString("ru-RU")}%</small>
        <button type="button" className="crash-proof-check" onClick={() => void verifySelected()} disabled={checking || !selected.serverSeedReveal}
          data-testid={`button-crash-verify-${selected.roundNumber}`}>
          <ShieldCheck size={13} />{checking ? "ПРОВЕРЯЕМ…" : selected.serverSeedReveal ? "ПРОВЕРИТЬ РАУНД" : "SEED ПОСЛЕ ОКОНЧАНИЯ ДНЯ"}
        </button>
        {verification?.roundNumber === selected.roundNumber && <small className={verification.passed ? "crash-proof-pass" : "crash-proof-fail"} role="status" data-testid={`status-crash-verify-${selected.roundNumber}`}>
          {verification.passed ? "ПРОВЕРКА ПРОЙДЕНА" : "РЕЗУЛЬТАТ НЕ СОВПАЛ"}
        </small>}
        {!!verificationError && <small className="crash-proof-fail" role="status">{verificationError}</small>}
      </div>}
    </details>
  </section>;
}

function CrashProof({ snapshot }: { snapshot: DarkAceCrashSnapshot }) {
  const round = snapshot.round;
  if (!round) return null;
  const crashed = round.status === "crashed";
  return <section className="crash-panel crash-proof" aria-label="Проверка честности" data-testid="crash-proof">
    <div className="crash-section-heading"><div><span className="crash-kicker">ПРОВЕРЯЕМОСТЬ</span><h3><ShieldCheck size={16} /> Доказательство раунда</h3></div><span className="crash-algorithm">{snapshot.algorithmVersion}</span></div>
    <p className="crash-proof-copy">{round.clientSeed.startsWith("da-daily-v1|")
      ? "Один дневной хеш используется во всех раундах Crash за этот день. Seed раскрывается после окончания дня по Москве."
      : "До активации дневной схемы этот раунд использует отдельный хеш и seed."}</p>
    <div className="crash-proof-row"><span>{round.clientSeed.startsWith("da-daily-v1|") ? "ДНЕВНОЙ ХЕШ" : "ХЕШ РАУНДА"}</span><code data-testid="crash-proof-hash">{round.serverSeedHash}</code></div>
    {crashed && <div className="crash-proof-row"><span>{round.clientSeed.startsWith("da-daily-v1|") ? "ДНЕВНОЙ SEED" : "SEED РАУНДА"}</span><code data-testid="crash-proof-reveal">{round.serverSeedReveal ?? "Раскроется после окончания дня"}</code></div>}
    <div className="crash-proof-foot"><span>CLIENT SEED</span><code data-testid="crash-proof-client-seed">{round.clientSeed}</code><span>ПРЕИМУЩЕСТВО ДОМА · {(round.houseEdgeBps / 100).toLocaleString("ru-RU")}%</span></div>
  </section>;
}

export default function CrashGamePage({ sessionReady, liveConnected, gameEnabled, balance, onWin }: Props) {
  const queryClient = useQueryClient();
  const query = useGetDarkAceCrash({ query: {
    enabled: sessionReady,
    queryKey: getGetDarkAceCrashQueryKey(),
    refetchInterval: liveConnected ? 750 : 1_000,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  } });
  const snapshot = query.data;
  const round = snapshot?.round;
  const [now, setNow] = useState(Date.now());
  const serverClockRef = useRef<{ sample: string | null; offset: number }>({ sample: null, offset: 0 });
  const observedBetStatuses = useRef<Map<string, string> | null>(null);
  if (snapshot?.serverNow && snapshot.serverNow !== serverClockRef.current.sample) {
    const receivedAt = query.dataUpdatedAt || Date.now();
    serverClockRef.current = {
      sample: snapshot.serverNow,
      offset: Date.parse(snapshot.serverNow) - receivedAt,
    };
  }
  const [slotSettings, setSlotSettings] = useState({
    1: { autoEnabled: false, autoText: "2,00" },
    2: { autoEnabled: false, autoText: "2,00" },
  });
  const [chipState, setChipState] = useState<{
    roundNumber: number | null;
    budget: number;
    key: StakeChipKey;
  }>({ roundNumber: null, budget: 0, key: "1" });
  const [mutationError, setMutationError] = useState("");
  const [notice, setNotice] = useState("");
  const placeBet = usePlaceDarkAceCrashBet();
  const cashout = useCashoutDarkAceCrashBet();
  const offset = serverClockRef.current.offset;
  const availableBalance = snapshot?.balance ?? balance ?? 0;
  const myBets = snapshot?.myBets ?? [];
  const committedStake = myBets.reduce((total, bet) => total + bet.amount, 0);
  const maxAdditionalStake = Math.floor(Math.max(
    0,
    Math.min(availableBalance, MAX_GAME_STAKE - committedStake),
  ) / 100) * 100;
  const chipBudgetCandidate = Math.min(MAX_GAME_STAKE, Math.max(0, availableBalance + committedStake));
  const slotMaxStake = () => maxAdditionalStake;
  useEffect(() => {
    if (!round || chipState.roundNumber === round.roundNumber) return;
    setChipState((current) => ({ roundNumber: round.roundNumber, budget: chipBudgetCandidate, key: current.key }));
  }, [round?.roundNumber, chipBudgetCandidate, chipState.roundNumber]);
  const chipBudget = chipState.roundNumber === round?.roundNumber ? chipState.budget : chipBudgetCandidate;
  const selectedChipKey = chipState.key;
  const chipOptions = getStakeChipOptions(chipBudget, 100, 100);
  const selectedStake = (slot: 1 | 2) =>
    getStakeChipAmount(selectedChipKey, chipOptions, slotMaxStake());
  useEffect(() => {
    if (!query.isSuccess || !snapshot) return;
    const previous = observedBetStatuses.current;
    const next = new Map(previous ?? []);
    for (const bet of snapshot.myBets) {
      const previousStatus = previous?.get(bet.betId);
      if (previousStatus === "pending" && bet.status === "cashed_out" && bet.payout > 0) {
        onWin({ eventId: `crash:${bet.betId}`, outcome: "win", amount: bet.payout });
      } else if (previousStatus === "pending" && bet.status === "lost") {
        onWin({ eventId: `crash:${bet.betId}`, outcome: "loss", amount: bet.amount });
      }
      next.set(bet.betId, bet.status);
    }
    if (!previous) {
      observedBetStatuses.current = next;
      return;
    }
    while (next.size > 100) next.delete(next.keys().next().value!);
    observedBetStatuses.current = next;
  }, [query.isSuccess, snapshot?.myBets, onWin]);
  const remaining = round?.status === "open"
    ? Math.max(0, Math.ceil((Date.parse(round.bettingClosesAt) - (now + offset)) / 1000))
    : 0;
  const accepting = !!round && round.status === "open" && remaining > 0 && gameEnabled && !!snapshot?.gameEnabled;
  const roundEnabled = gameEnabled && !!snapshot?.gameEnabled;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setMutationError("");
    setNotice("");
  }, [round?.roundNumber]);

  const refreshAfterAction = () => {
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceCrashQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
  };
  const updateSlot = (slot: 1 | 2, patch: Partial<(typeof slotSettings)[1]>) => {
    setSlotSettings((current) => ({ ...current, [slot]: { ...current[slot], ...patch } }));
  };
  const placeSlot = (
    slot: 1 | 2,
    amountOverride?: number,
    autoCashoutOverride?: number | null,
    isRepeat = false,
  ) => {
    const settings = slotSettings[slot];
    const ownBet = myBets.find((bet) => bet.slot === slot);
    const amount = amountOverride ?? selectedStake(slot);
    const autoEnabled = autoCashoutOverride !== undefined
      ? autoCashoutOverride !== null
      : settings.autoEnabled;
    const autoMultiplier = Number(settings.autoText.replace(",", "."));
    const autoHundredths = autoCashoutOverride !== undefined && autoCashoutOverride !== null
      ? autoCashoutOverride
      : Math.round(autoMultiplier * 100);
    const amountValid = Number.isSafeInteger(amount) && amount >= 100
      && amount <= slotMaxStake() && amount % 100 === 0;
    const autoValid = !autoEnabled
      || (Number.isFinite(autoMultiplier) && autoHundredths >= 101 && autoHundredths <= 100_000_000);
    if (!snapshot || !round || !accepting || ownBet || !amountValid || !autoValid || placeBet.isPending) {
      if (snapshot && round && accepting && !ownBet && !amountValid) {
        setMutationError(`Общий лимит 250 млн на раунд; доступно для новой ставки: ${numberFormat.format(slotMaxStake())}.`);
      }
      return;
    }
    if (amount > availableBalance) {
      setMutationError("Недостаточно кредитов для этой ставки.");
      return;
    }
    const latest = queryClient.getQueryData<DarkAceCrashSnapshot>(getGetDarkAceCrashQueryKey());
    if (latest?.round?.roundNumber !== round.roundNumber || latest.round.status !== "open") return;
    setMutationError("");
    setNotice("");
    placeBet.mutate({
      data: {
        slot,
        amount,
        autoCashoutHundredths: autoEnabled ? autoHundredths : null,
        idempotencyKey: idKey(),
      },
    }, {
      onSuccess: (result) => {
        setNotice(isRepeat ? "Повтор ставки принят сервером." : "Ставка принята сервером.");
        queryClient.setQueryData<DarkAceCrashSnapshot>(getGetDarkAceCrashQueryKey(), (old) => old
          ? updateSnapshotWithMyBet(old, result.bet, result.balance)
          : old);
        refreshAfterAction();
      },
      onError: (error) => setMutationError(errorText(error)),
    });
  };
  const repeatSlot = (slot: 1 | 2) => {
    const previous = snapshot?.lastBet;
    if (!previous || myBets.some((bet) => bet.slot === slot) || previous.amount > slotMaxStake()) return;
    updateSlot(slot, {
      autoEnabled: previous.autoCashoutHundredths !== null,
      autoText: previous.autoCashoutHundredths === null
        ? slotSettings[slot].autoText
        : (previous.autoCashoutHundredths / 100).toFixed(2).replace(".", ","),
    });
    placeSlot(slot, previous.amount, previous.autoCashoutHundredths, true);
  };
  const doCashout = (bet: CrashBet) => {
    if (bet.status !== "pending" || round?.status !== "flying" || cashout.isPending) return;
    setMutationError("");
    setNotice("");
    cashout.mutate({ data: { betId: bet.betId, idempotencyKey: idKey() } }, {
      onSuccess: (result) => {
        setNotice("Вывод подтверждён сервером.");
        if (result.bet.payout > 0) {
          onWin({ eventId: `crash:${result.bet.betId}`, amount: result.bet.payout });
        }
        queryClient.setQueryData<DarkAceCrashSnapshot>(getGetDarkAceCrashQueryKey(), (old) => old
          ? updateSnapshotWithMyBet(old, result.bet, result.balance)
          : old);
        refreshAfterAction();
      },
      onError: (error) => setMutationError(errorText(error)),
    });
  };

  if (!sessionReady) return <section className="crash-page crash-gate" data-testid="crash-session-not-ready">
    <div className="crash-gate-mark"><LockKeyhole size={20} /></div><span className="crash-kicker">DARK ACE · ЗАКРЫТЫЙ СТОЛ</span>
    <h2>Подключаем игровую сессию</h2><p>Crash станет доступен после подтверждения Telegram-сессии.</p>
  </section>;
  if (query.isLoading && !snapshot) return <section className="crash-page" aria-label="Загрузка Crash" data-testid="crash-loading">
    <div className="crash-skeleton crash-skeleton-head" /><div className="crash-skeleton crash-skeleton-stage" /><div className="crash-skeleton crash-skeleton-panel" />
  </section>;
  if (query.isError && !snapshot) return <section className="crash-page crash-load-error" data-testid="crash-load-error">
    <Activity size={22} /><h2>Раунд не загружен</h2><p>Не удалось получить состояние Crash с сервера. Ставки закрыты до восстановления связи.</p>
    <button type="button" onClick={() => void query.refetch()} data-testid="button-retry-crash"><RefreshCw size={14} /> Повторить загрузку</button>
  </section>;
  if (!snapshot) return null;

  return <section className="crash-page" aria-label="Crash DARK ACE" data-testid="crash-game-page">
    {!roundEnabled && <div className="crash-disabled" role="status" data-testid="crash-game-disabled"><LockKeyhole size={15} /><span>Игра временно отключена. Просмотр раундов доступен, ставки закрыты.</span></div>}
    <div className="crash-layout">
      <div className="crash-main-column">
        <section className="crash-panel crash-stage" aria-label="Текущий полёт">
          <div className="crash-stage-top"><span><i className={liveConnected ? "is-connected" : ""} /> СЕРВЕРНЫЙ ПОТОК</span><span>СТАВОК · {numberFormat.format(round?.betCount ?? 0)}</span></div>
          <CrashPreviousResults snapshot={snapshot} />
          <CrashChart snapshot={snapshot} serverOffset={offset} />
        </section>
      </div>
      <aside className="crash-side-column">
        <section className="crash-panel crash-entry" aria-label="Ваша ставка">
          <div className="crash-chip-control">
            <StakeChipPicker
              budget={chipBudget}
              maxStake={maxAdditionalStake}
              allInAmount={maxAdditionalStake}
              minStake={100}
              step={100}
              selectedKey={selectedChipKey}
              onSelect={(key) => setChipState({
                roundNumber: round?.roundNumber ?? chipState.roundNumber,
                budget: chipBudget,
                key,
              })}
              disabled={!accepting || !roundEnabled || placeBet.isPending}
              testIdPrefix="button-crash-chip"
              resetKey={round?.roundNumber}
              className="crash-stake-picker"
            />
            <p className="crash-chip-instruction">Выберите фишку, затем нажмите «Поставить» для одной или обеих ставок.</p>
          </div>
          <div className="crash-slot-grid">
            {([1, 2] as const).map((slot) => {
              const settings = slotSettings[slot];
              const ownBet = myBets.find((bet) => bet.slot === slot);
              const amount = selectedStake(slot);
              const maxStake = slotMaxStake();
              const amountValid = Number.isSafeInteger(amount) && amount >= 100 && amount <= maxStake && amount % 100 === 0;
              const autoMultiplier = Number(settings.autoText.replace(",", "."));
              const autoHundredths = Math.round(autoMultiplier * 100);
              const autoValid = !settings.autoEnabled
                || (Number.isFinite(autoMultiplier) && autoHundredths >= 101 && autoHundredths <= 100_000_000);
              const settledNet = ownBet ? ownBet.payout - ownBet.amount : 0;
              const showResult = ownBet?.status === "cashed_out" && (!round
                || (!!ownBet.settledAt && Date.parse(ownBet.settledAt) >= Date.parse(round.startedAt)));
              const suffix = slot === 1 ? "" : `-${slot}`;
              return <article className="crash-bet-slot" key={slot} data-testid={`crash-bet-slot-${slot}`}>
                <div className="crash-slot-heading">
                  <div className="crash-slot-heading-copy">
                    <span>СТАВКА {slot}</span>
                    <small>{ownBet ? "ПРИНЯТА" : `ДО ${credits(maxStake)}`}</small>
                  </div>
                  {!ownBet && <div className="crash-auto-control">
                    <label className="crash-auto-toggle crash-auto-toggle-inline">
                      <input type="checkbox" checked={settings.autoEnabled}
                        onChange={(event) => updateSlot(slot, { autoEnabled: event.target.checked })}
                        disabled={!accepting || placeBet.isPending} data-testid={`input-crash-auto-enabled${suffix}`} />
                      <span className="crash-toggle-track" /><span>Автовывод</span>
                    </label>
                    {settings.autoEnabled && <label className="crash-auto-input crash-auto-input-inline">
                      <span>×</span>
                      <input type="text" inputMode="decimal" value={settings.autoText}
                        onChange={(event) => updateSlot(slot, { autoText: event.target.value })}
                        disabled={!accepting || placeBet.isPending} aria-label="Множитель автовывода"
                        list={`crash-auto-values${suffix}`}
                        data-testid={`input-crash-auto-multiplier${suffix}`} />
                      <datalist id={`crash-auto-values${suffix}`}>
                        <option value="1,50" /><option value="2,00" /><option value="3,00" />
                      </datalist>
                    </label>}
                  </div>}
                </div>
                <div className="crash-slot-play">
                  <div className="crash-slot-options">
                    {ownBet ? <>
                      <div className="crash-my-bet-card" data-testid={`crash-my-bet-${slot}`}>
                        <div><span>ВАША СТАВКА</span><b>{credits(ownBet.amount)}</b></div>
                        <div><span>АВТОВЫВОД</span><b>{ownBet.autoCashoutHundredths ? multiplier(ownBet.autoCashoutHundredths) : "Вручную"}</b></div>
                        {ownBet.status === "pending" && round?.status === "flying" && <div><span>ВОЗМОЖНАЯ ВЫПЛАТА</span>
                          <CrashPotentialPayout amount={ownBet.amount} round={round} serverOffset={offset}
                            className="crash-gold" testId={`crash-potential-payout-${slot}`} />
                        </div>}
                      </div>
                      {ownBet.status === "pending" && round?.status === "open" && <div className="crash-bet-status-note pending" data-testid={`crash-my-bet-status-${slot}`}>
                        Ставка принята. Ждём полёт.
                      </div>}
                      {showResult && <div className={`crash-personal-result ${settledNet >= 0 ? "is-win" : "is-loss"}`} data-testid={`crash-personal-result-${slot}`}>
                        <span>ОБЩИЙ ВЫИГРЫШ</span><b>+{credits(ownBet.payout)}</b>
                      </div>}
                    </> : <>
                      <div className="crash-selected-stake">
                        <div><span>СУММА СТАВКИ</span><b>{amount >= 100 ? credits(amount) : "Недоступна"}</b></div>
                        <button type="button" onClick={() => repeatSlot(slot)}
                          disabled={!accepting || placeBet.isPending || !snapshot.lastBet || snapshot.lastBet.amount > maxStake}
                          aria-label={`Повторить предыдущую ставку на позиции ${slot}`}
                          data-testid={`button-crash-repeat${suffix}`}>
                          <RefreshCw size={12} /><span>Повтор</span>
                        </button>
                      </div>
                      {amountValid && <div className="crash-estimate" data-testid={`crash-potential-payout${suffix}`}>
                        <span>Возможная выплата</span>
                        <CrashPotentialPayout amount={amount} round={round} serverOffset={offset}
                          testId={`crash-potential-payout${suffix}`} />
                      </div>}
                    </>}
                  </div>
                  <button type="button" className={`crash-submit${ownBet ? " is-cashout" : ""}`}
                    onClick={() => ownBet ? doCashout(ownBet) : placeSlot(slot)}
                    disabled={ownBet
                      ? ownBet.status !== "pending" || round?.status !== "flying" || cashout.isPending
                      : !accepting || !amountValid || !autoValid || amount > availableBalance || placeBet.isPending}
                    data-stake-chip-target={!ownBet ? "" : undefined}
                    data-testid={ownBet ? `button-crash-cashout${suffix}` : `button-crash-place-bet${suffix}`}>
                    {placeBet.isPending || (ownBet && cashout.isPending)
                      ? <RefreshCw size={15} className="crash-spin" />
                      : ownBet ? <TrendingUp size={16} /> : <Plane size={15} />}
                    <span>{placeBet.isPending ? "ОЖИДАЕМ…" : ownBet
                      ? ownBet.status === "pending" ? "ЗАБРАТЬ" : ownBet.status === "cashed_out" ? "ЗАБРАНО" : "ПРОИГРАНО"
                      : accepting ? `ПОСТАВИТЬ · ${compactCredits(amount)}` : "СТАВКИ ЗАКРЫТЫ"}</span>
                  </button>
                </div>
                {!ownBet && !autoValid && <p className="crash-validation" data-testid={`crash-auto-validation${suffix}`}>Множитель: от ×1,01 до ×1 000 000.</p>}
                {!ownBet && amountValid && amount > availableBalance && <p className="crash-validation" data-testid={`crash-balance-validation${suffix}`}>Недостаточно доступных кредитов.</p>}
              </article>;
            })}
          </div>
          {mutationError && <div className="crash-inline-error" role="alert" data-testid="crash-mutation-error">{mutationError}</div>}
          {notice && <div className="crash-inline-success" role="status" data-testid="crash-mutation-notice">{notice}</div>}
          <p className="crash-fair-note"><ShieldCheck size={13} /> Ставка и выплата подтверждаются сервером. Локальная анимация не определяет исход.</p>
        </section>
      </aside>
      <section className="crash-round-feed" aria-label="Активные ставки и результаты раундов">
        <CrashCurrentBets snapshot={snapshot} />
      </section>
      <CrashHistory snapshot={snapshot} />
    </div>
  </section>;
}
