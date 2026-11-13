import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CircleAlert, RotateCw, ShieldCheck, Users } from "lucide-react";
import {
  getGetDarkAceDiceQueryKey,
  getGetDarkAceDiceRoundQueryKey,
  useGetDarkAceDice,
  useGetDarkAceDiceRound,
  usePlayDarkAceDiceRound,
  useUpdateDarkAceGamePresence,
} from "@workspace/api-client-react";
import { getGameCountdownTone } from "@/lib/game-countdown";
import { playGameCountdownTick } from "@/lib/game-countdown-audio";
import type { WinCelebrationInput } from "@/components/WinCelebration";
import { getStakeChipAmount, getStakeChipOptions, StakeChipPicker, type StakeChipKey } from "@/components/StakeChipPicker";
import {
  getDiceMaximumPerSelection,
  isDiceSelection,
  isDiceSelectionSet,
  type DiceSelection,
} from "@/lib/dice-selection";
import "../GameCountdown.css";
import "./DiceGamePage.css";

type PendingRound = { requestId: string; selections: DiceSelection[]; stake: number };
type TablePhase = "betting" | "rolling" | "result" | "waiting";

const PENDING_KEY = "dark-ace-dice-pending-v1";
const MAX_STAKE = 250_000_000;
const FALLBACK_ROLL_DURATION_MS = 6_000;
const MIN_STAKE = 100;
const money = new Intl.NumberFormat("ru-RU");

function getDiceApiErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = error.data;
  if (!data || typeof data !== "object" || !("error" in data)) return null;
  return typeof data.error === "string" ? data.error : null;
}

const selectionCopy: Record<DiceSelection, string> = {
  less_than_7: "МЕНЬШЕ 7",
  exactly_7: "РОВНО 7",
  greater_than_7: "БОЛЬШЕ 7",
};
const outcomes: { id: DiceSelection; label: string; multiplier: string; note: string }[] = [
  { id: "less_than_7", label: "МЕНЬШЕ 7", multiplier: "2×", note: "сумма 2–6" },
  { id: "exactly_7", label: "РОВНО 7", multiplier: "4×", note: "точная сумма" },
  { id: "greater_than_7", label: "БОЛЬШЕ 7", multiplier: "2×", note: "сумма 8–12" },
];

function makeRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("Защищённый идентификатор раунда недоступен на этом устройстве.");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readPendingRound(): PendingRound | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingRound> & { selection?: unknown };
    const selections = Array.isArray(parsed.selections)
      ? parsed.selections
      : isDiceSelection(parsed.selection) ? [parsed.selection] : [];
    if (
      typeof parsed.requestId === "string"
      && /^[0-9a-f-]{36}$/i.test(parsed.requestId)
      && selections.length === 1
      && isDiceSelectionSet(selections)
      && Number.isSafeInteger(parsed.stake)
      && (parsed.stake as number) >= MIN_STAKE
      && (parsed.stake as number) <= MAX_STAKE
      && (parsed.stake as number) % 100 === 0
    ) return { requestId: parsed.requestId, selections, stake: parsed.stake as number };
  } catch {
    return null;
  }
  return null;
}

function isNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 404;
}

function getPhase(round: {
  status: string;
  bettingClosesAt: string;
  rollingStartedAt: string | null;
  rollEndsAt: string | null;
  resultEndsAt: string | null;
}, now: number): TablePhase {
  const close = Date.parse(round.bettingClosesAt);
  const rollStart = round.rollingStartedAt ? Date.parse(round.rollingStartedAt) : null;
  const rollEnd = round.rollEndsAt ? Date.parse(round.rollEndsAt) : null;
  const resultEnd = round.resultEndsAt ? Date.parse(round.resultEndsAt) : null;
  const status = String(round.status).toLowerCase();

  if (Number.isFinite(close) && now < close) return "betting";
  if (rollStart !== null && rollEnd !== null && now >= rollStart && now < rollEnd) return "rolling";
  if (rollEnd !== null && resultEnd !== null && now >= rollEnd && now < resultEnd) return "result";
  if (rollEnd !== null && now >= rollEnd && (resultEnd === null || now < resultEnd)) return "result";
  if (resultEnd !== null && now >= resultEnd) return "waiting";
  if (Number.isFinite(close) && now >= close && rollStart === null) return "waiting";
  if (status.includes("roll")) return "rolling";
  if (status.includes("result") || status.includes("complete") || status.includes("settled")) return "result";
  return "betting";
}

