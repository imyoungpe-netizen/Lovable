import { type KeyboardEvent, type ReactNode, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import EuropeanRouletteGame from '@/components/roulette/EuropeanRouletteGame';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { animateStakeChipFlight } from '@/lib/stake-chip-flight';
import { formatCredits, normalizeCurrencyText } from '@/lib/currency-format';
import { darkAceWebSocketUrl } from '@/lib/api-base';
import {
  Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, Award, Check, Club,
  CircleHelp, Coins, Crown, Flame, Gem, Gift, History, Home, Info, LockKeyhole,
  LayoutDashboard, Maximize2, Menu, RefreshCw, Settings, Settings2, ShieldCheck, ShoppingBag, Sparkles,
  Target, Trophy, UserRound, Users, Wallet, ChevronDown, ChevronLeft, ChevronRight, X,
  Gamepad2, Ticket,
} from 'lucide-react';
import {
  getGetDarkAceAdminUsersQueryKey,
  getGetDarkAceAdminOverviewQueryKey,
  getGetDarkAceBootstrapQueryKey,
  getGetDarkAceGiftInventoryQueryKey,
  getGetDarkAceCrashQueryKey,
  getGetDarkAceOwnProfileQueryKey,
  getGetDarkAceFruitsQueryKey,
  getGetDarkAceGameAvailabilityQueryKey,
  getGetDarkAceDiceQueryKey,
  getGetDarkAceTableQueryKey,
  getGetDarkAceRouletteDcQueryKey,
  getGetDarkAceLeaderboardQueryKey,
  getGetDarkAceMonthlyLeaderboardQueryKey,
  getGetDarkAceShopQueryKey,
  getGetDarkAceBattleQueryKey,
  getListDarkAceRoundsQueryKey,
  getListDarkAceLevelGiftNotificationsQueryKey,
  getListDarkAceTableBetsQueryKey,
  getListDarkAceTransactionsQueryKey,
  useClaimDarkAceDailyReward,
  useConfigureDarkAceTelegramMenu,
  useCreateDarkAceSession,
  useCancelDarkAceTableBets,
  useGetDarkAceAdminOverview,
  useGetDarkAceAdminUsers,
  useGetDarkAceBootstrap,
  useGetDarkAceCrash,
  useGetDarkAceFruits,
  useGetDarkAceGameAvailability,
  useGetDarkAceTable,
  useGetDarkAceRouletteDc,
  useGetDarkAceMonthlyLeaderboard,
  useGetDarkAceShop,
  useHealthCheck,
  useListDarkAceRounds,
  useListDarkAceLevelGiftNotifications,
  useListDarkAceTransactions,
  useAcknowledgeDarkAceLevelGiftNotification,
  usePlaceDarkAceTableBet,
  usePlaceDarkAceRouletteDcBet,
  useCancelDarkAceRouletteDcBets,
  usePlayDarkAceRound,
  useUpdateDarkAceGameConfig,
  useUpdateDarkAceGameAvailability,
  useUpdateDarkAceTransferAvailability,
  useUpdateDarkAceGameWageringAvailability,
  useGrantDarkAceCredits,
  useManageDarkAceAdminWageringRequirement,
  useRemoveDarkAceCredits,
  useResetDarkAcePlayerLevel,
  useResetDarkAceLeaderboard,
  useSetDarkAcePlayerBlock,
  useUpdateDarkAceGamePresence,
} from '@workspace/api-client-react';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  getRemainingSeconds,
  WHEEL_SPIN_ACCELERATION_EASING,
} from '@/lib/roulette-visuals';
import {
  getRouletteReelFrame,
  getRouletteReelLandingFraction,
  getRouletteReelMotionPlan,
  getRouletteReelBrakingProgress,
  ROULETTE_REEL_BRAKING_EASING,
  ROULETTE_REEL_COPY_COUNT,
  ROULETTE_REEL_STOP_COPY_INDEX,
} from '@/lib/roulette-reel';
import { getGameCountdownTone } from '@/lib/game-countdown';
import { playGameCountdownTick } from '@/lib/game-countdown-audio';
import '@/components/GameCountdown.css';
import { MAX_GAME_STAKE } from '@/lib/game-limits';
import { getPromoDeviceToken } from '@/lib/promo-device-token';
import CrashGamePage from '@/components/crash/CrashGamePage';
import FruitGamePage from '@/components/FruitGamePage';
import UpgradeGamePage from '@/components/UpgradeGamePage';
import DiceGamePage from '@/components/dice/DiceGamePage';
import { PlinkoGamePage } from '@/components/CommittedArcadeGames';
import HighCardGamePage from '@/components/HighCardGamePage';
import { getStakeChipAmount, getStakeChipOptions, StakeChipPicker, type StakeChipKey } from '@/components/StakeChipPicker';
import { BlackjackLobbyPage, BlackjackTablePage } from '@/components/blackjack/BlackjackPages';
import { GameBalance } from '@/components/GameChrome';
import { getDarkAceBotUrl, openDarkAceBotUrl } from '@/components/telegram-bot-links';
import DailyQuestsPage from '@/components/DailyQuestsPage';
import HomeHubPage from '@/components/HomeHubPage';
import TournamentsPage from '@/components/TournamentsPage';
import FairnessPage from '@/components/FairnessPage';
import { SUPPORT_URL } from '@/lib/support';
import AdminPromoCodes from '@/components/admin/AdminPromoCodes';
import AdminActionLog from '@/components/admin/AdminActionLog';
import AdminJournalPlayerHistory from '@/components/admin/AdminJournalPlayerHistory';
import AdminFinancialOperations from '@/components/admin/AdminFinancialOperations';
import AdminSystemStatus from '@/components/admin/AdminSystemStatus';
import AdminCryptoTopups from '@/components/admin/AdminCryptoTopups';
import '@/components/admin/AdminDailySummary.css';
import WelcomePromoDialog from '@/components/WelcomePromoDialog';
import { getDarkAceWelcomeStorageKeys } from '@/lib/welcome-promo';
import { BotTopupPage, ProfileHubPage, PublicProfilePage, UserAgreementPage } from '@/components/ProfileMarketHub';
import { PlayerAvatar } from '@/components/player-profile-context';
import { PlayerProfileOverlayProvider } from '@/components/PlayerProfileOverlay';
import { enqueueWinCelebration, WIN_CELEBRATION_DURATION_MS, WinCelebrationHost, type WinCelebrationInput } from '@/components/WinCelebration';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 12_000, refetchOnWindowFocus: false } },
});
const fmt = new Intl.NumberFormat('ru-RU');
const ROUND_RESULT_DISPLAY_MS = 4_000;
const money = (value?: number) => formatCredits(value ?? 0);
const shortNum = (value?: number) => fmt.format(value ?? 0);
const compactCreditAmount = (value?: number) => {
  const amount = Math.abs(value ?? 0);
  if (amount >= 1_000_000) return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(amount / 1_000_000)}м`;
  if (amount >= 1_000) return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(amount / 1_000)}к`;
  return fmt.format(amount);
};
const compactMoney = (value?: number) => {
  const amount = value ?? 0;
  if (amount >= 1_000_000_000) return `${fmt.format(amount / 1_000_000_000)} млрд кредитов`;
  if (amount >= 1_000_000) return `${fmt.format(amount / 1_000_000)} млн кредитов`;
  if (amount >= 1_000) return `${fmt.format(amount / 1_000)} тыс. кредитов`;
  return `${fmt.format(amount)} кредитов`;
};
const displayCurrencyText = normalizeCurrencyText;
const prettyDate = (value: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
type Target = 'red' | 'black' | 'coins' | 'red+coins' | 'black+coins';
type Outcome = 'red' | 'black' | 'coins';
const targets: { id: Outcome; label: string }[] = [
  { id: 'red', label: 'Красное' },
  { id: 'coins', label: 'Монета' },
  { id: 'black', label: 'Чёрное' },
];
const quickStakeAmounts: { value: number; label: string }[] = [
  { value: 50_000, label: "50k" },
  { value: 100_000, label: "100k" },
  { value: 250_000, label: "250k" },
  { value: 500_000, label: "500k" },
];
const maxSharedStake = MAX_GAME_STAKE;

const winCelebrationStorageKey = "dark-ace-win-events-v1";
const winCelebrationHistoryLimit = 250;

function readSeenWinCelebrationIds() {
  try {
    const raw = window.sessionStorage.getItem(winCelebrationStorageKey);
    const saved = raw ? JSON.parse(raw) : [];
    return new Set<string>(Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function getProfilePathFromTelegramStartParam(): string | null {
  const webApp = (window as any).Telegram?.WebApp;
  const unsafeStartParam = webApp?.initDataUnsafe?.start_param;
  const signedStartParam = typeof webApp?.initData === "string"
    ? new URLSearchParams(webApp.initData).get("start_param")
    : null;
  const startParam = typeof unsafeStartParam === "string" && unsafeStartParam
    ? unsafeStartParam
    : signedStartParam;
  const match = typeof startParam === "string"
    ? /^profile_([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.exec(startParam)
    : null;
  return match ? `/players/${encodeURIComponent(match[1]!)}` : null;
}

function getTelegramBackDestination(location: string): string | null {
  if (location === "/") return null;
  if (location.startsWith("/blackjack/table/")) return "/blackjack";
  if (location === "/profile/account") return "/profile";
  return "/";
}

function AppData() {
  const qc = useQueryClient();
  const [location, setLocation] = useLocation();
  useEffect(() => {
    const handleStakeClick = (event: MouseEvent) => {
      const clicked = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-stake-chip-target]")
        : null;
      if (clicked) animateStakeChipFlight(clicked);
    };
    document.addEventListener("click", handleStakeClick, true);
    return () => document.removeEventListener("click", handleStakeClick, true);
  }, []);
  useEffect(() => {
    const backButton = (window as any).Telegram?.WebApp?.BackButton;
    if (!backButton) return;

    const destination = getTelegramBackDestination(location);
    const handleBack = () => {
      if (destination) setLocation(destination);
    };

    try {
      if (destination) {
        backButton.onClick?.(handleBack);
        backButton.show?.();
      } else {
        backButton.hide?.();
      }
    } catch {
      // Older Telegram clients may not expose every BackButton method.
    }

    return () => {
      try {
        backButton.offClick?.(handleBack);
        backButton.hide?.();
      } catch {
        // Keep routing usable if Telegram's native BackButton is unavailable.
      }
    };
  }, [location, setLocation]);
  const [sessionReady, setSessionReady] = useState(false);
  const [welcomePromoOpen, setWelcomePromoOpen] = useState(false);
  const welcomeStorageKeysRef = useRef<ReturnType<typeof getDarkAceWelcomeStorageKeys> | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [stakeText, setStakeText] = useState('1 000');
  const [target, setTarget] = useState<Outcome>('red');
  const [claimNotice, setClaimNotice] = useState('');
  const [roundResult, setRoundResult] = useState<any>(null);
  const seenWinCelebrationIds = useRef<Set<string> | null>(null);
  if (!seenWinCelebrationIds.current) seenWinCelebrationIds.current = readSeenWinCelebrationIds();
  const rouletteResultInitialized = useRef(false);
  const lastRoulettePersonalRound = useRef<number | null>(null);
  const fruitResultInitialized = useRef(false);
  const lastFruitPersonalRound = useRef<number | null>(null);
  const crashResultsInitialized = useRef(false);
  const observedCrashBetStatuses = useRef<Map<string, string>>(new Map());
  const started = useRef(false);
  const session = useCreateDarkAceSession();
  const health = useHealthCheck();
  const dismissWelcomePromo = useCallback(() => {
    const keys = welcomeStorageKeysRef.current;
    if (keys) {
      try {
        window.localStorage.setItem(keys.dismissed, "1");
        window.localStorage.removeItem(keys.pending);
      } catch {
        // The server still marks this as a new player only once.
      }
    }
    setWelcomePromoOpen(false);
  }, []);
  const openWelcomePromo = useCallback(() => {
    dismissWelcomePromo();
    setLocation("/profile#profile-redeem-promo");
  }, [dismissWelcomePromo, setLocation]);
  const completeSession = useCallback((response: { newPlayer: boolean }) => {
    const profilePath = getProfilePathFromTelegramStartParam();
    const telegramUserId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
    const normalizedTelegramUserId = typeof telegramUserId === "string" || typeof telegramUserId === "number"
      ? String(telegramUserId).trim()
      : "";
    let shouldShowWelcome = response.newPlayer;
    if (normalizedTelegramUserId) {
      const keys = getDarkAceWelcomeStorageKeys(normalizedTelegramUserId);
      welcomeStorageKeysRef.current = keys;
      try {
        const dismissed = window.localStorage.getItem(keys.dismissed) === "1";
        const pending = window.localStorage.getItem(keys.pending) === "1";
        shouldShowWelcome = !dismissed && (response.newPlayer || pending);
        if (response.newPlayer && shouldShowWelcome) window.localStorage.setItem(keys.pending, "1");
      } catch {
        shouldShowWelcome = response.newPlayer;
      }
    }
    if (shouldShowWelcome) {
      setWelcomePromoOpen(true);
      setLocation("/");
    } else if (response.newPlayer) {
      setLocation("/");
    } else if (profilePath) {
      setLocation(profilePath);
    }
    setSessionReady(true);
  }, [setLocation]);
  const bootstrap = useGetDarkAceBootstrap({ query: { enabled: sessionReady, queryKey: getGetDarkAceBootstrapQueryKey() } });
  const table = useGetDarkAceTable({
    query: {
      enabled: sessionReady,
      queryKey: getGetDarkAceTableQueryKey(),
      refetchInterval: location === "/play" && new URLSearchParams(window.location.search).get("mode") !== "roulette-dc"
        ? (liveConnected ? 3_000 : 2_000)
        : 15_000,
      refetchIntervalInBackground: false,
    },
  });
  const fruitsWatch = useGetDarkAceFruits({ query: {
    enabled: sessionReady,
    queryKey: getGetDarkAceFruitsQueryKey(),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  } });
  const crashWatch = useGetDarkAceCrash({ query: {
    enabled: sessionReady,
    queryKey: getGetDarkAceCrashQueryKey(),
    refetchInterval: (query) => query.state.data?.myBets.some((bet) => bet.status === "pending") ? 900 : 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  } });
  const rounds = useListDarkAceRounds({ limit: 10 }, { query: { enabled: sessionReady, queryKey: getListDarkAceRoundsQueryKey({ limit: 10 }) } });
  const transactions = useListDarkAceTransactions({ query: { enabled: sessionReady && location === "/profile/account", queryKey: getListDarkAceTransactionsQueryKey() } });
  const shop = useGetDarkAceShop({ query: { enabled: sessionReady, queryKey: getGetDarkAceShopQueryKey() } });
  const adminOverview = useGetDarkAceAdminOverview({ query: {
    enabled: sessionReady && !!bootstrap.data?.admin,
    queryKey: getGetDarkAceAdminOverviewQueryKey(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  } });
  const playRound = usePlayDarkAceRound();
  const claimDaily = useClaimDarkAceDailyReward();
  const updateConfig = useUpdateDarkAceGameConfig();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const telegramWebApp = (window as any).Telegram?.WebApp;
    telegramWebApp?.ready?.();
    telegramWebApp?.expand?.();
    const initData = telegramWebApp?.initData;
    const deviceToken = getPromoDeviceToken();
    session.mutate({ data: {
      ...(initData ? { initData } : {}),
      ...(deviceToken ? { deviceToken } : {}),
    } }, {
      onSuccess: completeSession,
    });
  }, [completeSession, session.mutate]);

  useEffect(() => {
    if (!sessionReady) return;
    let disposed = false;
    let reconnectDelay = 500;
    let reconnectTimer = 0;
    let socket: WebSocket | null = null;
    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(darkAceWebSocketUrl());
      socket.onopen = () => {
        reconnectDelay = 500;
        setLiveConnected(true);
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message?.type === "fruit_state" && message.data) {
            const fruitQueryKey = getGetDarkAceFruitsQueryKey();
            const bootstrapQueryKey = getGetDarkAceBootstrapQueryKey();
            const currentFruit = qc.getQueryData<any>(fruitQueryKey);
            const currentBootstrap = qc.getQueryData<any>(bootstrapQueryKey);
            const hasNewFruitResult = message.data.recentResults?.[0]?.roundNumber
              !== currentFruit?.recentResults?.[0]?.roundNumber;
            const walletChanged = currentBootstrap?.wallet?.balance !== message.data.balance;
            qc.setQueryData(fruitQueryKey, message.data);
            qc.setQueryData<any>(getGetDarkAceBootstrapQueryKey(), (current: any) => current?.wallet
              ? { ...current, wallet: { ...current.wallet, balance: message.data.balance } }
              : current);
            if (hasNewFruitResult || walletChanged) {
              void qc.invalidateQueries({ queryKey: bootstrapQueryKey });
            }
            if (hasNewFruitResult) {
              void qc.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
              void qc.invalidateQueries({ queryKey: getGetDarkAceLeaderboardQueryKey() });
            }
            return;
          }
          if (message?.type === "dice_state" && message.data?.currentRound) {
            const diceQueryKey = getGetDarkAceDiceQueryKey();
            const currentDice = qc.getQueryData<any>(diceQueryKey);
            if (currentDice) {
              const sharedRound = message.data.currentRound;
              const oldMyBet = currentDice.myBet;
              const visibleMyBet = oldMyBet?.roundNumber === sharedRound.roundNumber
                ? sharedRound.bets?.find((bet: any) => bet.id === oldMyBet.id) ?? oldMyBet
                : null;
              const betJustSettled = oldMyBet?.status === "accepted"
                && oldMyBet.roundNumber === sharedRound.roundNumber
                && sharedRound.status === "result";
              qc.setQueryData(diceQueryKey, {
                ...currentDice,
                ...message.data,
                myBet: visibleMyBet,
              });
              if (betJustSettled) {
                void qc.invalidateQueries({ queryKey: diceQueryKey });
                void qc.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
                void qc.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
                void qc.invalidateQueries({ queryKey: getListDarkAceRoundsQueryKey({ limit: 10 }) });
                void qc.invalidateQueries({ queryKey: getGetDarkAceLeaderboardQueryKey() });
                void qc.invalidateQueries({ queryKey: getGetDarkAceMonthlyLeaderboardQueryKey() });
              }
            }
            return;
          }
          if (message?.type === "battle_state" && message.data) {
            qc.setQueryData(getGetDarkAceBattleQueryKey(), message.data);
            qc.setQueryData<any>(getGetDarkAceBootstrapQueryKey(), (current: any) => current?.wallet
              ? { ...current, wallet: { ...current.wallet, balance: message.data.balance } }
              : current);
            void qc.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
            void qc.invalidateQueries({ queryKey: getListDarkAceRoundsQueryKey({ limit: 10 }) });
            void qc.invalidateQueries({ queryKey: getGetDarkAceLeaderboardQueryKey() });
            return;
          }
          if (message?.type !== "table_state" || !message.data) return;
           const tableQueryKey = getGetDarkAceTableQueryKey();
           const currentTable = qc.getQueryData<any>(tableQueryKey);
           const hasNewCompletedResult = message.data.recentResults?.[0]?.roundNumber
             !== currentTable?.recentResults?.[0]?.roundNumber;
          qc.setQueryData(getGetDarkAceTableQueryKey(), (current: any) => ({
            ...message.data,
            myCurrentBets: current?.round?.roundNumber === message.data.round?.roundNumber
              ? current.myCurrentBets ?? []
              : [],
             myRecentWin: current?.myRecentWin ?? null,
             myRecentResult: current?.myRecentResult ?? null,
          }));
           if (hasNewCompletedResult) {
             void qc.invalidateQueries({ queryKey: tableQueryKey });
           }
          void qc.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
          void qc.invalidateQueries({ queryKey: getListDarkAceRoundsQueryKey({ limit: 10 }) });
          void qc.invalidateQueries({ queryKey: getListDarkAceTableBetsQueryKey() });
          void qc.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
           void qc.invalidateQueries({ queryKey: getGetDarkAceLeaderboardQueryKey() });
        } catch {
          // Ignore malformed frames and keep the authenticated connection open.
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        setLiveConnected(false);
        if (disposed) return;
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
      };
    };
    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
      setLiveConnected(false);
    };
  }, [sessionReady, qc]);

  const parsedStake = Number(stakeText.replace(/[^\d]/g, ''));
  const config = bootstrap.data?.gameConfig;
  const amountValid = Number.isSafeInteger(parsedStake) && parsedStake >= 100 && parsedStake <= MAX_GAME_STAKE && parsedStake % 100 === 0;
  const roundsData = rounds.data ?? bootstrap.data?.recentRounds ?? [];
  const player = bootstrap.data?.player;
  const welcomePlayerName = player?.username
    ? `@${player.username.replace(/^@/, "")}`
    : player?.displayName?.trim() || "игрок";
  const wallet = bootstrap.data?.wallet;
  const announceWin = useCallback((event: WinCelebrationInput) => {
    if (event.outcome === "loss" || !event.eventId || !Number.isSafeInteger(event.amount) || event.amount <= 0) return;
    const eventId = `${String(player?.id ?? "unknown")}:${event.eventId}`;
    const seen = seenWinCelebrationIds.current;
    if (!seen || seen.has(eventId)) return;
    seen.add(eventId);
    try {
      window.sessionStorage.setItem(
        winCelebrationStorageKey,
        JSON.stringify([...seen].slice(-winCelebrationHistoryLimit)),
      );
    } catch {
      // The in-memory set still protects against repeats if storage is unavailable.
    }
    enqueueWinCelebration({ ...event, eventId });
  }, [player?.id]);
  const announcePayoutResult = useCallback((eventId: string, result: { stake: number; payout: number; profit: number }) => {
    if (result.profit > 0 && result.payout > 0) {
      announceWin({ eventId, outcome: "win", amount: result.payout });
    }
  }, [announceWin]);
  useEffect(() => {
    const snapshot = table.data;
    if (!table.isSuccess || !snapshot) return;
    const result = snapshot.myRecentResult;
    if (!rouletteResultInitialized.current) {
      rouletteResultInitialized.current = true;
      lastRoulettePersonalRound.current = result?.roundNumber ?? null;
      if (result && result.stake > 0 && result.profit !== 0) {
        const ageMs = Date.parse(snapshot.serverNow) - Date.parse(result.completedAt);
        if (ageMs >= -1_000 && ageMs <= WIN_CELEBRATION_DURATION_MS) {
          announcePayoutResult(`roulette:${result.roundNumber}`, result);
        }
      }
      return;
    }
    if (!result || result.roundNumber === lastRoulettePersonalRound.current) return;
    lastRoulettePersonalRound.current = result.roundNumber;
    announcePayoutResult(`roulette:${result.roundNumber}`, result);
  }, [table.isSuccess, table.data?.serverNow, table.data?.myRecentResult?.roundNumber, table.data?.myRecentResult?.stake, table.data?.myRecentResult?.payout, table.data?.myRecentResult?.profit, announcePayoutResult]);
  useEffect(() => {
    const snapshot = fruitsWatch.data;
    if (!fruitsWatch.isSuccess || !snapshot) return;
    const result = snapshot.myRecentResult;
    if (!fruitResultInitialized.current) {
      fruitResultInitialized.current = true;
      lastFruitPersonalRound.current = result?.roundNumber ?? null;
      if (result && result.stake > 0 && result.profit !== 0) {
        const ageMs = Date.parse(snapshot.serverNow) - Date.parse(result.completedAt);
        if (ageMs >= -1_000 && ageMs <= WIN_CELEBRATION_DURATION_MS) {
          announcePayoutResult(`fruits:${result.roundNumber}`, result);
        }
      }
      return;
    }
    if (!result || result.roundNumber === lastFruitPersonalRound.current) return;
    lastFruitPersonalRound.current = result.roundNumber;
    announcePayoutResult(`fruits:${result.roundNumber}`, result);
  }, [fruitsWatch.isSuccess, fruitsWatch.data?.serverNow, fruitsWatch.data?.myRecentResult?.roundNumber, fruitsWatch.data?.myRecentResult?.stake, fruitsWatch.data?.myRecentResult?.payout, fruitsWatch.data?.myRecentResult?.profit, announcePayoutResult]);
  useEffect(() => {
    const snapshot = crashWatch.data;
    if (!crashWatch.isSuccess || !snapshot) return;
    const previousStatuses = observedCrashBetStatuses.current;
    for (const bet of snapshot.myBets) {
      const previousStatus = previousStatuses.get(bet.betId);
      if (previousStatus === "pending" && bet.status === "cashed_out" && bet.payout > 0) {
        announceWin({ eventId: `crash:${bet.betId}`, outcome: "win", amount: bet.payout });
      } else if (previousStatus === "pending" && bet.status === "lost") {
        announceWin({ eventId: `crash:${bet.betId}`, outcome: "loss", amount: bet.amount });
      } else if (!crashResultsInitialized.current && bet.status !== "pending" && bet.settledAt) {
        const ageMs = Date.parse(snapshot.serverNow) - Date.parse(bet.settledAt);
        if (ageMs >= -1_000 && ageMs <= WIN_CELEBRATION_DURATION_MS) {
          announceWin({
            eventId: `crash:${bet.betId}`,
            outcome: bet.status === "cashed_out" ? "win" : "loss",
            amount: bet.status === "cashed_out" ? bet.payout : bet.amount,
          });
        }
      }
      previousStatuses.set(bet.betId, bet.status);
    }
    crashResultsInitialized.current = true;
    while (previousStatuses.size > 100) previousStatuses.delete(previousStatuses.keys().next().value!);
  }, [crashWatch.isSuccess, crashWatch.data?.serverNow, crashWatch.data?.myBets, announceWin]);

  const play = () => {
    if (!amountValid || playRound.isPending || !config?.gameEnabled) return;
    setRoundResult(null);
    const key = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    playRound.mutate({ data: { target, stake: parsedStake, idempotencyKey: key } }, {
      onSuccess: (result) => {
        setRoundResult(result);
        void qc.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
        void qc.invalidateQueries({ queryKey: getListDarkAceRoundsQueryKey({ limit: 10 }) });
        void qc.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetDarkAceLeaderboardQueryKey() });
      },
    });
  };
  const claim = () => claimDaily.mutate({ data: {} }, { onSuccess: (result) => {
    setClaimNotice(`Ежедневный бонус получен: ${money(result.amount)}. Баланс: ${money(result.balance)}.`);
    void qc.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
    void qc.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
  } });
  const saveGameConfig = (data: any) => updateConfig.mutate({ data }, { onSuccess: () => {
    void qc.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetDarkAceAdminOverviewQueryKey() });
  } });
  const pageProps = {
    bootstrap: bootstrap.data, rounds: roundsData, roundsQuery: rounds, player, wallet, config, target, sessionReady,
    table: table.data, tableQuery: table, liveConnected, setLocation,
    announceWin,
    setTarget, stakeText, setStakeText, parsedStake, amountValid, play, playPending: playRound.isPending,
    playError: playRound.error, roundResult, claim, claimPending: claimDaily.isPending,
    claimError: claimDaily.error, claimNotice, transactions, shop, adminOverview,
    saveGameConfig, configPending: updateConfig.isPending, configError: updateConfig.isError, health,
  };
  const isBusy = !sessionReady && !session.isError;
  if (isBusy) return <Startup />;
  if (session.isError) return <Unavailable detail={session.error?.message} onRetry={() => {
    session.reset();
    const initData = (window as any).Telegram?.WebApp?.initData;
    const deviceToken = getPromoDeviceToken();
    session.mutate({ data: {
      ...(initData ? { initData } : {}),
      ...(deviceToken ? { deviceToken } : {}),
    } }, { onSuccess: completeSession });
  }} />;
  if (bootstrap.isError) return <Unavailable detail="Сессию удалось открыть, но данные игрового стола недоступны." onRetry={() => void bootstrap.refetch()} />;
  if (bootstrap.isLoading || !bootstrap.data) return <Startup loading />;

  return (
    <div className="grain min-h-[100dvh]">
      <div className="app-frame">
        <Sidebar admin={!!bootstrap.data.admin} />
        <div className={`app-main${location === "/play" || location === "/dice" ? " app-main-game" : ""}${location === "/dice" ? " app-main-dice" : ""}${location.startsWith("/blackjack/table/") ? " app-main-blackjack" : ""}`}>
          <Topbar admin={!!bootstrap.data.admin} balance={wallet?.balance} topupBotUrl={shop.data?.topupBotUrl} />
          <main className="shell page-content">
            <Switch>
              <Route path="/"><HomeHubPage bootstrap={bootstrap.data} wallet={wallet} topupBotUrl={shop.data?.topupBotUrl} /></Route>
              <Route path="/fairness"><FairnessPage /></Route>
              <Route path="/tournaments"><TournamentsPage /></Route>
              <Route path="/blackjack"><BlackjackLobbyPage /></Route>
              <Route path="/blackjack/table/:tableNumber">{(params) => <BlackjackTablePage tableNumber={Number(params.tableNumber)} sessionReady={sessionReady} />}</Route>
              <Route path="/dice"><DiceGamePage
                sessionReady={sessionReady}
                gameEnabled={config?.gameEnabled !== false}
                onBack={() => setLocation("/")}
                onWalletRefresh={() => void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() })}
                onWin={announceWin}
              /></Route>
              <Route path="/play"><GamePage {...pageProps} /></Route>
              <Route path="/levels"><LevelsPage bootstrap={bootstrap.data} player={player} /></Route>
              <Route path="/shop/topup"><BotTopupPage botUrl={shop.data?.topupBotUrl} /></Route>
              <Route path="/shop/withdraw"><BotTopupPage botUrl={getDarkAceBotUrl(shop.data?.topupBotUrl, "da_withdraw")} title="Вывод DARK ACE" /></Route>
              <Route path="/shop"><Redirect to="/" /></Route>
              <Route path="/leaderboard"><LeaderboardPage /></Route>
              <Route path="/achievements"><Redirect to="/profile" /></Route>
              <Route path="/daily-quests"><DailyQuestsPage /></Route>
              <Route path="/players/:publicUserId">{(params) => <PublicProfilePage publicUserId={params.publicUserId} />}</Route>
              <Route path="/chat/room/:roomId"><Redirect to="/" /></Route>
              <Route path="/chat"><Redirect to="/" /></Route>
              <Route path="/profile/agreement"><UserAgreementPage /></Route>
              <Route path="/profile/account"><ProfilePage {...pageProps} admin={!!bootstrap.data.admin} /></Route>
              <Route path="/profile"><ProfileHubLanding /></Route>
              {bootstrap.data.admin && <Route path="/admin"><AdminPage {...pageProps} /></Route>}
              <Route component={NotFound} />
            </Switch>
          </main>
          <Footer />
        </div>
        <BottomNav />
      </div>
      <Toaster />
      <LevelGiftNotificationHost enabled={sessionReady && !!bootstrap.data} />
      <WelcomePromoDialog
        open={welcomePromoOpen}
        playerName={welcomePlayerName}
        onOpenChange={(open) => { if (!open) dismissWelcomePromo(); }}
        onRedeem={openWelcomePromo}
      />
      <WinCelebrationHost />
    </div>
  );
}

