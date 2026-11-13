import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Check, Clock3, Crown, LoaderCircle, RotateCw, Users, Wallet } from "lucide-react";
import {
  getGetDarkAceBootstrapQueryKey,
  getGetDarkAceBattleQueryKey,
  getListDarkAceTransactionsQueryKey,
  useAddDarkAceBattleEntry,
  useCancelDarkAceBattleEntry,
  useGetDarkAceBattle,
} from "@workspace/api-client-react";
import type { DarkAceBattleSnapshot } from "@workspace/api-client-react";
import { MAX_GAME_STAKE } from "@/lib/game-limits";
import { playGameCountdownTick } from "@/lib/game-countdown-audio";

const numberFormat = new Intl.NumberFormat("ru-RU");
const compactFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const credits = (value: number) => `${numberFormat.format(value)} кредитов`;
const compactCredits = (value: number) => value >= 1_000 ? `${compactFormat.format(value / 1_000)}k` : numberFormat.format(value);
const quickAmounts = [50_000, 100_000, 250_000, 500_000];
const sliceColors = ["#b99c5d", "#725d36", "#a26c55", "#6b7f72", "#8b7450"];

type Props = { sessionReady: boolean; liveConnected: boolean; gameEnabled: boolean; balance?: number };

function makeIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function sectorPath(start: number, end: number) {
  const p1 = polarPoint(100, 100, 96, start);
  const p2 = polarPoint(100, 100, 96, end);
  const largeArc = end - start > 180 ? 1 : 0;
  return `M 100 100 L ${p1.x} ${p1.y} A 96 96 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}

function BattleWheel({ snapshot, serverOffsetMs }: { snapshot: DarkAceBattleSnapshot; serverOffsetMs: number }) {
  const { round, participants } = snapshot;
  const wheelRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const settledAngleRef = useRef(0);
  const serverOffsetRef = useRef(serverOffsetMs);
  serverOffsetRef.current = serverOffsetMs;
  const total = participants.reduce((sum, participant) => sum + participant.amount, 0);
  const segments = useMemo(() => {
    let cursor = 0;
    return participants.map((participant, index) => {
      const span = total > 0 ? participant.amount / total * 360 : 360 / Math.max(1, participants.length);
      const segment = { participant, start: cursor, end: cursor + span, color: sliceColors[index % sliceColors.length] };
      cursor += span;
      return segment;
    });
  }, [participants, total]);
  const segmentSignature = segments.map(({ participant }) => `${participant.entryId}:${participant.amount}`).join("|");

  useEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel) return;
    animationRef.current?.cancel();
    animationRef.current = null;
    if (round?.status !== "spinning" || !round.winnerEntryId || !round.spinStartedAt || !round.spinEndsAt) {
      wheel.style.transform = `rotate(${settledAngleRef.current}deg)`;
      return;
    }

    const winnerSegment = segments.find((segment) => segment.participant.entryId === round.winnerEntryId);
    if (!winnerSegment) return;
    const center = (winnerSegment.start + winnerSegment.end) / 2;
    const current = settledAngleRef.current;
    const destinationBase = ((360 - center) % 360 + 360) % 360;
    const destination = current + 360 * 8 + ((destinationBase - current) % 360 + 360) % 360;
    const start = Date.parse(round.spinStartedAt);
    const end = Date.parse(round.spinEndsAt);
    const duration = 12_000;
    const elapsed = Math.min(duration, Math.max(0, Date.now() + serverOffsetRef.current - start));
    const animation = wheel.animate(
      [{ transform: `rotate(${current}deg)` }, { transform: `rotate(${destination}deg)` }],
      { duration, easing: "cubic-bezier(.12,.76,.15,1)", fill: "forwards" },
    );
    animation.currentTime = elapsed;
    animationRef.current = animation;
    const finish = () => {
      settledAngleRef.current = destination % 360;
      wheel.style.transform = `rotate(${destination % 360}deg)`;
      animationRef.current = null;
    };
    animation.onfinish = finish;
    const remaining = Math.max(0, end - (Date.now() + serverOffsetRef.current));
    const finishTimer = window.setTimeout(finish, remaining);
    return () => {
      window.clearTimeout(finishTimer);
      animation.cancel();
    };
  }, [round?.roundNumber, round?.status, round?.winnerEntryId, round?.spinStartedAt, round?.spinEndsAt, segmentSignature]);

  const wheelNames = participants.map((participant) => participant.username ? `@${participant.username}` : participant.displayName);
  return <div className={`battle-wheel-wrap ${round?.status === "spinning" ? "battle-wheel-spinning" : ""}`}>
    <div className="battle-wheel-dial">
      <div className="battle-pointer" aria-hidden="true" />
      <div className="battle-wheel" ref={wheelRef} data-testid="battle-wheel">
        <svg viewBox="0 0 200 200" role="img" aria-label="Колесо распределения шансов игроков">
          <circle cx="100" cy="100" r="98" fill="#17181b" stroke="rgba(214,187,124,.42)" strokeWidth="2" />
          {segments.map(({ participant, start, end, color }) => {
            const midpoint = (start + end) / 2;
            const labelPoint = polarPoint(100, 100, 62, midpoint);
            const textRotation = midpoint > 90 && midpoint < 270 ? midpoint + 180 : midpoint;
            const fullName = participant.username ? `@${participant.username}` : participant.displayName;
            const sectorName = fullName.length > 12 ? `${fullName.slice(0, 11)}…` : fullName;
            const sectorChance = Number(participant.winChance).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
            return <g key={participant.entryId}>
              {end - start >= 359.9
                ? <circle cx="100" cy="100" r="96" fill={color} stroke="#17181b" strokeWidth="1.4" />
                : <path d={sectorPath(start, end)} fill={color} stroke="#17181b" strokeWidth="1.4" />}
              {end - start > 18 && <g transform={`translate(${labelPoint.x} ${labelPoint.y}) rotate(${textRotation})`} textAnchor="middle" className="battle-sector-group">
                <title>{`${fullName} · ${credits(participant.amount)} · ${Number(participant.winChance).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`}</title>
                <text y="-2" className="battle-sector-label">{sectorName}</text>
                <text y="8" className="battle-sector-amount">{compactCredits(participant.amount)} · {sectorChance}%</text>
              </g>}
            </g>;
          })}
          {!participants.length && <circle cx="100" cy="100" r="96" fill="#292720" stroke="#594b30" strokeWidth="1" />}
        </svg>
        <div className="battle-wheel-core">
          <span>БАНК</span>
          <b>{numberFormat.format(round?.totalPot ?? 0)}</b>
          <small>{participants.length ? "кредитов" : "ЖДЁМ СТАВКУ"}</small>
        </div>
      </div>
    </div>
    <div className="battle-wheel-roster" aria-label="Игроки и ставки в секторах рулетки">
      {participants.length ? participants.map((participant, index) => <span className="battle-wheel-player" key={participant.entryId}>
        <i style={{ background: sliceColors[index % sliceColors.length] }} />
        <b>{wheelNames[index]}</b><small>{compactCredits(participant.amount)}</small>
      </span>) : <span className="battle-wheel-empty">Ник и сектор появятся после ставки</span>}
    </div>
  </div>;
}

export default function BattlePage({ sessionReady, liveConnected, gameEnabled, balance }: Props) {
  const queryClient = useQueryClient();
  const battleQuery = useGetDarkAceBattle({
    query: {
      enabled: sessionReady,
      queryKey: getGetDarkAceBattleQueryKey(),
      refetchInterval: liveConnected ? false : 2_000,
      refetchIntervalInBackground: false,
    },
  });
  const addEntry = useAddDarkAceBattleEntry();
  const cancelEntry = useCancelDarkAceBattleEntry();
  const [stakeText, setStakeText] = useState("50 000");
  const [quickStakeUnit, setQuickStakeUnit] = useState<number | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [notice, setNotice] = useState("");
  const lastIntent = useRef<{ amount: number; key: string } | null>(null);
  const snapshot = battleQuery.data;
  const round = snapshot?.round;
  const offset = useMemo(
    () => snapshot?.serverNow ? Date.parse(snapshot.serverNow) - Date.now() : 0,
    [snapshot?.serverNow],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  const hasParticipants = (round?.participantCount ?? 0) > 0;
  const remaining = round?.status === "open" && hasParticipants
    ? Math.max(0, Math.ceil((Date.parse(round.bettingClosesAt) - (clockNow + offset)) / 1000))
    : round?.status === "spinning" && round.spinEndsAt
      ? Math.max(0, Math.ceil((Date.parse(round.spinEndsAt) - (clockNow + offset)) / 1000))
      : 0;
  const amount = Number(stakeText.replace(/[^\d]/g, ""));
  const remainingPlayerLimit = Math.max(0, MAX_GAME_STAKE - (snapshot?.myStake ?? 0));
  const amountValid = Number.isSafeInteger(amount) && amount >= 100 && amount <= MAX_GAME_STAKE && amount % 100 === 0;
  const exceedsPlayerLimit = amount > remainingPlayerLimit;
  const joined = (snapshot?.myStake ?? 0) > 0;
  const atCapacity = (round?.participantCount ?? 0) >= 5 && !joined;
  const accepting = round?.status === "open" && (!hasParticipants || remaining > 0) && gameEnabled;
  const enoughBalance = amount <= (snapshot?.balance ?? 0);
  const canSubmit = accepting && amountValid && !exceedsPlayerLimit && enoughBalance && !atCapacity && !addEntry.isPending && !cancelEntry.isPending;
  const canCancel = round?.status === "open" && remaining > 0 && joined && !addEntry.isPending && !cancelEntry.isPending;

  useEffect(() => {
    if (round?.status === "open" && hasParticipants) {
      playGameCountdownTick(`battle:${round.roundNumber}`, remaining);
    }
  }, [round?.status, round?.roundNumber, hasParticipants, remaining]);

  const refreshSnapshot = useCallback((next: DarkAceBattleSnapshot) => {
    queryClient.setQueryData(getGetDarkAceBattleQueryKey(), next);
    queryClient.setQueryData<any>(getGetDarkAceBootstrapQueryKey(), (old: any) => old?.wallet
      ? { ...old, wallet: { ...old.wallet, balance: next.balance } }
      : old);
  }, [queryClient]);

  const submitStake = () => {
    if (!canSubmit) return;
    if (lastIntent.current?.amount !== amount) lastIntent.current = { amount, key: makeIdempotencyKey() };
    setNotice("");
    addEntry.mutate({ data: { amount, idempotencyKey: lastIntent.current.key } }, {
      onSuccess: (next) => {
        lastIntent.current = null;
        refreshSnapshot(next);
        void queryClient.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
        setNotice(joined ? "Ставка добавлена к вашему сектору." : "Вы в баттле. Ваш шанс уже на колесе.");
      },
    });
  };

  const cancelStake = () => {
    if (!snapshot || !canCancel) return;
    const refunded = snapshot.myStake;
    setNotice("");
    cancelEntry.mutate(undefined, {
      onSuccess: (next) => {
        refreshSnapshot(next);
        void queryClient.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
        setQuickStakeUnit(null);
        setNotice(`Возвращено ${credits(refunded)}.`);
      },
    });
  };

  const setAmount = (next: number) => {
    const clamped = Math.min(remainingPlayerLimit, Math.max(100, Math.floor(next / 100) * 100));
    if (clamped < 100) return;
    setStakeText(numberFormat.format(clamped));
  };
  const selectQuickStake = (quick: number) => {
    const next = quickStakeUnit === quick ? amount + quick : quick;
    if (!Number.isSafeInteger(next) || next > remainingPlayerLimit) return;
    setQuickStakeUnit(quick);
    setAmount(next);
  };

  if (battleQuery.isLoading && !snapshot) return <div className="battle-loading" aria-label="Загрузка баттла">
    <div className="battle-skeleton battle-skeleton-title" /><div className="battle-skeleton battle-skeleton-wheel" />
  </div>;
  if (battleQuery.isError && !snapshot) return <div className="battle-error panel">
    <div className="battle-error-mark"><RotateCw size={20} /></div><h2>Стол временно недоступен</h2><p>Не удалось получить данные битвы. Ставки не будут приняты, пока связь не восстановится.</p>
    <button type="button" onClick={() => void battleQuery.refetch()} data-testid="button-retry-battle">Повторить загрузку</button>
  </div>;
  if (!snapshot) return null;

  return <section className="battle-page" aria-label="Баттл DARK ACE">
    <header className="battle-round-head">
      <div className="battle-round-meta">
        <div className="battle-round-number"><span>РАУНД</span><b>#{numberFormat.format(round?.roundNumber ?? 0)}</b></div>
        <div className={`battle-status battle-state-${round?.status ?? "waiting"}`} data-testid="status-battle-round">
          <span />{round?.status === "open" ? gameEnabled ? hasParticipants ? "Приём ставок" : "Ожидание ставки" : "Игра остановлена" : round?.status === "spinning" ? "Ставки закрыты" : round?.status === "completed" ? "Завершён" : "Ожидание"}
        </div>
        <div className="battle-countdown" aria-live="off" data-testid="value-battle-countdown">
          <Clock3 size={15} /><b>{round?.status === "open" && !hasParticipants ? "—" : `${String(remaining).padStart(2, "0")}с`}</b><span>{round?.status === "open" && !hasParticipants ? "до первой ставки" : accepting ? "до закрытия" : round?.status === "spinning" ? "до результата" : "до следующего раунда"}</span>
        </div>
      </div>
    </header>

    {battleQuery.isError && <div className="battle-stale-note" role="status">Нет связи с сервером. Показаны последние полученные данные.</div>}
    <div className="battle-stage panel">
      <div className="battle-stage-top">
        <span><i className={liveConnected ? "connected" : ""} />{liveConnected ? "ОНЛАЙН" : "ОБНОВЛЕНИЕ"}</span>
        <span><Users size={11} />{numberFormat.format(round?.participantCount ?? 0)} / 5</span>
      </div>
      <BattleWheel snapshot={snapshot} serverOffsetMs={offset} />
      {round?.status === "completed" && round.winnerEntryId && <div className="battle-draw-banner" role="status"><Crown size={14} /> Раунд завершён</div>}
    </div>

    <section className="battle-entry panel">
      <div className="battle-stake-head">
        <label htmlFor="battle-stake" className="eyebrow">СУММА СТАВКИ</label>
        <div className="battle-entry-tools">
          <span><Wallet size={12} />{credits(snapshot.balance)}</span>
          {joined && round?.status === "open" && remaining > 0 && <button type="button" className="battle-cancel-entry" onClick={cancelStake} disabled={!canCancel} data-testid="button-cancel-battle-entry">
            {cancelEntry.isPending ? "ВОЗВРАТ…" : `ОТМЕНИТЬ · ${compactCredits(snapshot.myStake)}`}
          </button>}
        </div>
      </div>
      <div className={`battle-stake-input ${!amountValid ? "battle-stake-invalid" : ""}`}>
        <input id="battle-stake" inputMode="numeric" autoComplete="off" value={stakeText} onChange={(event) => { setQuickStakeUnit(null); setStakeText(numberFormat.format(Number(event.target.value.replace(/[^\d]/g, "")) || 0)); }} aria-label="Сумма ставки" data-testid="input-battle-stake" disabled={addEntry.isPending || cancelEntry.isPending} />
        <span>кредитов</span>
      </div>
      <div className="battle-adjust" aria-label="Изменить сумму ставки">
        <button type="button" onClick={() => { setQuickStakeUnit(null); setAmount(amount / 2); }} disabled={!amountValid || amount < 200 || addEntry.isPending || cancelEntry.isPending} aria-label="Разделить сумму пополам" data-testid="button-battle-half">÷2</button>
        <button type="button" onClick={() => { setQuickStakeUnit(null); setAmount(amount * 2); }} disabled={!amountValid || amount > Math.floor(remainingPlayerLimit / 2) || addEntry.isPending || cancelEntry.isPending} aria-label="Удвоить сумму" data-testid="button-battle-double">×2</button>
      </div>
      <div className="battle-quick-amounts" aria-label="Быстрый выбор суммы">
        {quickAmounts.map((quick) => <button type="button" key={quick} onClick={() => selectQuickStake(quick)} disabled={addEntry.isPending || cancelEntry.isPending || (quickStakeUnit === quick ? amount + quick : quick) > remainingPlayerLimit} className={quickStakeUnit === quick ? "battle-quick-active" : ""} title={quickStakeUnit === quick ? `Добавить ещё ${numberFormat.format(quick)} кредитов` : `Выбрать ${numberFormat.format(quick)} кредитов`} aria-label={`Быстрая ставка ${numberFormat.format(quick)} кредитов; повторное нажатие добавит эту сумму`} data-testid={`button-battle-amount-${quick}`}>{numberFormat.format(quick / 1000)}k</button>)}
      </div>
      {(!amountValid || exceedsPlayerLimit || !enoughBalance || atCapacity || round?.status !== "open" || !gameEnabled) && <div className="battle-validation" role="status" data-testid="status-battle-entry">
        {!gameEnabled ? "Игра временно приостановлена." : !amountValid ? "Сумма ставки: от 100 до 250 000 000 кредитов, шаг 100." : exceedsPlayerLimit ? "Общая ставка за раунд не может превышать 250 000 000 кредитов." : !enoughBalance ? "Недостаточно кредитов." : atCapacity ? "Все пять мест заняты." : round?.status === "spinning" ? "Ставки закрыты." : "Приём ставок закрыт."}
      </div>}
      {(addEntry.isError || cancelEntry.isError) && <div className="battle-inline-error" role="alert">
        {addEntry.isError && addEntry.error instanceof Error ? addEntry.error.message : cancelEntry.isError && cancelEntry.error instanceof Error ? cancelEntry.error.message : "Не удалось выполнить действие. Попробуйте ещё раз."}
      </div>}
      {notice && <div className="battle-success" role="status"><Check size={12} />{notice}</div>}
      <button type="button" className="battle-submit" disabled={!canSubmit} onClick={submitStake} data-testid="button-battle-join" aria-label={joined ? "Увеличить ставку в баттле" : "Сделать ставку в баттле"}>
        {addEntry.isPending ? <LoaderCircle size={15} className="battle-button-loader" /> : <ArrowUp size={15} />}
        <span>{addEntry.isPending ? "Зачисляем…" : "Баттл"}</span>
      </button>
    </section>
  </section>;
}