const DICE_REST_ROTATION: Record<number, { x: string; y: string }> = {
  1: { x: "0deg", y: "0deg" },
  2: { x: "-90deg", y: "0deg" },
  3: { x: "0deg", y: "-90deg" },
  4: { x: "0deg", y: "90deg" },
  5: { x: "90deg", y: "0deg" },
  6: { x: "0deg", y: "180deg" },
};
const DICE_FACES = [
  { value: 1, side: "front" },
  { value: 6, side: "back" },
  { value: 3, side: "right" },
  { value: 4, side: "left" },
  { value: 2, side: "top" },
  { value: 5, side: "bottom" },
] as const;

function Die({ value, showValues, rolling, index, animationDelay }: {
  value: number | null;
  showValues: boolean;
  rolling: boolean;
  index: number;
  animationDelay: string;
}) {
  const rest = DICE_REST_ROTATION[value ?? 1]!;
  return (
    <div
      className={`dice-die${rolling ? ` is-rolling die-${index}` : ""}`}
      style={{ "--die-rest-x": rest.x, "--die-rest-y": rest.y } as CSSProperties}
      role="img"
      aria-label={rolling ? `Кубик ${index} бросается` : showValues && value ? `Кубик ${index}: ${value}` : `Кубик ${index}, ожидает броска`}
    >
      <div className="dice-cube" style={{ animationDelay }}>
        {DICE_FACES.map((face) => (
          <div className={`dice-cube-face cube-face-${face.side} face-${face.value}`} key={face.side} aria-hidden="true">
            {showValues
              ? Array.from({ length: face.value }, (_, pip) => <i key={pip} className={`pip pip-${pip + 1}`} />)
              : <span className="die-placeholder">?</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "DA";
}

export type DiceGamePageProps = {
  sessionReady: boolean;
  gameEnabled: boolean;
  onBack(): void;
  onWalletRefresh(): void;
  onWin?: (event: WinCelebrationInput) => void;
};

export default function DiceGamePage({ sessionReady, gameEnabled, onBack, onWalletRefresh, onWin }: DiceGamePageProps) {
  const queryClient = useQueryClient();
  const gamePresence = useUpdateDarkAceGamePresence();
  useEffect(() => {
    if (!sessionReady || !gameEnabled) return;
    const updatePresence = () => gamePresence.mutate({ data: { game: "dice" } });
    updatePresence();
    const timer = window.setInterval(updatePresence, 15_000);
    return () => window.clearInterval(timer);
  }, [gameEnabled, gamePresence.mutate, sessionReady]);
  const diceQuery = useGetDarkAceDice({
    query: {
      enabled: sessionReady,
      queryKey: getGetDarkAceDiceQueryKey(),
      refetchOnWindowFocus: true,
      refetchInterval: (query) => {
        if (!sessionReady) return false;
        return query.state.data?.currentRound.status === "rolling" ? 500 : 1_000;
      },
      staleTime: 1_000,
    },
  });
  const [pendingRound, setPendingRound] = useState<PendingRound | null>(null);
  const [queuedBets, setQueuedBets] = useState<{ selection: DiceSelection; stake: number }[]>([]);
  const queuedBetsRef = useRef<{ selection: DiceSelection; stake: number }[]>([]);
  const [chipState, setChipState] = useState<{ roundNumber: number | null; budget: number; key: StakeChipKey }>({
    roundNumber: null,
    budget: 0,
    key: "1",
  });
  const [notice, setNotice] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);
  const settledIds = useRef(new Set<string>());
  const notifiedRounds = useRef(new Set<number>());
  const playRound = usePlayDarkAceDiceRound();
  const recoveryQuery = useGetDarkAceDiceRound(pendingRound?.requestId ?? "", {
    query: {
      enabled: sessionReady && storageReady && !!pendingRound,
      queryKey: getGetDarkAceDiceRoundQueryKey(pendingRound?.requestId ?? ""),
      retry: false,
      refetchOnWindowFocus: false,
    },
  });
  const currentRound = diceQuery.data?.currentRound;
  const myBets = diceQuery.data?.myBets ?? (diceQuery.data?.myBet ? [diceQuery.data.myBet] : []);
  const selection = [...new Set([
    ...myBets.map((bet) => bet.selection),
    ...(pendingRound?.selections ?? []),
    ...queuedBets.map((bet) => bet.selection),
  ])];
  const myBetsStateKey = myBets.map((bet) => `${bet.id}:${bet.won}:${bet.payout}:${bet.stake}`).join(":");
  const serverClockOffset = currentRound?.serverNow && diceQuery.dataUpdatedAt
    ? Date.parse(currentRound.serverNow) - diceQuery.dataUpdatedAt
    : 0;
  const synchronizedNow = now + serverClockOffset;
  const phase = currentRound ? getPhase(currentRound, synchronizedNow) : "betting";

  useEffect(() => {
    const saved = readPendingRound();
    if (saved) {
      setPendingRound(saved);
      setNotice("Восстанавливаем сохранённую ставку.");
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), phase === "rolling" ? 75 : 250);
    return () => window.clearInterval(timer);
  }, [phase]);

  const settleRound = (response: NonNullable<typeof recoveryQuery.data>, requestId: string) => {
    if (settledIds.current.has(requestId)) return;
    settledIds.current.add(requestId);
    setPendingRound(null);
    setNotice("");
    inFlight.current = false;
    try {
      window.sessionStorage.removeItem(PENDING_KEY);
    } catch {
      // The server has accepted the idempotent request; in-memory state remains authoritative.
    }
    const responseBets = response.bets ?? [response.bet];
    queryClient.setQueryData(getGetDarkAceDiceQueryKey(), (current: typeof diceQuery.data) => current
      ? { ...current, balance: response.balance, currentRound: response.currentRound, myBet: response.bet, myBets: responseBets }
      : current);
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceDiceQueryKey() });
    onWalletRefresh();
    continueQueuedBet(response.currentRound);
  };

  function continueQueuedBet(round: NonNullable<typeof diceQuery.data>["currentRound"]) {
    if (!queuedBetsRef.current.length) return;
    const serverNow = typeof round.serverNow === "string" ? Date.parse(round.serverNow) : Date.now();
    if (getPhase(round, serverNow) !== "betting") {
      queuedBetsRef.current = [];
      setQueuedBets([]);
      setNotice("Раунд закрылся до отправки добавочных фишек. Они не списаны.");
      return;
    }
    const [next, ...remaining] = queuedBetsRef.current;
    queuedBetsRef.current = remaining;
    setQueuedBets(remaining);
    if (!next) return;
    const payload: PendingRound = { requestId: makeRequestId(), selections: [next.selection], stake: next.stake };
    try {
      window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
    } catch {
      setNotice("Не удалось сохранить добавочную ставку. Она не отправлена.");
      return;
    }
    sendPending(payload);
  }

  const sendPending = (payload: PendingRound) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingRound(payload);
    setNotice("Подтверждаем ставку на общем столе.");
    playRound.mutate({ data: payload }, {
      onSuccess: (response) => settleRound(response, payload.requestId),
      onError: (error) => {
        inFlight.current = false;
        const serverMessage = getDiceApiErrorMessage(error);
        if (serverMessage === "Этот номер операции уже использован для другой ставки.") {
          setPendingRound(null);
          try {
            window.sessionStorage.removeItem(PENDING_KEY);
          } catch {
            // The stale request is also cleared from in-memory state.
          }
          setNotice("Номер операции уже связан с другой ставкой. Обновляю стол: если прежняя ставка была принята, она останется в списке. Затем можно выбрать исход и поставить снова.");
          void queryClient.invalidateQueries({ queryKey: getGetDarkAceDiceQueryKey() });
          onWalletRefresh();
          return;
        }
        setNotice(serverMessage
          ? `${serverMessage} Запрос сохранён — сначала нажмите «Проверить».`
          : "Не удалось подтвердить ставку. Запрос сохранён для безопасной проверки.");
      },
    });
  };

  useEffect(() => {
    if (!sessionReady || !storageReady || !pendingRound || recoveryQuery.isFetching || recoveryQuery.isPending) return;
    if (recoveryQuery.data) {
      settleRound(recoveryQuery.data, pendingRound.requestId);
      return;
    }
    if (recoveryQuery.isError) {
      if (isNotFound(recoveryQuery.error)) {
        if (!inFlight.current) sendPending(pendingRound);
      } else {
        setNotice("Нет связи для проверки ставки. Повторите проверку — запрос сохранён.");
      }
    }
  }, [sessionReady, storageReady, pendingRound, recoveryQuery.data, recoveryQuery.error, recoveryQuery.isError, recoveryQuery.isFetching, recoveryQuery.isPending]);

  const myTotalStake = myBets.reduce((sum, bet) => sum + bet.stake, 0);
  const myTotalPayout = myBets.reduce((sum, bet) => sum + bet.payout, 0);
  const queuedStakeTotal = queuedBets.reduce((sum, bet) => sum + bet.stake, 0);
  const outstandingStake = (pendingRound?.stake ?? 0) + queuedStakeTotal;
  const remainingRoundStake = Math.max(0, MAX_STAKE - myTotalStake - outstandingStake);
  const chipBudgetCandidate = Math.min(MAX_STAKE, Math.max(0, (diceQuery.data?.balance ?? 0) + myTotalStake));
  useEffect(() => {
    if (!currentRound || chipState.roundNumber === currentRound.roundNumber) return;
    setChipState((current) => ({ roundNumber: currentRound.roundNumber, budget: chipBudgetCandidate, key: current.key }));
  }, [currentRound?.roundNumber, chipBudgetCandidate, chipState.roundNumber]);
  const chipBudget = chipState.roundNumber === currentRound?.roundNumber ? chipState.budget : chipBudgetCandidate;
  const selectedChipKey = chipState.key;
  const maxStake = useMemo(
    () => getDiceMaximumPerSelection(Math.max(0, (diceQuery.data?.balance ?? 0) - outstandingStake), 1, remainingRoundStake),
    [diceQuery.data?.balance, outstandingStake, remainingRoundStake],
  );
  const stakeOptions = getStakeChipOptions(chipBudget, MIN_STAKE, 100);
  const selectedStakeTotal = getStakeChipAmount(selectedChipKey, stakeOptions, maxStake);
  const stakeValid = Number.isSafeInteger(selectedStakeTotal)
    && selectedStakeTotal >= MIN_STAKE
    && selectedStakeTotal <= maxStake
    && selectedStakeTotal % 100 === 0
    && selectedStakeTotal <= remainingRoundStake
    && selectedStakeTotal <= (diceQuery.data?.balance ?? 0);
  const operationBusy = playRound.isPending || recoveryQuery.isFetching || (!!pendingRound && recoveryQuery.isPending);
  const hasBetThisRound = myBets.length > 0;
  const myResultKnown = myBets.length > 0 && myBets.every((bet) => bet.won !== null && bet.won !== undefined);
  useEffect(() => {
    if (!myBets.length || !myResultKnown || !onWin) return;
    const roundNumber = myBets[0]!.roundNumber;
    if (notifiedRounds.current.has(roundNumber)) return;
    notifiedRounds.current.add(roundNumber);
    const isWin = myTotalPayout > 0;
    onWin({
      eventId: `dice:${roundNumber}`,
      outcome: isWin ? "win" : "loss",
      amount: isWin ? myTotalPayout : myTotalStake,
    });
  }, [myBetsStateKey, myResultKnown, myTotalPayout, myTotalStake, onWin]);
  const canBet = phase === "betting";
  const history = diceQuery.data?.recentRounds ?? [];
  const secondsLeft = currentRound
    ? Math.max(0, Math.ceil((Date.parse(currentRound.bettingClosesAt) - synchronizedNow) / 1000))
    : 10;
  const stakeMessage = diceQuery.data && diceQuery.data.balance < MIN_STAKE
    ? "Недостаточно кредитов для минимальной ставки."
    : maxStake < MIN_STAKE
      ? "Недостаточно доступных кредитов или достигнут лимит раунда."
      : !stakeValid
        ? "Выбранная фишка превышает доступный баланс или лимит раунда."
        : "";

  const startRound = (requestedSelection: [DiceSelection]) => {
    const requestedStakeValid = requestedSelection.length === 1
      && Number.isSafeInteger(selectedStakeTotal)
      && selectedStakeTotal >= MIN_STAKE
      && selectedStakeTotal <= maxStake
      && selectedStakeTotal % 100 === 0
      && selectedStakeTotal <= remainingRoundStake
      && selectedStakeTotal <= (diceQuery.data?.balance ?? 0);
    if (!requestedStakeValid || !gameEnabled || !sessionReady || !canBet || operationBusy) return;
    setNotice("");
    let payload: PendingRound;
    try {
      payload = { requestId: makeRequestId(), selections: requestedSelection, stake: selectedStakeTotal };
      window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось сохранить ставку на этом устройстве.");
      return;
    }
    sendPending(payload);
  };

  const chooseOutcome = (outcome: DiceSelection) => {
    if (!canBet || !gameEnabled || !stakeValid) return;
    const acceptedSelections = [
      ...myBets.map((bet) => bet.selection),
      ...(pendingRound?.selections ?? []),
      ...queuedBets.map((bet) => bet.selection),
    ];
    const nextSelections = [...new Set([...acceptedSelections, outcome])];
    if (!isDiceSelectionSet(nextSelections)) {
      setNotice("Можно поставить на один исход или на пару с числом 7: «меньше 7 + ровно 7» либо «ровно 7 + больше 7».");
      return;
    }
    setNotice("");
    if (pendingRound || inFlight.current || recoveryQuery.isFetching) {
      const existingIndex = queuedBetsRef.current.findIndex((bet) => bet.selection === outcome);
      const nextQueue = [...queuedBetsRef.current];
      if (existingIndex >= 0) nextQueue[existingIndex] = {
        ...nextQueue[existingIndex]!,
        stake: nextQueue[existingIndex]!.stake + selectedStakeTotal,
      };
      else nextQueue.push({ selection: outcome, stake: selectedStakeTotal });
      queuedBetsRef.current = nextQueue;
      setQueuedBets(nextQueue);
      setNotice("Фишка добавлена к ставке и отправится сразу после её подтверждения.");
      return;
    }
    startRound([outcome]);
  };

  const retryPending = () => {
    if (!pendingRound || operationBusy) return;
    setNotice("Проверяем ставку у сервера…");
    if (recoveryQuery.isError) void recoveryQuery.refetch();
    else sendPending(pendingRound);
  };

  const displayedDice = phase === "result" && currentRound?.die1 !== null && currentRound?.die2 !== null;
  const rollDurationMs = currentRound?.rollingStartedAt && currentRound.rollEndsAt
    ? Math.max(1, Date.parse(currentRound.rollEndsAt) - Date.parse(currentRound.rollingStartedAt))
    : FALLBACK_ROLL_DURATION_MS;
  const animationDuration = currentRound?.rollingStartedAt && currentRound.rollEndsAt
    ? `${rollDurationMs}ms`
    : `${FALLBACK_ROLL_DURATION_MS}ms`;
  const rollStartedAt = currentRound?.rollingStartedAt ? Date.parse(currentRound.rollingStartedAt) : null;
  const rollKey = currentRound?.rollingStartedAt && rollStartedAt !== null
    ? `${currentRound.roundNumber}:${currentRound.rollingStartedAt}`
    : null;
  const [rollAnimation, setRollAnimation] = useState<{ key: string; delay: string } | null>(null);
  useEffect(() => {
    if (rollKey === null || rollStartedAt === null) return;
    setRollAnimation((current) => {
      if (current?.key === rollKey) return current;
      const elapsed = Math.max(0, Math.min(rollDurationMs - 1, synchronizedNow - rollStartedAt));
      return { key: rollKey, delay: `-${elapsed}ms` };
    });
  }, [rollKey, rollStartedAt, rollDurationMs, synchronizedNow]);
  const rollAnimationDelay = rollAnimation?.key === rollKey ? rollAnimation.delay : "0ms";
  const diceAnimationReady = phase === "rolling" && (rollKey === null || rollAnimation?.key === rollKey);
  const showDiceValues = phase === "rolling" || displayedDice;
  const countdownTone = getGameCountdownTone(secondsLeft);

  useEffect(() => {
    if (phase === "betting" && currentRound) {
      playGameCountdownTick(`dice:${currentRound.roundNumber}`, secondsLeft);
    }
  }, [phase, currentRound?.roundNumber, secondsLeft]);

  return (
    <div className="dice-page" data-testid="page-dice">
      <div className="dice-shell">
        <header className="dice-topbar">
          <button type="button" className="dice-back" onClick={onBack} aria-label="Вернуться в DARK ACE" data-testid="button-dice-back">
            <ArrowLeft size={17} /><span>КЛУБ</span>
          </button>
          <div className="dice-brand"><span className="dice-brand-mark">A</span><span>DARK ACE<small>ОБЩИЙ ИГРОВОЙ СТОЛ</small></span></div>
        </header>

        <section className={`dice-stage${phase === "rolling" ? " is-active" : ""}`} aria-label="Общий бросок двух кубиков" data-testid="dice-stage">
          <div className="stage-orbit orbit-one" /><div className="stage-orbit orbit-two" />
          <span className="stage-kicker">
            {phase === "betting" ? `РАУНД ${currentRound?.roundNumber ?? "—"} · ПРИЁМ СТАВОК` : phase === "rolling" ? "ОБЩИЙ БРОСОК · РАУНД В ИГРЕ" : phase === "result" ? "РЕЗУЛЬТАТ ОБЩЕГО РАУНДА" : "СЛЕДУЮЩИЙ РАУНД ГОТОВИТСЯ"}
          </span>
          {phase === "betting" && (
            <div className={`dice-countdown-card ${countdownTone}${secondsLeft <= 3 ? " is-urgent" : ""}`} aria-label={`Приём ставок, осталось ${secondsLeft} секунд`}>
              <span>СТАВКИ ЗАКРОЮТСЯ ЧЕРЕЗ</span>
              <strong className={`dice-stage-countdown game-countdown-timer ${countdownTone}`} data-testid="dice-countdown">
                {String(secondsLeft).padStart(2, "0")}с
              </strong>
            </div>
          )}
          <div className="dice-pair" style={{ ["--roll-duration" as string]: animationDuration }}>
            <Die value={showDiceValues ? currentRound?.die1 ?? null : null} showValues={showDiceValues} rolling={diceAnimationReady} index={1} animationDelay={rollAnimationDelay} />
            <span className="dice-plus">+</span>
            <Die value={showDiceValues ? currentRound?.die2 ?? null : null} showValues={showDiceValues} rolling={diceAnimationReady} index={2} animationDelay={rollAnimationDelay} />
          </div>
          <div className="dice-last-line" data-testid="text-dice-last-result">
            {phase === "rolling" ? <span>Серверный бросок продолжается</span> : displayedDice
              ? <><span>ОБЩИЙ ИТОГ</span><strong>{currentRound?.die1} <i>+</i> {currentRound?.die2} <i>=</i> {currentRound?.total}</strong></>
              : phase === "result" ? <span>Раунд завершён · ждём следующий стол</span> : phase === "waiting" ? <span>Раунд завершён · сервер готовит новый стол</span> : <span>Один стол для всех участников</span>}
          </div>
        </section>

        {diceQuery.isError && !diceQuery.data && (
          <div className="dice-query-error" role="alert" data-testid="status-dice-load-error">
            <CircleAlert size={14} /> Не удалось загрузить стол и баланс.
            <button type="button" onClick={() => void diceQuery.refetch()} data-testid="button-dice-retry">Повторить</button>
          </div>
        )}

        <p className="dice-selection-note">
          Выберите фишку и нажмите на исход. Повторное нажатие добавит такую же сумму; второй исход можно поставить отдельно.
        </p>
        <section className="dice-chip-control" aria-label="Выбор фишки для ставки">
          <StakeChipPicker
            budget={chipBudget}
            maxStake={maxStake}
            minStake={MIN_STAKE}
            step={100}
            selectedKey={selectedChipKey}
            onSelect={(key) => setChipState((current) => ({
              roundNumber: currentRound?.roundNumber ?? current.roundNumber,
              budget: chipBudget,
              key,
            }))}
            disabled={!canBet || !gameEnabled || !sessionReady}
            testIdPrefix="button-dice-chip"
            resetKey={currentRound?.roundNumber}
          />
          {stakeMessage && <div className="stake-helper helper-error" role="status" data-testid="text-dice-stake-helper">{stakeMessage}</div>}
        </section>
        <section className="dice-selection" aria-label="Нажмите на исход, чтобы сразу поставить указанную сумму">
          {outcomes.map((outcome) => (
            <button
              type="button"
              key={outcome.id}
              className={`dice-outcome ${outcome.id === "exactly_7" ? "outcome-seven" : "outcome-green"}${selection.includes(outcome.id) ? " selected" : ""}`}
              aria-pressed={selection.includes(outcome.id)}
              aria-label={`${outcome.label}, коэффициент ${outcome.multiplier}, ставка ${money.format(selectedStakeTotal)} кредитов, нажмите, чтобы поставить`}
              disabled={!canBet || !gameEnabled || !sessionReady || !stakeValid || diceQuery.isError}
              onClick={() => chooseOutcome(outcome.id)}
              data-stake-chip-target
              data-testid={`button-dice-selection-${outcome.id}`}
            >
              <span>{outcome.label}</span><strong>{outcome.multiplier}</strong><small>{outcome.note}</small>
            </button>
          ))}
        </section>

        {(notice || (pendingRound && !operationBusy)) && (
          <div className={`dice-notice${notice.includes("Не удалось") || notice.includes("Нет связи") ? " notice-error" : ""}`} role="status" data-testid="status-dice-round">
            <span>{notice || "Ставка ожидает проверки."}</span>
            {pendingRound && !operationBusy && <button type="button" onClick={retryPending} data-testid="button-dice-retry-round"><RotateCw size={13} /> Проверить</button>}
          </div>
        )}
        {!gameEnabled && <div className="dice-disabled-note" role="status" data-testid="status-dice-disabled">Игра временно недоступна.</div>}

        {hasBetThisRound && (
          <section className="dice-result-card" aria-live="polite" data-testid="status-dice-my-bet">
            <div className="result-heading">
              <span className="result-check"><Check size={13} /></span>
              <strong>ВАША СТАВКА ПРИНЯТА</strong>
              <small>{myBets.map((bet) => selectionCopy[bet.selection]).join(" + ")}</small>
            </div>
            <div className="result-details">
              <span>Общая ставка <b>{money.format(myTotalStake)}</b></span>
              {myResultKnown && myTotalPayout > 0
                ? <span>Общий выигрыш <b>+{money.format(myTotalPayout)}</b></span>
                : myResultKnown ? <span>Потеря <b>−{money.format(myTotalStake)}</b></span> : <span>Расчёт после общего результата</span>}
            </div>
          </section>
        )}

        <section className="dice-room" aria-label="Участники общего раунда" data-testid="list-dice-room-bets">
          <div className="room-heading">
            <span><Users size={13} /> СТАВКИ УЧАСТНИКОВ</span>
            <strong>{currentRound?.betCount ?? 0} <small>ИГРОКОВ</small></strong>
          </div>
          {diceQuery.isLoading ? (
            <div className="room-skeleton" aria-label="Загружаем ставки участников"><i /><i /><i /></div>
          ) : (currentRound?.bets?.length ?? 0) > 0 ? (
            <div className="room-bets">
              {currentRound?.bets.map((bet) => (
                <div className={`room-bet${myBets.some((myOwnBet) => myOwnBet.id === bet.id) ? " own-bet" : ""}`} key={bet.id} data-testid={`item-dice-room-bet-${bet.id}`}>
                  <span className="room-avatar" aria-hidden="true">{initials(bet.displayName)}</span>
                  <span className="room-player"><strong>{bet.displayName}</strong><small>{selectionCopy[bet.selection]}</small></span>
                  <span className="room-stake">{money.format(bet.stake)}<small>КРЕД.</small></span>
                </div>
              ))}
            </div>
          ) : (
            <div className="room-empty"><span className="room-empty-mark" />Вы будете первым за этим столом.</div>
          )}
          <div className="room-total"><span>ОБЩАЯ СУММА СТАВОК</span><strong>{money.format(currentRound?.totalStake ?? 0)} <small>КРЕДИТОВ</small></strong></div>
        </section>

        <footer className="dice-footer">
          <span><ShieldCheck size={12} /> Один серверный результат для всех</span>
          {history.length > 0 && <div className="dice-history" aria-label="Последние общие результаты" data-testid="list-dice-history">
            <span>ИСТОРИЯ</span>
            {history.slice(0, 10).map((round) => <span key={round.roundNumber} className="history-chip" aria-label={`Раунд ${round.roundNumber}: ${round.total}`} data-testid={`item-dice-history-${round.roundNumber}`}>{round.total}</span>)}
          </div>}
        </footer>
      </div>
    </div>
  );
}