function Startup({ loading = false }: { loading?: boolean }) {
  return <div className="viewport-page grid place-items-center p-6">
    <div className="w-full max-w-sm panel rounded-3xl p-8 text-center fade-up">
      <LogoMark />
      <p className="eyebrow mt-6">ЗАКРЫТЫЙ ИГРОВОЙ СТОЛ</p>
      <h1 className="display text-4xl mt-2">DARK ACE</h1>
      <div className="mt-8 h-1 rounded bg-[#2b2c31] overflow-hidden"><div className="h-full w-2/3 bg-[#c8a655] rounded animate-pulse" /></div>
       <p className="mt-4 text-sm text-[#97979a]">{loading ? 'Загружаем игровой стол…' : 'Подключаем сессию…'}</p>
    </div>
  </div>;
}
function Unavailable({ detail = 'Не удалось подтвердить сессию. Проверьте подключение и попробуйте снова.', onRetry }: { detail?: string; onRetry: () => void }) {
  return <div className="viewport-page grid place-items-center p-6">
    <div className="w-full max-w-md panel rounded-3xl p-8 md:p-10 fade-up">
      <div className="w-12 h-12 rounded-2xl bg-[#312321] text-[#e18a77] grid place-items-center"><LockKeyhole size={21} /></div>
      <p className="eyebrow mt-7">СЕССИЯ НЕДОСТУПНА</p>
      <h1 className="display text-3xl mt-2">Стол пока закрыт</h1>
      <p className="text-sm text-[#a2a0a0] leading-6 mt-3">{detail}</p>
      <div className="mt-5 rounded-xl bg-[#111318] border border-[#303038] p-4 text-xs text-[#aaa9a6] leading-5">
         Закройте это окно и откройте приложение кнопкой DARK ACE в боте @DarkAcePlayBot. Обычная ссылка на сайт не передаёт данные для входа через Telegram.
      </div>
      <button data-testid="button-retry-session" onClick={onRetry} className="mt-6 h-12 w-full rounded-xl bg-[#c8a655] text-[#171610] font-extrabold flex items-center justify-center gap-2 hover:bg-[#dbbd72] transition-colors">
        <RefreshCw size={16} /> Повторить подключение
      </button>
      <div className="mt-5 text-center text-[10px] uppercase tracking-[.16em] text-[#77797d]">Вход только через Telegram</div>
    </div>
  </div>;
}

function LogoMark({ small = false }: { small?: boolean }) {
  return <div className={`logo-mark ${small ? 'logo-small' : ''}`} aria-hidden="true"><Club size={small ? 15 : 22} fill="currentColor" /><span>A</span></div>;
}

function ProfileHubLanding() {
  return <>
    <ProfileHubPage />
    <Link href="/profile/agreement" className="profile-agreement-link" data-testid="link-profile-agreement">
      <span><small>ДОКУМЕНТЫ DARK ACE</small><b>Пользовательское соглашение</b></span>
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  </>;
}

const navLinks = [
  { href: '/', label: 'Главная', icon: Home },
  { href: '/tournaments', label: 'Турниры', icon: Award },
  { href: '/leaderboard', label: 'Рейтинг', icon: Trophy },
  { href: '/profile', label: 'Профиль', icon: UserRound },
];
function Sidebar({ admin }: { admin: boolean }) {
  const [path] = useLocation();
  return <aside className="sidebar">
    <Link href="/" className="brand-lockup"><LogoMark small /><span><b>DARK ACE</b><small>PRIVATE GAME ROOM</small></span></Link>
    <div className="nav-caption">ИГРОВАЯ КОМНАТА</div>
    <nav className="side-nav">
      {navLinks.map(({ href, label, icon: Icon }) => { const active = path === href || (href === '/profile' && path.startsWith('/profile/')); return <Link key={href} href={href} data-testid={`link-nav-${href === '/' ? 'game' : href.slice(1)}`} className={`nav-item ${active ? 'nav-active' : ''}`}><Icon size={17} /><span>{label}</span>{active && <span className="nav-dot" />}</Link>; })}
      {admin && <Link href="/admin" data-testid="link-nav-admin" className={`nav-item ${path === '/admin' ? 'nav-active' : ''}`}><Settings2 size={17} /><span>Админ-панель</span></Link>}
    </nav>
    <div className="side-spacer" />
    <div className="side-note">
      <div className="flex items-center gap-2 text-[#c8a655]"><ShieldCheck size={15} /><span className="eyebrow !text-[#c8a655]">ЧЕСТНЫЙ РЕЖИМ</span></div>
      <p>Результат определяет сервер. Стартовые кредиты начисляет администратор.</p>
    </div>
    <a href={SUPPORT_URL} target="_blank" rel="noreferrer" data-testid="link-contact-side" className="contact-link"><CircleHelp size={15} /> Связаться с клубом <ArrowUpRight size={13} /></a>
  </aside>;
}
function Topbar({ admin = false, balance, topupBotUrl }: { admin?: boolean; balance?: number; topupBotUrl?: string | null }) {
  const [path] = useLocation();
  const [fullscreenMessage, setFullscreenMessage] = useState('');
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const telegramApp = (window as any).Telegram?.WebApp;
  const mode = path === "/play" ? new URLSearchParams(window.location.search).get("mode") : null;
  const pageTitle = path.startsWith("/blackjack") ? "Blackjack"
    : path === "/dice" ? "DICE"
    : path === "/play" ? ({
      "roulette-dc": "Лента",
      roulette: "Европейская рулетка",
      fruits: "Фрукты",
      crash: "Crash",
      upgrade: "UPGRADE",
      plinko: "Plinko",
      "high-card": "Высшая карта",
    } as Record<string, string>)[mode ?? ""] ?? "Игра"
    : path.startsWith("/profile") ? "Профиль"
    : path === "/tournaments" ? "Турниры"
    : path === "/leaderboard" ? "Рейтинг"
    : path === "/daily-quests" ? "Задания"
    : path === "/fairness" ? "Честность"
    : "DARK ACE";
  const isGamePage = path === "/dice" || path === "/play" || path.startsWith("/blackjack");
  useLayoutEffect(() => {
    const sides = ['top', 'right', 'bottom', 'left'] as const;
    const toInset = (value: unknown) => {
      const parsed = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };
    const syncSafeArea = () => {
      const rootStyle = document.documentElement.style;
      const safeArea = telegramApp?.safeAreaInset ?? {};
      const contentSafeArea = telegramApp?.contentSafeAreaInset ?? {};
      for (const side of sides) {
        rootStyle.setProperty(`--da-telegram-safe-${side}`, `${toInset(safeArea[side])}px`);
        rootStyle.setProperty(`--da-telegram-content-safe-${side}`, `${toInset(contentSafeArea[side])}px`);
      }
    };
    const syncFullscreen = () => {
      setFullscreenActive(!!telegramApp?.isFullscreen || !!document.fullscreenElement);
      syncSafeArea();
    };
    const failed = () => setFullscreenMessage('Telegram не смог изменить режим экрана.');
    syncFullscreen();
    document.addEventListener('fullscreenchange', syncFullscreen);
    window.addEventListener('resize', syncSafeArea);
    window.visualViewport?.addEventListener('resize', syncSafeArea);
    const telegramEvents: Array<[string, () => void]> = [
      ['fullscreenChanged', syncFullscreen],
      ['fullscreenFailed', failed],
      ['safeAreaChanged', syncSafeArea],
      ['contentSafeAreaChanged', syncSafeArea],
      ['viewportChanged', syncSafeArea],
    ];
    for (const [event, handler] of telegramEvents) {
      try {
        telegramApp?.onEvent?.(event, handler);
      } catch {
        // Telegram event subscriptions are optional across WebApp versions.
      }
    }
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      window.removeEventListener('resize', syncSafeArea);
      window.visualViewport?.removeEventListener('resize', syncSafeArea);
      for (const [event, handler] of telegramEvents) {
        try {
          telegramApp?.offEvent?.(event, handler);
        } catch {
          // Ignore unsupported Telegram event cleanup.
        }
      }
    };
  }, [telegramApp]);
  const toggleFullscreen = async () => {
    const webApp = (window as any).Telegram?.WebApp;
    try {
      if (webApp?.isFullscreen) {
        if (typeof webApp.exitFullscreen === 'function') {
          await webApp.exitFullscreen();
        } else if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        } else {
          setFullscreenMessage('Выход из полноэкранного режима недоступен в этой версии Telegram.');
          return;
        }
      } else if (document.fullscreenElement) {
        if (!document.exitFullscreen) {
          setFullscreenMessage('Выход из полноэкранного режима не поддерживается.');
          return;
        }
        await document.exitFullscreen();
      } else if (typeof webApp?.requestFullscreen === 'function') {
        await webApp.requestFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else {
        setFullscreenMessage('Полноэкранный режим не поддерживается этим устройством.');
        return;
      }
      setFullscreenMessage('');
      setFullscreenActive(!!webApp?.isFullscreen || !!document.fullscreenElement);
    } catch {
      if (!webApp?.isFullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen();
          setFullscreenMessage('');
          setFullscreenActive(!!document.fullscreenElement);
          return;
        } catch {
          // Fall through to the concise unsupported notice.
        }
      }
      setFullscreenMessage('Полноэкранный режим недоступен на этом устройстве.');
    }
  };
  return <header className="topbar">
    <div className={`topbar-inner shell${isGamePage ? " topbar-inner-game" : ""}`}>
      {isGamePage
        ? <div className="topbar-context topbar-context-game" data-testid="topbar-game-balance">
            <GameBalance balance={balance} topupBotUrl={topupBotUrl} className="topbar-game-wallet" />
          </div>
        : <div className="topbar-context"><LogoMark small /><span><small>DARK ACE</small><b>{pageTitle}</b></span></div>}
      <div className="demo-pill"><span className="status-dot" /> TELEGRAM · DARK ACE</div>
      {admin && <Link href="/admin" className="admin-mobile-link" aria-label="Админ-панель" title="Админ-панель" data-testid="link-mobile-admin"><Settings2 size={15} /><span>Админ-панель</span></Link>}
      <button className={`fullscreen-button ${fullscreenActive ? 'fullscreen-active' : ''}`} onClick={toggleFullscreen} data-testid="button-fullscreen" aria-label={fullscreenActive ? "Выйти из полноэкранного режима" : "Включить полноэкранный режим"} aria-pressed={fullscreenActive}>{fullscreenActive ? <X size={18} /> : <Maximize2 size={16} />}<span>{fullscreenActive ? 'ВЫХОД' : 'ЭКРАН'}</span></button>
    </div>
    {fullscreenMessage && <div className="topbar-notices shell"><div className="fullscreen-message" role="status" data-testid="status-fullscreen">{fullscreenMessage}</div></div>}
  </header>;
}
function BottomNav() {
  const [path] = useLocation();
  const inBlackjackTable = path.startsWith('/blackjack/table/');
  const items = [
    navLinks.find((item) => item.href === '/')!,
    navLinks.find((item) => item.href === '/tournaments')!,
    navLinks.find((item) => item.href === '/leaderboard')!,
    navLinks.find((item) => item.href === '/profile')!,
  ];
  if (inBlackjackTable) {
    items[0] = { ...items[0], href: '/blackjack', label: 'Столы' };
  }
  const returnToTables = async () => {
    const webApp = (window as any).Telegram?.WebApp;
    try {
      if (webApp?.isFullscreen && typeof webApp.exitFullscreen === 'function') {
        await webApp.exitFullscreen();
      } else if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // The route change remains available if this Telegram version cannot exit fullscreen.
    }
  };
  return <nav className="bottom-nav" aria-label="Основная навигация">
    {items.map(({ href, label, icon: Icon }) => {
      const isTableReturn = inBlackjackTable && href === '/blackjack';
      const active = path === href || (href === '/blackjack' && inBlackjackTable);
      return <Link
        key={href}
        href={href}
        onClick={isTableReturn ? () => { void returnToTables(); } : undefined}
        aria-label={isTableReturn ? 'Выйти из игры и вернуться к столам' : undefined}
        data-testid={`mobile-nav-${href.slice(1) || 'game'}`}
        className={`bottom-nav-item ${active ? 'bottom-active' : ''}`}
      ><Icon size={18} /><span>{label}</span></Link>;
    })}
  </nav>;
}
function Footer() {
  return <footer className="shell app-footer">
    <span>DARK ACE <i>·</i> ЗАКРЫТЫЙ СТОЛ</span>
      <span>Игровые кредиты не имеют денежной стоимости</span>
    <a href={SUPPORT_URL} target="_blank" rel="noreferrer">Поддержка <ArrowUpRight size={11} /></a>
  </footer>;
}
function PageHeading({ overline, title, detail, right }: { overline: string; title: string; detail?: string; right?: ReactNode }) {
  return <div className="page-heading fade-up"><div><p className="eyebrow">{overline}</p><h1 className="display">{title}</h1>{detail && <p className="heading-detail">{detail}</p>}</div>{right}</div>;
}
function SectionLabel({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return <div className="section-label"><h2>{children}</h2>{extra}</div>;
}
function LoadingBlock({ label = 'ЗАГРУЗКА ДАННЫХ' }: { label?: string }) {
  return <div className="panel rounded-2xl p-5 space-y-3" aria-label={label}><div className="skeleton-line w-1/3" /><div className="skeleton-line w-full" /><div className="skeleton-line w-4/5" /></div>;
}
function ErrorBlock({ retry, text = 'Не удалось загрузить данные.' }: { retry: () => void; text?: string }) {
  return <div className="empty-state"><Info size={18} /><span>{text}</span><button onClick={retry} data-testid="button-retry-query">Повторить</button></div>;
}
function formatStakeInput(value: string) { return fmt.format(Number(value.replace(/[^\d]/g, '')) || 0); }

type RoundCountdownProps = {
  deadlineEpochMs: number | null;
  serverOffsetMs: number;
  roundNumber: number | null;
  onDeadlineReached: (roundNumber: number) => void;
};

const RoundCountdown = memo(function RoundCountdown({
  deadlineEpochMs,
  serverOffsetMs,
  roundNumber,
  onDeadlineReached,
}: RoundCountdownProps) {
  const serverOffsetRef = useRef(serverOffsetMs);
  const onDeadlineReachedRef = useRef(onDeadlineReached);
  const notifiedRoundRef = useRef<number | null>(null);
  serverOffsetRef.current = serverOffsetMs;
  onDeadlineReachedRef.current = onDeadlineReached;
  const [seconds, setSeconds] = useState(() =>
    getRemainingSeconds(deadlineEpochMs, serverOffsetMs, Date.now()),
  );

  useEffect(() => {
    const updateCountdown = () => {
      const next = getRemainingSeconds(deadlineEpochMs, serverOffsetRef.current, Date.now());
      setSeconds((current) => current === next ? current : next);
      if (
        deadlineEpochMs !== null
        && roundNumber !== null
        && next === 0
        && notifiedRoundRef.current !== roundNumber
      ) {
        notifiedRoundRef.current = roundNumber;
        onDeadlineReachedRef.current(roundNumber);
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') updateCountdown();
    };

    updateCountdown();
    if (deadlineEpochMs === null) return;
    const interval = window.setInterval(updateCountdown, 250);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', updateCountdown);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', updateCountdown);
    };
  }, [deadlineEpochMs, roundNumber]);

  useEffect(() => {
    if (deadlineEpochMs !== null && roundNumber !== null) {
      playGameCountdownTick(`roulette:${roundNumber}`, seconds);
    }
  }, [deadlineEpochMs, roundNumber, seconds]);

  return <span className={`shared-countdown mono game-countdown-timer ${getGameCountdownTone(seconds)}`} aria-live="off" data-testid="value-round-countdown">
    {`${String(seconds).padStart(2, '0')}с`}
  </span>;
});

