import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, RotateCw } from "lucide-react";
import {
  getGetDarkAceBootstrapQueryKey,
  getGetDarkAceFruitsQueryKey,
  getGetDarkAceLeaderboardQueryKey,
  getListDarkAceTransactionsQueryKey,
  useGetDarkAceFruits,
  usePlaceDarkAceFruitBet,
  useRepeatDarkAceFruitBets,
} from "@workspace/api-client-react";
import type { DarkAceFruitId, DarkAceFruitSnapshot } from "@workspace/api-client-react";
import { getGameCountdownTone } from "@/lib/game-countdown";
import { playGameCountdownTick } from "@/lib/game-countdown-audio";
import "./GameCountdown.css";
import "./FruitGamePage.css";
import { getStakeChipAmount, getStakeChipOptions, StakeChipPicker, type StakeChipKey } from "@/components/StakeChipPicker";
import { MAX_GAME_STAKE } from "@/lib/game-limits";
import type { WinCelebrationInput } from "@/components/WinCelebration";

type Props = { sessionReady: boolean; liveConnected: boolean; gameEnabled: boolean; balance?: number; onWin: (event: WinCelebrationInput) => void };
const numberFormat = new Intl.NumberFormat("ru-RU");
const credits = (value: number) => `${numberFormat.format(value)} кредитов`;
const formatCompactStake = (value: number) => {
  if (value >= 1_000_000) return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value / 1_000_000)}м`;
  if (value >= 1_000) return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value / 1_000)}к`;
  return numberFormat.format(value);
};
type PendingFruitBet = {
  id: string;
  fruitId: DarkAceFruitId;
  amount: number;
  roundNumber: number;
  accepted: boolean;
};
const signedCredits = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${credits(Math.abs(value))}`;
const fruits: { id: DarkAceFruitId; name: string; multiplier: number }[] = [
  { id: "apple", name: "Яблоко", multiplier: 5 },
  { id: "kiwi", name: "Киви", multiplier: 5 },
  { id: "orange", name: "Апельсин", multiplier: 5 },
  { id: "watermelon", name: "Арбуз", multiplier: 40 },
  { id: "mango", name: "Манго", multiplier: 5 },
  { id: "grapes", name: "Виноград", multiplier: 25 },
  { id: "strawberry", name: "Клубника", multiplier: 15 },
  { id: "cherries", name: "Вишня", multiplier: 10 },
];
const maxFruitStake = MAX_GAME_STAKE;
const clockwiseFruitOrder: DarkAceFruitId[] = ["apple", "kiwi", "orange", "mango", "cherries", "strawberry", "grapes", "watermelon"];
const fruitBoardOrder: (DarkAceFruitId | null)[] = ["apple", "kiwi", "orange", "watermelon", null, "mango", "grapes", "strawberry", "cherries"];
const fmtDate = (value: string) => new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const idKey = () => typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

function FruitGlyph({ fruit, size = 42 }: { fruit: DarkAceFruitId; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 64 64", role: "img" as const, "aria-label": fruits.find((item) => item.id === fruit)?.name };
  const leaf = <path d="M32 12c4-8 12-8 16-6-1 8-7 12-15 11" fill="#75c96d" stroke="#b6f28c" strokeWidth="1.5" />;
  const base = {
    apple: <><path d="M32 18c-6-8-20-4-22 11-3 19 9 30 22 27 14 3 25-9 22-27-2-15-16-19-22-11Z" fill="#ed4146" stroke="#ff9784" strokeWidth="2" />{leaf}<ellipse cx="21" cy="29" rx="4" ry="7" fill="#ff8b78" opacity=".8" /></>,
    kiwi: <><ellipse cx="32" cy="34" rx="24" ry="21" fill="#8eba3e" stroke="#d3eb77" strokeWidth="2" /><ellipse cx="32" cy="34" rx="14" ry="12" fill="#f3e8ad" />{Array.from({ length: 8 }, (_, i) => <circle key={i} cx={32 + Math.cos(i * Math.PI / 4) * 9} cy={34 + Math.sin(i * Math.PI / 4) * 8} r="1.4" fill="#37352c" />)}</>,
    orange: <><circle cx="32" cy="34" r="23" fill="#fa8b20" stroke="#ffd05d" strokeWidth="2" /><path d="M30 12c2-5 8-6 12-4-1 5-5 7-11 7" fill="#8dd16c" /><path d="M16 27c5-8 13-12 21-12" fill="none" stroke="#ffe19a" strokeWidth="2" opacity=".9" /></>,
    watermelon: <><path d="M8 31a25 25 0 0 0 48 0H8Z" fill="#f0445d" stroke="#71d278" strokeWidth="5" /><path d="M12 30a21 21 0 0 0 40 0" fill="none" stroke="#e5ff8e" strokeWidth="3" />{[23, 32, 41].map((x) => <ellipse key={x} cx={x} cy="38" rx="1.5" ry="3" fill="#45342d" />)}</>,
    mango: <><path d="M40 12c13 3 17 14 11 29-6 15-18 21-30 15C8 50 10 32 20 22c7-8 13-12 20-10Z" fill="#ffc62f" stroke="#fff078" strokeWidth="2" />{leaf}<path d="M22 28c4-4 8-5 12-4" stroke="#fff3a1" strokeWidth="3" opacity=".8" /></>,
    grapes: <><path d="M32 14c0-8 8-10 14-8" fill="none" stroke="#9bdc75" strokeWidth="3" />{[[29,22],[40,25],[21,31],[32,34],[44,36],[26,43],[37,46],[32,55]].map(([x,y], i) => <circle key={i} cx={x} cy={y} r="8" fill={i % 2 ? "#a950db" : "#c06aef"} stroke="#e0a7ff" strokeWidth="1.5" />)}</>,
    strawberry: <><path d="M13 23c8 0 14-7 19-7s11 7 19 7c-1 18-9 30-19 36-10-6-18-18-19-36Z" fill="#f43d58" stroke="#ff9bac" strokeWidth="2" /><path d="M21 21c3-8 9-10 11-8 3-5 9-4 12 0l-7 8" fill="#88d36f" />{[[23,31],[34,29],[43,34],[26,42],[37,43],[32,51]].map(([x,y], i) => <ellipse key={i} cx={x} cy={y} rx="1.2" ry="2" fill="#fff0a0" />)}</>,
    cherries: <><path d="M24 30c0-19-2-20-5-23M42 30c1-18 8-20 11-21" fill="none" stroke="#91d576" strokeWidth="3" /><circle cx="22" cy="42" r="14" fill="#eb3555" stroke="#ff858d" strokeWidth="2" /><circle cx="44" cy="42" r="14" fill="#fb4a61" stroke="#ff9b91" strokeWidth="2" /><ellipse cx="17" cy="36" rx="3" ry="5" fill="#ffa198" opacity=".9" /></>,
  };
  return <svg {...common}>{base[fruit]}</svg>;
}

function FruitHistoryStrip({
  results,
  location,
}: {
  results: DarkAceFruitSnapshot["recentResults"];
  location: "stage" | "betting";
}) {
  const visibleResults = results.slice(0, 15);
  return <div className={`fruit-history-strip fruit-history-${location}`} data-testid={`fruit-history-${location}`}>
    <div className="fruit-history-heading"><span>ИСТОРИЯ · НОВЫЕ СЛЕВА</span><small>{visibleResults.length}/15</small></div>
    {visibleResults.length ? <div className="fruit-history-track" aria-label="Последние 15 результатов, новые слева">
      {visibleResults.map((result) => <div className="fruit-history-item" key={`${location}-${result.roundNumber}`}
        title={`Раунд ${result.roundNumber}: ${fruits.find((fruit) => fruit.id === result.fruitId)?.name ?? result.fruitId} ×${result.multiplier}`}
        data-testid={`fruit-history-${location}-${result.roundNumber}`}>
        <FruitGlyph fruit={result.fruitId} size={20} />
        <span>#{numberFormat.format(result.roundNumber)}</span>
      </div>)}
    </div> : <div className="fruit-history-empty">Результаты появятся после раунда</div>}
  </div>;
}

function FruitCurrentTopBets({
  bets,
  selectedFruitCount,
}: {
  bets: DarkAceFruitSnapshot["currentBets"];
  selectedFruitCount: number;
}) {
  const topPlayers = useMemo(() => {
    const players = new Map<string, {
      name: string;
      stake: number;
      fruitAmounts: Map<DarkAceFruitId, number>;
    }>();
    for (const bet of bets) {
      const key = `${bet.username ?? bet.displayName}:${bet.avatarUrl ?? ""}`;
      const player = players.get(key) ?? {
        name: bet.username ? `@${bet.username}` : bet.displayName,
        stake: 0,
        fruitAmounts: new Map<DarkAceFruitId, number>(),
      };
      player.stake += bet.totalAmount;
      for (const item of bet.stakes) {
        player.fruitAmounts.set(item.fruitId, (player.fruitAmounts.get(item.fruitId) ?? 0) + item.amount);
      }
      players.set(key, player);
    }
    return [...players.values()].sort((a, b) => b.stake - a.stake).slice(0, 3);
  }, [bets]);

  return <section className="fruit-current-top-bets" aria-label="Три крупнейшие ставки этого раунда" data-testid="fruit-current-top-bets">
    <div className="fruit-current-bets-heading">
      <span>СТАВКИ ЭТОГО РАУНДА · ТОП 3</span><small>{selectedFruitCount}/6</small>
    </div>
    {topPlayers.length ? <div className="fruit-current-bets-list">
      {topPlayers.map((player, index) => <div className="fruit-current-bet-row" key={`${player.name}-${index}`} data-testid={`fruit-current-bet-${index + 1}`}>
        <b className="fruit-current-bet-name" title={player.name}>{player.name}</b>
        <span className="fruit-current-bet-fruits" aria-label="Фрукты и суммы ставок">
          {[...player.fruitAmounts].map(([fruitId, amount]) => <span className="fruit-current-bet-fruit" key={fruitId} title={`${fruits.find((fruit) => fruit.id === fruitId)?.name ?? fruitId}: ${formatCompactStake(amount)}`}>
            <FruitGlyph fruit={fruitId} size={19} />
            <small>{formatCompactStake(amount)}</small>
          </span>)}
        </span>
        <strong>{formatCompactStake(player.stake)}</strong>
      </div>)}
    </div> : <div className="fruit-current-bets-empty">Ставок пока нет</div>}
  </section>;
}

function FruitBoard({
  snapshot,
  serverOffset,
  remaining,
  accepting,
  selected,
  personalStakes,
  pendingStakes,
  selectionLimitReached,
  onToggle,
  disabled,
}: {
  snapshot: DarkAceFruitSnapshot;
  serverOffset: number;
  remaining: number;
  accepting: boolean;
  selected: DarkAceFruitId[];
  personalStakes: Map<DarkAceFruitId, number>;
  pendingStakes: Map<DarkAceFruitId, number>;
  selectionLimitReached: boolean;
  onToggle: (fruit: DarkAceFruitId) => void;
  disabled: boolean;
}) {
  const serverOffsetRef = useRef(serverOffset);
  serverOffsetRef.current = serverOffset;
  const round = snapshot.round;
  const [rollingFruit, setRollingFruit] = useState<DarkAceFruitId | null>(null);
  useEffect(() => {
    if (round?.status !== "spinning" || !round.resultFruit || !round.spinStartedAt || !round.spinEndsAt) {
      setRollingFruit(null);
      return;
    }
    const targetIndex = clockwiseFruitOrder.indexOf(round.resultFruit);
    const position = Math.max(0, Math.min(0.999999, round.stopPosition ?? 0.5));
    const fullTurns = 7 + Math.floor(position * 3);
    const totalSteps = fullTurns * clockwiseFruitOrder.length + targetIndex;
    const startedAt = Date.parse(round.spinStartedAt);
    const duration = Math.max(1, Date.parse(round.spinEndsAt) - startedAt);
    let frame = 0;
    let lastStep = -1;
    const animate = () => {
      const progress = Math.max(0, Math.min(1, (Date.now() + serverOffsetRef.current - startedAt) / duration));
      const eased = progress * (2 - progress);
      const step = Math.min(totalSteps, Math.floor(eased * totalSteps));
      if (step !== lastStep) {
        lastStep = step;
        setRollingFruit(clockwiseFruitOrder[step % clockwiseFruitOrder.length] ?? round.resultFruit!);
      }
      if (progress < 1) {
        frame = window.requestAnimationFrame(animate);
      } else {
        setRollingFruit(round.resultFruit);
      }
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [round?.roundNumber, round?.status, round?.resultFruit, round?.spinStartedAt, round?.spinEndsAt, round?.stopPosition]);

  const lastResult = snapshot.recentResults[0];
  const finalFruit = round?.status === "spinning" ? null
    : round?.status === "completed" ? round.resultFruit
      : lastResult?.roundNumber === (round?.roundNumber ?? 0) - 1 ? lastResult.fruitId : null;
  const visibleFruit = rollingFruit ?? finalFruit;
  return <div className="fruit-board" data-testid="fruit-result-board">
    {fruitBoardOrder.map((fruitId, index) => fruitId
      ? (() => {
        const fruit = fruits.find((item) => item.id === fruitId)!;
        const isSelected = selected.includes(fruitId);
        const personalStake = personalStakes.get(fruitId) ?? 0;
        const pendingStake = pendingStakes.get(fruitId) ?? 0;
        const visibleStake = personalStake + pendingStake;
        const isRolling = round?.status === "spinning" && visibleFruit === fruitId;
        const isResult = round?.status !== "spinning" && finalFruit === fruitId;
        return <button type="button" key={fruitId}
          className={`fruit-board-cell fruit-tile-${fruitId} ${isSelected ? "fruit-board-selected" : ""} ${pendingStake > 0 ? "fruit-board-pending" : ""} ${isRolling ? "fruit-board-rolling" : ""} ${isResult ? "fruit-board-result" : ""}`}
          onClick={() => onToggle(fruitId)} disabled={disabled || !accepting || (selectionLimitReached && !isSelected)}
           aria-pressed={isSelected} aria-busy={pendingStake > 0} data-stake-chip-target data-testid={`button-select-fruit-${fruitId}`} data-fruit-id={fruitId}>
          <FruitGlyph fruit={fruitId} size={47} /><b>{fruit.name}</b><strong>×{fruit.multiplier}</strong>
          {visibleStake > 0 && <span className={`fruit-own-stake ${pendingStake > 0 ? "fruit-own-stake-pending" : ""}`} data-testid={`fruit-own-stake-${fruitId}`}>
            <small>{pendingStake > 0 ? "ПРИЁМ" : "ВАША"}</small><b>{numberFormat.format(visibleStake)}</b>
          </span>}
        </button>;
      })()
      : <div className={`fruit-board-center ${round?.status === "spinning" ? "fruit-board-center-spinning" : ""}`}
        key={`center-${index}`} data-testid="fruit-center-countdown" aria-live="polite">
        <span>{round ? `РАУНД #${numberFormat.format(round.roundNumber)}` : "РАУНД"}</span>
        <b className={round?.status === "open" ? `game-countdown-timer ${getGameCountdownTone(remaining)}` : undefined}>{round?.status === "spinning" ? `${String(remaining).padStart(2, "0")}с` : round?.status === "open" ? `${String(remaining).padStart(2, "0")}с` : "—"}</b>
        <small>{round?.status === "spinning" ? "ИТОГ УЖЕ ЗАФИКСИРОВАН" : accepting ? "СТАВКИ ОТКРЫТЫ" : "ОЖИДАНИЕ"}</small>
      </div>)}
  </div>;
}

