import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Coins,
  Crown,
  CircleDot,
  Dices,
  Flame,
  Gift,
  Heart,
  Radio,
  Spade,
  Sparkles,
  ShieldCheck,
  Clock3,
  Star,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  getGetDarkAceGameAvailabilityQueryKey,
  getGetDarkAceHomeDailyPlayersQueryKey,
  getGetDarkAceDailyQuestsQueryKey,
  useGetDarkAceGameAvailability,
  useGetDarkAceHomeDailyPlayers,
  useGetDarkAceDailyQuests,
} from "@workspace/api-client-react";
import { getDarkAceBotUrl, openDarkAceBotUrl } from "./telegram-bot-links";
import "./HomeHubPage.css";

const currencyFormat = new Intl.NumberFormat("ru-RU");
const playerCountFormat = new Intl.NumberFormat("ru-RU", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});
const COMMUNITY_GROUP_URL = "https://t.me/darkacecommunity";

type HomeHubPageProps = { bootstrap?: any; wallet?: { balance?: number | string }; topupBotUrl?: string | null };

const gameCatalog = [
  { name: "Высшая карта", note: "Игрок против банкира", tone: "high-card", icon: Spade, image: "/games/high-card.svg", mode: "high-card" },
  { name: "Upgrade", note: "Улучши подарок", tone: "upgrade", icon: Crown, image: "/games/upgrade.webp", mode: "upgrade" },
  { name: "Crash", note: "Поймай момент", tone: "crash", icon: Zap, image: "/games/crash.webp", mode: "crash" },
  { name: "Лента", note: "Общая классическая рулетка", tone: "roulette-dc", icon: Coins, image: "/games/lenta.webp", mode: "roulette-dc" },
  { name: "Фрукты", note: "Время удачи", tone: "fruits", icon: Sparkles, image: "/games/fruits.webp", mode: "fruits" },
  { name: "DICE", note: "Брось кости", tone: "dice", icon: Dices, image: "/games/dice.svg", mode: "dice" },
  { name: "Blackjack", note: "За столом DARK ACE", tone: "blackjack", icon: Spade, image: "/games/blackjack.webp", mode: "blackjack" },
  { name: "Plinko", note: "Выбери риск и путь", tone: "plinko", icon: CircleDot, image: "/games/plinko.svg", mode: "plinko" },
  { name: "Европейская рулетка", note: "37 секторов · одиночный ноль", tone: "european-roulette", icon: CircleDot, image: "/games/european-roulette.webp", mode: "roulette" },
] as const;
const games = gameCatalog;
const clubGames = games.filter((game) => game.mode !== "roulette-dc");
const HOME_GAME_STORAGE_KEY = "dark-ace-home-game-preferences-v1";

type HomeGamePreferences = { favorites: string[]; recent: string[] };

function readGamePreferences(): HomeGamePreferences {
  if (typeof window === "undefined") return { favorites: [], recent: [] };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HOME_GAME_STORAGE_KEY) ?? "{}") as Partial<HomeGamePreferences>;
    return {
      favorites: Array.isArray(parsed.favorites)
        ? parsed.favorites.filter((mode): mode is string => typeof mode === "string" && games.some((game) => game.mode === mode))
        : [],
      recent: Array.isArray(parsed.recent)
        ? parsed.recent.filter((mode): mode is string => typeof mode === "string" && games.some((game) => game.mode === mode)).slice(0, 8)
        : [],
    };
  } catch {
    return { favorites: [], recent: [] };
  }
}

function formatBalance(value?: number) {
  return `${currencyFormat.format(value ?? 0)} кредитов`;
}

function formatGameCount(count: number) {
  const category = new Intl.PluralRules("ru").select(count);
  const noun = category === "one" ? "игра" : category === "few" ? "игры" : "игр";
  return `${count} ${noun}`;
}

function formatPlayerCount(count: number) {
  return playerCountFormat.format(count);
}

function openTelegramCommunity() {
  const telegram = (window as Window & {
    Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } };
  }).Telegram?.WebApp;
  if (telegram?.openTelegramLink) {
    telegram.openTelegramLink(COMMUNITY_GROUP_URL);
    return;
  }
  window.open(COMMUNITY_GROUP_URL, "_blank", "noopener,noreferrer");
}

