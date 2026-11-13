import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, Volume2, VolumeX, CircleHelp, History, Plus,
  Spade, Users, RotateCw, Shield, Coins, DoorOpen,
} from "lucide-react";
import {
  getGetDarkAceBlackjackLobbyQueryKey,
  getGetDarkAceBlackjackTableQueryKey,
  getGetDarkAceBlackjackHistoryQueryKey,
  getGetDarkAceBootstrapQueryKey,
  useGetDarkAceBlackjackLobby,
  useGetDarkAceBlackjackTable,
  useGetDarkAceBlackjackHistory,
  useJoinDarkAceBlackjackTable,
  useLeaveDarkAceBlackjackSeat,
  useLeaveDarkAceBlackjackTable,
  useActDarkAceBlackjackTable,
  useUpdateDarkAceGamePresence,
} from "@workspace/api-client-react";
import type {
  BlackjackCard, BlackjackLobbyTable, BlackjackSeat,
} from "@workspace/api-client-react";
import { playGameCountdownTick } from "@/lib/game-countdown-audio";
import { getStakeChipAmount, getStakeChipOptions, StakeChipPicker, type StakeChipKey } from "@/components/StakeChipPicker";
import "./BlackjackPages.css";
import "./BlackjackCompact.css";

const fmt = new Intl.NumberFormat("ru-RU");
const compactFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const compactBlackjackChip = (value: number) => {
  if (value >= 1_000_000) return `${compactFmt.format(value / 1_000_000)} М`;
  if (value >= 1_000) return `${compactFmt.format(value / 1_000)} К`;
  return fmt.format(value);
};
const credits = (n: number) => {
  if (n >= 1_000_000) return `${compactFmt.format(n / 1_000_000)} М кредитов`;
  if (n >= 1_000) return `${compactFmt.format(n / 1_000)} К кредитов`;
  return `${fmt.format(n)} кредитов`;
};
const tiers: Record<string, string> = { ordinary: "Обычный", high: "Высокий", premium: "Премиум", vip: "VIP" };
const rankText: Record<string, string> = { A: "A", K: "K", Q: "Q", J: "J" };
const suits: Record<string, string> = { spades: "♠", clubs: "♣", hearts: "♥", diamonds: "♦" };
const MAX_BLACKJACK_TABLES_PER_PLAYER = 5;
const idempotency = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
function playBlackjackTone(enabled: boolean, frequency = 560) {
  if (!enabled || typeof window === "undefined") return;
  const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) return;
  const context = new AudioContextConstructor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.13);
  oscillator.onended = () => { void context.close(); };
  void context.resume();
}
const msg = (error: unknown) => {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Не удалось выполнить действие. Проверьте соединение и повторите попытку.";
};

function useVisible() {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

function useServerClock(serverNow?: string) {
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (serverNow) setOffset(Date.parse(serverNow) - Date.now());
  }, [serverNow]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  return now + offset;
}

function SeatAvatar({ seat, index }: { seat?: BlackjackSeat; index: number }) {
  return seat ? <span className="bj-avatar" data-testid={`seat-player-${index}`}>
    {seat.avatarUrl ? <img src={seat.avatarUrl} alt="" /> : <i>{seat.displayName.trim().slice(0, 1).toLocaleUpperCase()}</i>}
  </span> : <span className="bj-avatar bj-avatar-empty" data-testid={`seat-empty-${index}`}><span>{index}</span></span>;
}

function CardFace({ card, small = false, dealOrder }: { card: BlackjackCard; small?: boolean; dealOrder?: number }) {
  const dealClass = dealOrder === undefined ? "" : "bj-deal-card";
  const dealStyle = dealOrder === undefined ? undefined : { animationDelay: `${Math.min(dealOrder, 14) * 110}ms` };
  if (card.hidden) return <span className={`bj-playing-card bj-card-back ${dealClass} ${small ? "small" : ""}`} style={dealStyle} aria-label="Закрытая карта" data-testid="card-hidden"><Spade /></span>;
  if (!card.rank || !card.suit) return null;
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return <span className={`bj-playing-card ${dealClass} ${red ? "is-red" : ""} ${small ? "small" : ""}`} style={dealStyle} data-testid={`card-${card.rank}-${card.suit}`}>
    <b>{rankText[card.rank] ?? card.rank}</b><i>{suits[card.suit]}</i>
  </span>;
}

function Cards({ cards, label, compact = false, dealOrders }: { cards: BlackjackCard[]; label: string; compact?: boolean; dealOrders?: number[] }) {
  return <div className={`bj-cards ${compact ? "compact" : ""}`} aria-label={label}>
    {cards.map((card, i) => <CardFace key={`${card.rank}-${card.suit}-${i}`} card={card} small={compact} dealOrder={dealOrders?.[i]} />)}
  </div>;
}

function LobbyTableCard({ table }: { table: BlackjackLobbyTable }) {
  const seats = Array.from({ length: 6 }, (_, index) => table.seats.find((seat) => seat.seatIndex === index + 1));
  return <Link href={`/blackjack/table/${table.tableNumber}`} className="bj-lobby-card" data-testid={`link-blackjack-table-${table.tableNumber}`}>
    <div className={`bj-mini-felt theme-${table.theme.replace(/[^a-z0-9_-]/gi, "")}`}>
      <div className="bj-mini-mark"><Spade size={28} /></div>
      <span className="bj-mini-number">{String(table.tableNumber).padStart(2, "0")}</span>
      <div className="bj-mini-dealer">DARK<br />ACE</div>
      <div className="bj-mini-seats">{seats.map((seat, i) => <SeatAvatar seat={seat} index={i + 1} key={i} />)}</div>
    </div>
    <div className="bj-lobby-info">
      <div className="bj-lobby-card-head"><b>{table.name}</b><span className={`bj-tier ${table.tier}`}>{tiers[table.tier] ?? table.tier}</span></div>
      <div className="bj-lobby-stakes"><Coins size={13} />{credits(table.minStake)} – {credits(table.maxStake)}</div>
      <div className="bj-lobby-count"><Users size={13} /><span>{table.playerCount}/{table.capacity} мест</span><span className="bj-lobby-phase">{phaseLabel(table.phase)}</span></div>
      {table.mySeatIndexes.length > 0 && <span className={`bj-you-seat ${table.myTurnSeatIndex !== null ? "bj-your-turn" : ""}`}>
        Ваши места · {table.mySeatIndexes.join(", ")}
        {table.myTurnSeatIndex !== null && ` · ВАШ ХОД №${table.myTurnSeatIndex}`}
      </span>}
      <span className="bj-card-cta">{table.mySeatIndexes.length > 0 ? table.myTurnSeatIndex !== null ? "ВАШ ХОД · ВЕРНУТЬСЯ" : "Вернуться к столу" : "Открыть стол"}<ArrowRight size={14} /></span>
    </div>
  </Link>;
}