function RouletteCenterStatus({
  roundNumber,
  status,
  latestResult,
  deadlineEpochMs,
  serverOffsetMs,
  onDeadlineReached,
}: {
  roundNumber: number | null;
  status: string | undefined;
  latestResult: { roundNumber: number; result: Outcome; completedAt: string | null } | null;
  deadlineEpochMs: number | null;
  serverOffsetMs: number;
  onDeadlineReached: (roundNumber: number) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const resultBelongsToVisibleRound = !!latestResult && (
    (status === "completed" && roundNumber === latestResult.roundNumber)
    || (status === "open" && roundNumber === latestResult.roundNumber + 1)
  );

  useEffect(() => {
    if (!resultBelongsToVisibleRound || !latestResult?.completedAt) return;
    const update = () => setNow(Date.now());
    update();
    const resultDeadline = Date.parse(latestResult.completedAt) + ROUND_RESULT_DISPLAY_MS - serverOffsetMs;
    const timer = window.setTimeout(update, Math.max(0, resultDeadline - Date.now()));
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", update);
    };
  }, [resultBelongsToVisibleRound, latestResult?.roundNumber, latestResult?.completedAt, serverOffsetMs]);

  const resultAgeMs = latestResult?.completedAt
    ? now + serverOffsetMs - Date.parse(latestResult.completedAt)
    : Number.POSITIVE_INFINITY;
  if (
    resultBelongsToVisibleRound
    && latestResult
    && latestResult.completedAt
    && resultAgeMs >= -1_000
    && resultAgeMs < ROUND_RESULT_DISPLAY_MS
  ) {
    return <span className={`roulette-center-result result-${latestResult.result}`} role="status" data-testid="roulette-center-result">
      <OutcomeMark outcome={latestResult.result} size={20} />
    </span>;
  }

  if (deadlineEpochMs !== null && roundNumber !== null) {
    return <RoundCountdown
      deadlineEpochMs={deadlineEpochMs}
      serverOffsetMs={serverOffsetMs}
      roundNumber={roundNumber}
      onDeadlineReached={onDeadlineReached}
    />;
  }
  return <LogoMark small />;
}

type SharedReelProps = {
  roundNumber: number | null;
  status: string | undefined;
  result: Outcome | null;
  spinStartedAt: string | null;
  spinEndsAt: string | null;
  stopPosition: number | null;
  serverOffsetMs: number;
  recentResults: { roundNumber: number; result: Outcome }[];
  recentWinners: { displayName: string; username: string | null; payout: number }[];
  latestResult: { roundNumber: number; result: Outcome; completedAt: string | null } | null;
  myRecentResult: { roundNumber: number; result: Outcome; stake: number; payout: number; profit: number } | null;
  centerContent: ReactNode;
};

function readRouletteTrackX(transform: string): number {
  if (!transform || transform === "none") return 0;
  const translate = transform.match(/translate(?:3d)?\(\s*(-?[\d.]+)(?:px)?/);
  if (translate) return Number(translate[1]) || 0;
  const matrix = transform.match(/^matrix(3d)?\(([^)]+)\)$/);
  if (!matrix) return 0;
  const values = matrix[2]!.split(",").map(Number);
  return values[matrix[1] ? 12 : 4] ?? 0;
}

function rouletteTrackTransform(x: number): string {
  return `translate3d(${x}px, 0, 0)`;
}

const SharedRouletteReel = memo(function SharedRouletteReel({
  roundNumber,
  status,
  result,
  spinStartedAt,
  spinEndsAt,
  stopPosition,
  serverOffsetMs,
  recentResults,
  recentWinners,
  latestResult,
  myRecentResult,
  centerContent,
}: SharedReelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const serverOffsetRef = useRef(serverOffsetMs);
  const idleOffsetRef = useRef(0);
  const activeAnimationRef = useRef<{ animation: Animation | null; frameId: number | null } | null>(null);
  serverOffsetRef.current = serverOffsetMs;

  const spinStartEpochMs = spinStartedAt ? Date.parse(spinStartedAt) : null;
  const spinEndEpochMs = spinEndsAt ? Date.parse(spinEndsAt) : null;
  const reelFrame = useMemo(
    () => getRouletteReelFrame(roundNumber ?? 1, result),
    [roundNumber, result],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    const firstCell = track.querySelector<HTMLElement>('[data-reel-index="0"]');
    const nextCell = track.querySelector<HTMLElement>('[data-reel-index="1"]');
    if (!firstCell || !nextCell) return;
    const cellStep = nextCell.getBoundingClientRect().left - firstCell.getBoundingClientRect().left;
    const cycleDistance = cellStep * reelFrame.symbols.length;
    if (!(cycleDistance > 0)) return;

    if (status === "open" && roundNumber !== null) {
      const previousX = readRouletteTrackX(track.style.transform || window.getComputedStyle(track).transform);
      const phase = ((-previousX % cycleDistance) + cycleDistance) % cycleDistance;
      const startX = -phase;
      const endX = startX - cycleDistance;
      const duration = 30_000;
      const active = { animation: null as Animation | null, frameId: null as number | null };
      track.style.transform = rouletteTrackTransform(startX);
      idleOffsetRef.current = startX;
      activeAnimationRef.current = active;

      if (typeof track.animate === "function") {
        const animation = track.animate([
          { transform: rouletteTrackTransform(startX) },
          { transform: rouletteTrackTransform(endX) },
        ], { duration, iterations: Infinity, easing: "linear" });
        active.animation = animation;
      } else {
        const startedAt = performance.now();
        const animateIdle = () => {
          if (activeAnimationRef.current !== active) return;
          const progress = ((performance.now() - startedAt) % duration) / duration;
          const currentX = startX - cycleDistance * progress;
          track.style.transform = rouletteTrackTransform(currentX);
          idleOffsetRef.current = currentX;
          active.frameId = window.requestAnimationFrame(animateIdle);
        };
        active.frameId = window.requestAnimationFrame(animateIdle);
      }

      return () => {
        if (activeAnimationRef.current !== active) return;
        const currentX = readRouletteTrackX(window.getComputedStyle(track).transform);
        if (active.frameId !== null) window.cancelAnimationFrame(active.frameId);
        if (active.animation) active.animation.cancel();
        track.style.transform = rouletteTrackTransform(currentX);
        idleOffsetRef.current = currentX;
        activeAnimationRef.current = null;
      };
    }

    const resultIndex = ROULETTE_REEL_STOP_COPY_INDEX * reelFrame.symbols.length + reelFrame.targetIndex;
    const resultCell = track.querySelector<HTMLElement>(`[data-reel-index="${resultIndex}"]`);
    if (!resultCell) return;

    const viewportRect = viewport.getBoundingClientRect();
    const cellRect = resultCell.getBoundingClientRect();
    const landingFraction = getRouletteReelLandingFraction(stopPosition);
    const landingOffset = cellRect.width * (landingFraction - 0.5);
    const priorX = readRouletteTrackX(track.style.transform || window.getComputedStyle(track).transform);
    const baseCellLeft = cellRect.left - priorX;
    const endX = -(baseCellLeft + cellRect.width / 2 - viewportRect.left - viewportRect.width / 2 + landingOffset);
    const endTransform = rouletteTrackTransform(endX);

    if (
      status !== 'spinning'
      || roundNumber === null
      || !result
      || spinStartEpochMs === null
      || spinEndEpochMs === null
      || !Number.isFinite(spinStartEpochMs)
      || !Number.isFinite(spinEndEpochMs)
    ) {
      track.style.transform = status === "completed" && result ? endTransform : rouletteTrackTransform(0);
      if (status === "completed") idleOffsetRef.current = endX;
      return;
    }

    const durationMs = spinEndEpochMs - spinStartEpochMs;
    if (durationMs <= 0) {
      track.style.transform = endTransform;
      idleOffsetRef.current = endX;
      return;
    }
    const startX = idleOffsetRef.current;
    const motionPlan = getRouletteReelMotionPlan(startX, endX, cycleDistance, durationMs);
    const active = { animation: null as Animation | null, frameId: null as number | null };
    const finishAnimation = () => {
      if (activeAnimationRef.current !== active) return;
      track.style.transform = endTransform;
      if (active.frameId !== null) window.cancelAnimationFrame(active.frameId);
      if (active.animation) {
        active.animation.onfinish = null;
        active.animation.cancel();
      }
      idleOffsetRef.current = endX;
      activeAnimationRef.current = null;
    };
    const paintFallbackFrame = (elapsedMs: number) => {
      const elapsed = Math.max(0, Math.min(durationMs, elapsedMs));
      if (elapsed <= motionPlan.accelerationMs) {
        const progress = elapsed / motionPlan.accelerationMs;
        const eased = Math.pow(progress, 1.73);
        track.style.transform = rouletteTrackTransform(startX + (motionPlan.accelerationEndX - startX) * eased);
      } else if (elapsed <= motionPlan.launchMs) {
        const progress = (elapsed - motionPlan.accelerationMs) / (motionPlan.launchMs - motionPlan.accelerationMs);
        track.style.transform = rouletteTrackTransform(
          motionPlan.accelerationEndX + (motionPlan.launchEndX - motionPlan.accelerationEndX) * progress,
        );
      } else {
        const progress = (elapsed - motionPlan.launchMs) / (durationMs - motionPlan.launchMs);
        const eased = getRouletteReelBrakingProgress(progress);
        track.style.transform = rouletteTrackTransform(motionPlan.launchEndX + (endX - motionPlan.launchEndX) * eased);
      }
    };
    const syncAnimationToServerTime = () => {
      if (activeAnimationRef.current !== active) return;
      const elapsedMs = Date.now() + serverOffsetRef.current - spinStartEpochMs;
      if (elapsedMs >= durationMs) {
        if (active.animation) active.animation.currentTime = durationMs;
        finishAnimation();
      } else if (active.animation) {
        active.animation.currentTime = Math.max(0, elapsedMs);
      } else {
        paintFallbackFrame(elapsedMs);
      }
    };

    const elapsedMs = Date.now() + serverOffsetRef.current - spinStartEpochMs;
    if (elapsedMs >= durationMs) {
      track.style.transform = endTransform;
      idleOffsetRef.current = endX;
      return;
    }
    track.style.transform = rouletteTrackTransform(startX);
    activeAnimationRef.current = active;
    if (typeof track.animate === "function") {
      const animation = track.animate([
        {
          transform: rouletteTrackTransform(startX),
          offset: 0,
          easing: WHEEL_SPIN_ACCELERATION_EASING,
        },
        {
          transform: rouletteTrackTransform(motionPlan.accelerationEndX),
          offset: motionPlan.accelerationMs / durationMs,
          easing: "linear",
        },
        {
          transform: rouletteTrackTransform(motionPlan.launchEndX),
          offset: motionPlan.launchMs / durationMs,
          easing: ROULETTE_REEL_BRAKING_EASING,
        },
        { transform: endTransform, offset: 1 },
      ], {
        duration: durationMs,
        fill: "forwards",
      });
      active.animation = animation;
      animation.pause();
      animation.currentTime = Math.max(0, elapsedMs);
      animation.onfinish = finishAnimation;
      animation.play();
    } else {
      const animateFallback = () => {
        if (activeAnimationRef.current !== active) return;
        const currentElapsedMs = Date.now() + serverOffsetRef.current - spinStartEpochMs;
        if (currentElapsedMs >= durationMs) {
          finishAnimation();
          return;
        }
        paintFallbackFrame(currentElapsedMs);
        active.frameId = window.requestAnimationFrame(animateFallback);
      };
      active.frameId = window.requestAnimationFrame(animateFallback);
    }

    const refreshAfterResume = () => {
      if (document.visibilityState === 'visible') syncAnimationToServerTime();
    };
    document.addEventListener('visibilitychange', refreshAfterResume);
    window.addEventListener('focus', syncAnimationToServerTime);

    return () => {
      document.removeEventListener('visibilitychange', refreshAfterResume);
      window.removeEventListener('focus', syncAnimationToServerTime);
      if (activeAnimationRef.current !== active) return;
      track.style.transform = endTransform;
      idleOffsetRef.current = endX;
      if (active.frameId !== null) window.cancelAnimationFrame(active.frameId);
      if (active.animation) {
        active.animation.onfinish = null;
        active.animation.cancel();
      }
      activeAnimationRef.current = null;
    };
  }, [roundNumber, status, result, spinStartEpochMs, spinEndEpochMs, stopPosition, reelFrame.targetIndex]);

  return <>
    <div className="shared-roulette-reel-area">
      <div
        ref={viewportRef}
        className={`shared-roulette-reel-viewport ${status === "spinning" ? "reel-spinning" : ""}`}
        aria-label={status === "completed" && result ? `Результат раунда: ${targetName(result)}` : "Лента общей рулетки"}
        data-testid="shared-roulette-reel"
      >
        <div ref={trackRef} className="shared-roulette-reel-track">
          {Array.from({ length: ROULETTE_REEL_COPY_COUNT }, (_, copy) => reelFrame.symbols.map((symbol, index) => {
            const trackIndex = copy * reelFrame.symbols.length + index;
            return <div
              key={`${roundNumber ?? 0}-${copy}-${index}`}
              className={`shared-roulette-reel-cell reel-cell-${symbol} ${status === "completed" && trackIndex === ROULETTE_REEL_STOP_COPY_INDEX * reelFrame.symbols.length + reelFrame.targetIndex ? "reel-cell-result" : ""}`}
              data-reel-index={trackIndex}
              aria-label={targetName(symbol)}
            >
              {symbol === "coins"
                ? <span className="reel-coin"><Coins size={34} strokeWidth={2.3} /></span>
                : <span className={`reel-glyph reel-glyph-${symbol}`} aria-hidden="true">{symbol === "red" ? "♦" : "♣"}</span>}
            </div>;
          }))}
        </div>
        <div className="shared-roulette-reel-indicator" aria-hidden="true"><span /></div>
      </div>
      <div className={`roulette-reel-status ${status === "spinning" ? "roulette-reel-status-spinning" : ""}`}>
        {status === "spinning"
          ? <span className="eyebrow">РУЛЕТКА КРУТИТСЯ</span>
          : centerContent}
      </div>
    </div>
    <div className={`roulette-results-row ${status === 'open' && recentWinners.length ? "roulette-results-with-winners" : ""}`}>
      <div className="wheel-history" aria-label="Последние результаты рулетки" data-testid="wheel-history">
        <span className="wheel-history-label">ПОСЛЕДНИЕ РЕЗУЛЬТАТЫ</span>
        <div className="wheel-history-track">
          {recentResults.slice(0, 10).map((item) => <span
            key={item.roundNumber}
            className={`wheel-history-cell result-${item.result}`}
            title={`Раунд ${item.roundNumber}: ${targetName(item.result)}`}
            aria-label={`Раунд ${item.roundNumber}: ${targetName(item.result)}`}
          ><OutcomeMark outcome={item.result} size={12} /></span>)}
          {!recentResults.length && <span className="wheel-history-empty">—</span>}
        </div>
      </div>
      {status === 'open' && recentWinners.length > 0 && <aside className="roulette-winners" aria-label="Семь крупнейших выплат прошлого раунда" data-testid="roulette-winners">
        <span className="wheel-history-label">ТОП-7 ПРОШЛОГО РАУНДА</span>
        {recentWinners.slice(0, 7).map((winner, index) => {
          const name = winner.username ? `@${winner.username}` : winner.displayName;
          return <div className="roulette-winner" key={`${winner.username ?? winner.displayName}-${index}`} title={`${winner.displayName}: выплата ${money(winner.payout)}`}>
            <i>{index + 1}</i><b>{name}</b><strong>+{shortNum(winner.payout)}</strong>
          </div>;
        })}
      </aside>}
    </div>
    {myRecentResult && myRecentResult.payout > 0 && latestResult?.roundNumber === myRecentResult.roundNumber && <div
      className="roulette-personal-result roulette-personal-result-positive"
      role="status"
      data-testid="roulette-personal-result"
    >
      <span className="roulette-personal-result-mark"><OutcomeMark outcome={myRecentResult.result} size={15} /></span>
      <span className="roulette-personal-result-main">
        <b>Детали выплаты</b>
        <small>Ставка {money(myRecentResult.stake)}</small>
      </span>
      <span className="roulette-personal-result-profit">
        <small>ОБЩИЙ ВЫИГРЫШ</small>
        <b>+{money(myRecentResult.payout)}</b>
      </span>
    </div>}
  </>;
});

function GamePage(props: any) {
  const requestedMode = new URLSearchParams(window.location.search).get("mode");
  const highCardPresence = useUpdateDarkAceGamePresence();
  useEffect(() => {
    if (requestedMode !== "high-card" || !props.sessionReady) return;
    const updatePresence = () => highCardPresence.mutate({
      data: { game: "high-card" },
    });
    updatePresence();
    const interval = window.setInterval(updatePresence, 15_000);
    return () => window.clearInterval(interval);
  }, [requestedMode, props.sessionReady, highCardPresence.mutate]);
  if (requestedMode && !["crash", "fruits", "upgrade", "roulette-dc", "roulette", "high-card", "plinko"].includes(requestedMode)) {
    return <Unavailable detail="Эта игра сейчас недоступна." onRetry={() => props.setLocation("/")} />;
  }
  if (requestedMode === "high-card") return <HighCardGamePage sessionReady={props.sessionReady} onBack={() => props.setLocation("/")} onWin={props.announceWin} />;
  if (requestedMode === "plinko") return <PlinkoGamePage sessionReady={props.sessionReady} onBack={() => props.setLocation("/")} />;
  return <LegacyGamePage {...props} />;
}