export default function FruitGamePage({ sessionReady, liveConnected, gameEnabled, balance, onWin }: Props) {
  const queryClient = useQueryClient();
  const query = useGetDarkAceFruits({ query: {
    enabled: sessionReady,
    queryKey: getGetDarkAceFruitsQueryKey(),
    refetchInterval: liveConnected ? 3_000 : 2_000,
    refetchIntervalInBackground: false,
  } });
  const [selected, setSelected] = useState<DarkAceFruitId[]>([]);
  const [chipState, setChipState] = useState<{ roundNumber: number | null; budget: number; key: StakeChipKey }>({
    roundNumber: null,
    budget: 0,
    key: "1",
  });
  const [clockNow, setClockNow] = useState(Date.now());
  const [notice, setNotice] = useState("");
  const [betError, setBetError] = useState("");
  const [pendingBets, setPendingBets] = useState<PendingFruitBet[]>([]);
  const fruitResultInitialized = useRef(false);
  const lastFruitPersonalRound = useRef<number | null>(null);
  const pendingBetsRef = useRef<PendingFruitBet[]>([]);
  const confirmedBalanceFloor = useRef(Number.POSITIVE_INFINITY);
  const placeBet = usePlaceDarkAceFruitBet({
    mutation: {
      onSuccess: (result, variables) => {
        const pendingBet = pendingBetsRef.current.find((bet) => bet.id === variables.data.idempotencyKey);
        if (!pendingBet) return;
        const { fruitId, roundNumber } = pendingBet;
        confirmedBalanceFloor.current = Math.min(confirmedBalanceFloor.current, result.balance);
        const markedAccepted = pendingBetsRef.current.map((bet) => bet.id === pendingBet.id ? { ...bet, accepted: true } : bet);
        pendingBetsRef.current = markedAccepted;
        setPendingBets(markedAccepted);
        if (queryClient.getQueryData<DarkAceFruitSnapshot>(getGetDarkAceFruitsQueryKey())?.round?.roundNumber === roundNumber) {
          setNotice(`Ставка на ${fruits.find((fruit) => fruit.id === fruitId)?.name ?? "фрукт"} принята.`);
        }
        queryClient.setQueryData<DarkAceFruitSnapshot>(getGetDarkAceFruitsQueryKey(), (old) => {
          if (!old || old.round?.roundNumber !== roundNumber) return old;
          const alreadyInCurrent = old.currentBets.some((bet) => bet.betId === result.bet.betId);
          const alreadyInMine = old.myCurrentBets.some((bet) => bet.betId === result.bet.betId);
          return {
            ...old,
            currentBets: alreadyInCurrent ? old.currentBets : [...old.currentBets, result.bet],
            myCurrentBets: alreadyInMine ? old.myCurrentBets : [...old.myCurrentBets, result.bet],
            myTotalStake: old.myTotalStake + (alreadyInMine ? 0 : result.bet.totalAmount),
            round: old.round ? {
              ...old.round,
              totalStake: old.round.totalStake + (alreadyInCurrent ? 0 : result.bet.totalAmount),
              betCount: old.round.betCount + (alreadyInCurrent ? 0 : 1),
            } : old.round,
          };
        });
      },
      onError: (error, variables) => {
        const pendingBet = pendingBetsRef.current.find((bet) => bet.id === variables.data.idempotencyKey);
        if (!pendingBet) return;
        setBetError(error instanceof Error ? error.message : `Ставка на ${fruits.find((fruit) => fruit.id === pendingBet.fruitId)?.name ?? "фрукт"} не принята.`);
      },
      onSettled: (_result, error, variables) => {
        const pendingBet = pendingBetsRef.current.find((bet) => bet.id === variables.data.idempotencyKey);
        if (!pendingBet) return;
        const { fruitId, roundNumber } = pendingBet;
        const remainingPending = pendingBetsRef.current.filter((bet) => bet.id !== pendingBet.id);
        pendingBetsRef.current = remainingPending;
        setPendingBets(remainingPending);
        const latestSnapshot = queryClient.getQueryData<DarkAceFruitSnapshot>(getGetDarkAceFruitsQueryKey());
        if (error && latestSnapshot?.round?.roundNumber === roundNumber) {
          const alreadyAccepted = latestSnapshot.myCurrentBets.some((bet) => bet.stakes.some((item) => item.fruitId === fruitId));
          const sameFruitPending = remainingPending.some((bet) => bet.roundNumber === roundNumber && bet.fruitId === fruitId);
          if (!alreadyAccepted && !sameFruitPending) {
            setSelected((current) => current.filter((id) => id !== fruitId));
          }
        }
        if (remainingPending.length === 0) {
          const settledBalance = confirmedBalanceFloor.current;
          confirmedBalanceFloor.current = Number.POSITIVE_INFINITY;
          if (Number.isFinite(settledBalance)) {
            queryClient.setQueryData<DarkAceFruitSnapshot>(getGetDarkAceFruitsQueryKey(), (old) => old
              ? { ...old, balance: Math.min(old.balance, settledBalance) }
              : old);
            queryClient.setQueryData<any>(getGetDarkAceBootstrapQueryKey(), (old: any) => old?.wallet
              ? { ...old, wallet: { ...old.wallet, balance: Math.min(old.wallet.balance, settledBalance) } }
              : old);
          }
          void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetDarkAceFruitsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetDarkAceLeaderboardQueryKey() });
        }
      },
    },
  });
  const snapshot = query.data;
  const round = snapshot?.round;
  const repeatBets = useRepeatDarkAceFruitBets();
  const repeatPendingRef = useRef(false);
  const pendingStakeTotal = pendingBets.reduce((total, bet) => total + (bet.accepted ? 0 : bet.amount), 0);
  const availableBalance = Math.max(0, Math.min(snapshot?.balance ?? 0, confirmedBalanceFloor.current) - pendingStakeTotal);
  const pendingStakes = useMemo(() => {
    const totals = new Map<DarkAceFruitId, number>();
    for (const bet of pendingBets) {
      if (bet.roundNumber !== round?.roundNumber || bet.accepted) continue;
      totals.set(bet.fruitId, (totals.get(bet.fruitId) ?? 0) + bet.amount);
    }
    return totals;
  }, [pendingBets, round?.roundNumber]);
  const offset = useMemo(() => snapshot?.serverNow ? Date.parse(snapshot.serverNow) - Date.now() : 0, [snapshot?.serverNow]);
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setSelected([]);
    setNotice("");
  }, [round?.roundNumber]);
  useEffect(() => {
    if (!snapshot || !Number.isSafeInteger(snapshot.balance)) return;
    const bootstrapKey = getGetDarkAceBootstrapQueryKey();
    queryClient.setQueryData<any>(bootstrapKey, (current: any) => current?.wallet
      && current.wallet.balance !== snapshot.balance
      ? { ...current, wallet: { ...current.wallet, balance: snapshot.balance } }
      : current);
  }, [queryClient, snapshot?.balance]);
  const myCurrentBets = snapshot?.myCurrentBets ?? [];
  const committedStake = myCurrentBets.reduce((total, bet) => total + bet.totalAmount, 0);
  const unconfirmedStake = pendingBets
    .filter((bet) => !bet.accepted && bet.roundNumber === (snapshot?.round?.roundNumber ?? 0))
    .reduce((total, bet) => total + bet.amount, 0);
  const remainingPlayerStake = Math.max(0, maxFruitStake - committedStake - unconfirmedStake);
  const spendableBalance = Math.max(0, availableBalance - unconfirmedStake);
  const maxStake = Math.floor(Math.min(spendableBalance, remainingPlayerStake, maxFruitStake) / 100) * 100;
  const chipBudgetCandidate = Math.min(maxFruitStake, Math.max(0, (snapshot?.balance ?? 0) + committedStake));
  useEffect(() => {
    if (round?.roundNumber == null || chipState.roundNumber === round.roundNumber) return;
    setChipState((current) => ({ roundNumber: round.roundNumber!, budget: chipBudgetCandidate, key: current.key }));
  }, [round?.roundNumber, chipBudgetCandidate, chipState.roundNumber]);
  const chipBudget = chipState.roundNumber === round?.roundNumber ? chipState.budget : chipBudgetCandidate;
  const selectedChipKey = chipState.key;
  const stakeOptions = getStakeChipOptions(chipBudget, 100, 100);
  const stake = getStakeChipAmount(selectedChipKey, stakeOptions, maxStake);
  const amountValid = Number.isSafeInteger(stake) && stake >= 100
    && stake <= remainingPlayerStake && stake % 100 === 0;
  const enoughBalance = Number.isSafeInteger(stake) && stake <= spendableBalance;
  const personalStakes = useMemo(() => {
    const totals = new Map<DarkAceFruitId, number>();
    for (const bet of myCurrentBets) {
      for (const item of bet.stakes) totals.set(item.fruitId, (totals.get(item.fruitId) ?? 0) + item.amount);
    }
    return totals;
  }, [myCurrentBets]);
  const selectedFruitIds = [...new Set([...selected, ...personalStakes.keys()])];
  const selectionLimitReached = selectedFruitIds.length >= 6;
  const latestResult = snapshot?.recentResults[0];
  const hasRepeatablePreviousBets = !!latestResult
    && snapshot?.myRecentResult?.roundNumber === latestResult.roundNumber;
  const isPostRoundHistory = !!latestResult && !!round && (
    (round.status === "completed" && latestResult.roundNumber === round.roundNumber)
    || (round.status === "open" && latestResult.roundNumber === round.roundNumber - 1)
  );
  const recentWinners = isPostRoundHistory
    ? (snapshot?.recentWinners ?? []).filter((winner) => winner.roundNumber === latestResult?.roundNumber).slice(0, 3)
    : [];
  const myRecentResult = isPostRoundHistory && snapshot?.myRecentResult?.roundNumber === latestResult?.roundNumber
    ? snapshot.myRecentResult
    : null;
  useEffect(() => {
    if (!query.isSuccess || !snapshot) return;
    const result = snapshot.myRecentResult;
    if (!fruitResultInitialized.current) {
      fruitResultInitialized.current = true;
      lastFruitPersonalRound.current = result?.roundNumber ?? null;
      return;
    }
    if (!result || result.roundNumber === lastFruitPersonalRound.current) return;
    lastFruitPersonalRound.current = result.roundNumber;
    if (result.profit > 0 && result.payout > 0) {
      onWin({ eventId: `fruits:${result.roundNumber}`, outcome: "win", amount: result.payout });
    } else if (result.profit < 0) {
      onWin({ eventId: `fruits:${result.roundNumber}`, outcome: "loss", amount: Math.abs(result.profit) });
    }
  }, [query.isSuccess, snapshot, snapshot?.myRecentResult?.roundNumber, snapshot?.myRecentResult?.payout, snapshot?.myRecentResult?.profit, onWin]);
  const remaining = round?.status === "open" ? Math.max(0, Math.ceil((Date.parse(round.bettingClosesAt) - (clockNow + offset)) / 1000))
    : round?.status === "spinning" && round.spinEndsAt ? Math.max(0, Math.ceil((Date.parse(round.spinEndsAt) - (clockNow + offset)) / 1000)) : 0;
  useEffect(() => {
    if (round?.status === "open") {
      playGameCountdownTick(`fruits:${round.roundNumber}`, remaining);
    }
  }, [round?.status, round?.roundNumber, remaining]);
  const accepting = round?.status === "open" && remaining > 0 && gameEnabled;
  const canPlaceBet = !!snapshot && accepting && amountValid && enoughBalance;
  const submit = (fruitId: DarkAceFruitId) => {
    if (!snapshot || !accepting || !amountValid) return;
    const submittedRoundNumber = snapshot.round?.roundNumber ?? 0;
    const currentSnapshot = queryClient.getQueryData<DarkAceFruitSnapshot>(getGetDarkAceFruitsQueryKey()) ?? snapshot;
    const currentRoundFruitIds = currentSnapshot.round?.roundNumber === submittedRoundNumber
      ? currentSnapshot.myCurrentBets.flatMap((bet) => bet.stakes.map((item) => item.fruitId))
      : [];
    const pendingRoundFruitIds = pendingBetsRef.current
      .filter((bet) => bet.roundNumber === submittedRoundNumber)
      .map((bet) => bet.fruitId);
    const alreadySelected = new Set([...currentRoundFruitIds, ...pendingRoundFruitIds]);
    if (!alreadySelected.has(fruitId) && alreadySelected.size >= 6) {
      setBetError("");
      setNotice("За раунд можно выбрать не более 6 разных фруктов.");
      return;
    }
    const unconfirmedStake = pendingBetsRef.current
      .filter((bet) => !bet.accepted)
      .reduce((total, bet) => total + bet.amount, 0);
    const committedPlayerStake = currentSnapshot.round?.roundNumber === submittedRoundNumber
      ? currentSnapshot.myCurrentBets.reduce((total, bet) => total + bet.totalAmount, 0)
      : 0;
    if (committedPlayerStake + unconfirmedStake + stake > MAX_GAME_STAKE) {
      setBetError("");
      setNotice("Общая сумма ставок за раунд не может превышать 250 млн кредитов.");
      return;
    }
    const spendableBalance = Math.max(
      0,
      Math.min(currentSnapshot.balance, confirmedBalanceFloor.current) - unconfirmedStake,
    );
    if (stake > spendableBalance) {
      setNotice("");
      setBetError("Недостаточно кредитов для этой ставки.");
      return;
    }
    if (currentSnapshot.round?.roundNumber !== submittedRoundNumber || currentSnapshot.round.status !== "open") return;
    if (pendingBetsRef.current.length === 0) confirmedBalanceFloor.current = Number.POSITIVE_INFINITY;
    const pendingBet = { id: idKey(), fruitId, amount: stake, roundNumber: submittedRoundNumber, accepted: false };
    const nextPending = [...pendingBetsRef.current, pendingBet];
    pendingBetsRef.current = nextPending;
    setPendingBets(nextPending);
    setSelected((current) => current.includes(fruitId) ? current : [...current, fruitId]);
    setBetError("");
    setNotice("");
    placeBet.mutate({ data: { fruitIds: [fruitId], amount: stake, idempotencyKey: pendingBet.id } });
  };
  const repeatLastRoundBets = () => {
    if (!accepting || !snapshot || !hasRepeatablePreviousBets || repeatPendingRef.current) return;
    const previousStake = snapshot.myRecentResult?.stake ?? 0;
    if (previousStake <= 0) {
      setNotice("В прошлом раунде не было ставок для повтора.");
      return;
    }
    if (previousStake > maxStake) {
      setNotice("Повтор превышает доступный остаток лимита или баланса.");
      return;
    }

    repeatPendingRef.current = true;
    setNotice("");
    const submittedRoundNumber = snapshot.round?.roundNumber ?? 0;
    repeatBets.mutate({ data: { idempotencyKey: idKey() } }, {
      onSuccess: (result) => {
        const fruitQueryKey = getGetDarkAceFruitsQueryKey();
        const currentSnapshot = queryClient.getQueryData<DarkAceFruitSnapshot>(fruitQueryKey);
        if (currentSnapshot?.round?.roundNumber === submittedRoundNumber) {
          const replayedFruitIds = result.bets.flatMap((bet) => bet.stakes.map((item) => item.fruitId));
          setSelected((current) => [...new Set([...current, ...replayedFruitIds])]);
        }
        queryClient.setQueryData<DarkAceFruitSnapshot>(fruitQueryKey, (old) => {
          if (!old || old.round?.roundNumber !== submittedRoundNumber) return old;
          const currentIds = new Set(old.currentBets.map((bet) => bet.betId));
          const newBets = result.bets.filter((bet) => !currentIds.has(bet.betId));
          const addedStake = newBets.reduce((total, bet) => total + bet.totalAmount, 0);
          return {
            ...old,
            currentBets: newBets.length ? [...old.currentBets, ...newBets] : old.currentBets,
            myCurrentBets: newBets.length ? [...old.myCurrentBets, ...newBets] : old.myCurrentBets,
            myTotalStake: old.myTotalStake + addedStake,
            balance: Math.min(old.balance, result.balance),
            round: old.round ? {
              ...old.round,
              totalStake: old.round.totalStake + addedStake,
              betCount: old.round.betCount + newBets.length,
            } : old.round,
          };
        });
        queryClient.setQueryData<any>(getGetDarkAceBootstrapQueryKey(), (old: any) => old?.wallet
          ? { ...old, wallet: { ...old.wallet, balance: Math.min(old.wallet.balance, result.balance) } }
          : old);
        setNotice("Ставки прошлого раунда повторены.");
        void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDarkAceFruitsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDarkAceLeaderboardQueryKey() });
      },
      onSettled: () => {
        repeatPendingRef.current = false;
      },
    });
  };

  if (query.isLoading && !snapshot) return <section className="fruit-page" aria-label="Загрузка фруктов">
    <div className="fruit-skeleton fruit-skeleton-title" /><div className="fruit-skeleton fruit-skeleton-stage" /><div className="fruit-skeleton fruit-skeleton-form" />
  </section>;
  if (query.isError && !snapshot) return <section className="fruit-error panel" data-testid="fruit-error">
    <RotateCw size={22} /><h2>Фруктовый стол недоступен</h2><p>Не удалось получить раунд с сервера. Ставки пока закрыты.</p>
    <button type="button" onClick={() => void query.refetch()} data-testid="button-retry-fruits">Повторить загрузку</button>
  </section>;
  if (!snapshot) return null;
  const statusLabel = round?.status === "open" ? accepting ? "ПРИЁМ СТАВОК ОТКРЫТ" : "ПРИЁМ СТАВОК ЗАКРЫТ"
    : round?.status === "spinning" ? "РЕЗУЛЬТАТ ФИКСИРУЕТСЯ" : round?.status === "completed" ? "РАУНД ЗАВЕРШЁН" : "ОЖИДАНИЕ РАУНДА";

  return <section className="fruit-page" aria-label="Фрукты DARK ACE">
    <header className="fruit-head">
      <div className="fruit-round-meta">
        <span className={`fruit-status fruit-status-${round?.status ?? "waiting"}`} data-testid="status-fruit-round"><i />{statusLabel}</span>
      </div>
    </header>
    {query.isError && <div className="fruit-stale" role="status" data-testid="status-fruit-stale">Нет связи с сервером. Показано последнее состояние.</div>}
    <div className="fruit-layout">
      <div className="fruit-main-column">
        <section className="fruit-stage panel">
          <div className="fruit-stage-top"><span><i className={query.isError ? "" : "is-online"} />{query.isError ? "НЕТ СВЯЗИ" : "СЕРВЕР СИНХРОНИЗИРОВАН"}</span>
            <span>{numberFormat.format(round?.betCount ?? 0)} СТАВОК · {credits(round?.totalStake ?? 0)}</span>
          </div>
           <FruitBoard snapshot={snapshot} serverOffset={offset} remaining={remaining} accepting={accepting}
              selected={selectedFruitIds} personalStakes={personalStakes} pendingStakes={pendingStakes} selectionLimitReached={selectionLimitReached}
               onToggle={submit} disabled={!canPlaceBet} />
           {myRecentResult && myRecentResult.payout > 0 && <div className="fruit-congratulations fruit-personal-win" role="status" data-testid="fruit-congratulations">
             <Check size={17} aria-hidden="true" />
             <div className="fruit-congratulations-main">
               <b>Детали выплаты</b>
               <span>{fruits.find((fruit) => fruit.id === myRecentResult.fruitId)?.name} ×{myRecentResult.multiplier}</span>
             </div>
             <div className="fruit-congratulations-profit">
                <small>ОБЩИЙ ВЫИГРЫШ</small><b>+{numberFormat.format(myRecentResult.payout)}</b>
             </div>
          </div>}
          {recentWinners.length > 0 && <div className="fruit-round-winners" data-testid="fruit-round-winners">
            <div className="fruit-winners-heading"><span>ТОП 3 ПОБЕДИТЕЛЯ · РАУНД #{numberFormat.format(latestResult!.roundNumber)}</span><small>до следующего вращения</small></div>
            <div className="fruit-winners-podium">{recentWinners.map((winner, index) => <div className="fruit-winner-chip" key={`${winner.roundNumber}-${winner.username ?? winner.displayName}`} data-testid={`fruit-round-winner-${index + 1}`}>
              <span>#{index + 1} {winner.username ? `@${winner.username}` : winner.displayName}</span><b>+{numberFormat.format(winner.payout)}</b>
            </div>)}</div>
          </div>}
          <div className="fruit-stage-caption" data-testid="text-fruit-result">
            {!round ? "Сервер готовит следующий раунд" : round.status === "spinning" ? "Раунд закрыт. Итог определён сервером." : round.status === "completed" && round.resultFruit
              ? `Выпало: ${fruits.find((fruit) => fruit.id === round.resultFruit)?.name} · ×${fruits.find((fruit) => fruit.id === round.resultFruit)?.multiplier}`
              : accepting ? "Нажмите на фрукт — ставка спишется сразу" : "Ставки закрыты до следующего раунда"}
          </div>
        </section>
        <section className="fruit-chooser panel">
          <FruitCurrentTopBets bets={snapshot.currentBets} selectedFruitCount={selectedFruitIds.length} />
          <div className="fruit-chip-controls">
            <StakeChipPicker
              budget={chipBudget}
              maxStake={maxStake}
              allInAmount={maxStake}
              minStake={100}
              step={100}
              selectedKey={selectedChipKey}
              onSelect={(key) => setChipState({
                roundNumber: round?.roundNumber ?? chipState.roundNumber,
                budget: chipBudget,
                key,
              })}
              disabled={!accepting || !gameEnabled || !sessionReady}
              testIdPrefix="button-fruit-chip"
              label="ФИШКА НА ФРУКТ"
              resetKey={round?.roundNumber}
              className="fruit-stake-picker"
            />
            <button type="button" onClick={repeatLastRoundBets}
              disabled={!accepting || !hasRepeatablePreviousBets || repeatBets.isPending || (snapshot?.myRecentResult?.stake ?? 0) > maxStake}
              aria-label="Повторить ставки прошлого раунда" title="Повторить ставки прошлого раунда"
              className={`fruit-repeat-button${repeatBets.isPending ? " fruit-repeat-pending" : ""}`}
              data-testid="button-fruit-repeat">
              <RotateCw size={18} />
            </button>
          </div>
          {(!amountValid || !enoughBalance || !accepting) && <div className="fruit-validation" role="status" data-testid="status-fruit-validation">
            {!gameEnabled ? "Игра временно приостановлена." : !accepting ? round?.status === "spinning" ? "Ставки закрыты — ждём серверный результат." : "Приём ставок закрыт. Новый раунд скоро начнётся." : !amountValid ? `Сумма от 100 до ${numberFormat.format(MAX_GAME_STAKE)} кредитов, шаг 100.` : "Недостаточно кредитов для этой ставки."}
          </div>}
          {betError && <div className="fruit-inline-error" role="alert" data-testid="status-fruit-bet-error">{betError}</div>}
          {repeatBets.isError && <div className="fruit-inline-error" role="alert" data-testid="status-fruit-repeat-error">{repeatBets.error instanceof Error ? repeatBets.error.message : "Не удалось повторить ставки прошлого раунда."}</div>}
          {notice && <div className="fruit-success" role="status" data-testid="status-fruit-bet-success"><Check size={13} />{notice}</div>}
          {pendingBets.length > 0 && <div className="fruit-success" role="status"><span className="fruit-loader-dot" />Ставки принимаются…</div>}
        </section>
        <FruitHistoryStrip results={snapshot.recentResults} location="betting" />
      </div>
    </div>
  </section>;
}