function phaseLabel(phase: string) {
  return ({ waiting: "Ожидание", betting: "Приём ставок", dealing: "Раздача", player_turn: "Ход игрока", dealer_turn: "Ход дилера", result: "Результат" } as Record<string, string>)[phase] ?? phase;
}

export function BlackjackLobbyPage() {
  const visible = useVisible();
  const gamePresence = useUpdateDarkAceGamePresence();
  useEffect(() => {
    const updatePresence = () => gamePresence.mutate({ data: { game: "blackjack" } });
    updatePresence();
    const timer = window.setInterval(updatePresence, 15_000);
    return () => window.clearInterval(timer);
  }, [gamePresence.mutate]);
  const query = useGetDarkAceBlackjackLobby({ query: {
    queryKey: getGetDarkAceBlackjackLobbyQueryKey(), refetchInterval: visible ? 1500 : false,
    refetchIntervalInBackground: false, refetchOnWindowFocus: true,
  } });
  const [sort, setSort] = useState("number");
  const snapshot = query.data;
  const displayed = useMemo(() => {
    const tables = snapshot?.tables ?? [];
    return [...tables].sort((a, b) => sort === "level" ? ["ordinary", "high", "premium", "vip"].indexOf(a.tier) - ["ordinary", "high", "premium", "vip"].indexOf(b.tier) || a.tableNumber - b.tableNumber
      : sort === "stakes" ? a.minStake - b.minStake || a.tableNumber - b.tableNumber
        : a.tableNumber - b.tableNumber);
  }, [sort, snapshot?.tables]);
  return <div className="blackjack-page bj-lobby" data-testid="page-blackjack-lobby">
    <header className="bj-topbar">
      <Link href="/" className="bj-back" aria-label="На главную" data-testid="link-blackjack-home"><ArrowLeft /></Link>
      <h1 className="sr-only">BLACKJACK</h1>
    </header>
    <section className="bj-intro">
      <span className="bj-eyebrow"><i /> DARK ACE · КЛУБНЫЕ СТОЛЫ</span>
      <h1>Выберите свой<br /><em>стол.</em></h1>
      <p>Пять мест. Одна колода решений.</p>
    </section>
    {query.isError && <div className="bj-notice bj-error" role="alert" data-testid="error-blackjack-lobby"><span>Не удалось загрузить столы.</span><button onClick={() => void query.refetch()} data-testid="button-blackjack-lobby-retry"><RotateCw size={14} /> Повторить</button></div>}
    <div className="bj-lobby-controls">
      <label className="bj-sort">Сортировка
        <select value={sort} onChange={(event) => setSort(event.target.value)} data-testid="select-blackjack-sort">
          <option value="number">По номеру</option><option value="level">По уровню</option><option value="stakes">По минимальной ставке</option>
        </select>
      </label>
    </div>
    {query.isLoading && !snapshot ? <div className="bj-lobby-grid" aria-label="Загрузка столов" data-testid="loading-blackjack-lobby">{Array.from({ length: 10 }, (_, i) => <div className="bj-skeleton-card" key={i}><i /><span /><b /></div>)}</div>
      : displayed.length ? <div className="bj-lobby-grid" data-testid="list-blackjack-tables">{displayed.map((table) => <LobbyTableCard key={table.tableNumber} table={table} />)}</div>
          : !query.isError && <div className="bj-empty" data-testid="empty-blackjack-tables"><Spade /><b>Столы временно недоступны</b><span>Обновите список, чтобы проверить состояние игры.</span><button onClick={() => void query.refetch()} data-testid="button-blackjack-refresh">Обновить</button></div>}
    <section className="bj-rules bj-lobby-rules"><span className="bj-eyebrow">ПЕРЕД ПЕРВЫМ ХОДОМ</span><p>Дилер останавливается на мягких 17. Натуральный блэкджек оплачивается 3:2. Страховки и сплита в этой версии нет.</p></section>
  </div>;
}