function LegacyGamePage(props: any) {
  const { bootstrap, wallet, table: europeanTable, tableQuery: europeanTableQuery, liveConnected, target, setTarget } = props;
  const topupBotUrl = getDarkAceBotUrl(props.shop?.data?.topupBotUrl, "da_topup");
  const withdrawalBotUrl = getDarkAceBotUrl(props.shop?.data?.topupBotUrl, "da_withdraw");
  const qc = useQueryClient();
  const gamePresence = useUpdateDarkAceGamePresence();
  const [stakeText, setStakeText] = useState("50 000");
  const [quickStakeUnit, setQuickStakeUnit] = useState<number | null>(null);
  const [lentaChipState, setLentaChipState] = useState<{ roundNumber: number | null; budget: number; key: StakeChipKey }>({
    roundNumber: null,
    budget: 0,
    key: "1",
  });
  const [lastWinningBet, setLastWinningBet] = useState<{ roundNumber: number; outcome: Outcome } | null>(null);
  const notifiedRouletteDcRound = useRef<number | null>(null);
  const [activeGameMode] = useState<"crash" | "roulette" | "roulette-dc" | "fruits" | "upgrade">(() => {
    const requestedMode = new URLSearchParams(window.location.search).get("mode");
    return requestedMode === "crash" || requestedMode === "fruits" || requestedMode === "upgrade" || requestedMode === "roulette-dc"
      ? requestedMode
      : "roulette";
  });
  useEffect(() => {
    if (!props.sessionReady) return;
    const updatePresence = () => gamePresence.mutate({ data: { game: activeGameMode } });
    updatePresence();
    const timer = window.setInterval(updatePresence, 15_000);
    return () => window.clearInterval(timer);
  }, [activeGameMode, gamePresence.mutate, props.sessionReady]);
  const rouletteDcQuery = useGetDarkAceRouletteDc({
    query: {
      enabled: activeGameMode === "roulette-dc",
      queryKey: getGetDarkAceRouletteDcQueryKey(),
      refetchInterval: (query) => query.state.data?.round?.status === "spinning" ? 900 : 1_500,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  });
  useEffect(() => {
    if (activeGameMode !== "roulette-dc" || !rouletteDcQuery.isSuccess) return;
    const snapshot = rouletteDcQuery.data;
    const result = snapshot?.myRecentResult;
    if (!snapshot || !result || result.stake <= 0 || result.profit === 0) return;
    const announce = () => props.announceWin({
      eventId: `roulette-dc:${result.roundNumber}`,
      outcome: result.profit > 0 ? "win" : "loss",
      amount: result.profit > 0 ? result.payout : Math.abs(result.profit),
    });
    if (notifiedRouletteDcRound.current === null) {
      notifiedRouletteDcRound.current = result.roundNumber;
      const ageMs = Date.parse(snapshot.serverNow) - Date.parse(result.completedAt);
      if (ageMs >= -1_000 && ageMs <= WIN_CELEBRATION_DURATION_MS) announce();
      return;
    }
    if (notifiedRouletteDcRound.current === result.roundNumber) return;
    notifiedRouletteDcRound.current = result.roundNumber;
    announce();
  }, [activeGameMode, rouletteDcQuery.isSuccess, rouletteDcQuery.data?.serverNow, rouletteDcQuery.data?.myRecentResult?.roundNumber, rouletteDcQuery.data?.myRecentResult?.stake, rouletteDcQuery.data?.myRecentResult?.payout, rouletteDcQuery.data?.myRecentResult?.profit, rouletteDcQuery.data?.myRecentResult?.completedAt, props.announceWin]);
  const table = activeGameMode === "roulette-dc" ? rouletteDcQuery.data : europeanTable;
  const tableQuery = activeGameMode === "roulette-dc" ? rouletteDcQuery : europeanTableQuery;
  const activeTableQueryKey = activeGameMode === "roulette-dc"
    ? getGetDarkAceRouletteDcQueryKey()
    : getGetDarkAceTableQueryKey();
  const [betNotice, setBetNotice] = useState("");
  const europeanBetMutation = usePlaceDarkAceTableBet();
  const rouletteDcBetMutation = usePlaceDarkAceRouletteDcBet();
  const betMutation = activeGameMode === "roulette-dc" ? rouletteDcBetMutation : europeanBetMutation;
  const europeanCancelMutation = useCancelDarkAceTableBets();
  const rouletteDcCancelMutation = useCancelDarkAceRouletteDcBets();
  const cancelMutation = activeGameMode === "roulette-dc" ? rouletteDcCancelMutation : europeanCancelMutation;
  const [pendingBetDebit, setPendingBetDebit] = useState(0);
  const pendingBetDebitRef = useRef(0);
  const pendingBetTargets = useRef(new Map<Outcome, number>());
  const round = table?.round;
  const myCurrentBets = table?.myCurrentBets ?? [];
  const currentPlayerStake = myCurrentBets.reduce((total: number, bet: any) => total + bet.totalAmount, 0);
  const remainingPlayerStake = Math.max(0, maxSharedStake - currentPlayerStake - pendingBetDebit);
  const targetStakeUnits = activeGameMode === "roulette-dc" ? 1 : target === "red+coins" || target === "black+coins" ? 2 : 1;
  const maxStakeForTarget = Math.floor(Math.min(maxSharedStake, remainingPlayerStake / targetStakeUnits) / 100) * 100;
  const maxAvailableStake = Number.isSafeInteger(wallet?.balance)
    ? Math.floor(Math.max(0, Math.min((wallet.balance - pendingBetDebit) / targetStakeUnits, maxStakeForTarget)) / 100) * 100
    : 0;
  const lentaChipBudgetCandidate = activeGameMode === "roulette-dc"
    ? Math.min(maxSharedStake, Math.max(0, (wallet?.balance ?? 0) + currentPlayerStake))
    : 0;
  useEffect(() => {
    if (activeGameMode !== "roulette-dc" || !round) return;
    if (lentaChipState.roundNumber === round.roundNumber) return;
    setLentaChipState((current) => ({ roundNumber: round.roundNumber, budget: lentaChipBudgetCandidate, key: current.key }));
  }, [activeGameMode, round?.roundNumber, lentaChipBudgetCandidate, lentaChipState.roundNumber]);
  const lentaChipBudget = lentaChipState.roundNumber === round?.roundNumber
    ? lentaChipState.budget
    : lentaChipBudgetCandidate;
  const lentaChipKey: StakeChipKey = lentaChipState.key;
  const lentaChipOptions = getStakeChipOptions(lentaChipBudget, 100, 100);
  const parsedInputStake = Number(stakeText.replace(/[^\d]/g, ""));
  const stake = activeGameMode === "roulette-dc"
    ? getStakeChipAmount(lentaChipKey, lentaChipOptions, maxAvailableStake)
    : parsedInputStake;
  const amountValid = Number.isSafeInteger(stake) && stake >= 100 && stake <= maxStakeForTarget && stake % 100 === 0;
  const halfWalletStake = Number.isSafeInteger(wallet?.balance)
    ? Math.floor(Math.min(Math.max(0, maxAvailableStake / 2), maxStakeForTarget) / 100) * 100
    : 0;
  const [deadlineReachedRound, setDeadlineReachedRound] = useState<number | null>(null);
  const onDeadlineReached = useCallback((expiredRound: number) => {
    setDeadlineReachedRound(expiredRound);
  }, []);
  const selectQuickStake = (amount: number) => {
    const nextStake = quickStakeUnit === amount ? stake + amount : amount;
    if (!Number.isSafeInteger(nextStake) || nextStake > maxStakeForTarget) return;
    setQuickStakeUnit(amount);
    setStakeText(fmt.format(nextStake));
  };
  const adjustStake = (factor: 0.5 | 2) => {
    if (!amountValid) return;
    const nextStake = factor === 2
      ? stake * 2
      : Math.floor(stake / 2 / 100) * 100;
    if (!Number.isSafeInteger(nextStake) || nextStake < 100 || nextStake > maxStakeForTarget) return;
    setQuickStakeUnit(null);
    setStakeText(fmt.format(nextStake));
  };
  const selectSpecialStake = (amount: number) => {
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > maxStakeForTarget) return;
    setQuickStakeUnit(null);
    setStakeText(fmt.format(amount));
  };
  const serverOffsetMs = useMemo(
    () => table?.serverNow ? Date.parse(table.serverNow) - Date.now() : 0,
    [table?.serverNow],
  );
  const bettingDeadline = round?.status === "open" ? Date.parse(round.bettingClosesAt) : null;
  const countdownDeadline = bettingDeadline;
  const bettingDeadlinePassed = bettingDeadline !== null
    && bettingDeadline <= Date.now() + serverOffsetMs;
  const canBet = round?.status === "open"
    && !!bootstrap?.gameConfig?.gameEnabled
    && deadlineReachedRound !== round.roundNumber
    && !bettingDeadlinePassed;
  const currentBets = table?.currentBets ?? [];
  const recentResults = table?.recentResults ?? [];
  const myRecentWin = table?.myRecentWin;
  useEffect(() => {
    if (!myRecentWin) {
      setLastWinningBet(null);
      return;
    }
    const ageMs = Date.now() + serverOffsetMs - Date.parse(myRecentWin.completedAt);
    if (ageMs < -1_000 || ageMs >= ROUND_RESULT_DISPLAY_MS) {
      setLastWinningBet(null);
      return;
    }
    setLastWinningBet((current) => current?.roundNumber === myRecentWin.roundNumber
      ? current
      : { roundNumber: myRecentWin.roundNumber, outcome: myRecentWin.result as Outcome });
    const timer = window.setTimeout(
      () => setLastWinningBet((current) => current?.roundNumber === myRecentWin.roundNumber ? null : current),
      Math.max(0, ROUND_RESULT_DISPLAY_MS - ageMs),
    );
    return () => window.clearTimeout(timer);
  }, [myRecentWin?.roundNumber, myRecentWin?.result, myRecentWin?.completedAt, serverOffsetMs]);
  const hasRedBet = myCurrentBets.some((bet: any) => bet.target === "red" || bet.target === "red+coins");
  const hasBlackBet = myCurrentBets.some((bet: any) => bet.target === "black" || bet.target === "black+coins");
  const totalDebit = stake * targetStakeUnits;
  const enoughBalance = Number.isSafeInteger(wallet?.balance) && totalDebit <= wallet.balance - pendingBetDebit;
  const refundableAmount = myCurrentBets.reduce((sum: number, bet: any) => sum + bet.totalAmount, 0);
  const coinsMultiplier = round?.coinsMultiplier ?? table?.coinsMultiplier ?? bootstrap.gameConfig.coinsMultiplier;
  const wheelRedPercent = table?.redPercent ?? bootstrap.gameConfig.redWeight;
  const wheelBlackPercent = table?.blackPercent ?? bootstrap.gameConfig.blackWeight;
  const wheelCoinsPercent = table?.coinsPercent ?? bootstrap.gameConfig.coinsWeight;
  const latestResult = recentResults[0];
  const postRoundResultVisible = !!round && !!latestResult && (
    (round.status === "completed" && latestResult.roundNumber === round.roundNumber)
    || (round.status === "open" && latestResult.roundNumber === round.roundNumber - 1)
  );
  const myRecentResult = postRoundResultVisible
    && table?.myRecentResult?.roundNumber === latestResult?.roundNumber
    ? table.myRecentResult
    : null;
  const wheelLatestResult = latestResult
    ? {
      roundNumber: latestResult.roundNumber,
      result: latestResult.result as Outcome,
      completedAt: latestResult.completedAt,
    }
    : null;
  const rouletteCenterContent = <RouletteCenterStatus
    roundNumber={round?.roundNumber ?? null}
    status={round?.status}
    latestResult={wheelLatestResult}
    deadlineEpochMs={countdownDeadline}
    serverOffsetMs={serverOffsetMs}
    onDeadlineReached={onDeadlineReached}
  />;

  const placeBet = (outcome: Outcome) => {
    if (!canBet || cancelMutation.isPending) return;
    if (
      (outcome === "red" && (hasBlackBet || (pendingBetTargets.current.get("black") ?? 0) > 0))
      || (outcome === "black" && (hasRedBet || (pendingBetTargets.current.get("red") ?? 0) > 0))
    ) return;
    const pendingDebit = pendingBetDebitRef.current;
    const units = activeGameMode === "roulette-dc" ? 1 : targetStakeUnits;
    const balanceLimit = Math.floor(Math.max(0, ((wallet?.balance ?? 0) - pendingDebit) / units) / 100) * 100;
    const roundLimit = Math.floor(Math.max(0, (maxSharedStake - currentPlayerStake - pendingDebit) / units) / 100) * 100;
    const tapLimit = Math.min(balanceLimit, roundLimit);
    const requestStake = activeGameMode === "roulette-dc"
      ? getStakeChipAmount(lentaChipKey, lentaChipOptions, tapLimit)
      : stake;
    const requestDebit = requestStake * units;
    if (!Number.isSafeInteger(requestStake) || requestStake < 100 || requestStake > tapLimit || requestStake % 100 !== 0) {
      setBetNotice("Достигнут лимит ставки или недостаточно доступных кредитов.");
      return;
    }
    setBetNotice("");
    const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    pendingBetDebitRef.current += requestDebit;
    pendingBetTargets.current.set(outcome, (pendingBetTargets.current.get(outcome) ?? 0) + 1);
    setPendingBetDebit(pendingBetDebitRef.current);
    void betMutation.mutateAsync({
      data: { target: outcome, amount: requestStake, idempotencyKey },
    }).then((result) => {
        setBetNotice(`Ставка ${money(requestStake)} принята`);
        qc.setQueryData<any>(activeTableQueryKey, (old: any) => {
          if (!old || old.round?.roundNumber !== result.bet.roundNumber) return old;
          const existing = old.myCurrentBets?.find((bet: any) => bet.target === outcome);
          const nextBet = existing
            ? { ...existing, amount: existing.amount + requestStake, totalAmount: existing.totalAmount + requestDebit }
            : { id: result.bet.id, target: outcome, amount: requestStake, totalAmount: requestDebit, createdAt: new Date().toISOString() };
          const currentBet = old.currentBets?.find((bet: any) =>
            bet.target === outcome
            && bet.displayName === result.bet.displayName
            && bet.username === result.bet.username);
          const nextCurrentBet = currentBet
            ? { ...currentBet, amount: currentBet.amount + requestStake, totalAmount: currentBet.totalAmount + requestDebit }
            : { ...result.bet, totalAmount: requestDebit, stakeBreakdown: [{ target: outcome, amount: requestStake }] };
          return {
            ...old,
            currentBets: [
              nextCurrentBet,
              ...(old.currentBets ?? []).filter((bet: any) => bet !== currentBet),
            ],
            myCurrentBets: [
              nextBet,
              ...(old.myCurrentBets ?? []).filter((bet: any) => bet.target !== outcome),
            ],
            roundTotalStake: (old.roundTotalStake ?? 0) + requestDebit,
            roundBetCount: (old.roundBetCount ?? 0) + 1,
          };
        });
        qc.setQueryData<any>(getGetDarkAceBootstrapQueryKey(), (old: any) => old?.wallet
          ? { ...old, wallet: { ...old.wallet, balance: result.balance } }
          : old);
        void qc.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
        void qc.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
      })
      .catch(() => {
        setBetNotice("Не удалось подтвердить ставку. Обновляю состояние стола.");
        void qc.invalidateQueries({ queryKey: activeTableQueryKey });
        void qc.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
      })
      .finally(() => {
        pendingBetDebitRef.current = Math.max(0, pendingBetDebitRef.current - requestDebit);
        const outstanding = (pendingBetTargets.current.get(outcome) ?? 1) - 1;
        if (outstanding > 0) pendingBetTargets.current.set(outcome, outstanding);
        else pendingBetTargets.current.delete(outcome);
        setPendingBetDebit(pendingBetDebitRef.current);
      });
  };
  const cancelBets = () => {
    if (!canBet || !myCurrentBets.length || cancelMutation.isPending || pendingBetDebitRef.current > 0) return;
    setBetNotice("");
    cancelMutation.mutate(undefined, {
      onSuccess: (result) => {
        setBetNotice(result.refundedAmount
          ? `Возвращено ${money(result.refundedAmount)}`
          : "Активных ставок нет");
        qc.setQueryData<any>(activeTableQueryKey, (old: any) => old
          ? { ...old, myCurrentBets: [] }
          : old);
        qc.setQueryData<any>(getGetDarkAceBootstrapQueryKey(), (old: any) => old?.wallet
          ? { ...old, wallet: { ...old.wallet, balance: result.balance } }
          : old);
        void qc.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
        void qc.invalidateQueries({ queryKey: activeTableQueryKey });
        void qc.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
      },
    });
  };

  if (activeGameMode === "roulette") {
    return <div className="game-page fade-up">
      <EuropeanRouletteGame
        balance={wallet?.balance}
        gameEnabled={props.config?.gameEnabled !== false}
        onBalanceChange={(balance) => {
          qc.setQueryData<any>(getGetDarkAceBootstrapQueryKey(), (old: any) => old?.wallet
            ? { ...old, wallet: { ...old.wallet, balance } }
            : old);
        }}
        onBack={() => props.setLocation?.("/")}
        onWin={props.announceWin}
      />
    </div>;
  }
  return <div className={`game-page fade-up ${activeGameMode === "crash" ? "crash-game-page" : ""} ${activeGameMode === "roulette-dc" ? "roulette-dc-page" : ""}`}>
    {activeGameMode === "crash" && <CrashGamePage sessionReady={props.sessionReady} liveConnected={liveConnected} gameEnabled={props.config?.gameEnabled !== false} balance={wallet?.balance} onWin={props.announceWin} />}
    {activeGameMode === "fruits" && <FruitGamePage sessionReady={props.sessionReady} liveConnected={liveConnected} gameEnabled={props.config?.gameEnabled !== false} balance={wallet?.balance} onWin={props.announceWin} />}
    {activeGameMode === "upgrade" && <UpgradeGamePage sessionReady={props.sessionReady} gameEnabled={props.config?.gameEnabled !== false} balance={wallet?.balance} onWin={props.announceWin} />}
    {activeGameMode === "roulette-dc" && <>
    <div className="game-layout">
      <section className="game-column">
        <div className={`shared-roulette panel rounded-[26px] game-table-card ${round?.status === "spinning" ? "shared-spinning" : ""}`}>
          <h1 className="sr-only">Лента</h1>
          <div className="roulette-meta"><span className="eyebrow">{round?.status === "spinning" ? "РАУНД КРУТИТСЯ" : "РУЛЕТКА ДО"}</span><span className="round-sequence mono">РАУНД #{shortNum(round?.roundNumber)}</span></div>
          <div className="shared-status-row">
            <span className={`shared-phase phase-${round?.status ?? "waiting"}`} data-testid="status-round-phase">
              {round?.status === "open" ? "ПРИЁМ СТАВОК ОТКРЫТ" : round?.status === "spinning" ? "СТАВКИ ЗАКРЫТЫ · РУЛЕТКА КРУТИТСЯ" : round?.status === "completed" ? "РАУНД ЗАВЕРШЁН" : "ПОДКЛЮЧАЕМ СТОЛ"}
            </span>
            <div className={`table-status ${liveConnected ? "" : "table-status-wait"}`}><span className={`status-dot ${liveConnected ? "" : "status-off"}`} />{liveConnected ? "СИНХРОНИЗИРОВАНО" : "ПОДКЛЮЧЕНИЕ"}</div>
          </div>
          <div className="roulette-pot-strip" aria-label={`Общий банк ${money(table?.roundTotalStake)} · ${shortNum(table?.roundBetCount)} ставок`}>
            <span>ОБЩИЙ БАНК</span><b>{money(table?.roundTotalStake)}</b><i>·</i><span>{shortNum(table?.roundBetCount)} ставок</span>
          </div>
          <SharedRouletteReel
            roundNumber={round?.roundNumber ?? null}
            status={round?.status}
            result={(round?.result as Outcome | null) ?? null}
            spinStartedAt={round?.spinStartedAt ?? null}
            spinEndsAt={round?.spinEndsAt ?? null}
            stopPosition={round?.wheelStopPosition ?? null}
            serverOffsetMs={serverOffsetMs}
            recentResults={recentResults.slice(0, 10)}
            recentWinners={table?.recentWinners ?? []}
            latestResult={wheelLatestResult}
            myRecentResult={myRecentResult}
            centerContent={rouletteCenterContent}
          />
          <div className="lenta-chip-area">
            <p className="lenta-chip-instruction">Выберите фишку, затем нажмите на цвет или монету. Повторное нажатие добавит такую же сумму.</p>
            <StakeChipPicker
              budget={lentaChipBudget}
              maxStake={maxAvailableStake}
              minStake={100}
              step={100}
              selectedKey={lentaChipKey}
              onSelect={(key) => setLentaChipState({
                roundNumber: round?.roundNumber ?? null,
                budget: lentaChipBudget,
                key,
              })}
              disabled={!canBet || cancelMutation.isPending}
              testIdPrefix="button-lenta-chip"
              resetKey={round?.roundNumber ?? "waiting"}
            />
          </div>
          <div className="shared-targets">
            {targets.map(({ id: side, label }) => {
              const multiplier = side === "red"
                ? round?.redMultiplier ?? table?.redMultiplier ?? bootstrap.gameConfig.redMultiplier
                : side === "black"
                  ? round?.blackMultiplier ?? table?.blackMultiplier ?? bootstrap.gameConfig.blackMultiplier
                  : coinsMultiplier;
              const chance = side === "red" ? table?.redPercent ?? bootstrap.gameConfig.redWeight : side === "black" ? table?.blackPercent ?? bootstrap.gameConfig.blackWeight : table?.coinsPercent ?? bootstrap.gameConfig.coinsWeight;
              const selected = myCurrentBets.some((bet: any) => side === "coins"
                ? bet.target === "coins" || bet.target.endsWith("+coins")
                : bet.target === side || bet.target === `${side}+coins`);
              const blockedByOppositeColor = (side === "red" && hasBlackBet) || (side === "black" && hasRedBet);
              const winningFlash = !!lastWinningBet
                && lastWinningBet.roundNumber === wheelLatestResult?.roundNumber
                && lastWinningBet.outcome === side;
              const disabled = !canBet || !amountValid || !enoughBalance || cancelMutation.isPending || blockedByOppositeColor;
              return <button key={side} onClick={() => placeBet(side)} disabled={disabled} aria-pressed={selected} aria-label={`${label}, поставить ${money(stake)}${winningFlash ? ", ставка выиграла" : ""}${blockedByOppositeColor ? ", недоступно: уже выбрана противоположная сторона" : ""}`} title={blockedByOppositeColor ? "В одном раунде нельзя ставить на оба цвета" : `Поставить ${money(stake)}`} data-stake-chip-target data-testid={`button-target-${side}`} className={`shared-target shared-target-${side} ${selected ? "shared-target-selected" : ""} ${winningFlash ? "shared-target-won" : ""}`}>
                <span className="shared-target-suit" aria-hidden="true">{side === "red" ? "♦️" : side === "black" ? "♣️" : "🪙"}</span>
                <span className="shared-target-check" aria-hidden="true">{selected && <Check size={13} />}</span>
                <span className="sr-only">{label}, шанс {chance}%, выплата ×{multiplier}. Нажмите, чтобы сразу поставить {money(stake)}.</span>
              </button>;
            })}
          </div>
          {(betNotice || betMutation.isError || cancelMutation.isError) && <div className={`bet-action-notice ${betMutation.isError || cancelMutation.isError ? "bet-action-error" : ""}`} role={betMutation.isError || cancelMutation.isError ? "alert" : "status"} aria-live="polite">
            {betNotice || (betMutation.isError
              ? betMutation.error instanceof Error ? betMutation.error.message : "Ставка не принята. Обновите баланс и попробуйте ещё раз."
              : cancelMutation.error instanceof Error ? cancelMutation.error.message : "Не удалось вернуть ставку. Попробуйте ещё раз.")}
          </div>}
          <div className="stake-area shared-stake">
            {activeGameMode === "roulette-dc" ? <section className="compact-bets-panel lenta-round-bets" aria-label="Ставки всех игроков">
              <div className="lenta-round-bets-heading">
                <div className="lenta-round-bets-title">
                  <span className="eyebrow">СТАВКИ ВСЕХ ИГРОКОВ</span>
                  <span className="compact-round-number">#{shortNum(round?.roundNumber)} · {shortNum(table?.roundBetCount ?? 0)} ставок</span>
                </div>
                {canBet && myCurrentBets.length > 0 && <button
                  type="button"
                  onClick={cancelBets}
                  disabled={cancelMutation.isPending || betMutation.isPending}
                  className="cancel-bets-button"
                  data-testid="button-cancel-bets"
                  aria-label={`Отменить свои ставки на ${money(refundableAmount)} кредитов`}
                >
                  {cancelMutation.isPending ? "ВОЗВРАТ…" : `ОТМЕНИТЬ МОИ · ${shortNum(refundableAmount)}`}
                </button>}
              </div>
              <div className="lenta-round-bet-list" role="list" aria-live="polite" data-testid="lenta-round-bets-list">
                {tableQuery.isLoading && !currentBets.length
                  ? <div className="compact-empty">ЗАГРУЖАЕМ СТАВКИ…</div>
                  : currentBets.length
                    ? currentBets.map((bet: any) => <CompactBetRow key={bet.id} bet={bet} />)
                    : <div className="compact-empty">{round?.status === "completed" ? "В этом раунде ставок не было." : "Ставок пока нет"}</div>}
              </div>
              {tableQuery.isError && <div className="compact-feed-error" role="alert">Проблема с подключением стола.</div>}
            </section> : <>
              <div className="stake-header-row">
                <label htmlFor="stake-input" className="eyebrow">СУММА СТАВКИ</label>
                {canBet && myCurrentBets.length > 0 && <button
                  type="button"
                  onClick={cancelBets}
                  disabled={cancelMutation.isPending || betMutation.isPending}
                  className="cancel-bets-button"
                  data-testid="button-cancel-bets"
                >
                  {cancelMutation.isPending ? "ВОЗВРАТ…" : `ОТМЕНИТЬ · ${shortNum(refundableAmount)}`}
                </button>}
              </div>
              <div className={`stake-input-wrap ${!amountValid ? "stake-invalid" : ""}`}><input id="stake-input" inputMode="numeric" autoComplete="off" data-testid="input-stake" value={stakeText} onChange={(event) => { setQuickStakeUnit(null); setStakeText(formatStakeInput(event.target.value)); }} aria-describedby={!amountValid || !enoughBalance ? "stake-hint" : undefined} disabled={betMutation.isPending || cancelMutation.isPending} /><button type="button" className="stake-clear-button" onClick={() => { setQuickStakeUnit(null); setStakeText(""); }} aria-label="Очистить сумму ставки" title="Очистить сумму ставки" disabled={betMutation.isPending || cancelMutation.isPending}>Очистить</button></div>
              <div className="stake-adjust-controls" aria-label="Изменить сумму ставки">
                <button type="button" onClick={() => adjustStake(0.5)} disabled={!amountValid || stake <= 199 || betMutation.isPending || cancelMutation.isPending} aria-label="Разделить ставку пополам" title="Разделить на 2">÷2</button>
                <button type="button" onClick={() => selectSpecialStake(halfWalletStake)} disabled={halfWalletStake < 100 || betMutation.isPending || cancelMutation.isPending} aria-label={`Выбрать половину текущего личного баланса: ${money(halfWalletStake)}`} title={`Половина личного баланса: ${money(halfWalletStake)}`}>1/2</button>
                <button type="button" onClick={() => selectSpecialStake(maxAvailableStake)} disabled={maxAvailableStake < 100 || betMutation.isPending || cancelMutation.isPending} aria-label={`Выбрать весь доступный баланс: ${money(maxAvailableStake)}`} title={`Весь доступный баланс: ${money(maxAvailableStake)}`}>max</button>
                <button type="button" onClick={() => adjustStake(2)} disabled={!amountValid || stake > maxSharedStake / 2 || betMutation.isPending || cancelMutation.isPending} aria-label="Умножить ставку на два" title="Умножить на 2">×2</button>
              </div>
              {(!amountValid || !enoughBalance) && <div id="stake-hint" className="stake-hint text-[#d68479]" data-testid="status-stake-validation">
                {!amountValid ? `Лимит на эту ставку: ${money(maxStakeForTarget)} · общий остаток ${money(remainingPlayerStake)}` : `Недостаточно кредитов: баланс ${money(wallet?.balance)} · нужно ${money(totalDebit)}`}
              </div>}
              <div className="stake-quick">{quickStakeAmounts.map(({ value, label }) => <button key={value} data-testid={`button-stake-${value}`} aria-label={`Ставка ${shortNum(value)} кредитов; повторное нажатие добавит эту сумму`} title={quickStakeUnit === value ? `Добавить ещё ${label} кредитов` : `Выбрать ${label} кредитов`} onClick={() => selectQuickStake(value)} className={`quick-amount ${quickStakeUnit === value ? "quick-amount-active" : ""}`} disabled={cancelMutation.isPending || value > maxStakeForTarget || (quickStakeUnit === value && stake + value > maxStakeForTarget)}>{label}</button>)}</div>
            </>}
          </div>
        </div>
      </section>
      <aside className="game-aside">
        <div className="balance-card panel rounded-2xl">
          <div className="flex justify-between items-start"><div><p className="eyebrow">ВАШ БАЛАНС</p><div className="balance-amount" data-testid="text-wallet-balance">{money(wallet?.balance)}</div></div><span className="balance-icon"><Wallet size={17} /></span></div>
          <div className="balance-foot"><span>Ставок сыграно</span><b>{shortNum(wallet?.roundsPlayed)}</b></div>
          <a href={topupBotUrl ?? undefined} data-testid="link-shop-balance" className="balance-link" aria-disabled={!topupBotUrl} onClick={(event) => {
            event.preventDefault();
            openDarkAceBotUrl(topupBotUrl);
          }}>Пополнить <ArrowRight size={14} /></a>
          <a href={withdrawalBotUrl ?? undefined} data-testid="link-shop-withdraw" className="balance-link" aria-disabled={!withdrawalBotUrl} onClick={(event) => {
            event.preventDefault();
            openDarkAceBotUrl(withdrawalBotUrl);
          }}>Вывести <ArrowRight size={14} /></a>
        </div>
        <a className="support-card" href={SUPPORT_URL} target="_blank" rel="noreferrer" data-testid="link-contact-game">
          <div className="support-icon"><CircleHelp size={17} /></div><div><b>Нужна помощь?</b><span>Напишите команде клуба</span></div><ArrowUpRight size={15} />
        </a>
      </aside>
    </div>
    </>}
  </div>;
}

