import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, CircleAlert, CircleHelp, Clock3, Coins, RefreshCw, ShieldCheck, Spade } from "lucide-react";
import type { WinCelebrationInput } from "@/components/WinCelebration";
import {
  getGetDarkAceHighCardQueryKey,
  useCancelDarkAceHighCardBet,
  useGetDarkAceHighCard,
  usePlaceDarkAceHighCardBet,
  type DarkAceHighCardBet,
  type DarkAceHighCardRoundBet,
  type DarkAceHighCardSelection,
} from "@workspace/api-client-react";
import "./HighCardGamePage.css";

const numberFormat = new Intl.NumberFormat("ru-RU");
const MIN_STAKE = 100;
const MAX_ROUND_STAKE = 250_000_000;
const SELECTIONS: { id: DarkAceHighCardSelection; title: string; multiplier: string }[] = [
  { id: "player", title: "Игрок", multiplier: "×2" },
  { id: "tie", title: "Ничья", multiplier: "×11" },
  { id: "banker", title: "Банкир", multiplier: "×2" },
];
type AggregatedHighCardBet = DarkAceHighCardRoundBet & { betIds: string[]; betCount: number };
const SUIT_SYMBOLS: Record<string, string> = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const SUIT_NAMES: Record<string, string> = { clubs: "трефы", diamonds: "бубны", hearts: "черви", spades: "пики" };
const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[3, 3]],
  2: [[3, 1], [3, 5]],
  3: [[3, 1], [3, 3], [3, 5]],
  4: [[2, 1], [4, 1], [2, 5], [4, 5]],
  5: [[2, 1], [4, 1], [3, 3], [2, 5], [4, 5]],
  6: [[2, 1], [4, 1], [2, 3], [4, 3], [2, 5], [4, 5]],
  7: [[2, 1], [4, 1], [2, 2], [3, 3], [4, 2], [2, 5], [4, 5]],
  8: [[2, 1], [4, 1], [2, 2], [4, 2], [2, 4], [4, 4], [2, 5], [4, 5]],
  9: [[2, 1], [4, 1], [2, 2], [4, 2], [3, 3], [2, 4], [4, 4], [2, 5], [4, 5]],
  10: [[2, 1], [4, 1], [2, 2], [4, 2], [2, 3], [4, 3], [2, 4], [4, 4], [2, 5], [4, 5]],
};

const formatCredits = (amount: number) => numberFormat.format(amount);
const compactChipNumber = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const formatCompactChipAmount = (amount: number) => amount >= 1_000_000
  ? `${compactChipNumber.format(amount / 1_000_000)} М`
  : amount >= 1_000
    ? `${compactChipNumber.format(amount / 1_000)} К`
    : formatCredits(amount);
