import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, CircleAlert, Coins, ShieldCheck, RotateCw } from "lucide-react";
import {
  getGetDarkAceBootstrapQueryKey,
  getGetDarkAcePlinkoQueryKey,
  useGetDarkAcePlinko,
  useSettleDarkAcePlinkoRound,
  useStartDarkAcePlinkoRound,
  type DarkAcePlinkoRound,
  type DarkAcePlinkoRoundRisk,
} from "@workspace/api-client-react";
import "./CommittedArcadeGames.css";

const money = new Intl.NumberFormat("ru-RU");
const MIN_STAKE = 100;
const MAX_STAKE = 250_000_000;
const formatCredits = (value: number) => `${money.format(value)} кредитов`;

function idempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function StakeField({ value, onChange, balance, disabled }: {
  value: string;
  onChange(value: string): void;
  balance: number;
  disabled: boolean;
}) {
  const stake = /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  const valid = Number.isSafeInteger(stake) && stake >= MIN_STAKE && stake <= MAX_STAKE && stake % 100 === 0 && stake <= balance;
  const feedback = value && !valid
    ? stake > balance ? "Ставка превышает доступный баланс." : "От 100 до 250 000 000 кредитов, шаг 100."
    : `Возможная выплата будет показана по серверному коэффициенту.`;
  return <section className="ca-stake" aria-label="Размер ставки">
    <div className="ca-field-heading"><label htmlFor="ca-stake-input">ВАША СТАВКА</label><span>ШАГ 100</span></div>
    <div className="ca-stake-input">
      <input id="ca-stake-input" value={value} inputMode="numeric" autoComplete="off" disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
        aria-label="Ставка в кредитах" aria-describedby="ca-stake-help" data-testid="input-arcade-stake" />
      <span>КРЕДИТОВ</span>
    </div>
    <div className="ca-quick-stakes">
      {[100, 1_000, 10_000, 100_000].map((amount) => <button type="button" key={amount} disabled={disabled || amount > balance}
        onClick={() => onChange(String(amount))} data-testid={`button-stake-${amount}`}>{money.format(amount)}</button>)}
      <button type="button" disabled={disabled || balance < MIN_STAKE} onClick={() => onChange(String(Math.min(MAX_STAKE, Math.floor(balance / 100) * 100)))} data-testid="button-stake-max">МАКС.</button>
    </div>
    <p id="ca-stake-help" className={`ca-helper${value && !valid ? " is-error" : ""}`} role={value && !valid ? "alert" : undefined}>
      {feedback}
    </p>
  </section>;
}

function GameHeader({ title, balance, onBack }: { title: string; balance?: number; onBack(): void }) {
  return <header className="ca-header">
    <button type="button" className="ca-back" onClick={onBack} aria-label="Вернуться в DARK ACE" data-testid="button-arcade-back">
      <ArrowLeft size={16} /><span>КЛУБ</span>
    </button>
    <div className="ca-brand"><span className="ca-brand-mark">A</span><span>DARK ACE<small>СЕРВЕРНАЯ ИГРА</small></span></div>
    <span className="sr-only">{title}</span>
  </header>;
}

function Proof({ hash, reveal, clientSeed, version }: {
  hash?: string | null;
  reveal?: string | null;
  clientSeed?: string;
  version?: string;
}) {
  if (!hash) return null;
  const dailySeed = clientSeed?.startsWith("da-daily-v1|") ?? false;
  return <section className="ca-proof" aria-label="Проверка честности" data-testid="panel-game-proof">
    <div className="ca-proof-heading"><ShieldCheck size={14} /><b>{dailySeed ? "ДНЕВНАЯ ЧЕСТНОСТЬ" : reveal ? "ПРОВЕРКА РАУНДА" : "ЗАФИКСИРОВАНО ДО РЕЗУЛЬТАТА"}</b></div>
    {dailySeed
      ? <p>Для всех раундов Plinko за этот день используется один хеш. <Link href="/fairness?game=plinko">Открыть дневные хеши</Link>.</p>
      : <div className="ca-proof-row"><span>Хеш серверного seed</span><code>{hash}</code></div>}
    {!dailySeed && reveal && <div className="ca-proof-reveal">
      <div className="ca-proof-row"><span>Раскрытый seed</span><code>{reveal}</code></div>
      {clientSeed && <div className="ca-proof-row"><span>Клиентский seed</span><code>{clientSeed}</code></div>}
      {version && <div className="ca-proof-row"><span>Версия алгоритма</span><code>{version}</code></div>}
    </div>}
  </section>;
}