function CompactBetRow({ bet }: { bet: any }) {
  const stakeBreakdown: { target: Outcome; amount: number }[] = bet.stakeBreakdown?.length
    ? bet.stakeBreakdown
    : (bet.target.split("+") as Outcome[]).map((target: Outcome) => ({ target, amount: bet.amount }));
  const targetLabel = betTargetName(bet.target);
  const stakeLabel = stakeBreakdown.map((leg) => `${targetName(leg.target)} ${money(leg.amount)}`).join(" + ");
  const settled = bet.status !== "pending" && bet.result != null;
  const rowClass = settled
    ? bet.status === "won" ? " compact-bet-history-won" : bet.status === "lost" ? " compact-bet-history-lost" : " compact-bet-history-mixed"
    : "";
  const playerName = bet.username ? `@${String(bet.username).replace(/^@/, "")}` : bet.displayName || "Игрок";
  return <div className={`compact-bet-item${rowClass}`} role="listitem" data-testid={`item-lenta-round-bet-${bet.id}`} title={`${playerName} · ${targetLabel} · ${stakeLabel} · всего ${money(bet.totalAmount)}`}>
    <div className="compact-bet-avatar">{bet.avatarUrl ? <img src={bet.avatarUrl} alt="" loading="lazy" /> : (bet.displayName || playerName).slice(0, 1)}</div>
    <b className="compact-bet-name" title={playerName}>{playerName}</b>
    <span className="compact-bet-outcomes" aria-label={`${targetLabel}: ${stakeLabel}`}>{stakeBreakdown.map((leg, index) => <span className="compact-bet-leg" key={`${leg.target}-${index}`}>
      <OutcomeMark outcome={leg.target} size={11} />
      {settled
        ? leg.target === bet.result && bet.payout > 0
          ? <small className="compact-history-amount compact-history-amount-win" aria-label={`Выигрыш с возвратом ставки: ${compactCreditAmount(bet.payout)}`}>+{compactCreditAmount(bet.payout)}</small>
          : <small className="compact-history-amount compact-history-amount-loss" aria-label={`Проигрыш: ${compactCreditAmount(leg.amount)}`}>−{compactCreditAmount(leg.amount)}</small>
        : <small>{shortNum(leg.amount)}</small>}
    </span>)}</span>
  </div>;
}

function OutcomeMark({ outcome, size = 14 }: { outcome: string; size?: number }) {
  if (outcome === "coins") return <Coins className="coin-mark" size={size} strokeWidth={2.1} aria-label="Монета" />;
  return <span className={`suit-mark suit-${outcome}`} aria-hidden="true">{outcome === "red" ? "♦" : "♣"}</span>;
}
function targetName(target: string) { return target === 'red' ? 'Красное' : target === 'black' ? 'Чёрное' : 'Монета'; }
function betTargetName(target: string) {
  return target === "red+coins" ? "Красное + монета" : target === "black+coins" ? "Чёрное + монета" : targetName(target);
}
function RoundResult({ result }: { result: any }) {
  return <div className={`round-result ${result.won ? 'round-win' : 'round-loss'}`} aria-live="polite">
    <div className="result-disc result-large"><OutcomeMark outcome={result.result} size={19} /></div>
    <div className="result-copy"><b>{result.won ? 'Попадание' : 'Не в этот раз'}</b><span>Выпало: {targetName(result.result)} · ставка учтена в оборот</span></div>
    <div className="result-profit">{result.won ? '+' : ''}{money(result.profit)}<small>чистая прибыль · выплата {money(result.payout)} · баланс {money(result.balance)}</small></div>
  </div>;
}
function RoundRow({ round }: { round: any }) {
  return <div className="round-row" data-testid={`row-round-${round.id}`}>
    <div className={`result-disc result-${round.result}`}><OutcomeMark outcome={round.result} size={16} /></div>
    <div className="round-row-main"><b>Выбрано: {betTargetName(round.target)} <i>·</i> выпало {targetName(round.result)} · {round.won ? 'выигрыш' : 'мимо'}</b><span>{prettyDate(round.createdAt)} · списано {money(round.stake)} · выплата {money(round.payout)}</span></div>
    <strong className={round.won ? 'positive' : 'negative'}>{round.won ? '+' : ''}{money(round.profit)}<small>чистая прибыль</small></strong>
  </div>;
}

function LevelsPage({ bootstrap, player }: any) {
  const levels = bootstrap.levels ?? [];
  const [selectedLevel, setSelectedLevel] = useState<number>(player?.level ?? 1);
  useEffect(() => {
    if (player?.level) setSelectedLevel(player.level);
  }, [player?.level]);
  const selected = levels.find((item: any) => item.level === selectedLevel);
  const currentLevel = player?.level ?? 1;
  const progress = player?.progressPercent ?? 0;
  const selectedReceived = currentLevel >= selectedLevel;

  return <div>
    <PageHeading overline="ПУТЬ ИГРОКА" title="Уровни DARK ACE" detail="50 уровней по обороту ставок. На 50-м уровне — 3 млрд кредитов оборота." right={<div className="rank-seal"><Crown size={17} /><span>LVL {currentLevel} / 50</span></div>} />
    <div className="level-hero panel rounded-[26px] fade-up fade-delay-1">
      <div className="level-insignia"><span>{currentLevel}</span><i /></div>
      <div className="level-main"><p className="eyebrow">ТЕКУЩИЙ УРОВЕНЬ</p><h2 className="display">{player?.levelName ?? 'Новичок'}</h2><p>Учитывается завершённый оборот ставок во всех играх.</p>
        <div className="xp-track"><div style={{ width: `${progress}%` }} /></div><div className="xp-caption"><span>{money(player?.levelTurnover ?? 0)} кр.</span><span>{money(player?.nextLevelTurnover ?? 0)} кр.</span></div>
      </div>
      <div className="level-next"><span>ПРОГРЕСС</span><b>{Math.floor(progress)}%</b><small>{currentLevel >= 50 ? 'МАКСИМАЛЬНЫЙ УРОВЕНЬ' : `до уровня ${currentLevel + 1}`}</small></div>
    </div>
    <section className="level-case-panel panel rounded-2xl">
      <div className="level-case-heading">
        <div><p className="eyebrow">ПОДАРОК ЗА УРОВЕНЬ {String(selectedLevel).padStart(2, '0')}</p><h2>{selected?.giftName ?? 'Подарок DARK ACE'}</h2><span>{selectedReceived ? 'Подарок уже добавлен в вашу коллекцию.' : `Подарок автоматически появится в коллекции на уровне ${selectedLevel}.`}</span></div>
        <span className={`level-case-status ${selectedReceived ? 'is-unlocked' : ''}`}>{selectedReceived ? 'ПОЛУЧЕН' : 'ЗАКРЫТ'}</span>
      </div>
      <div className="level-case-picker" aria-label="Выбрать уровень">
        {levels.map((item: any) => {
          const reached = currentLevel >= item.level;
          return <button type="button" key={item.level} className={`level-case-pick ${selectedLevel === item.level ? 'is-selected' : ''} ${reached ? 'is-unlocked' : ''}`}
            onClick={() => setSelectedLevel(item.level)} aria-pressed={selectedLevel === item.level}
            data-testid={`button-level-gift-${item.level}`}>
            <span>УР. {String(item.level).padStart(2, '0')}</span>{reached ? <Check size={12} /> : <LockKeyhole size={11} />}
          </button>;
        })}
      </div>
      <div className="level-case-prizes">
        <div className="level-case-prize" data-testid={`level-gift-${selectedLevel}`}>
          <Gift size={18} aria-hidden="true" />
          <span><b>{selected?.giftName ?? 'Подарок DARK ACE'}</b></span>
        </div>
      </div>
      <div className="level-case-opened"><Gift size={15} />При повышении уровня подарок начисляется автоматически. Открывать кейс не нужно.</div>
    </section>
    <section className="levels-section"><SectionLabel extra={<span className="eyebrow">50 УРОВНЕЙ</span>}>Лестница клуба</SectionLabel>
      <div className="levels-list">{levels.map((level: any, index: number) => {
        const current = currentLevel === level.level;
        const done = currentLevel > level.level;
        return <div key={level.level} className={`level-row ${current ? 'current-level' : ''} ${done ? 'completed-level' : ''}`} data-testid={`level-row-${level.level}`}>
          <div className="level-number">{done ? <Check size={14} /> : String(level.level).padStart(2, '0')}</div>
          <div className="level-connect">{index < levels.length - 1 && <span />}</div>
          <div className="level-name"><b>{level.name}</b><span>{level.requiredTurnover === 0 ? 'Старт' : `${shortNum(level.requiredTurnover)} кр. оборота`}</span></div>
          <div className="level-reward"><Gift size={13} /><span>{level.giftName}</span></div>
          {current && <span className="you-are-here">ВЫ ЗДЕСЬ</span>}
        </div>;
      })}</div>
    </section>
  </div>;
}