export default function HomeHubPage({ bootstrap, wallet, topupBotUrl: configuredTopupBotUrl }: HomeHubPageProps) {
  const topupBotUrl = getDarkAceBotUrl(configuredTopupBotUrl, "da_topup");
  const withdrawalBotUrl = getDarkAceBotUrl(configuredTopupBotUrl, "da_withdraw");
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [gamePreferences, setGamePreferences] = useState<HomeGamePreferences>(readGamePreferences);
  const [gameFilter, setGameFilter] = useState<"all" | "favorites" | "recent">("all");
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const dailyReward = bootstrap?.dailyReward;
  const gameAvailabilityQuery = useGetDarkAceGameAvailability({
    query: {
      queryKey: getGetDarkAceGameAvailabilityQueryKey(),
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  });
  const questsQuery = useGetDarkAceDailyQuests({
    query: {
      queryKey: getGetDarkAceDailyQuestsQueryKey(),
      staleTime: 20_000,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  });
  const dailyPlayersQuery = useGetDarkAceHomeDailyPlayers({
    query: {
      queryKey: getGetDarkAceHomeDailyPlayersQueryKey(),
      staleTime: 60_000,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  });
  useEffect(() => {
    if (!walletMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!walletMenuRef.current?.contains(event.target as Node)) setWalletMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [walletMenuOpen]);
  const quests = questsQuery.data;
  const dailyPlayers = dailyPlayersQuery.data?.games;
  const playersInLast24Hours = (mode: string) => {
    const responseMode = mode === "european-roulette" ? "roulette" : mode;
    const count = dailyPlayers?.[responseMode as keyof typeof dailyPlayers];
    return typeof count === "number" ? count : null;
  };
  const featuredDailyPlayers = playersInLast24Hours("roulette-dc");
  const readyCount = quests?.readyCount ?? 0;
  const totalQuests = quests?.quests.length ?? 6;
  const streak = quests?.currentStreak ?? dailyReward?.streak ?? 0;
  const rewardAvailable = dailyReward?.available === true;
  const availableModeIds = new Set<string>(
    gameAvailabilityQuery.data?.games.filter((game) => game.available).map((game) => game.id) ?? [],
  );
  const isGameAvailable = (mode: string) => availableModeIds.has(mode === "roulette" ? "european-roulette" : mode);
  const playableGames = gameAvailabilityQuery.isSuccess ? games.filter((game) => isGameAvailable(game.mode)) : [];
  const playableClubGames = playableGames.filter((game) => game.mode !== "roulette-dc");
  const featuredGameAvailable = gameAvailabilityQuery.isSuccess && isGameAvailable("roulette-dc");
  const favoriteModes = new Set(gamePreferences.favorites);
  const visibleGames = gameFilter === "favorites"
    ? playableGames.filter((game) => favoriteModes.has(game.mode))
    : gameFilter === "recent"
      ? gamePreferences.recent.flatMap((mode) => {
        const game = playableGames.find((item) => item.mode === mode);
        return game ? [game] : [];
      })
      : playableClubGames;

  function saveGamePreferences(next: HomeGamePreferences) {
    setGamePreferences(next);
    try {
      window.localStorage.setItem(HOME_GAME_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The in-memory selection remains usable when browser storage is unavailable.
    }
  }

  function recordGameOpen(mode: string) {
    saveGamePreferences({
      ...gamePreferences,
      recent: [mode, ...gamePreferences.recent.filter((item) => item !== mode)].slice(0, 8),
    });
  }

  function toggleFavorite(mode: string) {
    const favorites = favoriteModes.has(mode)
      ? gamePreferences.favorites.filter((item) => item !== mode)
      : [...gamePreferences.favorites, mode];
    saveGamePreferences({ ...gamePreferences, favorites });
  }

  return (
    <div className="home-hub-page" data-testid="page-home-hub">
      <div className="hub-topbar">
        <button
          type="button"
          className="hub-community-banner"
          aria-label="Открыть Telegram-сообщество DARK ACE"
          onClick={openTelegramCommunity}
          data-testid="button-home-community"
        >
          <span className="hub-community-icon" aria-hidden="true"><Users size={15} /></span>
          <span className="hub-community-copy"><b>Сообщество DARK ACE</b></span>
        </button>
        <div className="hub-wallet-wrap" ref={walletMenuRef}>
          <button
            type="button"
            className="hub-wallet-trigger"
            aria-label={`Баланс ${formatBalance(Number(wallet?.balance ?? 0))}. Открыть операции`}
            aria-haspopup="menu"
            aria-expanded={walletMenuOpen}
            aria-controls="hub-wallet-menu"
            onClick={() => setWalletMenuOpen((open) => !open)}
            data-testid="button-home-wallet"
          >
            <Coins size={14} aria-hidden="true" />
            <span>
              <small>ВАШ БАЛАНС</small>
              <b>{currencyFormat.format(Number(wallet?.balance ?? 0))}<em>кр.</em></b>
            </span>
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          {walletMenuOpen && <div id="hub-wallet-menu" className="hub-wallet-menu" role="menu" aria-label="Операции с балансом">
            <div className="hub-wallet-menu-balance">{formatBalance(Number(wallet?.balance ?? 0))}</div>
            <a href={topupBotUrl ?? undefined} role="menuitem" aria-disabled={!topupBotUrl} onClick={(event) => {
              event.preventDefault();
              setWalletMenuOpen(false);
              openDarkAceBotUrl(topupBotUrl);
            }} data-testid="button-home-wallet-topup">Пополнить</a>
            <a href={withdrawalBotUrl ?? undefined} role="menuitem" aria-disabled={!withdrawalBotUrl} onClick={(event) => {
              event.preventDefault();
              setWalletMenuOpen(false);
              openDarkAceBotUrl(withdrawalBotUrl);
            }} data-testid="button-home-wallet-withdraw">Вывести</a>
          </div>}
        </div>
      </div>
      <header className="hub-greeting">
        <div className="hub-greeting-topline">
          <div className="hub-overline"><i /> ДОБРО ПОЖАЛОВАТЬ В КЛУБ</div>
        </div>
        <h1>Ваш следующий ход.</h1>
        <p>Выберите игру и проверьте, что приготовил сегодня клуб.</p>
        <p className="hub-durak-note">Зарабатывай кредиты и выводи их в игру «Дурак Онлайн».</p>
      </header>

      {featuredGameAvailable && <Link
        href="/play?mode=roulette-dc"
        className="hub-roulette-card"
        aria-label="Открыть игру Лента"
        onClick={() => recordGameOpen("roulette-dc")}
        data-testid="link-home-roulette"
      >
        <span className="hub-hero-copy">
          <span className="hub-hero-label"><Radio size={11} /> ИГРА МОМЕНТА</span>
          <strong>Лента</strong>
          <span className="hub-hero-description">Классика закрытого стола.<br />Ваш выбор — ваша ставка.</span>
          <span className="hub-play-button">Открыть игру <ArrowRight size={13} /></span>
        </span>
        <span className="hub-reel-stage" aria-hidden="true">
          <span className="hub-reel-glow" />
          <span className="hub-reel-window">
            <span className="hub-reel-strip">
              <i className="hub-reel-cell black">♣</i>
              <i className="hub-reel-cell red">♦</i>
              <i className="hub-reel-cell black">♣</i>
              <i className="hub-reel-cell coin"><Coins size={20} /></i>
              <i className="hub-reel-cell red">♦</i>
              <i className="hub-reel-cell black">♣</i>
            </span>
            <span className="hub-reel-indicator" />
          </span>
        </span>
        <span className="hub-game-online hub-activity-count hub-hero-online"
          title={dailyPlayersQuery.isError ? "Не удалось загрузить число игроков" : "Уникальные игроки"}
          data-testid="activity-home-roulette-dc">
          <i aria-hidden="true" />{featuredDailyPlayers === null ? "…" : formatPlayerCount(featuredDailyPlayers)}
          <span className="sr-only"> уникальных игроков</span>
        </span>
      </Link>}

      <section className="hub-section" aria-labelledby="hub-games-title">
        <div className="hub-section-heading">
          <h2 id="hub-games-title">Игры клуба</h2><span>{formatGameCount(visibleGames.length)}</span>
        </div>
        <div className="hub-game-filters" role="group" aria-label="Фильтр игр">
          <button type="button" aria-pressed={gameFilter === "all"} onClick={() => setGameFilter("all")}
            data-testid="button-home-games-all">Все</button>
          <button type="button" aria-pressed={gameFilter === "favorites"} onClick={() => setGameFilter("favorites")}
            data-testid="button-home-games-favorites"><Star size={12} /> Избранные</button>
          <button type="button" aria-pressed={gameFilter === "recent"} onClick={() => setGameFilter("recent")}
            data-testid="button-home-games-recent"><Clock3 size={12} /> Недавние</button>
        </div>
        <div className="hub-game-list">
          {visibleGames.map(({ name, note, tone, icon: Icon, image, mode }) => {
            const isFavorite = favoriteModes.has(mode);
            const dailyPlayerCount = playersInLast24Hours(mode);
            return <div className="hub-game-card-wrap" key={mode}>
              <Link
                href={mode === "blackjack" ? "/blackjack" : mode === "dice" ? "/dice" : `/play?mode=${mode}`}
                className={`hub-game-tile ${tone}`}
                onClick={() => recordGameOpen(mode)}
                data-testid={`link-home-game-${mode}`}
              >
                <span className="hub-game-symbol"><Icon size={14} /></span>
                <img
                  className="hub-game-art"
                  src={image}
                  alt=""
                  aria-hidden="true"
                  width={640}
                  height={420}
                  loading="lazy"
                  decoding="async"
                />
                <span className="hub-game-copy">
                  <b>{name}</b>
                  <small>{note}</small>
                </span>
                <span className="hub-game-online hub-activity-count"
                  title={dailyPlayersQuery.isError ? "Не удалось загрузить число игроков" : "Уникальные игроки"}
                  data-testid={`activity-home-${mode}`}>
                  <i aria-hidden="true" />{dailyPlayerCount === null ? "…" : formatPlayerCount(dailyPlayerCount)}
                  <span className="sr-only"> уникальных игроков</span>
                </span>
              </Link>
              <button type="button" className={`hub-game-favorite${isFavorite ? " is-favorite" : ""}`}
                aria-label={isFavorite ? `Убрать ${name} из избранного` : `Добавить ${name} в избранное`}
                aria-pressed={isFavorite} onClick={() => toggleFavorite(mode)}
                data-testid={`button-home-favorite-${mode}`}>
                <Heart size={14} fill={isFavorite ? "currentColor" : "none"} />
              </button>
            </div>;
          })}
        </div>
        {gameAvailabilityQuery.isError && <p className="hub-games-empty" role="alert" data-testid="error-home-game-availability">
          Не удалось загрузить доступность игр. Обновите страницу и попробуйте ещё раз.
        </p>}
        {gameAvailabilityQuery.isPending && <p className="hub-games-empty" role="status">Загружаем список игр…</p>}
        {gameAvailabilityQuery.isSuccess && visibleGames.length === 0 && <p className="hub-games-empty" role="status">
          {playableGames.length === 0
              ? "Сейчас нет доступных игр."
              : gameFilter === "favorites"
                ? "Пока нет избранных игр. Нажмите на сердечко в карточке игры, чтобы добавить её."
                : gameFilter === "recent"
                  ? "Недавно открытые игры появятся здесь после первого запуска."
                  : "В этом разделе пока нет игр."}
        </p>}
        <Link href="/fairness" className="hub-fairness-link" data-testid="link-home-fairness">
          <span className="hub-fairness-mark"><ShieldCheck size={16} /></span>
          <span><b>Честность</b><small>Как сервер определяет результаты игр</small></span>
          <ChevronRight className="hub-fairness-arrow" size={15} aria-hidden="true" />
        </Link>
      </section>

      <section className="hub-section hub-streak-section" aria-labelledby="hub-today-title">
        <div className="hub-section-heading">
          <h2 id="hub-today-title">Ежедневные задания</h2><span>вход · серия · награды</span>
        </div>
        <Link href="/daily-quests" className="hub-entry-card reward" data-testid="link-home-daily-quests">
          <Gift className="hub-reward-stamp" size={66} strokeWidth={1} />
          <span className="hub-entry-icon"><Flame size={16} /></span>
          <span className="hub-entry-copy">
            <b>Бонус за вход и задания</b>
            <small className={questsQuery.isError && !quests ? "hub-query-error" : "hub-task-count"}>
              {rewardAvailable
                ? `Бонус ${formatBalance(dailyReward?.amount)} · ${readyCount} из ${totalQuests} готовы`
                : `${streak} ${streak === 1 ? "день" : "дней"} серии · ${readyCount} из ${totalQuests} готовы`}
            </small>
            <span className="hub-task-progress">
              <i style={{ width: `${quests ? Math.min(100, (readyCount / Math.max(1, totalQuests)) * 100) : 0}%` }} />
            </span>
          </span>
          <ChevronRight className="hub-entry-arrow" size={14} />
        </Link>
      </section>
    </div>
  );
}