export function BlackjackTablePage({ tableNumber, sessionReady = true }: { tableNumber: number; sessionReady?: boolean }) {
  const visible = useVisible();
  const queryClient = useQueryClient();
  const gamePresence = useUpdateDarkAceGamePresence();
  useEffect(() => {
    if (!sessionReady) return;
    const updatePresence = () => gamePresence.mutate({ data: { game: "blackjack" } });
    updatePresence();
    const timer = window.setInterval(updatePresence, 15_000);
    return () => window.clearInterval(timer);
  }, [gamePresence.mutate, sessionReady]);
  const tableQuery = useGetDarkAceBlackjackTable(tableNumber, { query: {
    queryKey: getGetDarkAceBlackjackTableQueryKey(tableNumber),
    refetchInterval: (query) => !visible ? false : query.state.data?.phase === "waiting" ? 1500 : 600,
    refetchIntervalInBackground: false, refetchOnWindowFocus: true,
  } });
  const lobbyQuery = useGetDarkAceBlackjackLobby({ query: {
    queryKey: getGetDarkAceBlackjackLobbyQueryKey(), enabled: visible,
    refetchInterval: visible ? 3000 : false, refetchIntervalInBackground: false,
  } });
  const historyQuery = useGetDarkAceBlackjackHistory(tableNumber, { query: {
    queryKey: getGetDarkAceBlackjackHistoryQueryKey(tableNumber), enabled: visible,
  } });
  const join = useJoinDarkAceBlackjackTable();
  const leaveSeat = useLeaveDarkAceBlackjackSeat();
  const leave = useLeaveDarkAceBlackjackTable();
  const act = useActDarkAceBlackjackTable();
  const table = tableQuery.data;
  const serverNow = useServerClock(table?.serverNow);
  const [chipState, setChipState] = useState<{
    tableNumber: number;
    roundNumber: number;
    budget: number;
    key: StakeChipKey;
  } | null>(null);
  const [selectedSeatIndex, setSelectedSeatIndex] = useState<number | null>(null);
  const [bettingTimerTable, setBettingTimerTable] = useState<number | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmLeaveSeatIndex, setConfirmLeaveSeatIndex] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resultNotice, setResultNotice] = useState<{
    kind: "win" | "loss" | "push" | "flat";
    amount: number;
    roundNumber: number;
  } | null>(null);
  const [pendingSeatBets, setPendingSeatBets] = useState<Map<number, number>>(() => new Map());
  const pendingSeatBetsRef = useRef(new Map<number, number>());
  const seatBetQueueRef = useRef<number[]>([]);
  const seatBetSendingRef = useRef(false);
  const [sound, setSound] = useState(() => {
    try { return localStorage.getItem("dark-ace-blackjack-sound") !== "off"; } catch { return true; }
  });
  const lastSoundSignature = useRef(new Map<number, string>());
  const lastNotifiedResultRound = useRef(new Map<number, number | null>());
  const resultNoticeTimer = useRef<number | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceBlackjackLobbyQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceBlackjackTableQueryKey(tableNumber) });
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceBlackjackHistoryQueryKey(tableNumber) });
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
  };
  const ownSeatKey = table?.mySeatIndexes.join(",") ?? "";
  useEffect(() => { setBettingTimerTable(null); }, [tableNumber]);
  useEffect(() => {
    if (!table || table.tableNumber !== tableNumber) return;
    setSelectedSeatIndex(table.myTurnSeatIndex ?? table.mySeatIndexes[0] ?? null);
  }, [tableNumber, ownSeatKey, table?.myTurnSeatIndex, table?.roundNumber]);
  const selectedSeat = table?.seats.find((seat) => seat.seatIndex === selectedSeatIndex);
  const selectedBet = selectedSeatIndex === null
    ? 0
    : pendingSeatBets.get(selectedSeatIndex) ?? selectedSeat?.betAmount ?? 0;
  const chipBudgetCandidate = table
    ? Math.min(table.maxStake, Math.max(0, table.availableBalance + table.myTotalBet))
    : 0;
  useEffect(() => {
    if (!table || table.tableNumber !== tableNumber) return;
    if (chipState?.tableNumber === table.tableNumber && chipState.roundNumber === table.roundNumber) return;
    setChipState({
      tableNumber: table.tableNumber,
      roundNumber: table.roundNumber,
      budget: chipBudgetCandidate,
      key: chipState?.tableNumber === table.tableNumber ? chipState.key : "1",
    });
  }, [table?.tableNumber, table?.roundNumber, tableNumber, chipBudgetCandidate, chipState?.tableNumber, chipState?.roundNumber]);
  const chipRoundMatches = !!table
    && !!chipState
    && chipState.tableNumber === table.tableNumber
    && chipState.roundNumber === table.roundNumber;
  const chipBudget = chipRoundMatches && chipState ? chipState.budget : chipBudgetCandidate;
  const selectedChipKey: StakeChipKey = table && chipState?.tableNumber === table.tableNumber ? chipState.key : "1";
  const lastResult = table?.lastResult;
  useEffect(() => { setResultNotice(null); }, [tableNumber]);
  useEffect(() => {
    if (!table || table.tableNumber !== tableNumber) return;
    const resultRound = lastResult?.roundNumber ?? null;
    const previousRound = lastNotifiedResultRound.current.get(tableNumber);
    if (previousRound === undefined) {
      lastNotifiedResultRound.current.set(tableNumber, resultRound);
      return;
    }
    if (!resultRound) {
      lastNotifiedResultRound.current.set(tableNumber, null);
      return;
    }
    if (!ownSeatKey) {
      lastNotifiedResultRound.current.set(tableNumber, resultRound);
      return;
    }
    if (previousRound === resultRound) return;
    lastNotifiedResultRound.current.set(tableNumber, resultRound);
    const ownSeats = new Set(ownSeatKey.split(",").map(Number));
    const ownResults = lastResult?.players.filter((player) => ownSeats.has(player.seatIndex)) ?? [];
    if (!ownResults.length) return;
    const netProfit = ownResults.reduce((total, player) => total + player.profit, 0);
    const kind = netProfit > 0 ? "win" : netProfit < 0 ? "loss" : ownResults.every((player) => player.outcome === "push") ? "push" : "flat";
    const totalWin = ownResults.reduce((total, player) => total + player.payout, 0);
    if (resultNoticeTimer.current !== null) {
      window.clearTimeout(resultNoticeTimer.current);
      resultNoticeTimer.current = null;
    }
    if (kind === "loss") {
      setResultNotice(null);
      return;
    }
    setResultNotice({ kind, amount: kind === "win" ? totalWin : Math.abs(netProfit), roundNumber: resultRound });
    resultNoticeTimer.current = window.setTimeout(() => setResultNotice(null), 1_500);
  }, [tableNumber, lastResult?.roundNumber, ownSeatKey]);
  useEffect(() => () => {
    if (resultNoticeTimer.current !== null) window.clearTimeout(resultNoticeTimer.current);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const bettingRemaining = table?.phase === "betting" && table.bettingClosesAt
    ? Math.max(0, Math.ceil((Date.parse(table.bettingClosesAt) - serverNow) / 1000))
    : null;
  const turnRemaining = table?.phase === "player_turn" && table.turnExpiresAt
    ? Math.max(0, Math.ceil((Date.parse(table.turnExpiresAt) - serverNow) / 1000))
    : null;
  useEffect(() => {
    if (table?.phase === "betting" && bettingRemaining !== null) {
      playGameCountdownTick(`blackjack:${tableNumber}:betting:${table.roundNumber}`, bettingRemaining, sound);
    }
  }, [tableNumber, table?.phase, table?.roundNumber, bettingRemaining, sound]);
  useEffect(() => {
    if (table?.phase === "player_turn" && table.requiresAction && turnRemaining !== null) {
      playGameCountdownTick(
        `blackjack:${tableNumber}:turn:${table.roundNumber}:${table.turnExpiresAt ?? "active"}`,
        turnRemaining,
        sound,
      );
    }
  }, [tableNumber, table?.phase, table?.requiresAction, table?.roundNumber, table?.turnExpiresAt, turnRemaining, sound]);
  useEffect(() => {
    if (table?.tableNumber === tableNumber && table.phase === "betting") {
      setBettingTimerTable(tableNumber);
      return;
    }
    if (bettingTimerTable !== tableNumber) return;
    const timeout = window.setTimeout(() => setBettingTimerTable(null), 220);
    return () => window.clearTimeout(timeout);
  }, [table?.phase, table?.tableNumber, tableNumber, bettingTimerTable]);
  useEffect(() => {
    if (!table || table.tableNumber !== tableNumber) return;
    const signature = `${table.roundNumber}:${table.phase}:${table.requiresAction}:${table.lastResult?.roundNumber ?? 0}`;
    const previousSignature = lastSoundSignature.current.get(tableNumber);
    if (!previousSignature) {
      lastSoundSignature.current.set(tableNumber, signature);
      return;
    }
    if (previousSignature === signature) return;
    lastSoundSignature.current.set(tableNumber, signature);
    if (table.phase === "result") playBlackjackTone(sound, 430);
  }, [tableNumber, table?.roundNumber, table?.phase, table?.requiresAction, table?.lastResult?.roundNumber, sound]);
  const invoke = (action: "confirm_bet" | "cancel_bet" | "hit" | "stand" | "double", amount?: number, seatIndex = selectedSeatIndex) => {
    if (seatIndex === null) return;
    setError(""); setNotice("");
    playBlackjackTone(sound, action === "confirm_bet" ? 610 : 530);
    act.mutate({ tableNumber, data: { action, seatIndex, ...(amount === undefined ? {} : { amount }), idempotencyKey: idempotency() } }, {
      onSuccess: () => { setNotice(action === "confirm_bet" ? "Ставка подтверждена сервером." : action === "cancel_bet" ? "Ставка отменена." : "Ход принят сервером."); refresh(); },
      onError: async (reason) => {
        setError(msg(reason));
        refresh();
        // An HTTP error can happen after the server has committed an action but
        // failed while building its response. Reconcile the table before the
        // player can retry, so the UI cannot stay on a stale turn.
        await tableQuery.refetch();
      },
    });
  };
  const joinTable = () => {
    setError(""); playBlackjackTone(sound, 610);
    join.mutate({ tableNumber, data: { idempotencyKey: idempotency() } }, {
      onSuccess: (result) => {
        const newSeat = result.mySeatIndexes.find((index) => !table?.mySeatIndexes.includes(index));
        setSelectedSeatIndex(newSeat ?? result.mySeatIndexes[0] ?? null);
        setNotice("Место за столом занято."); refresh();
      },
      onError: (reason) => setError(msg(reason)),
    });
  };
  const leaveTable = () => { setError(""); leave.mutate({ tableNumber }, { onSuccess: () => { setConfirmLeave(false); setSelectedSeatIndex(null); setNotice("Вы освободили все свои места за этим столом."); refresh(); }, onError: (reason) => setError(msg(reason)) }); };
  const toggleSound = () => { const next = !sound; setSound(next); try { localStorage.setItem("dark-ace-blackjack-sound", next ? "on" : "off"); } catch { /* storage may be unavailable */ } };
  if ((tableQuery.isLoading && !table) || (table && table.tableNumber !== tableNumber)) return <div className="blackjack-page bj-table-page" data-testid="loading-blackjack-table"><div className="bj-table-skeleton" /><div className="bj-table-skeleton slim" /><div className="bj-table-skeleton" /></div>;
  if (!table && tableQuery.isError) return <div className="blackjack-page bj-table-page"><div className="bj-error-state" role="alert" data-testid="error-blackjack-table"><Spade /><h1>Стол не отвечает</h1><p>{msg(tableQuery.error)}</p><button onClick={() => void tableQuery.refetch()} data-testid="button-blackjack-table-retry"><RotateCw size={15} /> Повторить</button><Link href="/blackjack" data-testid="link-blackjack-lobby">К списку столов</Link></div></div>;
  if (!table) return null;
  const seats = Array.from({ length: 6 }, (_, index) => table.seats.find((seat) => seat.seatIndex === index + 1));
  const canLeaveSeatNow = (seat: BlackjackSeat) =>
    table.phase === "waiting" || table.phase === "result" || seat.cards.length === 0;
  const requestLeaveSeat = (seat: BlackjackSeat) => {
    if (!canLeaveSeatNow(seat)) {
      setNotice("Завершите текущую раздачу, чтобы освободить это место.");
      return;
    }
    setConfirmLeaveSeatIndex(seat.seatIndex);
  };
  const confirmLeaveSeat = () => {
    if (confirmLeaveSeatIndex === null) return;
    const seatIndex = confirmLeaveSeatIndex;
    const nextSeatIndex = table.mySeatIndexes.find((index) => index !== seatIndex) ?? null;
    setError("");
    leaveSeat.mutate({ tableNumber, seatIndex }, {
      onSuccess: () => {
        setConfirmLeaveSeatIndex(null);
        if (selectedSeatIndex === seatIndex) {
          setSelectedSeatIndex(nextSeatIndex);
        }
        setNotice(`Место ${seatIndex} освобождено.`);
        refresh();
      },
      onError: (reason) => setError(msg(reason)),
    });
  };
  const dealtSeatOrder = new Map<number, number>();
  seats.forEach((seat, index) => {
    if (seat && seat.cards.length > 0) dealtSeatOrder.set(index, dealtSeatOrder.size);
  });
  const dealtSeatCount = dealtSeatOrder.size;
  const dealerDealOrders = table.dealerCards.map((_, index) => index === 0 ? 0 : index === 1 ? dealtSeatCount + 1 : 0);
  const ownSeatSet = new Set(table.mySeatIndexes);
  const activeTableCount = lobbyQuery.data?.myTables.length ?? 0;
  const reachedTableLimit = table.mySeatIndexes.length === 0 &&
    activeTableCount >= MAX_BLACKJACK_TABLES_PER_PLAYER;
  const joinTitle = !table.gameEnabled
    ? "Игра временно приостановлена"
    : reachedTableLimit
      ? "Вы играете за пятью столами"
      : !table.canJoin
        ? table.playerCount >= table.capacity ? "Все пять мест заняты" : "Место временно недоступно"
        : "Ваше место свободно";
  const joinDescription = !table.gameEnabled
    ? "Попробуйте зайти позже."
    : reachedTableLimit
      ? "Покиньте один стол, чтобы занять место за новым."
      : !table.canJoin
        ? table.playerCount >= table.capacity ? "Освободите место или выберите другой стол." : "Обновите стол и попробуйте ещё раз."
        : "Займите место, чтобы начать игру.";
  const maxBetDraft = Math.max(0, Math.min(table.maxStake, table.availableBalance + selectedBet));
  const chipOptions = getStakeChipOptions(chipBudget, table.minStake);
  const maxAdditionalBet = Math.max(0, maxBetDraft - selectedBet);
  const isOwnSeatBettable = (seat: BlackjackSeat) =>
    table.canConfirmBet
    && ownSeatSet.has(seat.seatIndex)
    && ["reserved", "waiting", "seated"].includes(seat.status);
  const canTapSeatForBet = (seat: BlackjackSeat) => isOwnSeatBettable(seat);
  const seatChipAmount = (seat: BlackjackSeat) => {
    const pendingOtherSeats = [...pendingSeatBets].reduce((total, [seatIndex, target]) => {
      if (seatIndex === seat.seatIndex) return total;
      const confirmed = table.seats.find((item) => item.seatIndex === seatIndex)?.betAmount ?? 0;
      return total + Math.max(0, target - confirmed);
    }, 0);
    const seatMaximum = Math.max(0, Math.min(table.maxStake, table.availableBalance + seat.betAmount - pendingOtherSeats));
    const currentTarget = pendingSeatBets.get(seat.seatIndex) ?? seat.betAmount;
    return selectedChipKey === "all-in"
      ? seatMaximum
      : currentTarget + getStakeChipAmount(selectedChipKey, chipOptions, 0);
  };
  const flushSeatBetQueue = async () => {
    if (seatBetSendingRef.current) return;
    const seatIndex = seatBetQueueRef.current.shift();
    if (seatIndex === undefined) return;
    const targetAmount = pendingSeatBetsRef.current.get(seatIndex);
    const seat = table.seats.find((item) => item.seatIndex === seatIndex);
    if (targetAmount === undefined || !seat) {
      void flushSeatBetQueue();
      return;
    }
    if (targetAmount === seat.betAmount) {
      pendingSeatBetsRef.current.delete(seatIndex);
      setPendingSeatBets(new Map(pendingSeatBetsRef.current));
      void flushSeatBetQueue();
      return;
    }
    seatBetSendingRef.current = true;
    setError("");
    try {
      await act.mutateAsync({
        tableNumber,
        data: { action: "confirm_bet", seatIndex, amount: targetAmount, idempotencyKey: idempotency() },
      });
      setNotice("Ставка подтверждена сервером.");
      await tableQuery.refetch();
      refresh();
      const latestTarget = pendingSeatBetsRef.current.get(seatIndex);
      if (latestTarget === targetAmount) {
        pendingSeatBetsRef.current.delete(seatIndex);
        setPendingSeatBets(new Map(pendingSeatBetsRef.current));
      } else if (!seatBetQueueRef.current.includes(seatIndex)) {
        seatBetQueueRef.current.push(seatIndex);
      }
    } catch (reason) {
      setError(msg(reason));
      await tableQuery.refetch();
      pendingSeatBetsRef.current.delete(seatIndex);
      setPendingSeatBets(new Map(pendingSeatBetsRef.current));
    } finally {
      seatBetSendingRef.current = false;
      void flushSeatBetQueue();
    }
  };
  const selectOrBetSeat = (seat: BlackjackSeat) => {
    setSelectedSeatIndex(seat.seatIndex);
    if (!canTapSeatForBet(seat)) return;
    const pendingOtherSeats = [...pendingSeatBetsRef.current].reduce((total, [seatIndex, target]) => {
      if (seatIndex === seat.seatIndex) return total;
      const confirmed = table.seats.find((item) => item.seatIndex === seatIndex)?.betAmount ?? 0;
      return total + Math.max(0, target - confirmed);
    }, 0);
    const maxForSeat = Math.max(0, Math.min(table.maxStake, table.availableBalance + seat.betAmount - pendingOtherSeats));
    const baseAmount = pendingSeatBetsRef.current.get(seat.seatIndex) ?? seat.betAmount;
    const amount = selectedChipKey === "all-in" ? maxForSeat : baseAmount + getStakeChipAmount(selectedChipKey, chipOptions, 0);
    if (amount < table.minStake || amount > maxForSeat) {
      setNotice(`Выбранная фишка превышает доступный лимит места (${credits(maxForSeat)}).`);
      return;
    }
    pendingSeatBetsRef.current.set(seat.seatIndex, amount);
    setPendingSeatBets(new Map(pendingSeatBetsRef.current));
    if (!seatBetQueueRef.current.includes(seat.seatIndex)) {
      seatBetQueueRef.current.push(seat.seatIndex);
    }
    void flushSeatBetQueue();
  };
  const selectedSeatCanBet = Boolean(selectedSeat &&
    (selectedSeat.status === "reserved" || selectedSeat.status === "waiting" || selectedSeat.status === "seated"));
  const selectedSeatIsTurn = selectedSeat?.isTurn === true;
  return <div className="blackjack-page bj-table-page bj-quick-table" data-testid="page-blackjack-table">
    <header className="bj-topbar bj-table-topbar">
      <Link href="/blackjack" className="bj-back" aria-label="Назад к столам" data-testid="link-blackjack-back"><ArrowLeft /></Link>
      <h1 className="sr-only">BLACKJACK · Стол {table.tableNumber}</h1>
      <div className="bj-table-tools">
        <button type="button" onClick={() => { setShowRules((value) => !value); setShowHistory(false); }} aria-label="Правила Blackjack" aria-expanded={showRules} data-testid="button-blackjack-rules"><CircleHelp /></button>
        <button type="button" onClick={() => { setShowHistory((value) => !value); setShowRules(false); }} aria-label="История раздач" aria-expanded={showHistory} data-testid="button-blackjack-history"><History /></button>
      </div>
      <button className={`bj-sound ${sound ? "" : "muted"}`} onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "Выключить звук" : "Включить звук"} data-testid="button-blackjack-sound">{sound ? <Volume2 /> : <VolumeX />}</button>
    </header>
    {resultNotice && <div className={`bj-result-toast outcome-${resultNotice.kind}`} role="status" aria-live="polite" data-testid="blackjack-result-notice">
      <span className="bj-result-mark" aria-hidden="true">{resultNotice.kind === "win" ? "✓" : resultNotice.kind === "loss" ? "−" : resultNotice.kind === "push" ? "↺" : "="}</span>
      <span className="bj-result-copy">
        <b>{resultNotice.kind === "win" ? "ПОЗДРАВЛЯЕМ, ВЫ ВЫИГРАЛИ!" : resultNotice.kind === "loss" ? "ВЫ ПРОИГРАЛИ" : resultNotice.kind === "push" ? "НИЧЬЯ" : "БЕЗ ПРИБЫЛИ"}</b>
        <strong>{resultNotice.kind === "push" ? "Ставки возвращены" : resultNotice.kind === "flat" ? "0 кредитов" : `${resultNotice.kind === "win" ? "+" : "−"}${credits(resultNotice.amount)}`}</strong>
        <small>Раунд #{fmt.format(resultNotice.roundNumber)}</small>
      </span>
      <button type="button" onClick={() => setResultNotice(null)} aria-label="Закрыть результат">×</button>
    </div>}
    <div className="bj-table-meta"><span>{table.name}</span><span className={`bj-phase phase-${table.phase}`} data-testid="status-blackjack-phase"><i />{phaseLabel(table.phase)}</span><span>Раунд #{fmt.format(table.roundNumber)}</span></div>
    {error && <div className="bj-notice bj-error" role="alert" data-testid="error-blackjack-action">{error}<button onClick={() => setError("")} aria-label="Закрыть сообщение" data-testid="button-blackjack-dismiss-error">×</button></div>}
    {notice && <div className="bj-notice bj-success" role="status" data-testid="status-blackjack-action">{notice}</div>}
    <section className={`bj-felt theme-${table.theme.replace(/[^a-z0-9_-]/gi, "")}`} data-testid="blackjack-felt">
      <div className="bj-felt-light" aria-hidden="true" />
      <div className="bj-felt-topline"><span>СТОЛ {String(table.tableNumber).padStart(2, "0")}</span><span>{credits(table.minStake)} — {credits(table.maxStake)} / МЕСТО</span></div>
      <div className="bj-dealer-area">
        <div className="bj-dealer-portrait" aria-hidden="true"><img src="/blackjack-dealer.webp" alt="" /></div>
        {bettingTimerTable === tableNumber && <div
          className={`bj-bet-timer ${bettingRemaining === null ? "tone-red is-leaving" : bettingRemaining <= 3 ? "tone-red is-urgent" : bettingRemaining <= 5 ? "tone-orange" : bettingRemaining <= 7 ? "tone-yellow" : "tone-green"}`}
          role="timer"
          aria-label={bettingRemaining === null ? "Приём ставок завершён" : `До закрытия ставок ${bettingRemaining} секунд`}
          data-testid="text-blackjack-countdown"
        >
          <small>СТАВКИ</small><strong>{bettingRemaining ?? 0}</strong><span>СЕК</span>
        </div>}
        <span className="bj-seat-caption"><i /> ДИЛЕР <i /></span>
        <Cards cards={table.dealerCards} label="Карты дилера" dealOrders={dealerDealOrders} />
        {table.dealerTotal !== null && <span className="bj-total bj-dealer-total" data-testid="text-blackjack-dealer-total">{table.dealerTotal}</span>}
      </div>
      <div className="bj-felt-emblem"><Spade /><span>DARK ACE</span></div>
      <div className="bj-seats">
        {seats.map((seat, i) => <div
          className={`bj-seat ${seat?.isTurn ? "is-turn" : ""} ${seat && ownSeatSet.has(seat.seatIndex) ? "is-mine" : ""} ${seat?.seatIndex === selectedSeatIndex ? "is-selected" : ""}`}
          key={i}
          data-testid={`blackjack-seat-${i + 1}`}
          onClick={() => { if (seat && ownSeatSet.has(seat.seatIndex)) setSelectedSeatIndex(seat.seatIndex); }}
        >
          {seat && ownSeatSet.has(seat.seatIndex) && <>
            <button
              className="bj-seat-leave"
              type="button"
              aria-label={`Покинуть место ${seat.seatIndex}`}
              title={`Покинуть место ${seat.seatIndex}`}
              data-testid={`button-blackjack-leave-seat-${seat.seatIndex}`}
              disabled={leaveSeat.isPending}
              onClick={(event) => { event.stopPropagation(); requestLeaveSeat(seat); }}
            >×</button>
          </>}
          <SeatAvatar seat={seat} index={i + 1} />
            {seat ? <><span className="bj-seat-name">{seat.displayName}{ownSeatSet.has(seat.seatIndex) ? " · ВЫ" : ""}</span>
              {seat.isTurn && ownSeatSet.has(seat.seatIndex) && turnRemaining !== null && <span
                className={`bj-seat-turn-timer ${turnRemaining <= 3 ? "tone-red is-urgent" : turnRemaining <= 5 ? "tone-orange" : turnRemaining <= 7 ? "tone-yellow" : "tone-green"}`}
                role="timer"
                aria-label={`На ваш ход осталось ${turnRemaining} секунд`}
                data-testid="text-blackjack-turn-countdown"
              >{turnRemaining}с</span>}
              <Cards
                cards={seat.cards}
                label={`Карты ${seat.displayName}`}
                compact
                dealOrders={seat.cards.map((_, cardIndex) => {
                  const order = dealtSeatOrder.get(i) ?? 0;
                  if (cardIndex === 0) return order + 1;
                  if (cardIndex === 1) return dealtSeatCount + order + 2;
                  return 0;
                })}
              />
            {seat.total !== null && <span className="bj-seat-total" data-testid={`text-blackjack-player-total-${seat.seatIndex}`}>{seat.total}{seat.soft ? " мягкая" : ""}</span>}
            {seat.betAmount > 0 && <span className="bj-seat-bet">{credits(seat.betAmount)}</span>}
            {isOwnSeatBettable(seat) ? <button
              className="bj-seat-place-bet"
              type="button"
              aria-label={`Поставить ${credits(seatChipAmount(seat))} кредитов на место ${seat.seatIndex}`}
              aria-pressed={seat.seatIndex === selectedSeatIndex}
              data-testid={`button-blackjack-seat-bet-${seat.seatIndex}`}
              data-stake-chip-target
              disabled={!canTapSeatForBet(seat)}
              onClick={(event) => { event.stopPropagation(); selectOrBetSeat(seat); }}
            >
              <span className="bj-seat-place-bet-title"><Plus size={11} aria-hidden="true" /> Поставить</span>
              <strong className="bj-seat-place-bet-amount">{compactBlackjackChip(seatChipAmount(seat))}</strong>
            </button> : <span className={`bj-seat-status status-${seat.status}`}>{seat.isTurn
              ? "Ваш ход" : seat.seatIndex === selectedSeatIndex && ownSeatSet.has(seat.seatIndex) ? "Выбрано" : seat.status === "playing" ? "В игре" : seat.status === "won" || seat.status === "blackjack" ? "Победа" : seat.status === "lost" || seat.status === "bust" ? "Завершено" : seat.status === "push" ? "Ничья" : ""}</span>}
            </> : <>
              <button className="bj-empty-seat-action" type="button" disabled={!table.canJoin || join.isPending || !table.gameEnabled} onClick={(event) => { event.stopPropagation(); joinTable(); }} aria-label="Занять свободное место" data-testid={`button-blackjack-seat-join-${i + 1}`}>
                {join.isPending ? <span className="bj-seat-plus">···</span> : <Plus className="bj-seat-plus" />}
                <span>ЗАНЯТЬ</span>
              </button>
              <span className="bj-seat-name empty">МЕСТО {i + 1}</span>
            </>}
        </div>)}
      </div>
        {selectedSeatIsTurn && <div className="bj-felt-actions" data-testid="blackjack-turn-actions">
          <button className="bj-action hit" onClick={() => invoke("hit")} disabled={!table.canHit || act.isPending} aria-label="Взять карту" data-testid="button-blackjack-hit"><span className="bj-action-mark" aria-hidden="true">+</span></button>
          <button className="bj-action stand" onClick={() => invoke("stand")} disabled={!table.canStand || act.isPending} aria-label="Остановиться" data-testid="button-blackjack-stand"><span className="bj-action-mark" aria-hidden="true">❌</span></button>
          <button className="bj-action double" onClick={() => invoke("double")} disabled={!table.canDouble || act.isPending} aria-label="Удвоить ставку" data-testid="button-blackjack-double"><span className="bj-action-mark" aria-hidden="true">×2</span></button>
        </div>}
    </section>
    <section className="bj-control-panel" data-testid="blackjack-controls">
      {table.mySeatIndexes.length === 0 ? <div className="bj-join-block"><div><b>{joinTitle}</b><span>{joinDescription}</span></div><button className="bj-primary" disabled={!table.canJoin || join.isPending || !table.gameEnabled} onClick={joinTable} data-testid="button-blackjack-join">{join.isPending ? "ЗАНИМАЕМ МЕСТО…" : "ЗАНЯТЬ МЕСТО"}<ArrowRight size={16} /></button></div>
        : <>
          {table.canJoin && <div className="bj-join-block bj-add-seat"><span className="bj-add-seat-label">У каждого места своя ставка, рука и отдельный ход.</span><button className="bj-secondary" aria-label="Занять ещё одно место за этим столом" disabled={join.isPending || !table.gameEnabled} onClick={joinTable} data-testid="button-blackjack-add-seat">{join.isPending ? "ЗАНИМАЕМ…" : "ЕЩЁ МЕСТО"}<Plus size={15} /></button></div>}
          {table.mySeatIndexes.length > 1 && <div className="bj-seat-picker" role="group" aria-label="Выбор своего места">
            {table.mySeatIndexes.map((seatIndex) => <button type="button" key={seatIndex} className={seatIndex === selectedSeatIndex ? "active" : ""} onClick={() => setSelectedSeatIndex(seatIndex)} aria-pressed={seatIndex === selectedSeatIndex} data-testid={`button-blackjack-select-seat-${seatIndex}`}>
              МЕСТО {seatIndex}{table.seats.find((seat) => seat.seatIndex === seatIndex)?.isTurn ? " · ВАШ ХОД" : ""}
            </button>)}
          </div>}
          <div className="bj-bet-summary"><span>СТАВКА · МЕСТО #{selectedSeatIndex ?? "—"}</span><b data-testid="text-blackjack-current-bet">{credits(selectedBet)}</b><span className="bj-available">Всего на столе {credits(table.myTotalBet)}</span></div>
          <div className="bj-chip-balance-plain" data-testid="text-blackjack-table-balance"><span>БАЛАНС</span><b>{credits(table.availableBalance)}</b></div>
          {table.canConfirmBet && selectedSeatCanBet && <>
            <p className="bj-bet-instruction">Выберите фишку ниже и нажмите «Поставить» на своём месте. Повторное нажатие добавит фишку; «Алл-ин» поставит максимум.</p>
            <StakeChipPicker
              budget={chipBudget}
              maxStake={maxAdditionalBet}
              allInAmount={maxBetDraft}
              minStake={table.minStake}
              selectedKey={selectedChipKey}
              onSelect={(key) => setChipState({
                tableNumber: table.tableNumber,
                roundNumber: table.roundNumber,
                budget: chipBudget,
                key,
              })}
              disabled={!table.canConfirmBet || !selectedSeatCanBet || act.isPending}
              testIdPrefix="button-blackjack-chip"
              label="ФИШКА НА МЕСТО"
              resetKey={`${table.tableNumber}:${table.roundNumber}`}
            />
          </>}
          {table.canCancelBet && selectedSeat?.status === "reserved" && <div className="bj-bet-actions">
            <button className="bj-secondary" onClick={() => invoke("cancel_bet")} disabled={act.isPending} data-testid="button-blackjack-cancel-bet">Отменить ставку</button>
          </div>}
          {table.canLeave && <button className="bj-leave" onClick={() => setConfirmLeave(true)} data-testid="button-blackjack-leave"><DoorOpen size={15} /> Освободить все места</button>}
        </>}
    </section>
    {showRules && <div className="bj-info-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowRules(false); }}>
      <section className="bj-rules bj-info-dialog" role="dialog" aria-modal="true" aria-label="Правила Blackjack" data-testid="panel-blackjack-rules">
        <div className="bj-info-heading"><b>Правила и выплаты</b><button type="button" onClick={() => setShowRules(false)} aria-label="Закрыть правила">×</button></div>
        <p>Дилер стоит на мягких 17. Натуральный блэкджек оплачивается 3:2. Страховки и сплита в этой версии нет. Все выплаты и результаты определяет сервер.</p>
      </section>
    </div>}
    {showHistory && <div className="bj-info-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHistory(false); }}>
      <section className="bj-history bj-info-dialog bj-history-dialog" role="dialog" aria-modal="true" aria-label="История раздач" data-testid="panel-blackjack-history"><div className="bj-history-head"><div><span className="bj-eyebrow">ВАШИ РАУНДЫ</span><h2>История стола</h2></div><div className="bj-history-actions"><button onClick={() => void historyQuery.refetch()} aria-label="Обновить историю" data-testid="button-blackjack-history-refresh"><RotateCw /></button><button onClick={() => setShowHistory(false)} aria-label="Закрыть историю">×</button></div></div>
      {historyQuery.isLoading && <div className="bj-history-empty" data-testid="loading-blackjack-history">Загружаем историю…</div>}
      {historyQuery.isError && <div className="bj-history-empty" role="alert" data-testid="error-blackjack-history">История недоступна. <button onClick={() => void historyQuery.refetch()} data-testid="button-blackjack-history-retry">Повторить</button></div>}
      {!historyQuery.isLoading && !historyQuery.isError && !historyQuery.data?.items.length && <div className="bj-history-empty" data-testid="empty-blackjack-history">Завершённых раздач пока нет.</div>}
      {historyQuery.data?.items.map((item) => <article className={`bj-history-row outcome-${item.outcome}`} key={`${item.tableNumber}-${item.roundNumber}-${item.seatIndex}`} data-testid={`blackjack-history-round-${item.roundNumber}-seat-${item.seatIndex}`}>
        <div><b>Раунд #{item.roundNumber} · место {item.seatIndex}</b><small>{new Date(item.completedAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</small></div>
        <div className="bj-history-cards"><Cards cards={item.playerCards} label="Ваши карты" compact /><span>{item.playerTotal}</span><i>против</i><Cards cards={item.dealerCards} label="Карты дилера" compact /><span>{item.dealerTotal}</span></div>
        <div className="bj-history-result"><b>{outcomeLabel(item.outcome)}</b><small>Ставка {credits(item.betAmount)} · Выплата {credits(item.payout)}</small></div>
      </article>)}
      </section>
    </div>}
    {table.lastResult && <section className="bj-last-result" data-testid="panel-blackjack-last-result"><span>РАУНД #{table.lastResult.roundNumber} · ИТОГ</span><Cards cards={table.lastResult.dealerCards} label="Итоговые карты дилера" compact /><b>Дилер · {table.lastResult.dealerTotal}</b>{table.lastResult.players.map((player) => <div key={player.seatIndex} className="bj-result-player"><span>{player.displayName} · место {player.seatIndex}</span><span>{outcomeLabel(player.outcome)}</span><b>{credits(player.payout)}</b></div>)}</section>}
      {confirmLeave && <div className="bj-modal-backdrop" role="presentation"><section className="bj-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="bj-leave-title" data-testid="dialog-blackjack-leave"><span className="bj-eyebrow">ПОДТВЕРЖДЕНИЕ</span><h2 id="bj-leave-title">Покинуть стол?</h2><p>{table.canLeave ? "Вы освободите все свои места за этим столом." : "Сейчас нельзя покинуть стол во время активной раздачи."}</p><div><button className="bj-secondary" onClick={() => setConfirmLeave(false)} data-testid="button-blackjack-stay">Остаться</button><button className="bj-primary" onClick={leaveTable} disabled={!table.canLeave || leave.isPending} data-testid="button-blackjack-confirm-leave">{leave.isPending ? "ВЫХОД…" : "ПОКИНУТЬ"}</button></div></section></div>}
      {confirmLeaveSeatIndex !== null && <div className="bj-modal-backdrop" role="presentation"><section className="bj-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="bj-leave-seat-title" data-testid="dialog-blackjack-leave-seat"><span className="bj-eyebrow">ПОДТВЕРЖДЕНИЕ</span><h2 id="bj-leave-seat-title">Покинуть место {confirmLeaveSeatIndex}?</h2><p>Место освободится, а незапущенная ставка будет отменена.</p><div><button className="bj-secondary" onClick={() => setConfirmLeaveSeatIndex(null)} data-testid="button-blackjack-stay-seat">Остаться</button><button className="bj-primary" onClick={confirmLeaveSeat} disabled={leaveSeat.isPending} data-testid="button-blackjack-confirm-leave-seat">{leaveSeat.isPending ? "ВЫХОД…" : "ПОКИНУТЬ МЕСТО"}</button></div></section></div>}
  </div>;
}

function outcomeLabel(outcome: string) {
  return ({ blackjack: "Блэкджек", won: "Победа", lost: "Поражение", push: "Ничья" } as Record<string, string>)[outcome] ?? outcome;
}