type PlinkoPoint = { x: number; y: number };

const PLINKO_STEP_DURATION_MS = 100;

function getPlinkoSpacing(rows: number): number {
  return 320 / Math.max(rows, 1);
}

function getPlinkoAnimationDuration(rows: number, ballCount: number): number {
  const oneBallDuration = (rows + 1) * PLINKO_STEP_DURATION_MS;
  return ballCount * oneBallDuration;
}

function getPlinkoBallPoints(round: DarkAcePlinkoRound, rows: number): PlinkoPoint[] {
  const top = 25;
  const bottom = 198;
  const spacing = getPlinkoSpacing(rows);
  const gap = (bottom - top) / Math.max(rows, 1);
  const points: PlinkoPoint[] = [{ x: 180, y: 9 }];
  let rights = 0;
  (round.path ?? []).forEach((step, index) => {
    if (step === 1) rights += 1;
    points.push({
      x: 180 + (rights - (index + 1) / 2) * spacing,
      y: top + (index + 1) * gap,
    });
  });
  points.push({
    x: 180 + ((round.slotIndex ?? Math.round(rows / 2)) - rows / 2) * spacing,
    y: 218,
  });
  return points;
}

function PlinkoBoard({
  rounds,
  rows,
  multipliers,
  animationStartedAt,
}: {
  rounds: DarkAcePlinkoRound[];
  rows: number;
  multipliers: number[];
  animationStartedAt: Record<string, number>;
}) {
  const top = 25;
  const bottom = 198;
  const spacing = getPlinkoSpacing(rows);
  const gap = (bottom - top) / Math.max(rows, 1);
  const settledRounds = rounds.filter((item) => item.status === "settled" && item.slotIndex !== null);
  const animationKey = Object.keys(animationStartedAt).sort().join(":");
  const [frameTime, setFrameTime] = useState(0);
  const travelDuration = getPlinkoAnimationDuration(rows, 1);
  const elapsedFor = (roundId: string) => {
    const startedAt = animationStartedAt[roundId];
    return startedAt === undefined ? travelDuration : Math.max(0, Math.min(frameTime - startedAt, travelDuration));
  };
  const landedRounds = settledRounds.filter((item) => elapsedFor(item.id) >= travelDuration);
  const slotsWithBalls = new Set(landedRounds.map((item) => item.slotIndex));
  const slotTextSize = rows >= 15 ? 5 : rows >= 12 ? 6 : 7;

  useEffect(() => {
    if (!animationKey) {
      setFrameTime(0);
      return;
    }

    let frameId = 0;
    const tick = (now: number) => {
      setFrameTime(now);
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [animationKey]);

  return <div className={`ca-plinko-board${animationKey ? " is-dropping" : ""}`} data-testid="plinko-board">
    <svg viewBox="0 0 360 276" role="img" aria-label={`Доска Plinko, ${rows} рядов`}>
      <path className="ca-board-rail" d="M20,13 Q180,0 340,13" />
      {Array.from({ length: rows - 1 }, (_, rowIndex) => {
        const row = rowIndex + 1;
        return Array.from({ length: row + 1 }, (_, col) => {
          const x = 180 + (col - row / 2) * spacing;
          const y = top + row * gap;
          return <circle key={`${row}-${col}`} className="ca-peg" cx={x} cy={y} r="2.8" />;
        });
      })}
      {Array.from({ length: rows + 1 }, (_, index) => {
        const x = 180 + (index - rows / 2) * spacing;
        const slotBalls = landedRounds.filter((item) => item.slotIndex === index);
        return <rect
          key={`slot-${index}`}
          className={`ca-slot${slotsWithBalls.has(index) ? " selected" : ""}`}
          x={x - spacing / 2 + 1}
          y="205"
          width={Math.max(12, spacing - 2)}
          height="25"
          rx="4"
          data-testid={`plinko-slot-${index}`}
        >
          <title>{`×${((multipliers[index] ?? 0) / 10_000).toFixed(2)}${slotBalls.length ? ` · шаров: ${slotBalls.length}` : ""}`}</title>
        </rect>;
      })}
      {settledRounds.map((item, index) => {
        const points = getPlinkoBallPoints(item, rows);
        const last = points.at(-1)!;
        const slotBallIndex = settledRounds
          .filter((round) => round.slotIndex === item.slotIndex)
          .findIndex((round) => round.id === item.id);
        const slotBallCount = settledRounds.filter((round) => round.slotIndex === item.slotIndex).length;
        const ballRadius = Math.max(3, Math.min(4, spacing * 0.16));
        const offsetStep = Math.min(2.5, Math.max(0, (spacing - ballRadius * 2 - 2) / Math.max(slotBallCount, 1)));
        const offset = (slotBallIndex - (slotBallCount - 1) / 2) * offsetStep;
        let position = { x: last.x + offset, y: last.y };
        const elapsedMs = elapsedFor(item.id);
        if (animationStartedAt[item.id] !== undefined && elapsedMs < travelDuration) {
          const segment = Math.min(Math.floor(elapsedMs / PLINKO_STEP_DURATION_MS), points.length - 2);
          const segmentProgress = Math.min(1, (elapsedMs - segment * PLINKO_STEP_DURATION_MS) / PLINKO_STEP_DURATION_MS);
          const from = points[segment]!;
          const to = points[segment + 1]!;
          position = {
            x: from.x + (to.x - from.x) * segmentProgress + offset,
            y: from.y + (to.y - from.y) * segmentProgress,
          };
        }
        return <circle
          key={item.id}
          className="ca-drop-ball"
          cx={position.x}
          cy={position.y}
          r={ballRadius}
          data-testid={`plinko-ball-${index + 1}`}
        />;
      })}
      {Array.from({ length: rows + 1 }, (_, index) => {
        const x = 180 + (index - rows / 2) * spacing;
        const multiplier = multipliers[index];
        return <text
          key={`multiplier-${index}`}
          className={`ca-slot-label${slotsWithBalls.has(index) ? " selected" : ""}`}
          x={x}
          y="250"
          textLength={Math.max(11, spacing - 2)}
          lengthAdjust="spacingAndGlyphs"
          style={{ fontSize: `${slotTextSize}px` }}
          data-testid={`plinko-multiplier-${index}`}
        >
          {multiplier === undefined ? "×—" : `×${(multiplier / 10_000).toFixed(2)}`}
        </text>;
      })}
    </svg>
  </div>;
}

export function PlinkoGamePage({ sessionReady, onBack }: { sessionReady: boolean; onBack(): void }) {
  const queryClient = useQueryClient();
  const [stakeText, setStakeText] = useState("1000");
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState<DarkAcePlinkoRoundRisk>("medium");
  const [ballCount, setBallCount] = useState(1);
  const [round, setRound] = useState<DarkAcePlinkoRound | null>(null);
  const [batchRounds, setBatchRounds] = useState<DarkAcePlinkoRound[]>([]);
  const [batchProgress, setBatchProgress] = useState<{
    completed: number;
    total: number;
    stage: "settling" | "animating";
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [animationStartedAt, setAnimationStartedAt] = useState<Record<string, number>>({});
  const [balanceDuringAnimation, setBalanceDuringAnimation] = useState<number | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [revealedRoundIds, setRevealedRoundIds] = useState<string[]>([]);
  const locallyStartedId = useRef<string | null>(null);
  const alreadySettling = useRef(new Set<string>());
  const batchRunning = useRef(false);
  const animationTimers = useRef(new Map<string, number>());
  const params = { rows, risk };
  const query = useGetDarkAcePlinko(params, { query: {
    enabled: sessionReady, queryKey: getGetDarkAcePlinkoQueryKey(params), refetchOnWindowFocus: true, staleTime: 1_000,
  } });
  const start = useStartDarkAcePlinkoRound();
  const settle = useSettleDarkAcePlinkoRound();
  const balance = query.data?.balance ?? 0;
  const displayedBalance = balanceDuringAnimation ?? balance;
  const stake = /^\d+$/.test(stakeText) ? Number(stakeText) : NaN;
  const stakeValid = Number.isSafeInteger(stake) && stake >= MIN_STAKE && stake <= MAX_STAKE && stake % 100 === 0;
  const totalStake = stakeValid ? stake * ballCount : 0;
  const totalStakeValid = stakeValid && Number.isSafeInteger(totalStake) && totalStake <= balance;
  const batchLabel = (count: number) => `${count} ${count === 1 ? "шар" : count >= 2 && count <= 4 ? "шара" : "шаров"}`;
  const updatePendingCache = (pending: DarkAcePlinkoRound, nextBalance: number) => {
    queryClient.setQueryData(getGetDarkAcePlinkoQueryKey({ rows: pending.rows, risk: pending.risk }), (current: typeof query.data) => current
      ? { ...current, balance: nextBalance, pendingRound: pending }
      : current);
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
  };
  const updateSettledCache = (settled: DarkAcePlinkoRound, nextBalance: number, revealResult = true) => {
    queryClient.setQueryData(getGetDarkAcePlinkoQueryKey({ rows: settled.rows, risk: settled.risk }), (current: typeof query.data) => current
      ? {
          ...current,
          balance: revealResult ? nextBalance : current.balance,
          pendingRound: current.pendingRound?.id === settled.id ? null : current.pendingRound,
          recentRounds: revealResult
            ? [settled, ...current.recentRounds.filter((item) => item.id !== settled.id)].slice(0, 20)
            : current.recentRounds,
        }
      : current);
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
  };
  const startBallAnimation = (
    settled: DarkAcePlinkoRound,
    total: number,
    onLand: () => void,
  ): Promise<void> => {
    const reveal = () => {
      setRevealedRoundIds((current) => current.includes(settled.id) ? current : [...current, settled.id]);
      setBatchProgress((current) => current
        ? { ...current, completed: Math.min(current.total, current.completed + 1), stage: "animating" }
        : current);
      onLand();
    };
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion) {
      reveal();
      return Promise.resolve();
    }
    const startedAt = performance.now();
    setAnimationStartedAt((current) => ({ ...current, [settled.id]: startedAt }));
    setBatchProgress((current) => current
      ? { ...current, stage: "animating" }
      : { completed: 0, total, stage: "animating" });
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        animationTimers.current.delete(settled.id);
        setAnimationStartedAt((current) => {
          const next = { ...current };
          delete next[settled.id];
          return next;
        });
        reveal();
        resolve();
      }, getPlinkoAnimationDuration(settled.rows, 1) + 160);
      animationTimers.current.set(settled.id, timer);
    });
  };

  useEffect(() => () => {
    animationTimers.current.forEach((timer) => window.clearTimeout(timer));
    animationTimers.current.clear();
  }, []);

  useEffect(() => {
    const pending = query.data?.pendingRound;
    if (!pending || pending.status !== "committed" || locallyStartedId.current === pending.id || alreadySettling.current.has(pending.id)) return;
    alreadySettling.current.add(pending.id);
    setRound(pending);
    setRecovering(true);
    settle.mutate({ roundId: pending.id }, {
      onSuccess: async (result) => {
        setRound(result.round);
        setBatchRounds([result.round]);
        setRevealedRoundIds([]);
        updateSettledCache(result.round, result.balance, false);
        setBalanceDuringAnimation(balance);
        await startBallAnimation(result.round, 1, () => {
          updateSettledCache(result.round, result.balance);
          setBalanceDuringAnimation(null);
        });
        setBatchProgress(null);
        setRecovering(false);
        locallyStartedId.current = null;
        alreadySettling.current.delete(pending.id);
      },
      onError: (error) => {
        setRecovering(false);
        alreadySettling.current.delete(pending.id);
        setNotice(error.message || "Не удалось восстановить падение. Повторите проверку.");
      },
    });
  }, [query.data?.pendingRound?.id, query.data?.pendingRound?.status]);

  const resumePendingRound = async (pending: DarkAcePlinkoRound) => {
    if (batchRunning.current || pending.status !== "committed") return;
    batchRunning.current = true;
    const previouslyRevealed = batchRounds.filter((item) => revealedRoundIds.includes(item.id));
    const total = Math.max(ballCount, previouslyRevealed.length + 1);
    setNotice("");
    alreadySettling.current.delete(pending.id);
    alreadySettling.current.add(pending.id);
    setRecovering(true);
    try {
      const result = await settle.mutateAsync({ roundId: pending.id });
      locallyStartedId.current = null;
      setRound(result.round);
      setBatchRounds([...previouslyRevealed, result.round]);
      setRevealedRoundIds(previouslyRevealed.map((item) => item.id));
      updateSettledCache(result.round, result.balance, false);
      setBalanceDuringAnimation(displayedBalance);
      await startBallAnimation(result.round, total, () => {
        updateSettledCache(result.round, result.balance);
        setBalanceDuringAnimation(null);
      });
      alreadySettling.current.delete(pending.id);
    } catch (error) {
      alreadySettling.current.delete(pending.id);
      setNotice(error instanceof Error ? error.message : "Не удалось завершить падение.");
    } finally {
      setRecovering(false);
      batchRunning.current = false;
      setBatchProgress(null);
    }
  };

  const startRoundBatch = async () => {
    if (!totalStakeValid || !query.data?.gameEnabled || start.isPending || settle.isPending || batchRunning.current || query.data.pendingRound) return;
    const total = ballCount;
    batchRunning.current = true;
    setNotice("");
    setRound(null);
    setBatchRounds([]);
    setRevealedRoundIds([]);
    setAnimationStartedAt({});
    setBalanceDuringAnimation(null);
    setBatchProgress({ completed: 0, total, stage: "settling" });
    const startedRounds: DarkAcePlinkoRound[] = [];
    const revealPromises: Promise<void>[] = [];
    let pendingRound: DarkAcePlinkoRound | null = null;
    let placedBallCount = 0;
    let revealedPayout = 0;
    let latestResultBalance: number | null = null;
    let latestSettledRound: DarkAcePlinkoRound | null = null;
    try {
      for (let index = 0; index < total; index += 1) {
        const started = await start.mutateAsync({ data: { stake, rows, risk, idempotencyKey: idempotencyKey() } });
        pendingRound = started.round;
        placedBallCount += 1;
        setBalanceDuringAnimation(balance - placedBallCount * stake + revealedPayout);
        locallyStartedId.current = pendingRound.id;
        alreadySettling.current.add(pendingRound.id);
        setRound(pendingRound);
        updatePendingCache(pendingRound, started.balance);
        const result = await settle.mutateAsync({ roundId: pendingRound.id });
        updateSettledCache(result.round, result.balance, false);
        alreadySettling.current.delete(pendingRound.id);
        locallyStartedId.current = null;
        pendingRound = null;
        setRound(result.round);
        startedRounds.push(result.round);
        latestSettledRound = result.round;
        latestResultBalance = result.balance;
        setBatchRounds([...startedRounds]);
        revealPromises.push(startBallAnimation(result.round, total, () => {
          revealedPayout += result.round.payout;
          updateSettledCache(result.round, result.balance);
          setBalanceDuringAnimation(balance - placedBallCount * stake + revealedPayout);
        }));
      }
    } catch (error) {
      if (pendingRound) setRound(pendingRound);
      setNotice(error instanceof Error
        ? error.message
        : `Серия остановлена: запущено ${startedRounds.length} из ${total} шаров.`);
    }
    await Promise.all(revealPromises);
    if (latestSettledRound && latestResultBalance !== null) {
      updateSettledCache(latestSettledRound, latestResultBalance);
    }
    if (!pendingRound) setBalanceDuringAnimation(null);
    setRevealedRoundIds(startedRounds.map((item) => item.id));
    setBatchRounds(startedRounds);
    setAnimationStartedAt({});
    setBatchProgress(null);
    batchRunning.current = false;
  };

  const activeRound = round ?? query.data?.pendingRound ?? null;
  const busy = start.isPending || settle.isPending || recovering || batchProgress !== null;
  const displayedRounds = batchRounds.filter((item) => revealedRoundIds.includes(item.id));
  const boardRounds = batchRounds;
  const pendingRound = activeRound?.status === "committed" ? activeRound : null;
  const summaryRounds = pendingRound ? [...displayedRounds, pendingRound] : displayedRounds;
  const summaryStake = summaryRounds.reduce((sum, item) => sum + item.stake, 0);
  const summaryPayout = summaryRounds.reduce((sum, item) => sum + item.payout, 0);
  const payoutMultipliers = query.data?.payoutMultipliersBasisPoints ?? [];
  const maxMultiplier = Math.max(...payoutMultipliers, 0) / 10_000;
  const proofRound = pendingRound ?? displayedRounds.at(-1) ?? null;
  const currentBatchIds = new Set(batchRounds.map((item) => item.id));
  const historyRounds = (query.data?.recentRounds ?? []).filter((item) => !currentBatchIds.has(item.id));
  const buttonLabel = batchProgress?.stage === "animating"
    ? `Падают шары · ${batchProgress.completed}/${batchProgress.total}…`
    : batchProgress
      ? `Шар ${Math.min(batchProgress.completed + 1, batchProgress.total)} из ${batchProgress.total} · готовим…`
      : pendingRound
        ? "Завершить падение"
        : `Запустить ${batchLabel(ballCount)}`;
  return <div className="committed-arcade plinko-page" data-testid="page-plinko">
    <div className="ca-shell">
      <GameHeader title="PLINKO" balance={displayedBalance} onBack={onBack} />
      {query.isLoading ? <div className="ca-loading" aria-label="Загружаем игру"><i /><i /><i /></div>
        : query.isError && !query.data ? <div className="ca-error" role="alert"><CircleAlert size={16} />Не удалось загрузить игру и баланс.<button type="button" onClick={() => void query.refetch()} data-testid="button-plinko-retry">Повторить</button></div>
          : <>
            <section className="ca-intro">
              <div><span className="ca-kicker">ПАДЕНИЕ · RTP 95%</span><h1>Plinko</h1><p>Нажмите «Запустить» — шарики упадут по серверному результату.</p></div>
              <div className="ca-live-stat"><small>{displayedRounds.length
                ? `ВЫПЛАТА СЕРИИ · ${displayedRounds.length}${batchProgress ? `/${batchProgress.total}` : ""} ШАРОВ`
                : `МАКС. ВЫПЛАТА · ${batchLabel(ballCount).toUpperCase()}`}</small>
                <b>{money.format(displayedRounds.length ? summaryPayout : (stakeValid ? stake : 0) * ballCount * maxMultiplier)}</b><span>кредитов</span></div>
            </section>
            <section className="ca-controls ca-plinko-controls" aria-label="Параметры падения">
              <div className="ca-control-group"><span className="ca-label">ЧИСЛО РЯДОВ</span><div className="ca-segment ca-row-picks">
                {Array.from({ length: 9 }, (_, index) => index + 8).map((value) => <button type="button" key={value} aria-pressed={rows === value} disabled={busy || activeRound?.status === "committed" || !!query.data?.pendingRound}
                  onClick={() => { setRows(value); setRound(null); setBatchRounds([]); setRevealedRoundIds([]); setNotice(""); }} data-testid={`button-plinko-rows-${value}`}>{value}</button>)}
              </div></div>
              <div className="ca-control-group"><span className="ca-label">УРОВЕНЬ РИСКА</span><div className="ca-segment ca-risk-picks">
                {(["low", "medium", "high"] as const).map((value) => <button type="button" key={value} aria-pressed={risk === value} disabled={busy || activeRound?.status === "committed" || !!query.data?.pendingRound}
                  onClick={() => { setRisk(value); setRound(null); setBatchRounds([]); setRevealedRoundIds([]); setNotice(""); }} data-testid={`button-plinko-risk-${value}`}>{value === "low" ? "Низкий" : value === "medium" ? "Средний" : "Высокий"}</button>)}
              </div></div>
              <StakeField value={stakeText} onChange={setStakeText} balance={displayedBalance} disabled={busy || activeRound?.status === "committed" || !!query.data?.pendingRound} />
              <div className="ca-plinko-count" aria-label="Количество шаров">
                <div className="ca-field-heading"><span>ШАРОВ ЗА ЗАПУСК</span><span>1–15</span></div>
                <div className="ca-count-stepper">
                  <button type="button" aria-label="Уменьшить количество шаров" disabled={busy || ballCount <= 1 || activeRound?.status === "committed"}
                    onClick={() => setBallCount((count) => Math.max(1, count - 1))}>−</button>
                  <output aria-live="polite" data-testid="value-plinko-ball-count">{batchLabel(ballCount)}</output>
                  <button type="button" aria-label="Увеличить количество шаров" disabled={busy || ballCount >= 15 || activeRound?.status === "committed"}
                    onClick={() => setBallCount((count) => Math.min(15, count + 1))}>+</button>
                </div>
                <p className={`ca-helper${totalStakeValid ? "" : " is-error"}`} data-testid="text-plinko-total-stake">
                  {stakeValid
                    ? `Ставка за шар: ${money.format(stake)} · всего: ${money.format(totalStake)} кредитов`
                    : "Введите ставку от 100 кредитов с шагом 100."}
                  {stakeValid && !totalStakeValid ? " Не хватает баланса на всю серию." : ""}
                </p>
              </div>
            </section>
            <PlinkoBoard
              rounds={boardRounds}
              rows={activeRound?.rows ?? rows}
              multipliers={payoutMultipliers}
              animationStartedAt={animationStartedAt}
            />
            {summaryRounds.length > 0 && <div className={`ca-result${summaryPayout > summaryStake ? " result-won" : ""}`} role="status" aria-live="polite" data-testid="status-plinko-round">
              <div>
                <span>{pendingRound
                  ? `СЕРИЯ · ${displayedRounds.length}/${batchProgress?.total ?? ballCount} ШАРОВ`
                  : batchProgress
                    ? `ОБЩАЯ ВЫПЛАТА · ${displayedRounds.length}/${batchProgress.total} ШАРОВ`
                    : `ИТОГ · ${batchLabel(displayedRounds.length).toUpperCase()}`}
                </span>
                <b>Ставка за шар {formatCredits(summaryRounds[0]!.stake)} · всего поставлено {formatCredits(summaryStake)}</b>
              </div>
              <strong>{money.format(summaryPayout)} кредитов</strong>
            </div>}
            <div className="ca-round-actions">
              <button type="button" className="ca-primary ca-plinko-primary"
                disabled={busy || (!pendingRound && (!query.data?.gameEnabled || !totalStakeValid || !!query.data?.pendingRound))}
                onClick={() => pendingRound ? void resumePendingRound(pendingRound) : void startRoundBatch()}
                data-testid="button-plinko-start">
                {recovering ? "Завершаем сохранённый бросок…" : buttonLabel}
              </button>
            </div>
            {notice && <div className="ca-error" role="alert"><CircleAlert size={15} />{notice}
              {pendingRound && <button type="button" onClick={() => void resumePendingRound(pendingRound)} data-testid="button-plinko-retry">
                <RotateCw size={13} />Завершить
              </button>}
            </div>}
            {!query.data?.gameEnabled && <div className="ca-notice" role="status">Игра временно недоступна.</div>}
            {proofRound && <Proof hash={proofRound.serverSeedHash} reveal={proofRound.serverSeedReveal} clientSeed={proofRound.clientSeed} version={proofRound.algorithmVersion} />}
            <section className="ca-history" aria-label="Последние падения">
              <div className="ca-section-title"><b>Последние падения</b><span>до 20 записей</span></div>
              {historyRounds.length ? <div className="ca-history-list">{historyRounds.slice(0, 6).map((item) =>
                <div className="ca-history-item" key={item.id} data-testid={`item-plinko-history-${item.id}`}>
                  <span className={`ca-history-dot ${item.status === "settled" && item.payout > item.stake ? "won" : "lost"}`} />
                  <span><b>{item.rows} рядов · {item.risk === "low" ? "низкий" : item.risk === "medium" ? "средний" : "высокий"} риск</b><small>Слот {item.slotIndex === null ? "—" : item.slotIndex + 1}</small></span>
                  <strong>{money.format(item.payout)} кр.</strong>
                </div>)}</div> : <div className="ca-empty"><span />История появится после первого падения.</div>}
            </section>
          </>}
    </div>
  </div>;
}