function LevelGiftNotificationHost({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const notifications = useListDarkAceLevelGiftNotifications({
    query: {
      queryKey: getListDarkAceLevelGiftNotificationsQueryKey(),
      enabled,
      refetchInterval: 4_000,
      retry: false,
    },
  });
  const acknowledge = useAcknowledgeDarkAceLevelGiftNotification({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListDarkAceLevelGiftNotificationsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetDarkAceGiftInventoryQueryKey() }),
        ]);
      },
    },
  });
  const notification = notifications.data?.[0];
  if (!enabled || !notification) return null;

  return <div className="fixed inset-0 z-[130] grid place-items-center bg-black/75 p-5" role="presentation">
    <section className="panel w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="level-gift-title">
      <div className="level-insignia mx-auto"><Gift size={22} /></div>
      <p className="eyebrow mt-5">НОВЫЙ УРОВЕНЬ</p>
      <h2 className="display mt-2" id="level-gift-title">Уровень {notification.level}!</h2>
      <p className="mt-3 text-sm text-[#c8c4b8]">Вы получили подарок «{notification.giftName}».</p>
      <p className="mt-2 text-xs text-[#92908a]">Подарок уже добавлен в вашу коллекцию.</p>
      <button
        type="button"
        className="gold-button mt-6 w-full"
        onClick={() => acknowledge.mutate({ level: notification.level })}
        disabled={acknowledge.isPending}
        data-testid="button-acknowledge-level-gift"
      >{acknowledge.isPending ? 'Сохраняем…' : 'Отлично'}</button>
      {acknowledge.isError && <p className="mt-3 text-sm text-red-300" role="alert">Не удалось закрыть уведомление. Попробуйте ещё раз.</p>}
    </section>
  </div>;
}
function formatCountdown(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function ShopPage({ shop, wallet }: any) {
  return <div>
    <PageHeading overline="КАССА КЛУБА" title="Пакеты кредитов" detail="Предварительный просмотр пакетов игрового баланса." right={<div className="table-status"><span className="status-dot status-off" /> ПОКУПКИ ОТКЛЮЧЕНЫ</div>} />
    <div className="shop-notice panel rounded-2xl fade-up fade-delay-1">
      <div className="notice-mark"><LockKeyhole size={17} /></div><div><b>Покупки и вывод через приложение отключены</b><span>Кредиты используются только внутри игры. По вопросам вывода обратитесь в поддержку в профиле.</span></div>
    </div>
    {shop.isLoading ? <LoadingBlock /> : shop.isError ? <ErrorBlock retry={() => void shop.refetch()} /> : <div className="package-grid">
      {(shop.data?.packages ?? []).map((pack: any, index: number) => <article key={`${pack.credits}-${pack.stars}`} className={`package-card panel rounded-2xl fade-up fade-delay-${Math.min(index + 1, 3)}`} data-testid={`card-package-${pack.credits}`}>
        <div className="package-top"><span className="eyebrow">НАБОР {String(index + 1).padStart(2, '0')}</span><span className="package-status">{pack.available ? 'ПРЕДПРОСМОТР' : 'НЕ АКТИВЕН'}</span></div>
        <div className="package-amount">{shortNum(pack.credits)}<small>кредитов</small></div>
        <div className="package-stars"><span>{shortNum(pack.stars)} Stars</span><small>только для ориентира</small></div>
        <button disabled data-testid={`button-purchase-${pack.credits}`} className="package-button"><LockKeyhole size={14} /> Покупка недоступна</button>
      </article>)}
      {!shop.data?.packages?.length && <div className="empty-panel"><ShoppingBag size={19} /><b>Покупки отключены</b><span>Кредиты начисляются администратором.</span></div>}
    </div>}
    <div className="shop-footnote"><Info size={14} /><p>{shop.data?.reason || 'Покупки и вывод через приложение не настроены.'} <strong>Игровые кредиты не имеют денежной стоимости.</strong></p></div>
    <div className="wallet-mini panel rounded-2xl"><div><span className="eyebrow">ТЕКУЩИЙ БАЛАНС</span><b>{money(wallet?.balance)}</b></div><Link href="/" className="text-link">К игровому столу <ArrowRight size={14} /></Link></div>
  </div>;
}
const formatPayout = (value: string) => {
  try {
    return new Intl.NumberFormat('ru-RU').format(BigInt(value));
  } catch {
    return value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
};
const compactCredits = (value: string) => {
  try {
    const amount = BigInt(value);
    const units = [
      { divisor: 1_000_000_000_000n, label: 'трлн' },
      { divisor: 1_000_000_000n, label: 'млрд' },
      { divisor: 1_000_000n, label: 'М' },
      { divisor: 1_000n, label: 'тыс.' },
    ];
    const unitIndex = units.findIndex(({ divisor }) => amount >= divisor);
    if (unitIndex === -1) return `${formatPayout(value)} кредитов`;

    let { divisor, label } = units[unitIndex];
    let tenths = (amount * 10n + divisor / 2n) / divisor;
    if (unitIndex > 0 && tenths >= 10_000n) {
      ({ divisor, label } = units[unitIndex - 1]);
      tenths = (amount * 10n + divisor / 2n) / divisor;
    }
    const whole = tenths / 10n;
    const decimal = tenths % 10n;
    return `${whole}${decimal ? `,${decimal}` : ''} ${label} кредитов`;
  } catch {
    return `${formatPayout(value)} кредитов`;
  }
};
function LeaderboardPage() {
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>();
  const [clock, setClock] = useState(Date.now());
  const monthlyParams = { game: "all_games" as const, ...(selectedMonth ? { month: selectedMonth } : {}) };
  const monthlyQuery = useGetDarkAceMonthlyLeaderboard(monthlyParams, {
    query: {
      queryKey: getGetDarkAceMonthlyLeaderboardQueryKey(monthlyParams),
      refetchInterval: 15_000,
    },
  });
  const monthlyData = monthlyQuery.data;
  useEffect(() => {
    if (!monthlyData?.isCurrent || !monthlyData.closesAt) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [monthlyData?.isCurrent, monthlyData?.closesAt]);
  const secondsLeft = monthlyData?.isCurrent && monthlyData.closesAt
    ? Math.max(0, Math.floor((new Date(monthlyData.closesAt).getTime() - clock) / 1000))
    : null;
  const monthCountdown = secondsLeft === null
    ? ''
    : `${Math.floor(secondsLeft / 86_400)} д ${String(Math.floor((secondsLeft % 86_400) / 3_600)).padStart(2, '0')}:${String(Math.floor((secondsLeft % 3_600) / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;

  return <div className="leaderboard-page">
      <div className="leaderboard-shell panel rounded-[24px] fade-up">
        <div className="leaderboard-header">
          <div><p className="eyebrow">ТАБЛИЦА РЕЗУЛЬТАТОВ</p><h2>Лидеры рейтинга</h2></div>
          <span className="live-chip"><span className="status-dot" />ЕДИНЫЙ МЕСЯЧНЫЙ ЗАЧЁТ</span>
        </div>
        {monthlyData && <div className="monthly-rank-meta">
          <label className="monthly-month-picker"><span>Период</span>
            <select value={selectedMonth ?? monthlyData.month} onChange={(event) => setSelectedMonth(event.target.value)}>
              {monthlyData.availableMonths.map((item) => <option key={item.month} value={item.month}>{new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${item.month}-01T00:00:00.000Z`))}</option>)}
            </select>
          </label>
          {monthlyData.isCurrent && <div className="monthly-countdown"><span>ДО ЗАКРЫТИЯ</span><b>{monthCountdown}</b></div>}
          {!monthlyData.isCurrent && <div className={`monthly-period-status monthly-status-${monthlyData.status}`}>{monthlyData.status === 'completed' ? 'МЕСЯЦ ЗАКРЫТ' : 'ПОДСЧЁТ ИТОГОВ'}</div>}
        </div>}
        <div className="monthly-rank-note"><Info size={13} /> Суммируются принятые ставки во всех играх клуба за выбранный месяц.</div>
        {monthlyQuery.isLoading ? <div className="rank-skeleton" aria-label="Загружаем месячный рейтинг">
          <div className="rank-skeleton-heading" /><div className="rank-skeleton-row" /><div className="rank-skeleton-row" /><div className="rank-skeleton-row" />
        </div> : monthlyQuery.isError ? <div className="rank-error">
          <div className="rank-error-mark"><Info size={18} /></div><b>Месячный рейтинг недоступен</b><span>Не удалось получить данные. Попробуйте обновить рейтинг.</span>
          <button onClick={() => void monthlyQuery.refetch()} data-testid="button-retry-monthly-leaderboard"><RefreshCw size={14} /> Повторить</button>
        </div> : monthlyData && monthlyData.entries.length === 0 ? <div className="rank-empty">
          <div className="rank-empty-mark"><Trophy size={22} /></div><b>Пока нет принятых ставок</b><span>Здесь появятся игроки после первых ставок в играх клуба.</span>
        </div> : monthlyData && <div className="monthly-rank-table">
          <div className="monthly-rank-podium" aria-label="Три первых места">
            {monthlyData.entries.slice(0, 3).map((entry, index) => <article
              key={`${entry.publicUserId}-${entry.rank}`}
              className={`monthly-rank-podium-card monthly-rank-podium-${entry.rank}`}
              data-testid={`monthly-leader-row-${entry.rank}`}
            >
              <div className="monthly-rank-podium-place">
                <span aria-label={`${entry.rank} место`}>{entry.rank === 1 ? "I" : entry.rank === 2 ? "II" : "III"}</span>
              </div>
              <div className="monthly-rank-podium-player">
                <PlayerAvatar publicUserId={entry.publicUserId} displayName={entry.displayName} avatarUrl={entry.avatarUrl} avatarClassName="rank-avatar" />
                <div className="rank-player-copy"><b>{entry.displayName}</b><span>{entry.username ? `@${entry.username.replace(/^@/, "")}` : "Участник клуба"}</span></div>
              </div>
              <div className="monthly-rank-podium-stakes" title={`${formatPayout(entry.totalStaked)} кредитов ставок`}>
                <b>{compactCredits(entry.totalStaked)}</b>
                <span>{shortNum(entry.roundsPlayed)} раундов</span>
              </div>
            </article>)}
          </div>
          {monthlyData.entries.length > 3 && <div className="monthly-rank-list">
            <div className="monthly-rank-head"><span>МЕСТО</span><span>ИГРОК</span><span>ОБЪЁМ СТАВОК</span></div>
            {monthlyData.entries.slice(3, 10).map((entry) => <div key={`${entry.publicUserId}-${entry.rank}`} className="monthly-rank-row" data-testid={`monthly-leader-row-${entry.rank}`}>
              <div className="rank-position"><span>{String(entry.rank).padStart(2, "0")}</span></div>
              <div className="rank-player">
                <PlayerAvatar publicUserId={entry.publicUserId} displayName={entry.displayName} avatarUrl={entry.avatarUrl} avatarClassName="rank-avatar" />
                <div className="rank-player-copy"><b>{entry.displayName}</b><span>{entry.username ? `@${entry.username.replace(/^@/, "")}` : "Участник клуба"}</span></div>
              </div>
              <div className="monthly-rank-stakes" title={`${formatPayout(entry.totalStaked)} кредитов ставок`}>
                <b>{compactCredits(entry.totalStaked)}</b>
                <span>{shortNum(entry.roundsPlayed)} раундов</span>
              </div>
            </div>)}
          </div>}
        </div>}
        {monthlyData?.myEntry && monthlyData.myEntry.rank > 10 && <div className="monthly-my-rank">
          <span>ВАША ПОЗИЦИЯ</span><b>#{monthlyData.myEntry.rank}</b><strong title={`${formatPayout(monthlyData.myEntry.totalStaked)} кредитов ставок`}>Ставки {compactCredits(monthlyData.myEntry.totalStaked)}</strong><small>{shortNum(monthlyData.myEntry.roundsPlayed)} раундов</small>
        </div>}
        {monthlyData && monthlyData.totalPlayers > 0 && <div className="rank-footer"><span>Участников в зачёте <b>{shortNum(monthlyData.totalPlayers)}</b></span><span>{monthlyData.isCurrent ? 'Считаются ставки текущего месяца UTC' : 'Архив закрытого месяца UTC'}</span></div>}
      </div>
      <p className="leader-disclaimer"><ShieldCheck size={14} /> Рейтинг объединяет принятые ставки всех активных игр за месяц по UTC. Профиль игрока открывается нажатием на его аватар.</p>
  </div>;
}