const CHIP_PERCENTAGES = [0.5, 1, 2, 5, 10, 25, 50] as const;
const getStakeChips = (budget: number) => {
  if (!Number.isSafeInteger(budget) || budget < MIN_STAKE) return [];
  const maxOnStep = Math.floor(budget / 100) * 100;
  if (maxOnStep < MIN_STAKE) return [];
  const seen = new Set<number>();
  return CHIP_PERCENTAGES.flatMap((percentage) => {
    const proportional = Math.floor(budget * percentage / 100 / 100) * 100;
    const amount = Math.min(maxOnStep, Math.max(MIN_STAKE, proportional));
    if (amount < MIN_STAKE || seen.has(amount)) return [];
    seen.add(amount);
    return [{ id: String(percentage), percentage, amount }];
  });
};
const russianCount = (value: number, one: string, few: string, many: string) => {
  const absolute = Math.abs(value) % 100;
  const last = absolute % 10;
  if (absolute > 10 && absolute < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
};
const rankName = (rank: number | null | undefined) => {
  if (rank == null) return null;
  if (rank === 13) return "Т";
  if (rank === 12) return "К";
  if (rank === 11) return "Д";
  if (rank === 10) return "В";
  return String(rank + 1);
};
const rankLongName = (rank: number | null) => {
  if (rank === null) return "карта ещё не открыта";
  if (rank === 13) return "туз";
  if (rank === 12) return "король";
  if (rank === 11) return "дама";
  if (rank === 10) return "валет";
  return `${rank + 1} ранг`;
};
const cardRankLabel = (rank: number | null) => {
  if (rank === null) return "—";
  if (rank === 13) return "A";
  if (rank === 12) return "K";
  if (rank === 11) return "Q";
  if (rank === 10) return "J";
  return String(rank + 1);
};

function CourtCardIllustration({ suit }: { suit: string }) {
  return (
    <svg className="hc-court-art" viewBox="0 0 64 88" aria-hidden="true">
      <rect x="4" y="4" width="56" height="80" rx="5" fill="#fffdf8" stroke="currentColor" strokeWidth="1.4" />
      <g className="hc-court-figure">
        <path d="M22 18 27 10l5 6 5-6 5 8-4 4H26z" fill="currentColor" />
        <circle cx="32" cy="29" r="7" fill="currentColor" />
        <path d="M24 37q8-5 16 0l8 13-8 6H24l-8-6z" fill="currentColor" />
        <path d="m25 40 7 5 7-5m-14 10 7-5 7 5" fill="none" stroke="#fffdf8" strokeWidth="1.8" />
        <text x="32" y="54" textAnchor="middle" fill="#fffdf8" fontSize="10">{suit}</text>
      </g>
      <g className="hc-court-figure" transform="rotate(180 32 44)">
        <path d="M22 18 27 10l5 6 5-6 5 8-4 4H26z" fill="currentColor" />
        <circle cx="32" cy="29" r="7" fill="currentColor" />
        <path d="M24 37q8-5 16 0l8 13-8 6H24l-8-6z" fill="currentColor" />
        <path d="m25 40 7 5 7-5m-14 10 7-5 7 5" fill="none" stroke="#fffdf8" strokeWidth="1.8" />
        <text x="32" y="54" textAnchor="middle" fill="#fffdf8" fontSize="10">{suit}</text>
      </g>
      <path d="M11 44h42" stroke="currentColor" strokeWidth=".7" opacity=".55" />
      <circle cx="32" cy="44" r="3.5" fill="#fffdf8" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function useServerClock(serverNow?: string) {
  const [now, setNow] = useState(Date.now());
  const offset = useMemo(() => serverNow ? Date.parse(serverNow) - Date.now() : 0, [serverNow]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);
  return now + offset;
}

function countdownLabel(milliseconds: number) {
  return Math.max(0, milliseconds / 1000).toFixed(1);
}

function CardFace({ rank, side, suit: suitCode, hidden, revealed, winner, tieResult }: {
  rank: number | null;
  side: "player" | "banker";
  suit?: string | null;
  hidden: boolean;
  revealed: boolean;
  winner: boolean;
  tieResult: boolean;
}) {
  const value = !hidden && rank !== null ? rankName(rank) : null;
  const cardValue = !hidden && rank !== null ? cardRankLabel(rank) : null;
  const resolvedSuitCode = suitCode ?? (side === "player" ? "diamonds" : "spades");
  const suit = SUIT_SYMBOLS[resolvedSuitCode] ?? "♠";
  const isRedSuit = resolvedSuitCode === "hearts" || resolvedSuitCode === "diamonds";
  const pipCount = rank === 13 ? 1 : rank !== null && rank >= 1 && rank <= 9 ? rank + 1 : 0;
  const isCourtCard = rank !== null && rank >= 10 && rank <= 12;
  const pipPositions = PIP_LAYOUTS[pipCount] ?? [];
  return (
    <div className={`hc-card-stage hc-card-${side}${revealed ? " is-revealed" : ""}${winner ? " is-winner" : ""}${tieResult ? " is-tied" : ""}`}
      data-testid={`card-${side}`}>
      <div className="hc-card-flip">
        <div className="hc-card-back" aria-hidden="true">
          <span className="hc-card-back-mark"><Spade size={25} strokeWidth={1.2} /></span>
          <span className="hc-card-back-caption">DARK ACE</span>
        </div>
        <div role="img" className={`hc-card-front ${isRedSuit ? "red-suit" : "black-suit"}`}
          aria-label={`${side === "player" ? "Игрок" : "Банкир"}: ${hidden ? "карта ещё не открыта" : `${rankLongName(rank)}, ${SUIT_NAMES[resolvedSuitCode] ?? "пики"}${winner ? ", победная карта" : tieResult ? ", ничья" : ""}`}`}>
          <span className="hc-card-index">{cardValue ?? "—"}<small>{suit}</small></span>
          {isCourtCard ? <CourtCardIllustration suit={suit} /> : pipCount > 0 ? (
            <span className={`hc-card-pip-field${pipCount === 1 ? " ace-pip-field" : ""}`} aria-hidden="true">
              {pipPositions.map(([column, row], index) => <i key={`${column}-${row}-${index}`}
                className={row > 3 ? "lower-pip" : ""}
                style={{ gridColumn: column, gridRow: row }}>{suit}</i>)}
            </span>
          ) : <span className="hc-card-missing">{value ?? "—"}</span>}
          <span className="hc-card-index hc-card-index-bottom">{cardValue ?? "—"}<small>{suit}</small></span>
        </div>
      </div>
    </div>
  );
}

export default function HighCardGamePage({ sessionReady, onBack, onWin }: {
  sessionReady: boolean;
  onBack(): void;
  onWin(event: WinCelebrationInput): void;
}) {
  const queryClient = useQueryClient();
  const previousBetStates = useRef<Map<string, string> | null>(null);
  const query = useGetDarkAceHighCard({
    query: {
      enabled: sessionReady,
      queryKey: getGetDarkAceHighCardQueryKey(),
      refetchInterval: 1_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      staleTime: 500,
    },
  });
  const placeBet = usePlaceDarkAceHighCardBet();
  const cancelBet = useCancelDarkAceHighCardBet();
  const [placingSelection, setPlacingSelection] = useState<DarkAceHighCardSelection | null>(null);
  const [selectedChipKey, setSelectedChipKey] = useState("1");
  const [chipTrayOpen, setChipTrayOpen] = useState(false);
  const [chipBudgetByRound, setChipBudgetByRound] = useState<{ roundNumber: number; amount: number } | null>(null);
  const [acceptedChip, setAcceptedChip] = useState<{ selection: DarkAceHighCardSelection; amount: number; nonce: number } | null>(null);
  const [pendingStakeTotal, setPendingStakeTotal] = useState(0);
  const pendingStakeRef = useRef(0);
  const [notice, setNotice] = useState("");
  const snapshot = query.data;
  const round = snapshot?.currentRound;
  const serverTime = useServerClock(round?.serverNow);
  const balance = snapshot?.balance ?? 0;
  const selectionTotals = snapshot?.selectionTotals ?? {
    player: { totalStake: 0, playerCount: 0 },
    tie: { totalStake: 0, playerCount: 0 },
    banker: { totalStake: 0, playerCount: 0 },
  };
  const totalPoolStake = selectionTotals.player.totalStake + selectionTotals.tie.totalStake + selectionTotals.banker.totalStake;
  const myBets = snapshot?.myBets ?? [];
  const myRoundBets = myBets.filter((bet) => bet.roundNumber === round?.roundNumber);
  const roundBets = snapshot?.roundBets ?? [];
  const roundBetGroups = useMemo(() => {
    const groups = new Map<string, AggregatedHighCardBet>();
    for (const bet of roundBets) {
      const playerKey = bet.username
        ? `username:${bet.username.replace(/^@/, "").toLocaleLowerCase()}`
        : `name:${bet.displayName}`;
      const key = `${playerKey}:${bet.selection}:${bet.status}:${bet.won ?? "pending"}`;
      const group = groups.get(key);
      if (group) {
        group.stake += bet.stake;
        group.payout += bet.payout;
        group.profit += bet.profit;
        group.betIds.push(bet.id);
        group.betCount += 1;
      } else {
        groups.set(key, { ...bet, betIds: [bet.id], betCount: 1 });
      }
    }
    return [...groups.values()];
  }, [roundBets]);
  const openBets = myRoundBets.filter((bet) => bet.status === "accepted");
  const openBetIds = new Set(openBets.map((bet) => bet.id));
  const ownRoundStake = openBets.reduce((sum, bet) => sum + bet.stake, 0);
  const maxStake = Math.max(0, Math.floor(Math.min(balance - pendingStakeTotal, MAX_ROUND_STAKE - ownRoundStake - pendingStakeTotal)));
  const calculatedChipBudget = Math.max(0, Math.min(MAX_ROUND_STAKE, balance + ownRoundStake));
  const chipBudget = chipBudgetByRound && chipBudgetByRound.roundNumber === round?.roundNumber
    ? chipBudgetByRound.amount
    : calculatedChipBudget;
  const stakeChips = useMemo(() => getStakeChips(chipBudget), [chipBudget]);
  const selectedChip = stakeChips.find((chip) => chip.id === selectedChipKey);
  const stake = selectedChipKey === "all-in" ? maxStake : selectedChip?.amount ?? 0;
  const validStake = Number.isSafeInteger(stake) && stake >= MIN_STAKE && stake <= balance && stake <= maxStake;
  const formattedStake = validStake ? formatCredits(stake) : "—";
  const canAddStake = validStake && ownRoundStake + stake <= MAX_ROUND_STAKE;
  const ownStakesBySelection = openBets.reduce<Record<DarkAceHighCardSelection, number>>((totals, bet) => {
    totals[bet.selection] += bet.stake;
    return totals;
  }, { player: 0, tie: 0, banker: 0 });
  const selectedSides = new Set<"player" | "banker">(
    openBets.flatMap((bet) => bet.selection === "player" || bet.selection === "banker" ? [bet.selection] : []),
  );
  const selectedSide = selectedSides.size === 1 ? [...selectedSides][0] ?? null : null;
  const hasConflictingSides = selectedSides.size > 1;
  const selectedSideTitle = selectedSide === "player" ? "Игрок" : "Банкир";
  const phase = round?.phase ?? "betting";
  const bettingOpen = !!snapshot?.gameEnabled && phase === "betting" && serverTime < Date.parse(round?.bettingClosesAt ?? "");
  const isMutating = cancelBet.isPending || placeBet.isPending || pendingStakeTotal > 0;
  const playerVisible = !!round && (phase === "player_reveal" || phase === "banker_reveal" || phase === "result") && round.playerRank !== null;
  const bankerVisible = !!round && (phase === "banker_reveal" || phase === "result") && round.bankerRank !== null;
  const playerWinner = phase === "result" && round?.result === "player";
  const bankerWinner = phase === "result" && round?.result === "banker";
  const tiedResult = phase === "result" && round?.result === "tie";
  const countdownTarget = phase === "betting" ? round?.bettingClosesAt
    : phase === "player_reveal" ? round?.playerRevealAt
      : phase === "banker_reveal" ? round?.bankerRevealAt
        : round?.resultEndsAt;
  const remaining = countdownTarget ? Math.max(0, Date.parse(countdownTarget) - serverTime) : 0;
  const phaseTitle = phase === "betting" ? "Приём ставок"
    : phase === "player_reveal" ? "Открывается карта игрока"
      : phase === "banker_reveal" ? "Открывается карта банкира"
        : "Итог раунда";

  useEffect(() => {
    setChipTrayOpen(false);
  }, [round?.roundNumber]);

  useEffect(() => {
    if (selectedChipKey !== "all-in" && stakeChips.length > 0 && !selectedChip) {
      setSelectedChipKey(stakeChips[0]!.id);
    }
  }, [selectedChip, selectedChipKey, stakeChips]);

  useEffect(() => {
    if (!round) return;
    setChipBudgetByRound((current) => {
      if (current?.roundNumber === round.roundNumber) return current;
      return { roundNumber: round.roundNumber, amount: calculatedChipBudget };
    });
  }, [round?.roundNumber, calculatedChipBudget]);

  useEffect(() => {
    if (!acceptedChip) return;
    const timer = window.setTimeout(() => setAcceptedChip(null), 760);
    return () => window.clearTimeout(timer);
  }, [acceptedChip]);

  const refreshSnapshot = (result: { balance: number; currentRound: NonNullable<typeof round>; myBets: DarkAceHighCardBet[] }) => {
    queryClient.setQueryData(getGetDarkAceHighCardQueryKey(), (current: typeof snapshot | undefined) => current
      ? { ...current, balance: result.balance, currentRound: result.currentRound, myBets: result.myBets }
      : current);
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceHighCardQueryKey() });
  };

  const addBet = (betSelection: DarkAceHighCardSelection) => {
    if (!bettingOpen || isMutating || pendingStakeRef.current > 0) return;
    if (betSelection !== "tie" && (hasConflictingSides || (selectedSide !== null && selectedSide !== betSelection))) return;
    const pending = pendingStakeRef.current;
    const available = Math.max(0, Math.floor(Math.min(balance - pending, MAX_ROUND_STAKE - ownRoundStake - pending)));
    const amount = selectedChipKey === "all-in" ? available : selectedChip?.amount ?? 0;
    if (!Number.isSafeInteger(amount) || amount < MIN_STAKE || amount > available || amount % 100 !== 0) return;
    setNotice("");
    setPlacingSelection(betSelection);
    pendingStakeRef.current += amount;
    setPendingStakeTotal(pendingStakeRef.current);
    void placeBet.mutateAsync({ data: { selection: betSelection, stake: amount, requestId: crypto.randomUUID() } })
      .then((result) => {
        setAcceptedChip({ selection: betSelection, amount, nonce: Date.now() });
        refreshSnapshot(result);
      })
      .catch(() => setNotice("Не удалось принять ставку. Обновляю баланс и состояние раунда."))
      .finally(() => {
        pendingStakeRef.current = Math.max(0, pendingStakeRef.current - amount);
        setPendingStakeTotal(pendingStakeRef.current);
        setPlacingSelection((current) => current === betSelection ? null : current);
      });
  };

  const cancel = async (betIds: string[]) => {
    if (!bettingOpen || isMutating) return;
    setNotice("");
    try {
      for (const betId of betIds) {
        const result = await cancelBet.mutateAsync({ betId });
        refreshSnapshot(result);
      }
    } catch {
      setNotice("Не удалось отменить все суммы. Проверьте, какие ставки остались в раунде.");
    }
  };

  const errors = [placeBet.error, cancelBet.error].filter(Boolean);
  const recent = snapshot?.recentResults ?? [];
  const visibleRecent = recent.slice(0, 25);

  useEffect(() => {
    if (!snapshot) return;
    const previous = previousBetStates.current;
    const newlySettledBets = previous
      ? myBets.filter((bet) =>
          previous.get(bet.id) === "accepted"
          && bet.status === "settled"
        )
      : [];
    const settlementsByRound = new Map<number, DarkAceHighCardBet[]>();
    for (const bet of newlySettledBets) {
      const roundBets = settlementsByRound.get(bet.roundNumber) ?? [];
      roundBets.push(bet);
      settlementsByRound.set(bet.roundNumber, roundBets);
    }
    for (const [roundNumber, bets] of settlementsByRound) {
      const payout = bets.reduce((sum, bet) => sum + bet.payout, 0);
      const profit = bets.reduce((sum, bet) => sum + bet.profit, 0);
      if (profit > 0 && payout > 0) {
        onWin({
          eventId: `high-card:${roundNumber}`,
          outcome: "win",
          amount: payout,
          placement: "top",
        });
      } else if (profit < 0) {
        onWin({
          eventId: `high-card:${roundNumber}`,
          outcome: "loss",
          amount: Math.abs(profit),
          placement: "top",
        });
      }
    }
    previousBetStates.current = new Map(myBets.map((bet) => [bet.id, bet.status]));
  }, [myBets, snapshot, onWin]);

  return (
    <main className="high-card-page" data-testid="page-high-card">
      <div className="hc-shell">
        <header className="hc-header">
          <button type="button" className="hc-back" onClick={onBack} aria-label="Вернуться в DARK ACE" data-testid="button-high-card-back">
            <ArrowLeft size={16} /><span>ИГРЫ</span>
          </button>
          <div className="hc-brand"><span className="hc-brand-mark">A</span><span>DARK ACE<small>ОБЩИЙ СТОЛ</small></span></div>
          <div className="hc-live"><i /> ОБЩИЙ СТОЛ</div>
        </header>

        {query.isLoading || !sessionReady ? (
          <section className="hc-loading" aria-label="Загрузка игры «Высшая карта»" data-testid="state-high-card-loading">
            <div className="hc-skeleton-head" /><div className="hc-skeleton-table" /><div className="hc-skeleton-controls" />
          </section>
        ) : query.isError && !snapshot ? (
          <section className="hc-state-panel hc-error-state" role="alert" data-testid="state-high-card-error">
            <CircleAlert size={23} /><b>Стол недоступен</b><p>Не удалось загрузить общий раунд и ваш баланс.</p>
            <button type="button" onClick={() => void query.refetch()} data-testid="button-high-card-retry"><RefreshCw size={14} /> Повторить</button>
          </section>
        ) : snapshot ? (
          <>
            <h1 className="sr-only">Высшая карта</h1>

            {!snapshot.gameEnabled && <div className="hc-disabled" role="status" data-testid="status-high-card-disabled"><ShieldCheck size={15} /> Стол временно закрыт. Баланс и история по-прежнему доступны.</div>}
            {query.isError && <div className="hc-stale-banner" role="status">Нет соединения · показано последнее состояние общего стола.</div>}
            {notice && <div className="hc-notice" role="alert" data-testid="status-high-card-notice"><CircleAlert size={15} />{notice}</div>}
            {!notice && errors.length > 0 && <div className="hc-notice" role="alert"><CircleAlert size={15} />Не удалось выполнить действие со ставкой.</div>}

            <section className={`hc-table hc-phase-${phase}`} aria-label="Общий стол «Высшая карта»" data-testid="panel-high-card-table">
              <div className="hc-table-top">
                <div><span className="hc-round-label">РАУНД</span><b data-testid="value-high-card-round">#{round?.roundNumber ?? "—"}</b></div>
                <div className="hc-phase-center"><span className="hc-phase-kicker">УПРАВЛЯЕТ СЕРВЕР</span><strong data-testid="status-high-card-phase">{phaseTitle}</strong></div>
                <div className={`hc-clock${phase === "betting" && remaining < 3_000 ? " is-urgent" : ""}`} data-testid="value-high-card-countdown">
                  <Clock3 size={13} /><b>{countdownLabel(remaining)}</b><small>СЕК</small>
                </div>
              </div>
              <div className="hc-progress" aria-hidden="true"><span className={`hc-progress-fill progress-${phase}`} /></div>
              <div className="hc-card-row">
                <div className="hc-contestant"><span className="hc-seat-dot player-dot" /><span>ИГРОК</span><small>КРАСНЫЙ</small></div>
                <CardFace rank={round?.playerRank ?? null} side="player" suit={round?.playerSuit} hidden={!playerVisible} revealed={playerVisible}
                  winner={playerWinner} tieResult={tiedResult} />
                <div className="hc-versus"><span>ПРОТИВ</span><i /></div>
                <CardFace rank={round?.bankerRank ?? null} side="banker" suit={round?.bankerSuit} hidden={!bankerVisible} revealed={bankerVisible}
                  winner={bankerWinner} tieResult={tiedResult} />
                <div className="hc-contestant banker-contestant"><span className="hc-seat-dot banker-dot" /><span>БАНКИР</span><small>СИНИЙ</small></div>
              </div>
              <div className="hc-table-footer">
                <span>{phase === "betting" ? "ДО ЗАКРЫТИЯ СТАВОК" : phase === "player_reveal" ? "КАРТА ИГРОКА · 2 СЕК" : phase === "banker_reveal" ? "КАРТА БАНКИРА · 2 СЕК" : "ОБЩИЙ ИТОГ"}</span>
                <b data-testid="value-high-card-round-stats">{formatCredits(round?.totalStake ?? 0)} {russianCount(round?.totalStake ?? 0, "кредит в ставках", "кредита в ставках", "кредитов в ставках")} <i /> {round?.betCount ?? 0} {russianCount(round?.betCount ?? 0, "ставка", "ставки", "ставок")}</b>
              </div>
            </section>

            <section className="hc-history-section" aria-label="История результатов">
              <div className="hc-history-heading"><span>ИСТОРИЯ · НОВЫЕ СЛЕВА</span><small>{visibleRecent.length}/25</small></div>
              {visibleRecent.length ? <div className="hc-history-track" role="list" aria-label="Последние 25 результатов, новые слева" data-testid="list-high-card-recent-results">
                {visibleRecent.map((item) => {
                  const outcomeLabel = item.result === "tie" ? "Ничья" : item.result === "player" ? "Игрок" : "Банкир";
                  const resultIcon = item.result === "tie" ? "Н" : item.result === "player" ? "И" : "Б";
                  return <div className={`hc-history-item outcome-${item.result}`} key={item.roundNumber}
                    title={`Раунд ${item.roundNumber}: ${outcomeLabel}. Игрок — ${rankLongName(item.playerRank)}, банкир — ${rankLongName(item.bankerRank)}`}
                    aria-label={`Раунд ${item.roundNumber}: ${outcomeLabel}`}
                    role="listitem" data-testid={`item-high-card-result-${item.roundNumber}`}>
                    <b aria-hidden="true">{resultIcon}</b><span>#{item.roundNumber}</span>
                  </div>;
                })}
              </div> : <div className="hc-history-empty">Результаты появятся после первого раунда</div>}
            </section>

            <section className="hc-betting-layout" aria-label="Ставки на исходы">
              <div className="hc-bet-panel">
                <div className="hc-bet-heading">
                  <div><span className="hc-eyebrow">ВЫБЕРИТЕ ФИШКУ И ИСХОД</span><h2>Сделайте ставку</h2></div>
                  <details className="hc-info-menu">
                    <summary aria-label="Правила стола и статистика исходов" data-testid="button-high-card-info"><CircleHelp size={18} /></summary>
                    <div className="hc-info-popover">
                      <strong>Правила стола</strong>
                      <p>Верная ставка на Игрока или Банкира возвращает ×2, включая ставку. Ничья возвращает ×11. При равных картах ставки на Игрока и Банкира возвращают половину; для нечётной ставки возврат округляется вниз.</p>
                      <div className="hc-info-stat-list">
                        {SELECTIONS.map((item) => {
                          const pool = selectionTotals[item.id];
                          const percentage = totalPoolStake > 0 ? Math.round(pool.totalStake / totalPoolStake * 100) : 0;
                          const playerCount = russianCount(pool.playerCount, "игрок", "игрока", "игроков");
                          return <div className={`hc-info-stat ${item.id}`} key={item.id}>
                            <span>{item.title} · {item.multiplier}</span>
                            <b data-testid={`value-high-card-share-${item.id}`}>{percentage}%</b>
                            <small data-testid={`value-high-card-player-count-${item.id}`}>{pool.playerCount} {playerCount}</small>
                          </div>;
                        })}
                      </div>
                      <p>Минимум — 100 кредитов. Лимит — 250 000 000 кредитов на игрока за раунд. Принятую ставку можно отменить до закрытия приёма.</p>
                    </div>
                  </details>
                </div>
                <div className="hc-chip-selector">
                  <button type="button" className={`hc-selected-chip${selectedChipKey === "all-in" ? " is-all-in" : ""}`}
                    aria-label={`Выбранная фишка: ${selectedChipKey === "all-in" ? "Алл-ин" : "обычная"}, ${formattedStake} кредитов`}
                    aria-expanded={chipTrayOpen} aria-controls="high-card-chip-tray" disabled={!bettingOpen || isMutating}
                    data-stake-chip-source data-stake-chip-amount={formattedStake}
                    onClick={() => setChipTrayOpen((open) => !open)} data-testid="button-high-card-chip-selector">
                    <Coins size={19} />
                    <span><small>{selectedChipKey === "all-in" ? "АЛЛ-ИН" : "ВЫБРАНА ФИШКА"}</small><b>{formattedStake}</b><small>кредитов</small></span>
                    <ChevronDown className={chipTrayOpen ? "is-open" : ""} size={16} />
                  </button>
                  {chipTrayOpen && <div className="hc-chip-tray" id="high-card-chip-tray" role="group" aria-label="Выберите размер фишки">
                    {stakeChips.map((chip) => <button type="button" key={chip.id}
                      className={`hc-chip-option${selectedChipKey === chip.id ? " is-selected" : ""}`}
                      disabled={!bettingOpen || isMutating || chip.amount > maxStake}
                      onClick={() => { setSelectedChipKey(chip.id); setChipTrayOpen(false); }}
                      aria-label={`Фишка ${formatCredits(chip.amount)} кредитов`} data-testid={`button-high-card-chip-${chip.id}`}>
                      <span className="hc-chip-coin" aria-hidden="true"><Coins size={15} /></span><b>{formatCompactChipAmount(chip.amount)}</b>
                    </button>)}
                    <button type="button" className={`hc-chip-option hc-chip-all-in${selectedChipKey === "all-in" ? " is-selected" : ""}`}
                      disabled={!bettingOpen || isMutating || maxStake < MIN_STAKE}
                      onClick={() => { setSelectedChipKey("all-in"); setChipTrayOpen(false); }}
                      aria-label={`Алл-ин ${maxStake >= MIN_STAKE ? formatCredits(maxStake) : "недоступно"} кредитов`}
                      data-testid="button-high-card-all-in">
                      <span className="hc-chip-coin" aria-hidden="true"><Coins size={15} /></span><b>АЛЛ-ИН</b><small>{maxStake >= MIN_STAKE ? formatCompactChipAmount(maxStake) : "—"}</small>
                    </button>
                  </div>}
                </div>
                {bettingOpen && stake >= MIN_STAKE && !canAddStake && <div className="hc-stake-feedback" role="status" data-testid="status-high-card-stake">
                  {stake > balance ? "Недостаточно доступных кредитов для этой фишки." : `Остаток лимита раунда: ${formatCredits(maxStake)} кредитов.`}
                </div>}
                <div className="hc-stake-feedback" role="note" data-testid="status-high-card-outcome-rule">
                  {hasConflictingSides
                    ? "В этом раунде уже выбраны обе стороны. Отмените одну из них; ничья доступна отдельно."
                    : selectedSide !== null
                      ? `Выбрана сторона «${selectedSideTitle}». Противоположная сторона недоступна; на ничью можно ставить отдельно.`
                      : "Выберите Игрока или Банкира; на Ничью можно ставить отдельно."}
                </div>
                <div className="hc-selection-grid">
                  {SELECTIONS.map((item) => {
                    const ownSelectionStake = ownStakesBySelection[item.id];
                    const sideUnavailable = item.id !== "tie" && (
                      hasConflictingSides || (selectedSide !== null && selectedSide !== item.id)
                    );
                    const sideUnavailableCopy = hasConflictingSides
                      ? "Отмените ставку на одну из сторон"
                      : `Выбрана сторона ${selectedSideTitle}`;
                    return <button type="button" key={item.id} className={`hc-selection ${item.id}${placingSelection === item.id ? " is-pending" : ""}${phase === "result" && round?.result === item.id ? " is-winning-outcome" : ""}`}
                      aria-label={`${item.title}, ${item.multiplier}. Поставить ${formattedStake} кредитов${ownSelectionStake > 0 ? `; ваша ставка ${formatCredits(ownSelectionStake)}` : ""}${sideUnavailable ? `; ${sideUnavailableCopy}` : ""}`}
                      aria-busy={placingSelection === item.id} disabled={!canAddStake || !bettingOpen || isMutating || sideUnavailable} data-stake-chip-target
                      onClick={() => addBet(item.id)} data-testid={`button-high-card-select-${item.id}`}>
                      <span className="hc-selection-symbol">{item.id === "tie" ? "＝" : item.id === "player" ? "И" : "Б"}</span>
                      <strong className="hc-selection-multiplier">{item.multiplier}</strong>
                      <span className="hc-selection-copy"><b>{item.title}</b><small>{placingSelection === item.id ? "Принимаем…" : sideUnavailable ? sideUnavailableCopy : ownSelectionStake > 0 ? `Ваша ставка · ${formatCredits(ownSelectionStake)}` : "Нажмите, чтобы поставить"}</small></span>
                      {acceptedChip?.selection === item.id && <span className="hc-chip-arrival" key={acceptedChip.nonce} aria-hidden="true">+{formatCredits(acceptedChip.amount)}</span>}
                    </button>;
                  })}
                </div>
              </div>

              <div className="hc-round-bets">
                <div className="hc-section-heading"><div><span className="hc-eyebrow">СТАВКИ ТЕКУЩЕГО РАУНДА</span><h2>Ставки игроков <em>{roundBetGroups.length}</em></h2></div>
                </div>
                {roundBetGroups.length ? <div className="hc-bet-list" data-testid="list-high-card-round-bets">
                  {roundBetGroups.map((bet) => {
                    const selectionTitle = SELECTIONS.find((item) => item.id === bet.selection)?.title ?? "Ставка";
                    const playerName = bet.username ? `@${bet.username.replace(/^@/, "")}` : bet.displayName;
                    const canCancelBet = bet.betIds.some((id) => openBetIds.has(id)) && bettingOpen;
                    const isSettledWin = bet.status === "settled" && bet.won === true;
                    const isSettledLoss = bet.status === "settled" && bet.won === false && bet.profit < 0;
                    const isSettledRefund = bet.status === "settled" && bet.won === false && bet.profit === 0;
                    const combinedCount = bet.betCount > 1
                      ? ` · ${bet.betCount} ${russianCount(bet.betCount, "фишка", "фишки", "фишек")}`
                      : "";
                    const resultText = isSettledWin
                      ? formatCredits(bet.payout)
                      : isSettledLoss
                        ? `−${formatCredits(Math.abs(bet.profit))}`
                        : isSettledRefund
                          ? formatCredits(bet.payout)
                          : formatCredits(bet.stake);
                    const resultLabel = isSettledWin ? "Выигрыш" : isSettledLoss ? "Проигрыш" : isSettledRefund ? "Возврат" : bet.status === "accepted" ? "Принята" : "Рассчитана";
                    const resultClass = isSettledWin ? "positive" : isSettledLoss ? "negative" : isSettledRefund ? "refund" : "";
                    const rowResultClass = isSettledWin ? "is-win" : isSettledLoss ? "is-loss" : isSettledRefund ? "is-refund" : "";
                    return <article className={`hc-bet-row bet-${bet.status} ${rowResultClass}`} key={bet.betIds[0]} data-testid={`item-high-card-round-bet-${bet.betIds[0]}`}>
                      <span className={`hc-bet-mark ${bet.selection}`} aria-hidden="true">{bet.selection === "tie" ? "=" : bet.selection === "player" ? "И" : "Б"}</span>
                      <div className="hc-bet-info"><b>{playerName}</b><span className={resultClass ? `is-${resultClass}` : ""}>
                        {selectionTitle} · {resultLabel}{bet.status === "settled" ? ` · общая ставка ${formatCredits(bet.stake)}` : combinedCount}
                      </span></div>
                      <strong className={resultClass} title={isSettledWin
                        ? `Выплата ${formatCredits(bet.payout)} кредитов, включая ставку`
                        : isSettledLoss ? `Потеря ${formatCredits(Math.abs(bet.profit))} кредитов`
                          : isSettledRefund ? `Возврат ${formatCredits(bet.payout)} кредитов` : `Ставка ${formatCredits(bet.stake)} кредитов`}>
                        {resultText}
                      </strong>
                      {canCancelBet && <button type="button" className="hc-cancel-bet" onClick={() => void cancel(bet.betIds)} disabled={isMutating} aria-label={`Отменить все ставки «${selectionTitle}» на ${formatCredits(bet.stake)} кредитов`} data-testid={`button-high-card-cancel-${bet.betIds[0]}`}>Отменить всё</button>}
                    </article>;
                  })}
                </div> : <div className="hc-empty"><span className="hc-empty-glyph">＋</span><b>В этом раунде пока нет ставок</b><p>Выберите исход до окончания приёма ставок.</p></div>}
              </div>
            </section>

          </>
        ) : null}
      </div>
    </main>
  );
}