function ProfilePage({ player, wallet, transactions, admin = false }: any) {
  const historyRows = compactTransactionHistory(transactions.data ?? []);
  return <div>
    <PageHeading overline="ЛИЧНАЯ КАРТОЧКА" title="Профиль" detail="Ваш прогресс, игровой баланс и история операций." right={<div className="profile-heading-actions"><a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="outline-button"><CircleHelp size={15} /> Поддержка</a>{admin && <Link href="/admin" className="outline-button profile-admin-link" data-testid="link-profile-admin"><Settings2 size={15} /> Панель администратора</Link>}</div>} />
    <div className="profile-hero panel rounded-[25px] fade-up fade-delay-1">
      <PlayerAvatar publicUserId={player?.publicUserId} displayName={player?.displayName ?? 'Игрок'} avatarUrl={player?.avatarUrl} avatarClassName="profile-avatar">
        <span><Crown size={12} /></span>
      </PlayerAvatar>
      <div className="profile-person"><p className="eyebrow">УЧАСТНИК КЛУБА · УРОВЕНЬ {player?.level}</p><h2>{player?.displayName}</h2><span>{player?.username ? `@${player.username}` : 'Имя Telegram не указано'}</span></div>
      <div className="profile-level"><span>ЗВАНИЕ</span><b>{player?.levelName}</b><small>{shortNum(player?.levelTurnover)} оборота</small></div>
    </div>
    <div className="stat-grid">
      <StatTile label="Баланс" value={money(wallet?.balance)} icon={<Wallet size={16} />} />
      <StatTile label="Всего поставлено" value={money(wallet?.totalStaked)} icon={<Target size={16} />} />
      <StatTile label="Победы / раунды" value={`${shortNum(wallet?.wins)} / ${shortNum(wallet?.roundsPlayed)}`} icon={<Trophy size={16} />} />
      <StatTile label="Поражения" value={shortNum(wallet?.losses)} icon={<Activity size={16} />} />
    </div>
    <section className="profile-section">
      <SectionLabel extra={<span className="eyebrow">ПОСЛЕДНИЕ ЗАПИСИ</span>}>История баланса</SectionLabel>
      {transactions.isLoading ? <LoadingBlock /> : transactions.isError ? <ErrorBlock retry={() => void transactions.refetch()} /> : historyRows.length ? <div className="transaction-list">
        {historyRows.slice(0, 12).map((tx: any) => <div key={tx.id} className="transaction-row" data-testid={`transaction-row-${tx.id}`}>
          <div className={`tx-icon tx-${tx.type}`}><TransactionIcon type={tx.type} /></div>
          <div className="tx-details"><b>{displayCurrencyText(tx.description || transactionName(tx.type))}</b><span>{prettyDate(tx.createdAt)}{tx.isRoundSummary
            ? ` · ставка ${compactMoney(tx.totalStake)} · выплата ${compactMoney(tx.totalPayout)}`
            : ` · баланс ${money(tx.balanceAfter)}`}</span></div>
          <strong className={tx.amount >= 0 ? 'positive' : 'negative'}>{tx.type === "wagering_transfer"
            ? `+${fmt.format(tx.amount)} вейджера`
            : `${tx.amount >= 0 ? '+' : ''}${money(tx.amount)}`}</strong>
        </div>)}
      </div> : <div className="empty-panel"><History size={19} /><b>История пока пуста</b><span>Операции появятся после игры.</span></div>}
    </section>
  </div>;
}
function TransactionIcon({ type }: { type: string }) {
  if (type === 'win' || type === 'bonus') return <ArrowDownLeft size={15} />;
  if (type === 'bet' || type === 'loss') return <ArrowUpRight size={15} />;
  if (type === "wagering_transfer") return <Target size={15} />;
  return <Activity size={15} />;
}
function compactTransactionHistory(transactions: any[]) {
  const rows: any[] = [];
  const rounds = new Map<string, any>();
  for (const tx of transactions) {
    const description = typeof tx.description === "string" ? tx.description : "";
    const roundMatch = description.match(/раунд\s*#?\s*(\d+)/i);
    const canGroup = roundMatch && ["bet", "win", "loss", "refund"].includes(tx.type);
    if (!canGroup) {
      rows.push(tx);
      continue;
    }
    const lower = description.toLowerCase();
    const game = lower.includes("фрукт") ? "Фрукты"
      : lower.includes("баттл") || lower.includes("джекпот") ? "Баттл"
        : lower.includes("рулетк") ? "Рулетка" : "Игра";
    const roundNumber = Number(roundMatch[1]);
    const key = `${game}:${roundNumber}`;
    const existing = rounds.get(key);
    if (existing) {
      existing.amount += tx.amount;
      existing.totalStake += tx.type === "bet" ? Math.max(0, -tx.amount) : 0;
      existing.totalPayout += tx.type === "win" ? Math.max(0, tx.amount) : 0;
      existing.operationCount += 1;
      continue;
    }
    const summary = {
      ...tx,
      id: `round:${key}`,
      description: `Раунд #${roundNumber} · ${game}`,
      amount: tx.amount,
      totalStake: tx.type === "bet" ? Math.max(0, -tx.amount) : 0,
      totalPayout: tx.type === "win" ? Math.max(0, tx.amount) : 0,
      operationCount: 1,
      isRoundSummary: true,
    };
    rounds.set(key, summary);
    rows.push(summary);
  }
  return rows;
}
function transactionName(type: string) {
  const names: Record<string, string> = { demo_credit: 'Стартовый баланс кредитов', welcome_bonus: 'Приветственный бонус', bet: 'Ставка', win: 'Выплата', loss: 'Раунд', bonus: 'Бонус', quiz_reward: 'Награда за ответ в квизе', telegram_slot_giveaway_reward: 'Награда за джекпот в розыгрыше', refund: 'Возврат', admin_adjustment: 'Корректировка', stars_purchase: 'Покупка кредитов за Stars', crypto_purchase: 'Пополнение криптовалютой', ruble_purchase: 'Пополнение за рубли', wagering_transfer: 'Вейджер с перевода' };
  return names[type] ?? 'Операция';
}
function StatTile({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return <div className="stat-tile panel"><div className="stat-icon">{icon}</div><span className="eyebrow">{label}</span><b>{value}</b></div>;
}

function AdminPage({ adminOverview, config, saveGameConfig, configPending, configError }: any) {
  const cfg = adminOverview.data?.gameConfig ?? config;
  const dailyGames: Array<{ game: string; players: number; betCredits: number; payoutCredits: number }> =
    adminOverview.data?.dailyGames ?? [];
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(null);
  const [activeSection, setActiveSection] = useState<"overview" | "players" | "promos" | "games" | "audit" | "settings">("overview");
  const [adminNavExpanded, setAdminNavExpanded] = useState(false);
  const adminNavToggleRef = useRef<HTMLButtonElement>(null);
  const [gameAdminTab, setGameAdminTab] = useState<"games" | "table">("games");
  const [gameAvailabilityNotice, setGameAvailabilityNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [auditTab, setAuditTab] = useState<"actions" | "players" | "financial">("actions");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [selectedWagerMultiplier, setSelectedWagerMultiplier] = useState<2 | 5 | 10 | 15 | 20 | null>(null);
  const [selectedWagerMode, setSelectedWagerMode] = useState<"replace" | "add">("replace");
  const [grantNotice, setGrantNotice] = useState("");
  const [adminActionNotice, setAdminActionNotice] = useState("");
  const [pendingAdminAction, setPendingAdminAction] = useState<"remove" | "reset" | null>(null);
  const [pendingLeaderboardReset, setPendingLeaderboardReset] = useState<"all" | "player" | null>(null);
  const [leaderboardResetTab, setLeaderboardResetTab] = useState<"all" | "player">("all");
  const [leaderboardResetConfirmation, setLeaderboardResetConfirmation] = useState("");
  const [leaderboardResetNotice, setLeaderboardResetNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [pendingPlayerBlock, setPendingPlayerBlock] = useState<boolean | null>(null);
  const [playerBlockNotice, setPlayerBlockNotice] = useState<{ text: string; error: boolean } | null>(null);
  const adminUsers = useGetDarkAceAdminUsers(
    { search: userSearch.trim() || undefined, limit: 25 },
    { query: {
      queryKey: getGetDarkAceAdminUsersQueryKey({ search: userSearch.trim() || undefined, limit: 25 }),
      enabled: activeSection === "players",
      refetchInterval: activeSection === "players" ? 15_000 : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      staleTime: 0,
    } },
  );
  const gameAvailability = useGetDarkAceGameAvailability({
    query: {
      queryKey: getGetDarkAceGameAvailabilityQueryKey(),
      enabled: activeSection === "games",
      staleTime: 0,
      refetchInterval: activeSection === "games" ? 30_000 : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  });
  useEffect(() => {
    if (!selectedUser) return;
    const freshUser = adminUsers.data?.users.find((user) => user.id === selectedUser.id);
    if (!freshUser) return;
    setSelectedUser((current: any) => current?.id === freshUser.id ? { ...current, ...freshUser } : current);
  }, [adminUsers.data, selectedUser?.id]);
  const grantCredits = useGrantDarkAceCredits();
  const manageWageringRequirement = useManageDarkAceAdminWageringRequirement();
  const removeCredits = useRemoveDarkAceCredits();
  const resetPlayerLevel = useResetDarkAcePlayerLevel();
  const resetLeaderboard = useResetDarkAceLeaderboard();
  const setPlayerBlock = useSetDarkAcePlayerBlock();
  const telegramMenu = useConfigureDarkAceTelegramMenu();
  const updateGameAvailability = useUpdateDarkAceGameAvailability();
  const updateTransferAvailability = useUpdateDarkAceTransferAvailability();
  const updateGameWageringAvailability = useUpdateDarkAceGameWageringAvailability();
  const [telegramMenuNotice, setTelegramMenuNotice] = useState("");
  useEffect(() => {
    if (!adminNavExpanded) return;
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAdminNavExpanded(false);
      adminNavToggleRef.current?.focus();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [adminNavExpanded]);
  useEffect(() => {
    if (cfg) setForm({
      redWeight: cfg.redWeight, blackWeight: cfg.blackWeight, coinsWeight: cfg.coinsWeight,
      redMultiplier: cfg.redMultiplier, blackMultiplier: cfg.blackMultiplier,
      coinsMultiplier: cfg.coinsMultiplier, gameEnabled: cfg.gameEnabled,
    });
  }, [cfg]);
  const submit = () => {
    if (!form || !cfg) return;
    saveGameConfig({
      ...form,
      redWeight: cfg.redWeight,
      blackWeight: cfg.blackWeight,
      coinsWeight: cfg.coinsWeight,
      redMultiplier: cfg.redMultiplier,
      blackMultiplier: cfg.blackMultiplier,
      coinsMultiplier: cfg.coinsMultiplier,
    });
  };
  const setGameAvailabilityEnabled = (game: any, enabled: boolean) => {
    setGameAvailabilityNotice(null);
    updateGameAvailability.mutate(
      { gameId: game.id, data: { enabled } },
      {
        onSuccess: (result: any) => {
          void qc.invalidateQueries({ queryKey: getGetDarkAceGameAvailabilityQueryKey() });
          const cancelled = Number(result.cancelledQueueEntries ?? 0);
          setGameAvailabilityNotice({
            text: enabled
              ? `${game.name} включена.`
              : cancelled > 0
                ? `${game.name} выключена. ${cancelled} заявок очереди отменено, ставки возвращены.`
                : `${game.name} выключена. Уже начатые игры завершатся.`,
            error: false,
          });
        },
        onError: () => setGameAvailabilityNotice({
          text: `Не удалось изменить доступность игры «${game.name}». Повторите попытку.`,
          error: true,
        }),
      },
    );
  };
  const setTransferAvailabilityEnabled = (enabled: boolean) => {
    setGameAvailabilityNotice(null);
    updateTransferAvailability.mutate({ data: { enabled } }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetDarkAceGameAvailabilityQueryKey() });
        setGameAvailabilityNotice({
          text: enabled ? "Переводы кредитов игрокам включены." : "Переводы кредитов игрокам выключены.",
          error: false,
        });
      },
      onError: () => setGameAvailabilityNotice({
        text: "Не удалось изменить доступность переводов. Повторите попытку.",
        error: true,
      }),
    });
  };
  const setGameWageringEnabled = (game: any, enabled: boolean) => {
    setGameAvailabilityNotice(null);
    updateGameWageringAvailability.mutate({ gameId: game.id, data: { enabled } }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetDarkAceGameAvailabilityQueryKey() });
        setGameAvailabilityNotice({
          text: enabled
            ? `Ставки игры «${game.name}» засчитываются в вейджер.`
            : `Ставки игры «${game.name}» больше не засчитываются в вейджер.`,
          error: false,
        });
      },
      onError: () => setGameAvailabilityNotice({
        text: `Не удалось изменить учёт вейджера для игры «${game.name}». Повторите попытку.`,
        error: true,
      }),
    });
  };
  const parsedGrantAmount = Number(grantAmount);
  const grantAmountValid = Number.isSafeInteger(parsedGrantAmount) && parsedGrantAmount >= 1 && parsedGrantAmount <= 50_000_000_000_000;
  const calculatedWagerAmount = selectedUser && selectedWagerMultiplier
    ? selectedUser.balance * selectedWagerMultiplier
    : 0;
  const currentWagerRequired = selectedUser?.wageringRequiredCredits ?? 0;
  const currentWagerCompleted = selectedUser?.wageringCompletedCredits ?? 0;
  const currentWagerBaseRequired = currentWagerCompleted >= currentWagerRequired ? 0 : currentWagerRequired;
  const calculatedWagerRequirement = selectedWagerMode === "add"
    ? currentWagerBaseRequired + calculatedWagerAmount
    : calculatedWagerAmount;
  const calculatedWagerAmountValid = Number.isSafeInteger(calculatedWagerAmount)
    && calculatedWagerAmount > 0
    && Number.isSafeInteger(calculatedWagerRequirement);
  const adminActionPending = grantCredits.isPending || manageWageringRequirement.isPending || removeCredits.isPending || resetPlayerLevel.isPending;
  const makeAdminActionKey = () => typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const refreshAdminState = () => {
    void adminUsers.refetch();
    void adminOverview.refetch();
    void qc.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetDarkAceLeaderboardQueryKey() });
    void qc.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
  };
  const submitGrant = () => {
    if (!selectedUser || !grantAmountValid || !grantReason.trim()) return;
    const key = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    grantCredits.mutate({
      data: {
        userId: selectedUser.id,
        amount: parsedGrantAmount,
        reason: grantReason.trim(),
        idempotencyKey: key,
      },
    }, {
      onSuccess: (result) => {
        setGrantNotice(`Начислено ${money(result.amount)}. Баланс игрока: ${money(result.balance)}.`);
        setSelectedUser((current: any) => current?.id === result.userId ? { ...current, balance: result.balance } : current);
        setGrantAmount("");
        setGrantReason("");
        refreshAdminState();
      },
      onError: () => setGrantNotice("Не удалось начислить кредиты. Проверьте данные и повторите попытку."),
    });
  };
  const submitCreditRemoval = () => {
    if (!selectedUser || !grantAmountValid || !grantReason.trim()) return;
    removeCredits.mutate({
      data: {
        userId: selectedUser.id,
        amount: parsedGrantAmount,
        reason: grantReason.trim(),
        idempotencyKey: makeAdminActionKey(),
      },
    }, {
      onSuccess: (result) => {
        setAdminActionNotice(`Снято ${money(result.amount)}. Баланс игрока: ${money(result.balance)}.`);
        setSelectedUser((current: any) => current?.id === result.userId ? { ...current, balance: result.balance } : current);
        setGrantAmount("");
        setGrantReason("");
        setPendingAdminAction(null);
        refreshAdminState();
      },
      onError: (error) => setAdminActionNotice(error instanceof Error ? displayCurrencyText(error.message) : "Не удалось списать кредиты."),
    });
  };
  const submitWageringRequirement = () => {
    if (!selectedUser || !selectedWagerMultiplier || !grantReason.trim() || manageWageringRequirement.isPending) return;
    manageWageringRequirement.mutate({
      data: {
        userId: selectedUser.id,
        mode: selectedWagerMode,
        multiplier: selectedWagerMultiplier,
        reason: grantReason.trim(),
        idempotencyKey: makeAdminActionKey(),
      },
    }, {
      onSuccess: (result) => {
        setAdminActionNotice(
          `${result.mode === "replace" ? "Вейджер заменён" : "К текущему вейджеру добавлено"}: ${money(result.amount)} кредитов (баланс ${money(result.baseBalanceCredits)} ×${result.multiplier}). Требуется ${money(result.wageringRequiredCredits)}, выполнено ${money(result.wageringCompletedCredits)}, осталось ${money(result.wageringRemainingCredits)}.`,
        );
        setSelectedUser((current: any) => current?.id === result.userId
          ? {
            ...current,
            wageringRequiredCredits: result.wageringRequiredCredits,
            wageringCompletedCredits: result.wageringCompletedCredits,
          }
          : current);
        setSelectedWagerMultiplier(null);
        setGrantReason("");
        refreshAdminState();
      },
      onError: (error) => setAdminActionNotice(
        error instanceof Error ? displayCurrencyText(error.message) : "Не удалось изменить вейджер.",
      ),
    });
  };
  const submitLevelReset = () => {
    if (!selectedUser || !grantReason.trim()) return;
    resetPlayerLevel.mutate({
      data: {
        userId: selectedUser.id,
        reason: grantReason.trim(),
        idempotencyKey: makeAdminActionKey(),
      },
    }, {
      onSuccess: (result) => {
        setAdminActionNotice(`Уровень сброшен: ур. ${result.level}, 0 XP. Уже полученные награды сохранены.`);
        setSelectedUser((current: any) => current?.id === result.userId ? { ...current, level: result.level, levelName: "Новичок" } : current);
        setGrantReason("");
        setPendingAdminAction(null);
        refreshAdminState();
      },
      onError: (error) => setAdminActionNotice(error instanceof Error ? error.message : "Не удалось сбросить уровень."),
    });
  };
  const submitLeaderboardReset = () => {
    if (!pendingLeaderboardReset || resetLeaderboard.isPending) return;
    if (pendingLeaderboardReset === "player" && !selectedUser) return;
    if (pendingLeaderboardReset === "all" && leaderboardResetConfirmation.trim() !== "СБРОСИТЬ ВСЁ") return;
    const scope = pendingLeaderboardReset;
    const idempotencyKey = makeAdminActionKey();
    resetLeaderboard.mutate({
      data: {
        ...(scope === "player" && selectedUser ? { targetUserId: selectedUser.id } : {}),
        ...(scope === "all" ? { confirmationText: "СБРОСИТЬ ВСЁ" } : {}),
        idempotencyKey,
      },
    }, {
      onSuccess: (result) => {
        setLeaderboardResetNotice({
          text: result.scope === "all"
            ? `Полный сброс выполнен для всех игроков: баланс, подарки, уровни, рейтинг и игровые записи очищены. Аккаунты, денежный журнал и защита промокодов сохранены · ${prettyDate(result.resetAt)}.`
            : `Полный сброс выполнен для игрока ${result.targetDisplayName ?? selectedUser?.displayName ?? "игрок"}: баланс, подарки, уровень, рейтинг и его игровые записи очищены. Сохранены аккаунт, денежный журнал и защита промокодов; история общего матча остаётся у соперника · ${prettyDate(result.resetAt)}.`,
          error: false,
        });
        setPendingLeaderboardReset(null);
        setLeaderboardResetConfirmation("");
        setSelectedUser((current: any) => current
          ? { ...current, balance: 0, level: 1, levelName: "Новичок" }
          : current);
        refreshAdminState();
        void qc.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetDarkAceOwnProfileQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetDarkAceLeaderboardQueryKey() });
        void qc.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
        void qc.invalidateQueries({
          predicate: (query) => typeof query.queryKey[0] === "string"
            && (query.queryKey[0].startsWith("/api/dark-ace/rounds")
              || query.queryKey[0].startsWith("/api/dark-ace/admin/users/")),
        });
        void qc.invalidateQueries({
          predicate: (query) => typeof query.queryKey[0] === "string"
            && query.queryKey[0].startsWith("/api/dark-ace/monthly-leaderboard"),
        });
        void qc.invalidateQueries({
          predicate: (query) => typeof query.queryKey[0] === "string"
            && query.queryKey[0].startsWith("/api/dark-ace/profiles/"),
        });
      },
      onError: (error) => setLeaderboardResetNotice({
        text: error instanceof Error ? error.message : "Не удалось выполнить полный сброс. Повторите попытку.",
        error: true,
      }),
    });
  };
  const submitPlayerBlock = () => {
    if (!selectedUser || pendingPlayerBlock === null || setPlayerBlock.isPending) return;
    const blocked = pendingPlayerBlock;
    setPlayerBlock.mutate({
      userId: selectedUser.id,
      data: { blocked },
    }, {
      onSuccess: (result) => {
        setSelectedUser((current: any) => current?.id === result.userId
          ? { ...current, isBlocked: result.isBlocked }
          : current);
        setPlayerBlockNotice({
          text: result.isBlocked
            ? "Игрок заблокирован. Его баланс и история сохранены."
            : "Игрок разблокирован. Доступ к игровым действиям восстановлен.",
          error: false,
        });
        setPendingPlayerBlock(null);
        refreshAdminState();
      },
      onError: (error) => setPlayerBlockNotice({
        text: error instanceof Error ? error.message : "Не удалось изменить блокировку игрока.",
        error: true,
      }),
    });
  };
  const configureTelegramMenu = () => {
    if (window.location.protocol !== "https:") {
      setTelegramMenuNotice("Откройте опубликованное приложение по HTTPS, чтобы подключить кнопку меню.");
      return;
    }
    telegramMenu.mutate({ data: { url: window.location.origin } }, {
      onSuccess: (result) => setTelegramMenuNotice(`Кнопка бота настроена: ${result.url}`),
      onError: () => setTelegramMenuNotice("Не удалось настроить меню. Проверьте Bot Token и опубликованный HTTPS-адрес."),
    });
  };
  if (adminOverview.isLoading) return <LoadingBlock />;
  if (adminOverview.isError) return <div><PageHeading overline="УПРАВЛЕНИЕ" title="Панель управления" /><ErrorBlock retry={() => void adminOverview.refetch()} text="Нет доступа к административным данным." /></div>;
  const sections = [
    { id: "overview" as const, label: "Обзор", icon: LayoutDashboard, hint: "Сводка" },
    { id: "players" as const, label: "Игроки", icon: Users, hint: "Баланс и статистика" },
    { id: "promos" as const, label: "Промокоды", icon: Ticket, hint: "Бонусы и аудит" },
    { id: "games" as const, label: "Игры", icon: Gamepad2, hint: "Доступность" },
    { id: "audit" as const, label: "Журнал", icon: History, hint: "Действия админа" },
    { id: "settings" as const, label: "Настройки", icon: Settings, hint: "Telegram Mini App" },
  ];
  const goToSection = (section: typeof activeSection) => {
    setActiveSection(section);
    setAdminNavExpanded(false);
  };
  const handleAdminTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? sections.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : sections.length - 1)) % sections.length;
    const nextSection = sections[nextIndex];
    goToSection(nextSection.id);
    window.requestAnimationFrame(() => document.getElementById(`admin-tab-${nextSection.id}`)?.focus());
  };
  return <div>
    <div className="admin-panel-heading fade-up">
      <p className="eyebrow">ЗАКРЫТЫЙ РАЗДЕЛ · ADMIN</p>
      <span className="admin-tag"><ShieldCheck size={14} /> ДОСТУП ПОДТВЕРЖДЁН</span>
    </div>
    <div className="admin-layout">
    {adminNavExpanded && <div className="admin-nav-scrim" aria-hidden="true" onClick={() => setAdminNavExpanded(false)} />}
    <div className={`admin-section-nav${adminNavExpanded ? " is-expanded" : ""}`} data-testid="admin-section-navigation">
      <button
        ref={adminNavToggleRef}
        type="button"
        className="admin-nav-toggle"
        aria-label={adminNavExpanded ? "Свернуть меню разделов" : "Открыть меню разделов"}
        aria-expanded={adminNavExpanded}
        aria-controls="admin-section-tabs"
        onClick={() => setAdminNavExpanded((expanded) => !expanded)}
        data-testid="button-toggle-admin-navigation"
      >
        <Menu size={18} aria-hidden="true" />
      </button>
      <nav id="admin-section-tabs" className="admin-section-tabs" role="tablist" aria-label="Разделы панели администратора" aria-orientation="vertical">
        {sections.map(({ id, label, icon: Icon, hint }, index) => <button
          key={id}
          type="button"
          role="tab"
          id={`admin-tab-${id}`}
          aria-selected={activeSection === id}
          aria-controls={`admin-panel-${id}`}
          tabIndex={activeSection === id ? 0 : -1}
          aria-label={label}
          title={adminNavExpanded ? undefined : label}
          className={`admin-section-tab${activeSection === id ? " is-active" : ""}`}
          onClick={() => goToSection(id)}
          onKeyDown={(event) => handleAdminTabKey(event, index)}
          data-testid={`tab-admin-${id}`}
        >
          <Icon size={16} aria-hidden="true" />
          <span className="admin-tab-copy"><b>{label}</b><small>{hint}</small></span>
        </button>)}
      </nav>
    </div>

    <div className="admin-section-content" id={`admin-panel-${activeSection}`} role="tabpanel" aria-labelledby={`admin-tab-${activeSection}`}>
      {activeSection === "overview" && <section className="admin-overview-view" aria-label="Обзор административной панели">
        <div className="admin-summary">
          <StatTile label="Игроков" value={shortNum(adminOverview.data?.players)} icon={<Users size={16} />} />
          <StatTile label="Раундов" value={shortNum(adminOverview.data?.rounds)} icon={<Activity size={16} />} />
          <StatTile label="Новых сегодня" value={shortNum(adminOverview.data?.newPlayersToday)} icon={<Users size={16} />} />
          <StatTile label="Активны сегодня" value={shortNum(adminOverview.data?.activePlayersToday)} icon={<Activity size={16} />} />
          <StatTile label="Стол" value={cfg?.gameEnabled ? "Открыт" : "Пауза"} icon={<ShieldCheck size={16} />} />
        </div>
        <section className="admin-daily-summary panel rounded-2xl" aria-label="Ставки и выплаты по играм за сегодня">
          <header className="admin-daily-summary-heading">
            <div><span className="eyebrow">СЕГОДНЯ · МОСКОВСКОЕ ВРЕМЯ</span><h2>Ставки и выплаты</h2></div>
            <small>Новые — зарегистрированы сегодня · активные — сделали ставку</small>
          </header>
          {dailyGames.length
            ? <div className="admin-daily-summary-table-wrap">
              <table className="admin-daily-summary-table">
                <thead><tr><th>Игра</th><th>Игроки</th><th>Ставки</th><th>Выплаты</th></tr></thead>
                <tbody>{dailyGames.map((game) => <tr key={game.game}>
                  <th scope="row">{game.game}</th>
                  <td>{shortNum(game.players)}</td>
                  <td>{new Intl.NumberFormat("ru-RU").format(game.betCredits)}</td>
                  <td>{new Intl.NumberFormat("ru-RU").format(game.payoutCredits)}</td>
                </tr>)}</tbody>
              </table>
            </div>
            : <p className="admin-daily-summary-empty">Сегодня ещё нет ставок и выплат.</p>}
        </section>
        <AdminSystemStatus />
        <section className="admin-overview-operations panel rounded-2xl">
          <div className="section-label"><h2>Быстрый переход</h2><span className="eyebrow">ОПЕРАЦИИ</span></div>
          <div className="admin-quick-links">
            <button type="button" className="admin-quick-link" onClick={() => goToSection("players")} data-testid="button-admin-quick-players">
              <span className="admin-quick-icon"><Users size={17} /></span><span><b>Найти игрока</b><small>Баланс, уровень и статистика</small></span><ArrowRight size={15} />
            </button>
            <button type="button" className="admin-quick-link" onClick={() => goToSection("promos")} data-testid="button-admin-quick-promos">
              <span className="admin-quick-icon"><Ticket size={17} /></span><span><b>Промокоды</b><small>Награды и журнал активаций</small></span><ArrowRight size={15} />
            </button>
            <button type="button" className="admin-quick-link" onClick={() => goToSection("games")} data-testid="button-admin-quick-games">
              <span className="admin-quick-icon"><Gamepad2 size={17} /></span><span><b>Доступность игр</b><small>{cfg?.gameEnabled ? "Стол открыт для ставок" : "Стол сейчас на паузе"}</small></span><ArrowRight size={15} />
            </button>
            <button type="button" className="admin-quick-link" onClick={() => goToSection("audit")} data-testid="button-admin-quick-audit">
              <span className="admin-quick-icon"><History size={17} /></span><span><b>Журнал действий</b><small>Кто и что менял в админке</small></span><ArrowRight size={15} />
            </button>
          </div>
        </section>
        <div className="admin-overview-foot"><ShieldCheck size={15} /><span>Настройки вероятностей и множителей недоступны в панели. Управление игровой конфигурацией остаётся за сервером.</span></div>
      </section>}

      {activeSection === "players" && <div className="admin-player-view">
        <section className="admin-users panel rounded-2xl">
          <div className="section-label"><h2>Игроки</h2><span className="eyebrow">ПОИСК И ОПЕРАЦИИ</span></div>
          <p className="admin-users-note">Найдите аккаунт по Telegram ID, имени или username. Изменения баланса и уровня записываются в журнал администратора.</p>
          <label className="admin-search-label" htmlFor="admin-user-search">Поиск игрока по Telegram ID, имени или username</label>
          <input id="admin-user-search" className="admin-search-input" value={userSearch} onChange={(event) => {
            setUserSearch(event.target.value);
            setSelectedUser(null);
            setSelectedWagerMultiplier(null);
            setGrantNotice("");
            setAdminActionNotice("");
            setPendingAdminAction(null);
            setPendingLeaderboardReset(null);
             setPendingPlayerBlock(null);
             setPlayerBlockNotice(null);
          }} placeholder="Например, 123456789 или @username" autoComplete="off" data-testid="input-admin-player-search" />
          <div className="admin-user-list" aria-live="polite">
            {adminUsers.isLoading ? <LoadingBlock label="ПОИСК ИГРОКОВ" />
              : adminUsers.isError ? <ErrorBlock retry={() => void adminUsers.refetch()} text="Не удалось загрузить список игроков." />
                : adminUsers.data?.users.length
                  ? adminUsers.data.users.map((user) => <button
                    key={user.id}
                    className={`admin-user-option ${selectedUser?.id === user.id ? "admin-user-selected" : ""}`}
                    onClick={() => {
                      setSelectedUser(user);
                      setSelectedWagerMultiplier(null);
                      setSelectedWagerMode("replace");
                      setGrantAmount("");
                      setGrantReason("");
                      setGrantNotice("");
                      setAdminActionNotice("");
                      setPendingAdminAction(null);
                      setPendingLeaderboardReset(null);
                       setPendingPlayerBlock(null);
                       setPlayerBlockNotice(null);
                    }}
                    aria-pressed={selectedUser?.id === user.id}
                    data-testid={`button-admin-player-${user.id}`}
                  >
                    <span className="admin-user-name"><b>{user.displayName}</b><small>{user.username ? `@${user.username}` : user.id}</small></span>
                    <span className="admin-user-level">{user.levelName} · ур. {user.level}</span>
                    <strong>{money(user.balance)}</strong>
                  </button>)
                  : <div className="admin-user-empty">{userSearch ? "Игроки не найдены." : `Игроков: ${adminUsers.data?.total ?? 0}. Введите часть ID, имени или username для поиска.`}</div>}
          </div>
          {selectedUser && <div className="admin-grant-form">
            <div className="admin-selected-user"><span>Выбранный игрок</span><b>{selectedUser.displayName}</b><code>{selectedUser.id}</code><strong>Баланс: {money(selectedUser.balance)}</strong></div>
            <div className="admin-wagering-status" aria-label="Текущий вейджер игрока">
              <div><span>Требуется отыграть</span><b>{money(selectedUser.wageringRequiredCredits ?? 0)}</b></div>
              <div><span>Выполнено</span><b>{money(selectedUser.wageringCompletedCredits ?? 0)}</b></div>
              <div><span>Осталось</span><b>{money(Math.max(0, (selectedUser.wageringRequiredCredits ?? 0) - (selectedUser.wageringCompletedCredits ?? 0)))}</b></div>
            </div>
            <div className="admin-wagering-picker">
              <span className="admin-wagering-picker-label">Способ изменения</span>
              <div className="admin-wagering-modes" role="group" aria-label="Способ изменения вейджера">
                {([
                  ["replace", "Заменить текущий"],
                  ["add", "Добавить сверху"],
                ] as const).map(([mode, label]) => <button
                  key={mode}
                  type="button"
                  aria-pressed={selectedWagerMode === mode}
                  className={selectedWagerMode === mode ? "is-selected" : ""}
                  onClick={() => setSelectedWagerMode(mode)}
                  disabled={adminActionPending}
                  data-testid={`button-admin-wager-mode-${mode}`}
                >{label}</button>)}
              </div>
              <span className="admin-wagering-picker-label">Расчёт от текущего баланса</span>
              <div className="admin-wagering-multipliers" role="group" aria-label="Множитель вейджера">
                {([2, 5, 10, 15, 20] as const).map((multiplier) => <button
                  key={multiplier}
                  type="button"
                  aria-pressed={selectedWagerMultiplier === multiplier}
                  className={selectedWagerMultiplier === multiplier ? "is-selected" : ""}
                  onClick={() => setSelectedWagerMultiplier(multiplier)}
                  disabled={adminActionPending || selectedUser.balance <= 0}
                  data-testid={`button-admin-wager-multiplier-${multiplier}`}
                >×{multiplier}</button>)}
              </div>
              <p>
                {selectedWagerMode === "replace"
                  ? `Новое общее требование: ${money(selectedUser.balance)} × ${selectedWagerMultiplier ?? "—"} = ${selectedWagerMultiplier ? money(calculatedWagerAmount) : "—"} кредитов. Выполненный прогресс сохраняется.`
                  : `Добавить ${selectedWagerMultiplier ? money(calculatedWagerAmount) : "—"} к ${money(currentWagerBaseRequired)} = ${selectedWagerMultiplier ? money(calculatedWagerRequirement) : "—"} кредитов общего требования.`}
              </p>
            </div>
            <label htmlFor="admin-grant-amount">Сумма для начисления или списания</label>
            <input id="admin-grant-amount" className="admin-search-input" type="number" min="1" max="50000000000000" step="1" inputMode="numeric" value={grantAmount} onChange={(event) => setGrantAmount(event.target.value)} placeholder="Введите целое число" disabled={adminActionPending} />
            <small className="admin-grant-limit">От 1 до 50 000 000 000 000 кредитов за операцию с балансом.</small>
            <label htmlFor="admin-grant-reason">Причина операции (обязательна)</label>
            <textarea id="admin-grant-reason" className="admin-search-input admin-grant-reason" rows={3} maxLength={500} value={grantReason} onChange={(event) => setGrantReason(event.target.value)} placeholder="Например: компенсация или корректировка баланса" disabled={adminActionPending} />
            <div className="admin-account-actions">
              <button className="gold-button admin-grant-button" onClick={submitGrant} disabled={!grantAmountValid || !grantReason.trim() || adminActionPending} data-testid="button-admin-grant-credits">
                {grantCredits.isPending ? "Начисляем…" : `Начислить ${grantAmountValid ? money(parsedGrantAmount) : "кредиты"}`}
              </button>
              <button className="admin-remove-button" onClick={() => { setAdminActionNotice(""); setPendingAdminAction("remove"); }} disabled={!grantAmountValid || !grantReason.trim() || adminActionPending || selectedUser.balance <= 0} data-testid="button-admin-remove-credits">
                {removeCredits.isPending ? "Списываем…" : `Снять ${grantAmountValid ? money(parsedGrantAmount) : "кредиты"}`}
              </button>
              <button className="admin-wagering-button" onClick={submitWageringRequirement} disabled={!selectedWagerMultiplier || !calculatedWagerAmountValid || !grantReason.trim() || adminActionPending} data-testid="button-admin-manage-wagering">
                {manageWageringRequirement.isPending
                  ? "Сохраняем…"
                  : selectedWagerMultiplier && calculatedWagerAmountValid
                    ? `${selectedWagerMode === "replace" ? "Заменить на" : "Добавить"} ×${selectedWagerMultiplier} · ${money(calculatedWagerAmount)}`
                    : selectedWagerMode === "replace" ? "Заменить вейджер" : "Добавить вейджер"}
              </button>
              <button className="admin-reset-level-button" onClick={() => { setAdminActionNotice(""); setPendingAdminAction("reset"); }} disabled={!grantReason.trim() || adminActionPending} data-testid="button-admin-reset-level">
                {resetPlayerLevel.isPending ? "Сбрасываем…" : "Сбросить уровень"}
              </button>
            </div>
            <small className="admin-grant-limit">В режиме замены новая цель станет общей суммой вейджера, выполненный прогресс сохранится до её уровня. В режиме добавления цель увеличится на выбранную сумму. Учитываются только завершённые ставки, разрешённые правилами вейджера.</small>
            {pendingAdminAction && <div className="admin-action-confirm" role="group" aria-label="Подтверждение административного действия">
              <b>Подтвердите действие для {selectedUser.displayName}</b>
              <p>{pendingAdminAction === "remove"
                ? `Снять ${money(Math.min(parsedGrantAmount, selectedUser.balance))} с доступного баланса? Если баланс меньше указанной суммы, он станет нулевым.`
                : "Сбросить прогресс до уровня 1 и 0 XP? Ранее полученные награды останутся полученными."}</p>
              <div className="admin-action-confirm-buttons">
                <button type="button" className="outline-button" onClick={() => setPendingAdminAction(null)} disabled={adminActionPending}>Отмена</button>
                <button type="button" className="admin-remove-button" onClick={pendingAdminAction === "remove" ? submitCreditRemoval : submitLevelReset} disabled={adminActionPending}>
                  {removeCredits.isPending || resetPlayerLevel.isPending ? "Выполняем…" : "Подтвердить"}
                </button>
              </div>
            </div>}
          </div>}
          {grantNotice && <div className={`admin-grant-notice ${grantCredits.isError ? "notice-error" : ""}`} role="status">{grantNotice}</div>}
          {adminActionNotice && <div className={`admin-grant-notice ${manageWageringRequirement.isError || removeCredits.isError || resetPlayerLevel.isError ? "notice-error" : ""}`} role="status">{adminActionNotice}</div>}
        </section>
        <section className="admin-ranking-reset panel rounded-2xl" aria-labelledby="admin-ranking-reset-title">
          <div className="section-label"><h2 id="admin-ranking-reset-title">Полный сброс игроков</h2><span className="eyebrow">ВСЕ ИГРЫ</span></div>
          <p className="admin-ranking-reset-note">Сбрасываются кредиты, уровень и XP, рейтинг, подарки, игровые достижения, награды и история игр. Telegram-аккаунт, финансовый журнал, аудит и защита от повторного использования промокодов остаются. Сброс блокируется, если у игрока есть незавершённая игра, выплата или финансовая заявка.</p>
          <div className="admin-reset-tabs" role="tablist" aria-label="Область полного сброса">
            <button id="tab-reset-all-players" type="button" role="tab" aria-selected={leaderboardResetTab === "all"} className={leaderboardResetTab === "all" ? "admin-reset-tab admin-reset-tab-active" : "admin-reset-tab"}
              onClick={() => { setLeaderboardResetTab("all"); setPendingLeaderboardReset(null); setLeaderboardResetConfirmation(""); setLeaderboardResetNotice(null); }}
              disabled={resetLeaderboard.isPending} data-testid="tab-reset-all-players">Все игроки</button>
            <button id="tab-reset-one-player" type="button" role="tab" aria-selected={leaderboardResetTab === "player"} className={leaderboardResetTab === "player" ? "admin-reset-tab admin-reset-tab-active" : "admin-reset-tab"}
              onClick={() => { setLeaderboardResetTab("player"); setPendingLeaderboardReset(null); setLeaderboardResetConfirmation(""); setLeaderboardResetNotice(null); }}
              disabled={resetLeaderboard.isPending} data-testid="tab-reset-one-player">Один игрок</button>
          </div>
          <div role="tabpanel" aria-labelledby={leaderboardResetTab === "all" ? "tab-reset-all-players" : "tab-reset-one-player"}>
            <p className="admin-ranking-reset-note">
              {leaderboardResetTab === "all"
                ? "Обнулить игровые данные каждого аккаунта. Для защиты потребуется ввести подтверждение."
                : selectedUser
                  ? `Выбран игрок: ${selectedUser.displayName}. Общие матчи останутся в истории соперников.`
                  : "Сначала найдите и выберите игрока в разделе «Игроки» выше."}
            </p>
            <div className="admin-ranking-reset-actions">
              <button type="button" className="admin-reset-level-button" onClick={() => { setLeaderboardResetNotice(null); setLeaderboardResetConfirmation(""); setPendingLeaderboardReset(leaderboardResetTab); }}
                disabled={(leaderboardResetTab === "player" && !selectedUser) || resetLeaderboard.isPending}
                data-testid={leaderboardResetTab === "all" ? "button-reset-leaderboard-all" : "button-reset-leaderboard-player"}>
                {leaderboardResetTab === "all" ? <Users size={14} /> : <UserRound size={14} />}
                {leaderboardResetTab === "all" ? "Полностью обнулить всех игроков" : "Полностью обнулить выбранного игрока"}
              </button>
            </div>
          </div>
           <div className="admin-player-block-actions">
             <div>
               <b>Доступ к аккаунту</b>
               <small>{selectedUser
                 ? selectedUser.isBlocked
                   ? "Аккаунт заблокирован. Баланс и история сохранены."
                   : "Можно запретить игроку новые игровые и платёжные действия."
                 : "Сначала найдите и выберите игрока."}</small>
             </div>
             <button
               type="button"
               className={selectedUser?.isBlocked ? "admin-reset-level-button" : "admin-remove-button"}
               onClick={() => {
                 if (!selectedUser) return;
                 setPlayerBlockNotice(null);
                 setPendingPlayerBlock(!selectedUser.isBlocked);
               }}
               disabled={!selectedUser || setPlayerBlock.isPending}
               data-testid="button-admin-toggle-player-block"
             >
               {setPlayerBlock.isPending
                 ? "Обновляем…"
                 : selectedUser?.isBlocked ? "Разблокировать игрока" : "Заблокировать игрока"}
             </button>
           </div>
           {pendingPlayerBlock !== null && selectedUser && <div className="admin-ranking-confirm" role="group" aria-label="Подтверждение блокировки игрока">
             <b>{pendingPlayerBlock ? `Заблокировать ${selectedUser.displayName}?` : `Разблокировать ${selectedUser.displayName}?`}</b>
             <p>{pendingPlayerBlock
               ? "Новые ставки, покупки, переводы, подарки и активация промокодов будут запрещены. Баланс, аккаунт и история останутся."
               : "Игрок снова сможет выполнять игровые и платёжные действия."}</p>
             <div className="admin-action-confirm-buttons">
               <button type="button" className="outline-button" onClick={() => setPendingPlayerBlock(null)} disabled={setPlayerBlock.isPending}>Отмена</button>
               <button type="button" className={pendingPlayerBlock ? "admin-remove-button" : "gold-button"} onClick={submitPlayerBlock} disabled={setPlayerBlock.isPending} data-testid="button-confirm-player-block">
                 {setPlayerBlock.isPending ? "Обновляем…" : pendingPlayerBlock ? "Подтвердить блокировку" : "Подтвердить разблокировку"}
               </button>
             </div>
           </div>}
           {playerBlockNotice && <div className={`admin-grant-notice ${playerBlockNotice.error ? "notice-error" : ""}`} role={playerBlockNotice.error ? "alert" : "status"} data-testid="status-player-block">{playerBlockNotice.text}</div>}
           {pendingLeaderboardReset && <div className="admin-ranking-confirm" role="group" aria-label="Подтверждение полного сброса">
             <b>{pendingLeaderboardReset === "all" ? "Полностью обнулить игровые данные всех игроков?" : `Полностью обнулить игрока ${selectedUser?.displayName ?? ""}?`}</b>
             <p>{pendingLeaderboardReset === "all"
               ? "Будут удалены игровые записи, достижения, подарки, уровни и кредиты всех игроков. Сохранятся Telegram-аккаунты, финансовый журнал, блокировки, административный аудит и отметки о промокодах. Незавершённые игры и заявки не дадут выполнить сброс."
               : "Будут обнулены кредиты, уровень, рейтинг, подарки и игровая история выбранного игрока. История общего Set/Duel останется у соперника. Финансовый журнал, аккаунт и защита от повторной активации промокода сохранятся."}</p>
             {pendingLeaderboardReset === "all" && <>
               <label className="admin-reset-confirm-label" htmlFor="admin-reset-all-confirmation">Введите СБРОСИТЬ ВСЁ для подтверждения</label>
               <input id="admin-reset-all-confirmation" className="admin-search-input" value={leaderboardResetConfirmation}
                 onChange={(event) => setLeaderboardResetConfirmation(event.target.value)} autoComplete="off"
                 placeholder="СБРОСИТЬ ВСЁ" disabled={resetLeaderboard.isPending} data-testid="input-reset-all-confirmation" />
             </>}
            <div className="admin-action-confirm-buttons">
               <button type="button" className="outline-button" onClick={() => { setPendingLeaderboardReset(null); setLeaderboardResetConfirmation(""); }} disabled={resetLeaderboard.isPending} data-testid="button-cancel-leaderboard-reset">Отмена</button>
               <button type="button" className="admin-remove-button" onClick={submitLeaderboardReset}
                 disabled={resetLeaderboard.isPending || (pendingLeaderboardReset === "player" && !selectedUser) || (pendingLeaderboardReset === "all" && leaderboardResetConfirmation.trim() !== "СБРОСИТЬ ВСЁ")}
                 data-testid="button-confirm-leaderboard-reset">
                 {resetLeaderboard.isPending ? "Обнуляем…" : "Подтвердить полный сброс"}
              </button>
            </div>
          </div>}
          {resetLeaderboard.isPending && <div className="admin-ranking-progress" role="status">Обнуляем игровые показатели…</div>}
          {leaderboardResetNotice && <div className={`admin-grant-notice ${leaderboardResetNotice.error ? "notice-error" : ""}`} role={leaderboardResetNotice.error ? "alert" : "status"} data-testid="status-leaderboard-reset">{leaderboardResetNotice.text}</div>}
        </section>
      </div>}

      {activeSection === "promos" && <div className="admin-promo-view">
        <header className="admin-section-intro"><div><span className="eyebrow">ВОЗНАГРАЖДЕНИЯ И ПРОВЕРКА</span><h2>Промокоды</h2></div><p>Настройка отдельных наград игроку и владельцу, плюс аудит каждой активации.</p></header>
        <AdminPromoCodes />
      </div>}

      {activeSection === "games" && <div className="admin-games-view">
        <header className="admin-section-intro"><div><span className="eyebrow">ДОСТУПНОСТЬ</span><h2>Игры и стол</h2></div><p>Управляйте только приёмом ставок. Вероятности и множители задаются вне этой панели.</p></header>
        <div className="admin-games-subtabs" role="group" aria-label="Настройки доступности">
          <button type="button" aria-pressed={gameAdminTab === "games"} className={gameAdminTab === "games" ? "is-active" : ""}
            onClick={() => setGameAdminTab("games")} data-testid="tab-admin-game-list">Все игры</button>
          <button type="button" aria-pressed={gameAdminTab === "table"} className={gameAdminTab === "table" ? "is-active" : ""}
            onClick={() => setGameAdminTab("table")} data-testid="tab-admin-game-table">Общий стол</button>
        </div>
        {gameAdminTab === "games" ? <>
          {gameAvailabilityNotice && <div className={`admin-game-availability-notice${gameAvailabilityNotice.error ? " notice-error" : ""}`}
            role={gameAvailabilityNotice.error ? "alert" : "status"} data-testid="status-game-availability">
            {gameAvailabilityNotice.text}
          </div>}
          {gameAvailability.isPending ? <LoadingBlock /> : gameAvailability.isError || !gameAvailability.data
            ? <div className="inline-error" role="alert">Не удалось загрузить список игр. Обновите страницу и попробуйте снова.</div>
            : <section className="admin-game-list panel rounded-2xl">
              <p className="admin-game-copy">Переключатель «Игра» управляет доступностью. «Вейджер» отдельно включает или выключает учёт ставок для каждой игры.</p>
              {(["mini_app", "telegram"] as const).map((source) => {
                const games = gameAvailability.data.games.filter((game: any) => game.source === source);
                if (!games.length) return null;
                return <div className="admin-game-group" key={source}>
                  <h3>{source === "mini_app" ? "Мини-приложение" : "Игры в Telegram"}</h3>
                  {games.map((game: any) => {
                    const status = game.note
                      ?? (!game.enabled ? "Выключена"
                        : source === "mini_app" && !gameAvailability.data?.globalEnabled ? "Общий стол на паузе"
                          : game.available ? (source === "mini_app" ? "Доступна игрокам" : "Доступна в Telegram")
                            : "Недоступна игрокам");
                    return <div className={`admin-game-row${game.available ? "" : " is-unavailable"}`} key={game.id}>
                      <div className="admin-game-row-copy">
                        <b>{game.name}</b>
                        <small>{status}</small>
                      </div>
                      <div className="admin-game-switch-controls">
                        <div className="admin-game-switch-control">
                          <small>Игра</small>
                          <button type="button" role="switch" aria-label={`${game.enabled ? "Выключить" : "Включить"} игру ${game.name}`}
                            aria-checked={game.enabled} disabled={updateGameAvailability.isPending}
                            onClick={() => setGameAvailabilityEnabled(game, !game.enabled)}
                            data-testid={`button-toggle-admin-game-${game.id}`}
                            className={`switch ${game.enabled ? "switch-on" : ""}`}><span /></button>
                        </div>
                        <div className="admin-game-switch-control">
                          <small>Вейджер</small>
                          <button type="button" role="switch" aria-label={`${game.wageringEnabled ? "Выключить" : "Включить"} учёт вейджера для игры ${game.name}`}
                            aria-checked={game.wageringEnabled} disabled={updateGameWageringAvailability.isPending}
                            onClick={() => setGameWageringEnabled(game, !game.wageringEnabled)}
                            data-testid={`button-toggle-admin-wager-${game.id}`}
                            className={`switch ${game.wageringEnabled ? "switch-on" : ""}`}><span /></button>
                        </div>
                      </div>
                    </div>;
                  })}
                </div>;
              })}
              <div className="admin-game-group">
                <h3>Переводы между игроками</h3>
                <p className="admin-game-copy">Управляет переводами кредитов и в мини-приложении, и в Telegram.</p>
                <div className={`admin-game-row${gameAvailability.data.transferEnabled ? "" : " is-unavailable"}`}>
                  <div className="admin-game-row-copy">
                    <b>Переводы кредитов игрокам</b>
                    <small>{gameAvailability.data.transferEnabled ? "Разрешены" : "Выключены"}</small>
                  </div>
                  <button type="button" role="switch"
                    aria-label={`${gameAvailability.data.transferEnabled ? "Выключить" : "Включить"} переводы кредитов игрокам`}
                    aria-checked={gameAvailability.data.transferEnabled}
                    disabled={updateTransferAvailability.isPending}
                    onClick={() => setTransferAvailabilityEnabled(!gameAvailability.data.transferEnabled)}
                    data-testid="button-toggle-admin-transfers"
                    className={`switch ${gameAvailability.data.transferEnabled ? "switch-on" : ""}`}><span /></button>
                </div>
              </div>
            </section>}
        </> : !form ? <LoadingBlock /> : <section className="admin-config admin-game-availability panel rounded-2xl">
          <div className="admin-game-status-mark"><span className={form.gameEnabled ? "is-open" : "is-paused"}><Gamepad2 size={18} /></span>
            <div><p className="eyebrow">ОБЩАЯ ИГРОВАЯ КОНФИГУРАЦИЯ</p><h2>{form.gameEnabled ? "Игровой стол открыт" : "Игровой стол на паузе"}</h2></div>
          </div>
          <p className="admin-game-copy">Общая пауза действует на игры мини-приложения. Настройки отдельных игр доступны во вкладке «Все игры».</p>
          <div className="admin-switch-row"><div><b>Приём ставок</b><span>Открыть или временно приостановить игровой стол.</span></div><button type="button" role="switch" aria-label="Приём ставок" aria-checked={form.gameEnabled} onClick={() => setForm({ ...form, gameEnabled: !form.gameEnabled })} data-testid="button-toggle-game" className={`switch ${form.gameEnabled ? 'switch-on' : ''}`}><span /></button></div>
          <div className="admin-actions"><span className="demo-admin-note"><Info size={14} /> Другие параметры игры недоступны для изменения здесь.</span><button onClick={submit} disabled={configPending || !cfg} data-testid="button-save-config" className="gold-button">{configPending ? 'Сохраняем…' : 'Сохранить состояние'} <ArrowRight size={14} /></button></div>
          {configError && <div className="inline-error" role="alert">Состояние игры не сохранено. Повторите попытку.</div>}
          {updateMessage(configPending)}
        </section>}
      </div>}

      {activeSection === "audit" && <div className="admin-audit-view">
        <header className="admin-section-intro"><div><span className="eyebrow">ИСТОРИЯ ИГР И ДЕЙСТВИЙ</span><h2>Журнал</h2></div><p>Ставки, операции с балансом, заявки и действия администраторов.</p></header>
        <div className="admin-audit-subtabs" role="group" aria-label="Разделы журнала">
          <button type="button" aria-pressed={auditTab === "actions"} className="admin-audit-subtab"
            onClick={() => setAuditTab("actions")} data-testid="tab-admin-journal-actions">Действия</button>
          <button type="button" aria-pressed={auditTab === "players"} className="admin-audit-subtab"
            onClick={() => setAuditTab("players")} data-testid="tab-admin-journal-players">Игроки</button>
          <button type="button" aria-pressed={auditTab === "financial"} className="admin-audit-subtab"
            onClick={() => setAuditTab("financial")} data-testid="tab-admin-journal-financial">Финансы</button>
        </div>
        {auditTab === "actions" ? <AdminActionLog />
          : auditTab === "players" ? <AdminJournalPlayerHistory />
            : <AdminFinancialOperations />}
      </div>}

      {activeSection === "settings" && <div className="admin-settings-view">
        <header className="admin-section-intro"><div><span className="eyebrow">ПОДКЛЮЧЕНИЕ TELEGRAM</span><h2>Настройки</h2></div><p>Управление точкой входа Mini App для пользователей бота.</p></header>
        <section className="admin-telegram panel rounded-2xl">
          <div><p className="eyebrow">TELEGRAM MINI APP</p><h2>Кнопка меню в боте</h2>
            <span>Откройте DARK ACE с опубликованного HTTPS-адреса и настройте кнопку. Telegram установит эту страницу как меню приложения для всех пользователей.</span>
          </div>
          <button className="outline-button" onClick={configureTelegramMenu} disabled={telegramMenu.isPending} data-testid="button-configure-telegram-menu">
            {telegramMenu.isPending ? "Подключаем…" : "Настроить меню бота"}
          </button>
          {telegramMenuNotice && <p className={`admin-telegram-notice ${telegramMenu.isError ? "notice-error" : ""}`} role="status">{telegramMenuNotice}</p>}
        </section>
        <AdminCryptoTopups />
      </div>}
    </div>
    </div>
  </div>;
}
function updateMessage(pending: boolean) {
  return pending ? <div className="admin-saving" aria-live="polite">Сохраняем настройки стола…</div> : null;
}

function Router() {
  return <RoutedErrorBoundary><AppData /></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><PlayerProfileOverlayProvider><Router /></PlayerProfileOverlayProvider></WouterRouter></TooltipProvider></QueryClientProvider>;
}
export default App;
