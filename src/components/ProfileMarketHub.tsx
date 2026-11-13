import { apiUrl } from "@/lib/api-base";
import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { CRYPTO_TOPUP_CREDIT_AMOUNTS } from "@workspace/api-zod";
import { formatCredits } from "@/lib/currency-format";
import {
  Activity, AlertCircle, ArrowLeft, ArrowUpRight, Check, ChevronRight, CircleHelp, Flame,
  Coins, Copy, Crown, Gift, LockKeyhole, RefreshCw, ShieldCheck, Sparkles,
  Share2, Ticket, UserRound, Users, X, UserPlus, UserMinus,
} from "lucide-react";
import {
  getGetDarkAceBootstrapQueryKey,
  getGetDarkAceGameAvailabilityQueryKey,
  getGetDarkAceGiftCatalogQueryKey,
  getGetDarkAceGiftInventoryQueryKey,
  getGetDarkAceFriendsQueryKey,
  getGetDarkAceOwnProfileQueryKey,
  getGetDarkAcePublicProfileQueryKey,
  getGetDarkAcePublicGiftCollectionQueryKey,
  getGetDarkAcePromoSummaryQueryKey,
  getGetDarkAceShopQueryKey,
  getGetDarkAceCryptoTopupAvailabilityQueryKey,
  getGetDarkAceTransferQuoteQueryKey,
  getListDarkAceTransactionsQueryKey,
  useGetDarkAceFriends,
  useGetDarkAceGameAvailability,
  useGetDarkAceBootstrap,
  useGetDarkAcePromoSummary,
  useCreateDarkAcePromo,
  useRedeemDarkAcePromo,
  useCreateDarkAceFriendRequest,
  useAcceptDarkAceFriendRequest,
  useRemoveDarkAceFriendRequest,
  useRemoveDarkAceFriend,
  useSendDarkAceFriendGift,
  useGetDarkAceGiftCatalog,
  getGetDarkAceGiftRecipientsQueryKey,
  getGetDarkAceGiftSentQueryKey,
  useGetDarkAceGiftRecipients,
  useGetDarkAceGiftSent,
  useSendDarkAceGiftToPlayer,
  useGetDarkAceGiftInventory,
  useCreateDarkAceGiftPurchase,
  useSellDarkAceGiftToShop,
  useSendDarkAceOwnedGiftToPlayer,
  useCreateDarkAceShopInvoice,
  useCancelDarkAceShopPurchase,
  useCreateDarkAceTransfer,
  useGetDarkAceOwnProfile,
  useGetDarkAcePublicProfile,
  useGetDarkAcePublicGiftCollection,
  useGetDarkAceShop,
  useGetDarkAceCryptoTopupAvailability,
  useGetDarkAceShopPurchase,
  useGetDarkAceTransferQuote,
  useUpdateDarkAceProfile,
  useCreateDarkAceSupportReport,
} from "@workspace/api-client-react";
import type {
  DarkAceFriend,
  DarkAceGiftCatalogEntry,
  DarkAceGiftInventoryEntry,
  DarkAceProfileStat,
  DarkAcePublicProfile,
  GetDarkAceTransferQuoteParams,
  DarkAceSupportReportInput,
} from "@workspace/api-client-react";
import AdminPlayerGameHistory from "@/components/admin/AdminPlayerGameHistory";
import { MAX_DURAK_WITHDRAWAL_AMOUNT, MIN_DURAK_WITHDRAWAL_AMOUNT, parseDurakWholeAmount } from "../lib/durak-amount";
import { getGiftArtworkPath } from "../lib/gift-art";
import { getPromoDeviceToken } from "../lib/promo-device-token";
import { SUPPORT_URL } from "@/lib/support";
import "./ProfileMarketHub.css";
import "./ProfileSupportReport.css";
import { isPublicPlayerId, useOpenPlayerProfile } from "@/components/player-profile-context";

type ProfileTab = "overview" | "gifts" | "more" | "stats" | "history" | "support" | "friends";
type PublicProfileTab = "overview" | "gifts" | "stats";
const supportGameOptions: { value: DarkAceSupportReportInput["game"]; label: string }[] = [
  { value: "roulette_do", label: "Рулетка ДО" },
  { value: "european_roulette", label: "Европейская рулетка" },
  { value: "legacy_roulette", label: "Старая рулетка" },
  { value: "dice", label: "DICE" },
  { value: "group_dice", label: "Кубики в Telegram" },
  { value: "fruits", label: "Фрукты" },
  { value: "high_card", label: "Высшая карта" },
  { value: "plinko", label: "Plinko" },
  { value: "crash", label: "Crash" },
  { value: "blackjack", label: "Blackjack" },
  { value: "battle", label: "Баттл" },
  { value: "upgrade", label: "UPGRADE" },
  { value: "x_rush", label: "X-RUSH" },
];
type MarketTab = "stars" | "durak" | "crypto";
type GiftCategory = "all" | "simple" | "romantic" | "wealth" | "luxury" | "dark_ace" | "characters" | "cosmos" | "technology" | "collectibles" | "epic" | "luxury_queen";
type GiftRarity = DarkAceGiftCatalogEntry["rarity"];
const numberFormat = new Intl.NumberFormat("ru-RU");

function getPromoErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (typeof data === "object" && data !== null && "error" in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === "string") return message;
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
const credits = formatCredits;
const formatCompactCredits = (value: number) => value >= 1_000_000
  ? `${numberFormat.format(value / 1_000_000)}м`
  : `${numberFormat.format(value / 1_000)}к`;
const giftDate = (value: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const giftImages = import.meta.glob("../assets/gifts/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const giftSeed = (giftId: string) => {
  const catalogNumber = Number(giftId.match(/(\d+)$/)?.[1] ?? 0);
  return catalogNumber > 0
    ? (catalogNumber * 137) % 360
    : Array.from(giftId).reduce((seed, character) => (seed * 33 + character.charCodeAt(0)) % 360, 29);
};
const giftSeedStyle = (giftId: string) => {
  const seed = giftSeed(giftId);
  const catalogNumber = Number(giftId.match(/(\d+)$/)?.[1] ?? 0);
  const delayMilliseconds = catalogNumber > 0 ? (catalogNumber * 37) % 9_000 : seed * 25;
  return {
    "--gift-seed": `${seed}deg`,
    "--gift-effect-delay": `-${delayMilliseconds}ms`,
    "--gift-effect-hue": `${seed}`,
  } as CSSProperties;
};
const giftEffectTheme = (giftId: string) => {
  const number = Number(giftId.match(/(\d+)$/)?.[1] ?? 0);
  if ([18, 22, 24, 31, 34, 44, 50].includes(number)) return "flame";
  if ([10, 19, 21, 28, 37].includes(number)) return "diamond";
  if ([6, 14, 15, 17, 23, 26, 29, 40, 48].includes(number)) return "shadow";
  if ([32, 33, 38, 39, 47, 49].includes(number)) return "cosmos";
  if ([2, 7, 13, 16, 20, 30, 35, 36, 41, 45, 46].includes(number)) return "royal";
  if ([9, 27, 43].includes(number)) return "nature";
  const themes = ["arcane", "aurora", "steel", "royal", "cosmos", "diamond"] as const;
  return themes[giftSeed(giftId) % themes.length];
};
const giftEffectClass = (giftId: string) => `gift-effect-${giftEffectTheme(giftId)}`;
const giftRarityLabels: Record<GiftRarity, string> = {
  common: "Обычный", uncommon: "Необычный", rare: "Редкий", epic: "Эпический", legendary: "Легендарный", mythic: "Мифический",
};
const giftImage = (giftId: string, imagePath?: string | null) => giftImages[`../assets/gifts/${giftId}.webp`]
  ?? getGiftArtworkPath(giftId, imagePath);
const makeIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
};

function QueryError({ onRetry, children = "Данные временно недоступны." }: { onRetry: () => void; children?: string }) {
  return <div className="da-state da-state-error" role="alert">
    <CircleHelp size={19} /><b>Не удалось загрузить</b><span>{children}</span>
    <button type="button" onClick={onRetry} className="da-button da-button-quiet" data-testid="button-retry-profile-market"><RefreshCw size={14} /> Повторить</button>
  </div>;
}

function LoadingState({ rows = 3 }: { rows?: number }) {
  return <div className="da-loading" aria-label="Загрузка данных" role="status">
    {Array.from({ length: rows }, (_, index) => <i key={index} />)}
  </div>;
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Gift; title: string; detail: string }) {
  return <div className="da-state da-state-empty">
    <span className="da-empty-mark"><Icon size={20} /></span><b>{title}</b><span>{detail}</span>
  </div>;
}

function Tabs<T extends string>({ label, value, onChange, items }: {
  label: string; value: T; onChange: (value: T) => void; items: { id: T; label: string }[];
}) {
  return <div className="da-tabs" role="tablist" aria-label={label}>
    {items.map((item, index) => <button key={item.id} type="button" role="tab" aria-selected={value === item.id}
      tabIndex={value === item.id ? 0 : -1}
      className={value === item.id ? "is-active" : ""} onClick={() => onChange(item.id)}
      onKeyDown={(event) => {
        const move = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1
          : event.key === "Home" ? -index : event.key === "End" ? items.length - 1 - index : 0;
        if (!move) return;
        event.preventDefault();
        const next = items[(index + move + items.length) % items.length];
        onChange(next.id);
        event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-testid="tab-${next.id}"]`)?.focus();
      }}
      data-testid={`tab-${item.id}`}>{item.label}</button>)}
  </div>;
}

function ProfileSkeleton() {
  return <main className="da-hub da-profile-page" aria-label="Загрузка профиля"><div className="da-heading-skeleton" /><LoadingState rows={5} /></main>;
}

function RankMark({ rank }: { rank: string }) {
  return <span className={`da-rank da-rank-${rank.toLowerCase()}`}><Crown size={13} />{rank}</span>;
}

function ProfileIdentity({ profile }: { profile: DarkAcePublicProfile }) {
  const queryClient = useQueryClient();
  const giftCatalog = useGetDarkAceGiftCatalog({ query: { queryKey: getGetDarkAceGiftCatalogQueryKey() } });
  const giftInventory = useGetDarkAceGiftInventory({ query: {
    queryKey: getGetDarkAceGiftInventoryQueryKey(),
    enabled: profile.isOwnProfile,
  } });
  const updateProfileGift = useUpdateDarkAceProfile();
  const [gameIdCopied, setGameIdCopied] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [giftPickerOpen, setGiftPickerOpen] = useState(false);
  const [giftPickerMessage, setGiftPickerMessage] = useState("");
  const [featuredImageFailed, setFeaturedImageFailed] = useState(false);
  const profileUrl = useMemo(() => {
    const startParam = `profile_${profile.publicUserId}`;
    return `https://t.me/DarkAcePlayBot?startapp=${encodeURIComponent(startParam)}`;
  }, [profile.publicUserId]);
  const copyGameId = async () => {
    try {
      await navigator.clipboard.writeText(profile.publicUserId);
      setGameIdCopied(true);
      window.setTimeout(() => setGameIdCopied(false), 1700);
    } catch {
      window.prompt("Скопируйте игровой ID", profile.publicUserId);
    }
  };
  const shareProfile = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `Профиль ${profile.displayName} · DARK ACE`, url: profileUrl });
        setShareMessage("Ссылка отправлена.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(profileUrl);
      setShareMessage("Ссылка на профиль скопирована.");
    } catch {
      window.prompt("Скопируйте ссылку на публичный профиль", profileUrl);
    }
  };
  const featuredGift = profile.featuredGift;
  const featuredCatalogGift = featuredGift
    ? giftCatalog.data?.gifts.find((gift) => gift.giftId === featuredGift.giftId)
    : undefined;
  const featuredImage = featuredGift
    ? giftImage(featuredGift.giftId, featuredCatalogGift?.imagePath)
    : undefined;
  useEffect(() => setFeaturedImageFailed(false), [featuredImage]);
  const chooseProfileGift = async (instanceId: string) => {
    if (updateProfileGift.isPending) return;
    setGiftPickerMessage("");
    try {
      const updated = await updateProfileGift.mutateAsync({ data: { featuredGiftInstanceId: instanceId } });
      queryClient.setQueryData(getGetDarkAceOwnProfileQueryKey(), updated);
      void queryClient.invalidateQueries({ queryKey: getGetDarkAcePublicProfileQueryKey(profile.publicUserId) });
      setGiftPickerOpen(false);
    } catch {
      setGiftPickerMessage("Не удалось установить подарок в профиле. Обновите данные и попробуйте ещё раз.");
    }
  };
  const profileActions = <div className="da-profile-public-actions">
    <button type="button" className="da-button da-button-quiet da-button-small" onClick={() => void copyGameId()}
      aria-label="Скопировать игровой ID" data-testid="button-copy-game-id">
      {gameIdCopied ? <Check size={13} /> : <Copy size={13} />}<span>{gameIdCopied ? "ID скопирован" : "Игровой ID"}</span>
    </button>
    <button type="button" className="da-button da-button-quiet da-button-small" onClick={() => void shareProfile()}
      aria-label="Поделиться публичным профилем" data-testid="button-share-public-profile">
      <Share2 size={13} /><span>Поделиться</span>
    </button>
  </div>;
  return <section className="da-identity da-panel" aria-label="Публичная карточка игрока">
    <div className="da-identity-top">
      <div
        className={`da-avatar${featuredGift ? ` da-avatar--gift rarity-${featuredGift.rarity} ${giftEffectClass(featuredGift.giftId)}` : ""}`}
        style={featuredGift ? giftSeedStyle(featuredGift.giftId) : undefined}
        data-gift-id={featuredGift?.giftId}
      >
        {featuredGift && <GiftEffectOverlay giftId={featuredGift.giftId} rarity={featuredGift.rarity} place="avatar" />}
        {profile.avatarUrl
        ? <img src={profile.avatarUrl} alt="" />
        : <span>{profile.displayName.trim().slice(0, 1).toUpperCase() || "A"}</span>}
      </div>
      <div className="da-identity-name">
        <div className="da-identity-name-line">
          <h2>{profile.username ? `@${profile.username}` : profile.displayName}</h2>
          <RankMark rank={profile.rank} />
        </div>
      </div>
    </div>
    {featuredGift
      ? <div className="da-profile-featured-row">
        <div
          className={`da-profile-showcase rarity-${featuredGift.rarity} ${giftEffectClass(featuredGift.giftId)}`}
          style={giftSeedStyle(featuredGift.giftId)}
          data-gift-id={featuredGift.giftId}
          data-testid="profile-featured-gift"
        >
          <div className="da-profile-showcase-art">
            {featuredImage && !featuredImageFailed
              ? <img src={featuredImage} alt="" loading="lazy" onError={() => setFeaturedImageFailed(true)} />
              : <span>{featuredGift.name.trim().slice(0, 1).toUpperCase()}</span>}
            <GiftEffectOverlay giftId={featuredGift.giftId} rarity={featuredGift.rarity} place="art" />
          </div>
          <div className="da-profile-showcase-copy">
            <span className="da-kicker">ПОДАРОК В ПРОФИЛЕ</span>
            <b>{featuredGift.name}</b>
          </div>
        </div>
        {profile.isOwnProfile && <button type="button" className="da-button da-button-quiet da-profile-change-gift"
          onClick={() => { setGiftPickerMessage(""); setGiftPickerOpen(true); }} data-testid="button-select-profile-gift">
          <Gift size={15} /> Сменить
        </button>}
      </div>
      : <div className="da-profile-featured-row da-profile-featured-empty">
        <div className="da-profile-showcase da-profile-showcase-empty">
          <span className="da-profile-showcase-empty-mark"><Gift size={19} /></span>
          <span className="da-profile-showcase-copy"><span className="da-kicker">ПОДАРОК В ПРОФИЛЕ</span><b>Подарок не выбран</b></span>
        </div>
        {profile.isOwnProfile && <button type="button" className="da-button da-button-quiet da-profile-change-gift"
          onClick={() => { setGiftPickerMessage(""); setGiftPickerOpen(true); }} data-testid="button-select-profile-gift">
          <Gift size={15} /> Выбрать
        </button>}
      </div>}
    <div className="da-profile-public-actions da-profile-identity-actions">{profileActions.props.children}</div>
    {giftPickerOpen && createPortal(<div className="da-gift-modal-backdrop" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !updateProfileGift.isPending) setGiftPickerOpen(false); }}>
      <section className="da-send-gift-panel da-profile-gift-picker" role="dialog" aria-modal="true" aria-labelledby="profile-gift-picker-title" data-testid="panel-profile-gift-picker">
        <div className="da-friend-gift-head">
          <div><span className="da-kicker">ВАША КОЛЛЕКЦИЯ</span><b id="profile-gift-picker-title">Выберите подарок для профиля</b></div>
          <button type="button" className="da-friend-dismiss" onClick={() => setGiftPickerOpen(false)} aria-label="Закрыть выбор подарка"><X size={15} /></button>
        </div>
        {giftPickerMessage && <div className="da-gift-error" role="alert">{giftPickerMessage}</div>}
        {giftInventory.isLoading ? <LoadingState rows={3} />
          : giftInventory.isError ? <QueryError onRetry={() => void giftInventory.refetch()} />
            : (giftInventory.data?.items.length ?? 0) === 0
              ? <EmptyState icon={Gift} title="Подарков пока нет" detail="Получите подарок, и его можно будет выбрать для профиля." />
              : <div className="da-profile-gift-picker-list">{(giftInventory.data?.items ?? []).map((item) => {
                const itemGift = giftCatalog.data?.gifts.find((gift) => gift.giftId === item.giftId);
                const selected = profile.featuredGift?.instanceId === item.instanceId;
                return <article className={`da-profile-gift-picker-row ${selected ? "is-selected" : ""}`} key={item.instanceId}>
                  {itemGift ? <GiftArt gift={itemGift} compact /> : <span className="da-gift-art-fallback" aria-hidden="true"><i>DA</i><small>DARK ACE</small></span>}
                  <div><b>{itemGift?.name ?? "Подарок DARK ACE"}</b><small>{selected ? "Сейчас в профиле" : "Ваша коллекция"}</small></div>
                  <button type="button" className="da-button da-button-small" disabled={selected || updateProfileGift.isPending}
                    onClick={() => void chooseProfileGift(item.instanceId)} data-testid={`button-choose-profile-gift-${item.instanceId}`}>
                    {updateProfileGift.isPending ? "Сохраняем…" : selected ? "Выбрано" : "Выбрать"}
                  </button>
                </article>;
              })}</div>}
      </section>
    </div>, document.body)}
    {shareMessage && <span className="da-profile-share-status" role="status">{shareMessage}</span>}
    <div className="da-level-progress da-profile-level-progress">
      <div className="da-level-line"><span>УРОВЕНЬ {profile.level}</span><b>{numberFormat.format(profile.levelTurnover)} кр. оборота</b></div>
      <div className="da-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={profile.progressPercent}>
        <span style={{ width: `${Math.max(0, Math.min(100, profile.progressPercent))}%` }} />
      </div>
      <div className="da-level-caption"><span>{profile.rank} · {profile.level}</span><span>{profile.level >= 50 ? "Максимальный уровень" : `До уровня ${profile.level + 1} · ${numberFormat.format(Math.max(0, profile.nextLevelTurnover - profile.levelTurnover))} кредитов оборота`}</span></div>
    </div>
  </section>;
}

function ProfileStats({ stats }: { stats: DarkAceProfileStat[] }) {
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  if (!stats.length) return <EmptyState icon={Activity} title="Статистика появится после игры" detail="Здесь показываются только подтверждённые результаты по играм." />;
  const gameNames: Record<string, string> = {
    european_roulette: "Европейская рулетка",
    roulette: "Рулетка ДО",
    crash: "Crash",
    fruits: "Фрукты",
    upgrade: "UPGRADE",
    blackjack: "Blackjack",
  };
  return <div className="da-stat-list">{stats.map((stat) => {
    const expanded = expandedGame === stat.game;
    const winRate = stat.completedRounds ? Math.round(stat.wins / stat.completedRounds * 100) : 0;
    return <article className={`da-game-stat da-panel ${expanded ? "is-expanded" : ""}`} key={stat.game} data-testid={`stat-game-${stat.game}`}>
    <button type="button" className="da-game-stat-trigger" aria-expanded={expanded} aria-controls={`stat-detail-${stat.game}`}
      onClick={() => setExpandedGame(expanded ? null : stat.game)} data-testid={`button-expand-stat-${stat.game}`}>
      <span className="da-game-stat-title"><span className="da-game-symbol"><Activity size={17} /></span><span><small>ИГРА</small><b>{gameNames[stat.game] ?? stat.game}</b></span><ChevronRight size={15} /></span>
    </button>
    <div className="da-game-stat-values">
      <div><b>{numberFormat.format(stat.completedRounds)}</b><small>раундов</small></div>
      <div><b>{numberFormat.format(stat.wins)}</b><small>побед</small></div>
      <div><b>{credits(stat.totalStaked)}</b><small>всего поставлено</small></div>
      <div><b>{credits(stat.totalPayout)}</b><small>всего выплат</small></div>
      {stat.bestResult !== null && <div><b>{new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(stat.bestResult)}×</b><small>лучший множитель</small></div>}
    </div>
    {expanded && <div className="da-game-stat-detail" id={`stat-detail-${stat.game}`} data-testid={`detail-stat-${stat.game}`}>
      <span><small>ДОЛЯ ПОБЕД</small><b>{winRate}%</b></span>
      <span><small>РАЗНИЦА ВЫПЛАТ</small><b>{credits(stat.totalPayout - stat.totalStaked)}</b></span>
    </div>}
  </article>;
  })}</div>;
}

function PublicGiftCollection({ publicUserId }: { publicUserId: string }) {
  const collection = useGetDarkAcePublicGiftCollection(publicUserId, {
    query: {
      enabled: !!publicUserId,
      queryKey: getGetDarkAcePublicGiftCollectionQueryKey(publicUserId),
    },
  });
  const catalog = useGetDarkAceGiftCatalog({ query: { queryKey: getGetDarkAceGiftCatalogQueryKey() } });
  const [selectedGift, setSelectedGift] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "rarity">("date");
  if (collection.isLoading) return <LoadingState rows={4} />;
  if (collection.isError || !collection.data) return <QueryError onRetry={() => void collection.refetch()} />;
  const items = collection.data.received ?? [];
  if (!items.length) return <EmptyState icon={Gift} title="Коллекция пока пуста" detail="Публичных подарков в коллекции ещё нет." />;
  const rarityWeight: Record<GiftRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
  const sortedItems = [...items].sort((first, second) => sortBy === "date"
    ? new Date(second.acquiredAt).getTime() - new Date(first.acquiredAt).getTime()
    : (rarityWeight[second.rarity] - rarityWeight[first.rarity])
      || (new Date(second.acquiredAt).getTime() - new Date(first.acquiredAt).getTime()));
  const rarityLabels: Record<GiftRarity, string> = {
    ...giftRarityLabels,
  };
  return <>
    <div className="da-public-gift-tools"><span>Получено · {numberFormat.format(collection.data.totalCount)}</span><label><span className="sr-only">Сортировка коллекции</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} data-testid="select-public-gift-sort"><option value="date">По дате</option><option value="rarity">По редкости</option></select></label></div>
    <div className="da-public-gift-grid" data-testid="public-gift-collection">
      {sortedItems.map((gift) => {
        const expanded = selectedGift === gift.instanceId;
        const catalogGift = catalog.data?.gifts.find((entry) => entry.giftId === gift.giftId);
        const image = giftImage(gift.giftId, catalogGift?.imagePath);
        return <button type="button" key={gift.instanceId} style={giftSeedStyle(gift.giftId)} className={`da-public-gift-card rarity-${gift.rarity} ${giftEffectClass(gift.giftId)} gift-id-${gift.giftId.replace(/[^a-z0-9_-]/gi, "-")} ${expanded ? "is-expanded" : ""}`}
          onClick={() => setSelectedGift(expanded ? null : gift.instanceId)} aria-expanded={expanded}
          aria-label={`${gift.name}, ${rarityLabels[gift.rarity]}`} data-gift-id={gift.giftId} data-testid={`card-public-gift-${gift.instanceId}`}>
          <span className="da-public-gift-art">
            <SafeGiftArtwork src={image} name={gift.name} category={catalogGift?.category ?? "dark_ace"} />
            <GiftEffectOverlay giftId={gift.giftId} rarity={gift.rarity} place="art" />
          </span>
          <span className="da-public-gift-name">{gift.name}</span>
          <span className="da-public-gift-meta">{rarityLabels[gift.rarity]}</span>
          {expanded && <span className="da-public-gift-detail" data-testid={`detail-public-gift-${gift.instanceId}`}>
            {gift.giftedByDisplayName ? `От ${gift.giftedByDisplayName}${gift.giftedByUsername ? ` · @${gift.giftedByUsername}` : ""}` : "Получен в коллекцию"}
            <br />{giftDate(gift.acquiredAt)}
          </span>}
        </button>;
      })}
    </div>
  </>;
}

function FriendPortrait({ friend }: { friend: Pick<DarkAceFriend, "publicUserId" | "displayName" | "avatarUrl"> }) {
  return <div className="da-friend-avatar" aria-hidden="true" data-testid={`avatar-friend-${friend.publicUserId}`}>
    {friend.avatarUrl ? <img src={friend.avatarUrl} alt="" /> : friend.displayName.trim().slice(0, 1).toUpperCase() || "A"}
  </div>;
}

type RelationState = "none" | "incoming" | "outgoing" | "friends";

function FriendshipControls({ publicUserId, relation }: { publicUserId: string; relation: RelationState }) {
  const queryClient = useQueryClient();
  const createRequest = useCreateDarkAceFriendRequest();
  const acceptRequest = useAcceptDarkAceFriendRequest();
  const removeRequest = useRemoveDarkAceFriendRequest();
  const removeFriend = useRemoveDarkAceFriend();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pending = createRequest.isPending || acceptRequest.isPending || removeRequest.isPending || removeFriend.isPending;
  const finish = (success: string) => {
    setNotice(success);
    setError("");
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceFriendsQueryKey() });
  };
  const run = (action: "request" | "accept" | "decline" | "cancel" | "remove") => {
    if (pending) return;
    if (action === "remove" && !window.confirm("Удалить игрока из друзей? История личных сообщений сохранится.")) return;
    setNotice("");
    setError("");
    const handlers = {
      onSuccess: () => finish(action === "request" ? "Запрос отправлен." : action === "accept" ? "Теперь вы друзья." : action === "cancel" ? "Запрос отменён." : action === "remove" ? "Игрок удалён из друзей." : "Запрос отклонён."),
      onError: () => setError("Действие не выполнено. Обновите список и попробуйте ещё раз."),
    };
    if (action === "request") createRequest.mutate({ data: { publicUserId } }, handlers);
    if (action === "accept") acceptRequest.mutate({ publicUserId }, handlers);
    if (action === "decline" || action === "cancel") removeRequest.mutate({ publicUserId }, handlers);
    if (action === "remove") removeFriend.mutate({ publicUserId }, handlers);
  };
  return <div className="da-friend-controls">
    {relation === "none" && <button className="da-button da-button-small" type="button" onClick={() => run("request")} disabled={pending} data-testid={`button-friend-request-${publicUserId}`}><UserPlus size={13} />{pending ? "Отправляем…" : "Добавить в друзья"}</button>}
    {relation === "incoming" && <>
      <button className="da-button da-button-small" type="button" onClick={() => run("accept")} disabled={pending} data-testid={`button-friend-accept-${publicUserId}`}><Check size={13} />{pending ? "Принимаем…" : "Принять"}</button>
      <button className="da-button da-button-quiet da-button-small" type="button" onClick={() => run("decline")} disabled={pending} data-testid={`button-friend-decline-${publicUserId}`}>{pending ? "Обновляем…" : "Отклонить"}</button>
    </>}
    {relation === "outgoing" && <button className="da-button da-button-quiet da-button-small" type="button" onClick={() => run("cancel")} disabled={pending} data-testid={`button-friend-cancel-${publicUserId}`}><X size={13} />{pending ? "Отменяем…" : "Отменить запрос"}</button>}
    {relation === "friends" && <button className="da-button da-button-quiet da-button-small da-remove-avatar" type="button" onClick={() => run("remove")} disabled={pending} data-testid={`button-friend-remove-${publicUserId}`}><UserMinus size={13} />{pending ? "Удаляем…" : "Удалить"}</button>}
    {notice && <span className="da-friend-feedback" role="status" data-testid={`status-friend-${publicUserId}`}>{notice}</span>}
    {error && <span className="da-form-error" role="alert" data-testid={`error-friend-${publicUserId}`}>{error}</span>}
  </div>;
}

function FriendGiftComposer({ recipient, catalog, onDismiss }: {
  recipient: Pick<DarkAceFriend, "publicUserId" | "displayName">;
  catalog: DarkAceGiftCatalogEntry[];
  onDismiss: () => void;
}) {
  const queryClient = useQueryClient();
  const sendGift = useSendDarkAceFriendGift();
  const [selected, setSelected] = useState<DarkAceGiftCatalogEntry | null>(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const confirm = () => {
    if (!selected || sendGift.isPending) return;
    setError("");
    setSuccess("");
    sendGift.mutate({ publicUserId: recipient.publicUserId, data: { giftId: selected.giftId, idempotencyKey: makeIdempotencyKey() } }, {
      onSuccess: () => {
        setSuccess(`${selected.name} отправлен игроку ${recipient.displayName}.`);
        setSelected(null);
        void queryClient.invalidateQueries({ queryKey: getGetDarkAceGiftInventoryQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDarkAceGiftSentQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDarkAceShopQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDarkAceGiftCatalogQueryKey() });
      },
      onError: () => setError("Покупка не выполнена. Баланс не подтверждён; попробуйте ещё раз."),
    });
  };
  return <div className="da-friend-gift" data-testid={`panel-friend-gifts-${recipient.publicUserId}`}>
    <div className="da-friend-gift-head"><div><span className="da-kicker">КАТАЛОГ DARK ACE</span><b>Подарок для {recipient.displayName}</b></div>
      <button type="button" className="da-friend-dismiss" onClick={onDismiss} aria-label="Закрыть каталог подарков" data-testid={`button-close-friend-gifts-${recipient.publicUserId}`}><X size={15} /></button>
    </div>
    {success && <div className="da-gift-notice" role="status" data-testid={`status-gift-sent-${recipient.publicUserId}`}><Check size={14} />{success}</div>}
    {error && <div className="da-gift-error" role="alert" data-testid={`error-gift-send-${recipient.publicUserId}`}>{error}</div>}
    {catalog.length ? <div className="da-friend-gift-grid">{catalog.map((gift) => <article className={`da-friend-gift-choice rarity-${gift.rarity}`} key={gift.giftId} data-testid={`card-friend-gift-${gift.giftId}`}>
      <span className="da-friend-gift-rarity">{gift.rarity}</span><b>{gift.name}</b><small>{credits(gift.priceCredits)}</small>
      <button type="button" className="da-button da-button-small" onClick={() => { setSelected(gift); setError(""); }} data-testid={`button-select-friend-gift-${gift.giftId}`}>Выбрать</button>
    </article>)}</div> : <EmptyState icon={Gift} title="Каталог пуст" detail="Сейчас нет доступных подарков." />}
    {selected && createPortal(<div className="da-confirm-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !sendGift.isPending) setSelected(null); }}>
      <section className="da-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="friend-gift-confirm-title">
        <span className="da-gift-seal"><Gift size={18} /></span>
        <h2 id="friend-gift-confirm-title">Отправить {selected.name}?</h2>
        <p>Покупка для {recipient.displayName} спишет <b>{credits(selected.priceCredits)}</b> с вашего баланса. Подарок будет отправлен только после подтверждения сервера.</p>
        <div><button type="button" className="da-button da-button-quiet" onClick={() => setSelected(null)} disabled={sendGift.isPending} data-testid="button-cancel-friend-gift">Отмена</button>
          <button type="button" className="da-button" onClick={confirm} disabled={sendGift.isPending} data-testid="button-confirm-friend-gift">{sendGift.isPending ? "Покупаем и отправляем…" : `Подтвердить · ${credits(selected.priceCredits)}`}</button></div>
      </section>
    </div>, document.body)}
  </div>;
}

function FriendsArea({ profile }: { profile?: DarkAcePublicProfile }) {
  const openPlayerProfile = useOpenPlayerProfile();
  const friendsQuery = useGetDarkAceFriends({ query: { queryKey: getGetDarkAceFriendsQueryKey(), refetchInterval: 15000 } });
  const catalogQuery = useGetDarkAceGiftCatalog({ query: { queryKey: getGetDarkAceGiftCatalogQueryKey() } });
  const [giftRecipient, setGiftRecipient] = useState<DarkAceFriend | null>(null);
  const relationshipLists = friendsQuery.data;
  const targetId = profile?.publicUserId;
  const publicFriend = relationshipLists?.friends.find((friend) => friend.publicUserId === targetId);
  const publicIncoming = relationshipLists?.incomingRequests.find((friend) => friend.publicUserId === targetId);
  const publicOutgoing = relationshipLists?.outgoingRequests.find((friend) => friend.publicUserId === targetId);
  const publicRelation: RelationState = publicFriend ? "friends" : publicIncoming ? "incoming" : publicOutgoing ? "outgoing" : "none";
  const renderPlayer = (friend: DarkAceFriend, relation: RelationState, sinceLabel?: string) => <article className="da-friend-row" key={friend.publicUserId} data-testid={`row-friend-${friend.publicUserId}`}>
    <button
      type="button"
      className="da-friend-profile-trigger"
      onClick={() => openPlayerProfile?.(friend.publicUserId)}
      disabled={!openPlayerProfile || !isPublicPlayerId(friend.publicUserId)}
      aria-label={`Открыть профиль игрока ${friend.displayName}`}
      data-testid={`button-open-friend-profile-${friend.publicUserId}`}
    >
      <FriendPortrait friend={friend} />
      <span className="da-friend-copy"><b>{friend.displayName}</b><span>{friend.username ? `@${friend.username}` : "Игрок DARK ACE"}</span>{sinceLabel && <small>{sinceLabel}</small>}</span>
    </button>
    {relation === "friends" && <div className="da-friend-shortcuts">
      <button type="button" className="da-button da-button-small" onClick={() => { setGiftRecipient(friend); }} aria-label={`Отправить подарок ${friend.displayName}`} data-testid={`button-gift-friend-${friend.publicUserId}`}><Gift size={13} /> Подарить</button>
    </div>}
    <FriendshipControls publicUserId={friend.publicUserId} relation={relation} />
  </article>;
  if (profile) {
    if (profile.isOwnProfile) return null;
    return <section className="da-friends-area da-animate" aria-label="Дружба и подарки">
      <div className="da-section-head"><div><span className="da-kicker">СВЯЗИ КЛУБА</span><h2>Друзья</h2></div></div>
      {friendsQuery.isLoading ? <LoadingState rows={2} /> : friendsQuery.isError ? <QueryError onRetry={() => void friendsQuery.refetch()} /> : <>
        <div className="da-public-friendship da-panel">
          <div className="da-public-friendship-copy"><span className="da-kicker">ВАШ СТАТУС</span>
            <b>{publicRelation === "friends" ? "Вы друзья" : publicRelation === "incoming" ? "Ждёт вашего ответа" : publicRelation === "outgoing" ? "Запрос отправлен" : "Пока не друзья"}</b>
            <small>{publicRelation === "friends" ? "Можно отправлять подарки." : "Отправка подарков доступна после принятия запроса."}</small>
          </div>
          <FriendshipControls publicUserId={profile.publicUserId} relation={publicRelation} />
          {publicRelation === "friends" && <div className="da-friend-shortcuts">
            <button type="button" className="da-button da-button-small" onClick={() => setGiftRecipient({ publicUserId: profile.publicUserId, displayName: profile.displayName, username: null, avatarUrl: profile.avatarUrl ?? null, since: "" })} data-testid={`button-gift-friend-${profile.publicUserId}`}><Gift size={13} /> Подарить</button>
          </div>}
        </div>
      </>}
      {giftRecipient && catalogQuery.isLoading && <LoadingState rows={3} />}
      {giftRecipient && catalogQuery.isError && <QueryError onRetry={() => void catalogQuery.refetch()} />}
      {giftRecipient && catalogQuery.data && <FriendGiftComposer recipient={giftRecipient} catalog={catalogQuery.data.gifts} onDismiss={() => setGiftRecipient(null)} />}
    </section>;
  }
  if (friendsQuery.isLoading) return <section className="da-friends-area"><div className="da-section-head"><div><span className="da-kicker">ВАШ КРУГ</span><h2>Друзья и запросы</h2></div></div><LoadingState rows={5} /></section>;
  if (friendsQuery.isError || !relationshipLists) return <section className="da-friends-area"><div className="da-section-head"><div><span className="da-kicker">ВАШ КРУГ</span><h2>Друзья и запросы</h2></div></div><QueryError onRetry={() => void friendsQuery.refetch()} /></section>;
  const { friends, incomingRequests, outgoingRequests } = relationshipLists;
  return <section className="da-friends-area da-animate" aria-label="Друзья и запросы">
    <div className="da-friends-summary da-panel"><span className="da-friend-summary-mark"><UserRound size={18} /></span><div><span className="da-kicker">ВАШ КРУГ</span><b>{friends.length} {friends.length === 1 ? "друг" : "друзей"}</b><small>Подарки друзьям покупаются за кредиты.</small></div><span className="da-count" data-testid="text-friends-count">{friends.length} / {incomingRequests.length} / {outgoingRequests.length}</span></div>
    {friendsQuery.isRefetchError && <div className="da-form-error" role="status">Не удалось обновить связи; показаны последние данные.</div>}
    <div className="da-section-head"><div><span className="da-kicker">ПРИНЯТЫЕ СВЯЗИ</span><h2>Друзья</h2></div><span className="da-count">{friends.length}</span></div>
    {friends.length ? <div className="da-friend-list">{friends.map((friend) => renderPlayer(friend, "friends", `В друзьях с ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(friend.since))}`))}</div>
      : <EmptyState icon={UserRound} title="Круг пока пуст" detail="Откройте публичный профиль игрока и отправьте запрос в друзья." />}
    <div className="da-section-head"><div><span className="da-kicker">ВХОДЯЩИЕ</span><h2>Запросы к вам</h2></div><span className="da-count">{incomingRequests.length}</span></div>
    {incomingRequests.length ? <div className="da-friend-list">{incomingRequests.map((friend) => renderPlayer(friend, "incoming"))}</div>
      : <div className="da-inline-empty">Новых запросов нет.</div>}
    <div className="da-section-head"><div><span className="da-kicker">ОЖИДАНИЕ ОТВЕТА</span><h2>Ваши запросы</h2></div><span className="da-count">{outgoingRequests.length}</span></div>
    {outgoingRequests.length ? <div className="da-friend-list">{outgoingRequests.map((friend) => renderPlayer(friend, "outgoing"))}</div>
      : <div className="da-inline-empty">Вы никому не отправляли запрос.</div>}
    {giftRecipient && catalogQuery.isLoading && <LoadingState rows={3} />}
    {giftRecipient && catalogQuery.isError && <QueryError onRetry={() => void catalogQuery.refetch()} />}
    {giftRecipient && catalogQuery.data && <FriendGiftComposer recipient={giftRecipient} catalog={catalogQuery.data.gifts} onDismiss={() => setGiftRecipient(null)} />}
  </section>;
}

export function ProfileHubPage() {
  const queryClient = useQueryClient();
  const profileQuery = useGetDarkAceOwnProfile();
  const bootstrap = useGetDarkAceBootstrap({
    query: { enabled: profileQuery.isSuccess, queryKey: getGetDarkAceBootstrapQueryKey() },
  });
  const promoSummary = useGetDarkAcePromoSummary({
    query: { enabled: profileQuery.isSuccess, queryKey: getGetDarkAcePromoSummaryQueryKey(), refetchInterval: 15_000 },
  });
  const createPromoMutation = useCreateDarkAcePromo();
  const redeemPromoMutation = useRedeemDarkAcePromo();
  const updateProfile = useUpdateDarkAceProfile();
  const supportReport = useCreateDarkAceSupportReport();
  const profile = profileQuery.data;
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [publicProfile, setPublicProfile] = useState<boolean | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [enteredPromoCode, setEnteredPromoCode] = useState("");
  const [newPromoCode, setNewPromoCode] = useState("");
  const [promoCopied, setPromoCopied] = useState(false);
  const [promoFeedback, setPromoFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [supportGame, setSupportGame] = useState<DarkAceSupportReportInput["game"]>("dice");
  const [supportRound, setSupportRound] = useState("");
  const [supportDetails, setSupportDetails] = useState("");
  const [supportFeedback, setSupportFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const promoFocusHandled = useRef(false);
  const currentPublicProfile = publicProfile ?? profile?.publicProfile ?? true;
  const dirty = !!profile && currentPublicProfile !== profile.publicProfile;

  useEffect(() => {
    if (!profile || promoFocusHandled.current || window.location.hash !== "#profile-redeem-promo") return;
    promoFocusHandled.current = true;
    const frame = window.requestAnimationFrame(() => {
      const input = document.getElementById("profile-redeem-promo") as HTMLInputElement | null;
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (input && !input.disabled) input.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [profile]);

  const save = () => {
    if (!dirty || updateProfile.isPending) return;
    updateProfile.mutate({ data: { bio: profile!.bio, publicProfile: currentPublicProfile } }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetDarkAceOwnProfileQueryKey(), updated);
        setPublicProfile(updated.publicProfile);
        setSaveMessage("Настройка приватности сохранена.");
      },
    });
  };
  const refreshPromoData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetDarkAcePromoSummaryQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() }),
    ]);
  };
  const redeemPromo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (redeemPromoMutation.isPending || !enteredPromoCode.trim()) return;
    setPromoFeedback(null);
    try {
      const deviceToken = getPromoDeviceToken();
      const result = await redeemPromoMutation.mutateAsync({
        data: { code: enteredPromoCode.trim(), ...(deviceToken ? { deviceToken } : {}) },
      });
      setEnteredPromoCode("");
      setPromoFeedback({ kind: "success", text: `Промокод ${result.code} активирован. Вам начислено ${credits(result.playerRewardCredits)}.` });
      await refreshPromoData();
    } catch (error) {
      setPromoFeedback({ kind: "error", text: getPromoErrorMessage(error, "Не удалось активировать промокод.") });
    }
  };
  const submitSupportReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (supportReport.isPending || supportDetails.trim().length < 5) return;
    setSupportFeedback(null);
    try {
      await supportReport.mutateAsync({
        data: {
          game: supportGame,
          ...(supportRound.trim() ? { roundNumber: supportRound.trim().replace(/^[#№]/, "") } : {}),
          details: supportDetails.trim(),
        },
      });
      setSupportRound("");
      setSupportDetails("");
      setSupportFeedback({ kind: "success", text: "Обращение отправлено администраторам. Ответ появится через поддержку @nightworth." });
    } catch (error) {
      setSupportFeedback({ kind: "error", text: getPromoErrorMessage(error, "Не удалось отправить обращение. Напишите в поддержку @nightworth.") });
    }
  };
  const createPromo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createPromoMutation.isPending || !newPromoCode.trim()) return;
    setPromoFeedback(null);
    try {
      await createPromoMutation.mutateAsync({ data: { code: newPromoCode.trim() } });
      setNewPromoCode("");
      setPromoFeedback({ kind: "success", text: "Ваш личный промокод создан и сохранён в игре." });
      await refreshPromoData();
    } catch (error) {
      setPromoFeedback({ kind: "error", text: getPromoErrorMessage(error, "Не удалось создать промокод.") });
    }
  };
  const copyPromoCode = async () => {
    const code = promoSummary.data?.promoCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setPromoCopied(true);
      window.setTimeout(() => setPromoCopied(false), 1800);
    } catch {
      window.prompt("Скопируйте промокод", code);
    }
  };

  if (profileQuery.isLoading) return <ProfileSkeleton />;
  if (profileQuery.isError || !profile) return <main className="da-hub da-profile-page">
    <PageTitle eyebrow="КАРТОЧКА ИГРОКА" title="Профиль" detail="Публичная идентичность и честный прогресс клуба." />
    <QueryError onRetry={() => void profileQuery.refetch()} />
  </main>;
  return <main className="da-hub da-profile-page">
    <header className="da-page-title da-profile-page-title">
      <div className="da-profile-title-copy">
        <h1>Профиль</h1>
      </div>
    </header>
    <ProfileIdentity profile={profile} />
    {bootstrap.data?.dailyReward && <Link href="/daily-quests" className="da-profile-daily-bonus da-panel" aria-label="Открыть ежедневные награды" data-testid="profile-daily-bonus">
      <span className="da-profile-daily-mark"><Flame size={17} /></span>
      <div className="da-profile-daily-copy">
        <b>{bootstrap.data.dailyReward.available
          ? `Бонус за вход · ${credits(bootstrap.data.dailyReward.amount)}`
          : "Бонус за вход, задания и серия"}</b>
        <small>Открыть ежедневные задания</small>
      </div>
      <ChevronRight size={15} aria-hidden="true" />
    </Link>}
    {bootstrap.isError && <div className="da-profile-daily-error" role="alert">Не удалось загрузить ежедневный бонус.
      <button type="button" onClick={() => void bootstrap.refetch()}>Повторить</button>
    </div>}
    <Tabs label="Разделы профиля" value={tab === "overview" || tab === "gifts" ? tab : "more"} onChange={(value) => setTab(value as ProfileTab)} items={[
      { id: "overview", label: "Обзор" },
      { id: "gifts", label: "Подарки" },
      { id: "more", label: "Ещё" },
    ]} />
    {tab === "overview" && <div className="da-profile-content da-animate">
      <section className="panel rounded-2xl da-promo-card" aria-label="Промокоды DARK ACE" data-testid="profile-promo-card">
        <div className="da-promo-heading">
          <span className="da-promo-mark"><Ticket size={19} /></span>
          <div><span className="da-kicker">БОНУСЫ DARK ACE</span><h2>Промокод</h2>
            <p>Личные промокоды и админские акции учитываются отдельно.</p></div>
        </div>
        <form className="da-promo-form" onSubmit={(event) => void redeemPromo(event)}>
          <label htmlFor="profile-redeem-promo">ВВЕСТИ ПРОМОКОД</label>
          <div className="da-promo-input-row">
            <input id="profile-redeem-promo" value={enteredPromoCode} maxLength={20}
              minLength={3} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,19}" autoComplete="off"
              autoCapitalize="characters" placeholder="Например, ACE25"
              disabled={redeemPromoMutation.isPending}
              onChange={(event) => { setEnteredPromoCode(event.target.value.toUpperCase()); setPromoFeedback(null); }}
              data-testid="input-redeem-promo" />
            <button className="da-button" type="submit"
              disabled={!enteredPromoCode.trim() || redeemPromoMutation.isPending}
              data-testid="button-redeem-promo">
              {redeemPromoMutation.isPending ? "Проверяем…" : "Активировать"}
            </button>
          </div>
          <small className="da-promo-hint">
            Личный промокод можно активировать один раз. Каждый админский код акции — отдельно, тоже один раз.
            Нельзя активировать собственный личный промокод.
          </small>
        </form>
        {promoFeedback && <p className={`da-promo-feedback is-${promoFeedback.kind}`} role={promoFeedback.kind === "error" ? "alert" : "status"}>{promoFeedback.text}</p>}
        {promoSummary.isLoading && <div className="da-promo-hint">Загружаем промокоды…</div>}
        {promoSummary.isError && <div className="da-promo-feedback is-error" role="alert">
          Не удалось загрузить промокод. <button type="button" onClick={() => void promoSummary.refetch()}>Повторить</button>
        </div>}
        <div className="da-promo-divider" />
        <div className="da-promo-own">
          <div className="da-promo-own-copy"><span className="da-kicker">ВАШ ЛИЧНЫЙ КОД</span>
            <b>Создайте промокод для друзей</b>
            <small>{promoSummary.data?.promoCode
              ? "Делитесь кодом с друзьями — за его активацию можно получить до 25 000 кредитов."
              : "Создайте личный код и получайте до 25 000 кредитов за его активации."}</small>
          </div>
          {promoSummary.data?.promoCode
            ? <div className="da-promo-own-code">
              <code>{promoSummary.data.promoCode}</code>
              <button type="button" className="copy-button" onClick={() => void copyPromoCode()} data-testid="button-copy-own-promo">
                {promoCopied ? <Check size={14} /> : <Copy size={14} />}{promoCopied ? "Скопировано" : "Скопировать"}
              </button>
              <div className="da-promo-stats">
                <span>Активаций <b>{numberFormat.format(promoSummary.data.redeemedCount)}</b></span>
                <span>Начислено вам <b>{credits(promoSummary.data.ownerRewardCredits)}</b></span>
              </div>
            </div>
            : <form className="da-promo-create-form" onSubmit={(event) => void createPromo(event)}>
              <label className="sr-only" htmlFor="profile-create-promo">Новый личный промокод</label>
              <input id="profile-create-promo" value={newPromoCode} maxLength={20} minLength={3}
                pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,19}" autoComplete="off" autoCapitalize="characters"
                placeholder="Например, ACE2026"
                onChange={(event) => { setNewPromoCode(event.target.value.toUpperCase()); setPromoFeedback(null); }}
                disabled={createPromoMutation.isPending || promoSummary.isLoading || promoSummary.isError}
                data-testid="input-create-promo" />
              <button type="submit" className="da-button"
                disabled={!newPromoCode.trim() || createPromoMutation.isPending || promoSummary.isLoading || promoSummary.isError}
                data-testid="button-create-promo">
                {createPromoMutation.isPending ? "Создаём…" : "Создать промокод"}
              </button>
              <small className="da-promo-hint">3–20 символов: латинские буквы, цифры, дефис или подчёркивание. Создать можно один раз.</small>
            </form>}
        </div>
      </section>
      <section className="da-profile-quick-links da-panel" aria-label="Разделы профиля">
        <Link href="/levels" className="da-profile-quick-link" data-testid="link-profile-level-gifts">
          <span><b>Уровни и кейсы DARK ACE</b></span><ChevronRight size={18} />
        </Link>
        <Link href="/profile/account" className="da-profile-quick-link" data-testid="link-profile-account">
          <span><b>Аккаунт и кредиты</b></span><ChevronRight size={18} />
        </Link>
      </section>
    </div>}
    {tab === "gifts" && <section className="da-profile-content da-animate">
      <GiftCollection />
      <div className="da-section-head da-profile-shop-heading"><div><span className="da-kicker">ДОСТУПНО В КЛУБЕ</span><h2>Выбрать подарок</h2></div></div>
      <GiftCollection catalogOnly />
    </section>}
    {tab === "stats" && <section className="da-profile-content da-animate">
      <div className="da-section-head"><div><span className="da-kicker">ТОЛЬКО РЕАЛЬНЫЕ РЕЗУЛЬТАТЫ</span><h2>Игровая статистика</h2></div></div>
      <ProfileStats stats={profile.stats} />
    </section>}
    {tab === "history" && <section className="da-profile-content da-animate" aria-label="Моя история игр">
      <AdminPlayerGameHistory />
    </section>}
    {tab === "support" && <section className="da-profile-content da-animate da-support-report" aria-label="Сообщить о проблеме">
      <div className="da-section-head"><div><span className="da-kicker">ОБРАТНАЯ СВЯЗЬ</span><h2><AlertCircle size={17} /> Сообщить о проблеме</h2></div></div>
      <p className="da-support-report-intro">Укажите игру и, если помните, номер раунда. Обращение отправится администраторам; это форма поддержки, не чат.</p>
      <form onSubmit={(event) => void submitSupportReport(event)} className="da-support-report-form">
        <label>Игра
          <select value={supportGame} onChange={(event) => setSupportGame(event.target.value as DarkAceSupportReportInput["game"])}>
            {supportGameOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>Номер раунда <span>необязательно</span>
          <input value={supportRound} onChange={(event) => setSupportRound(event.target.value.slice(0, 64))}
            placeholder="Например, 12345" maxLength={64} autoComplete="off" />
        </label>
        <label>Что произошло?
          <textarea value={supportDetails} onChange={(event) => setSupportDetails(event.target.value.slice(0, 1000))}
            minLength={5} maxLength={1000} rows={5} placeholder="Опишите проблему, шаги до неё и что вы ожидали увидеть." required />
        </label>
        <div className="da-support-report-submit">
          {supportFeedback && <p className={`da-support-report-feedback is-${supportFeedback.kind}`} role={supportFeedback.kind === "error" ? "alert" : "status"}>{supportFeedback.text}</p>}
          <button type="submit" className="da-button" disabled={supportReport.isPending || supportDetails.trim().length < 5}>
            {supportReport.isPending ? "Отправляем…" : "Отправить обращение"}
          </button>
        </div>
        <small className="da-support-report-limit">Не более трёх обращений в час. Для срочной помощи: <a href={SUPPORT_URL} target="_blank" rel="noreferrer">@nightworth</a>.</small>
      </form>
    </section>}
    {tab === "friends" && <FriendsArea />}
    {tab === "more" && <section className="da-profile-content da-animate da-profile-more" aria-label="Дополнительные разделы">
      <div className="da-section-head"><div><span className="da-kicker">НАСТРОЙКИ И ИСТОРИЯ</span><h2>Ещё</h2></div></div>
      <section className="da-profile-privacy da-panel">
        <label htmlFor="toggle-public-profile">
          <span><b>Публичный профиль</b><small>Другие игроки могут открыть вашу карточку по ссылке.</small></span>
          <input id="toggle-public-profile" type="checkbox" checked={currentPublicProfile}
            onChange={(event) => { setPublicProfile(event.target.checked); setSaveMessage(""); }}
            data-testid="toggle-public-profile" />
        </label>
        <div className="da-profile-privacy-actions">
          {saveMessage && <span className="da-success" role="status"><Check size={14} />{saveMessage}</span>}
          {updateProfile.isError && <span className="da-form-error" role="alert">Изменения не сохранены. Попробуйте ещё раз.</span>}
          <button type="button" className="da-button" onClick={save} disabled={!dirty || updateProfile.isPending} data-testid="button-save-profile-privacy">
            {updateProfile.isPending ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </section>
      <div className="da-profile-more-actions" aria-label="Дополнительные функции">
        <button type="button" onClick={() => setTab("stats")} data-testid="button-profile-stats">Статистика</button>
        <button type="button" onClick={() => setTab("history")} data-testid="button-profile-history">История операций</button>
        <button type="button" onClick={() => setTab("friends")} data-testid="button-profile-friends">Друзья</button>
        <button type="button" onClick={() => setTab("support")} data-testid="button-profile-support">Сообщить о проблеме</button>
      </div>
    </section>}
  </main>;
}

const agreementSections = [
  {
    title: "1. Общие положения",
    clauses: [
      "Этот документ описывает правила доступа к DARK ACE и использования его игровых и профильных функций. DARK ACE создано в развлекательных целях.",
      "Пользовательское соглашение применяется ко всем экранам, режимам и функциям DARK ACE, которые доступны в приложении на момент использования.",
      "Открывая приложение, создавая игровое действие или продолжая пользоваться сервисом, пользователь подтверждает, что ознакомился с текстом. Если условия не подходят, следует прекратить использование приложения.",
      "К отдельным играм и функциям могут дополнительно применяться подсказки и правила, показанные непосредственно на соответствующем экране. При расхождении нужно ориентироваться на актуальные правила выбранной игры и подтверждённый сервером результат.",
    ],
  },
  {
    title: "2. Основные термины",
    clauses: [
      "DARK ACE — игровое мини-приложение в Telegram, включающее игры, профиль, виртуальный баланс и другие доступные функции.",
      "Пользователь — человек, который открывает или использует DARK ACE через свой аккаунт Telegram.",
      "Игровой баланс — отображаемое в приложении количество игровых кредитов, предназначенных для игровых действий внутри сервиса.",
      "Ставка — выбранное пользователем количество кредитов и игровой вариант, отправленные на сервер для участия в раунде.",
      "Раунд — отдельный игровой цикл, который может включать приём ставок, определение результата и расчёт игровых операций.",
      "Бонус, промокод, подарок, история и профиль — дополнительные функции, доступные в приложении в соответствии с их текущими описаниями.",
    ],
  },
  {
    title: "3. Назначение и формат сервиса",
    clauses: [
      "DARK ACE предназначено для досуга и игрового взаимодействия. Игровые экраны, анимации и виртуальные кредиты являются частью развлекательного опыта.",
      "Результаты виртуальных игр не являются обещанием заранее определённого выигрыша или дохода. Каждый раунд может завершиться по-разному.",
      "Сервис не заменяет реальные услуги, профессиональные рекомендации или источники информации вне приложения.",
      "Пользователь самостоятельно решает, пользоваться ли приложением, выбирать ли игру и совершать ли игровые действия.",
    ],
  },
  {
    title: "4. Возраст и доступ",
    clauses: [
      "DARK ACE предназначено для пользователей, достигших 18 лет.",
      "Используя приложение, пользователь подтверждает, что ему исполнилось 18 лет.",
      "Если пользователь не достиг указанного возраста, ему нельзя создавать игровые действия или пользоваться игровыми функциями DARK ACE.",
    ],
  },
  {
    title: "5. Аккаунт Telegram и профиль",
    clauses: [
      "Доступ к DARK ACE предоставляется через Telegram. Для работы отдельных функций сервис может использовать идентификатор Telegram и доступные сведения профиля.",
      "Пользователь отвечает за сохранность доступа к своему аккаунту Telegram и устройства, с которого открывает приложение.",
      "Действия, выполненные в DARK ACE из аккаунта пользователя, отображаются как действия этого аккаунта.",
      "Перед подтверждением ставки, покупки подарка, отправки подарка или другого действия пользователь должен проверить выбранные параметры.",
      "Публичные элементы профиля и отображаемое имя следует использовать корректно и не выдавать себя за другого человека или представителя DARK ACE.",
    ],
  },
  {
    title: "6. Использование приложения и устройств",
    clauses: [
      "Для доступа к DARK ACE нужны Telegram, совместимое устройство и интернет-соединение.",
      "Отображение интерфейса может зависеть от модели устройства, версии Telegram, браузерного окружения, размера экрана и настроек системы.",
      "Пользователь должен устанавливать обновления Telegram и использовать устройство, позволяющее корректно открывать мини-приложения.",
      "При потере соединения, сворачивании Telegram или перезагрузке экрана состояние анимации может отличаться от состояния на сервере. Для проверки нужно ориентироваться на результат и историю в приложении.",
    ],
  },
  {
    title: "7. Игры и правила режимов",
    clauses: [
      "В DARK ACE могут быть доступны разные игры и игровые режимы, включая игры с раундами, картами, кубиками, множителями, колесом, символами или выбором исхода.",
      "Набор игр и функций может меняться: отдельный режим может быть обновлён, временно отключён или заменён.",
      "Перед ставкой пользователь должен ознакомиться с названием выбранной игры, доступными исходами, лимитами, множителями и подсказками на экране.",
      "Правила и интерфейс одного режима не обязательно совпадают с правилами другого режима. Нельзя переносить условия одной игры на другую, если приложение прямо этого не указывает.",
      "Если в игре доступны правила по кнопке справки или значку вопроса, эти сведения относятся к соответствующему игровому экрану.",
    ],
  },
  {
    title: "8. Выбор и подтверждение ставки",
    clauses: [
      "До отправки ставки пользователь самостоятельно выбирает сумму, игровой исход и другие параметры, которые предусмотрены конкретной игрой.",
      "Ставка считается принятой после того, как приложение получило подтверждение сервера. Нажатие кнопки без такого подтверждения само по себе не подтверждает, что действие принято.",
      "Раунд может принимать ставки только в установленный для него период. После закрытия приёма ставок сервер может отклонить новую ставку или её изменение.",
      "Ставка должна соответствовать лимитам выбранной игры и доступному игровому балансу. Ограничения могут различаться между режимами.",
      "После принятия ставки изменить её или отменить можно только в том случае, если такой вариант прямо предусмотрен интерфейсом и ещё доступен для текущего состояния раунда.",
    ],
  },
  {
    title: "9. Раунды, результаты и анимации",
    clauses: [
      "Раунды могут проходить автоматически, по таймеру, по действиям игроков или в другом порядке, указанном на экране выбранной игры.",
      "Результат определяется игровой логикой и подтверждается сервером либо, для отдельных режимов, соответствующим механизмом Telegram.",
      "Анимация, звук, вращение, перемещение фишек и визуальные эффекты показывают ход игрового процесса и не заменяют результат, рассчитанный игровым механизмом.",
      "Если анимация прервалась или не завершилась, это само по себе не означает, что ставка или результат были отменены. Следует проверить экран игры, баланс и историю операций.",
      "Для совместного раунда результат может быть общим для участников, а расчёт по ставкам — индивидуальным для каждого пользователя согласно правилам игры.",
    ],
  },
  {
    title: "10. Игровые кредиты и баланс",
    clauses: [
      "Кредиты являются игровыми единицами, которые отображаются в балансе DARK ACE и используются для доступных игровых действий.",
      "Сумма ставки, списания и начисления зависят от выбранной игры, принятой ставки и результата раунда.",
      "Баланс и история операций обновляются по данным сервера; отображение на разных экранах может обновиться не одновременно.",
      "Если в приложении доступно получение кредитов или бонусов, условия и итоговое количество должны проверяться по информации, показанной перед подтверждением соответствующего действия.",
      "При расхождении баланса с историей или экраном игры следует дождаться обновления данных и, если расхождение сохраняется, обратиться в поддержку.",
    ],
  },
  {
    title: "11. История, статистика и рейтинги",
    clauses: [
      "История игры и операций предназначена для просмотра доступных сведений о действиях, ставках и результатах.",
      "Состав истории и период отображения могут различаться в зависимости от игры и функции приложения.",
      "Статистика, рейтинг и игровые показатели отражают данные, обработанные сервисом, и могут обновляться после завершения раунда или синхронизации.",
      "Удаление старых подробных записей из истории не обязательно означает удаление накопительных игровых показателей, если приложение продолжает их отображать.",
      "Публичный рейтинг служит игровым элементом и не гарантирует будущий результат или получение награды.",
    ],
  },
  {
    title: "12. Бонусы, промокоды и задания",
    clauses: [
      "Бонусы, задания и промокоды предоставляются на условиях, указанных в приложении или в сообщении, которым они выданы.",
      "Для промокода могут устанавливаться срок действия, количество активаций, ограничения для аккаунтов и размер начисления.",
      "Перед активацией пользователь должен проверить отображаемые условия и убедиться, что выбран правильный код.",
      "Успешная активация подтверждается приложением. Повторная отправка того же запроса не гарантирует повторного начисления.",
      "Бонус может быть недоступен после исчерпания лимита, завершения срока действия или выполнения условий, заданных для конкретной акции.",
      "Промокоды и бонусы нельзя использовать способом, который обходит их условия или ограничения приложения.",
    ],
  },
  {
    title: "13. Подарки, друзья и взаимодействие игроков",
    clauses: [
      "Если в приложении доступны подарки, пользователь может просматривать каталог и использовать предусмотренные интерфейсом действия с подарками.",
      "Перед покупкой, отправкой или передачей подарка нужно проверить его название, стоимость, получателя и подтверждение операции.",
      "Профили и публичные сведения других игроков следует использовать только для функций, доступных в DARK ACE.",
      "Запрещено выдавать себя за другого пользователя, оскорблять игроков, преследовать их или использовать функции профиля для рассылки нежелательных сообщений.",
      "Наличие социальной функции в одном разделе не означает, что она доступна во всех играх или режимах.",
    ],
  },
  {
    title: "14. Честность игры и проверка раундов",
    clauses: [
      "В отдельных играх могут отображаться сведения о честности, случайных результатах, раундах или проверочных данных.",
      "Доступный способ проверки зависит от конкретной игры. Если результат создаётся механизмом Telegram, он не обязательно проверяется тем же способом, что результат, рассчитанный сервером DARK ACE.",
      "Пользователь может сверить данные, показанные в разделе честности, с правилами и подсказками именно той игры, к которой они относятся.",
      "Не все старые результаты обязательно имеют одинаковый формат проверки: отображаемые сведения могут зависеть от времени игры и версии механизма.",
      "Если проверочные данные отсутствуют, не совпадают или вызывают вопросы, пользователь может передать их в поддержку вместе с названием игры и номером раунда.",
    ],
  },
  {
    title: "15. Запрещённые действия",
    clauses: [
      "Нельзя вмешиваться в работу приложения, сервера, игровых таймеров или механизма обработки ставок.",
      "Нельзя использовать ошибки, уязвимости, автоматические скрипты или сторонние инструменты для обхода игровых лимитов или получения не предусмотренного правилами преимущества.",
      "Нельзя намеренно создавать нагрузку, мешать другим пользователям или нарушать работу Telegram и DARK ACE.",
      "Нельзя подделывать результаты, подтверждения операций, сообщения поддержки или данные профиля.",
      "Нельзя использовать промокоды, бонусы, подарки и игровые функции в обход отображаемых условий.",
      "Об обнаруженной ошибке следует сообщить в поддержку и не использовать её для получения преимущества.",
    ],
  },
  {
    title: "16. Ошибки и спорные операции",
    clauses: [
      "При технической ошибке, задержке или непонятном результате сначала проверьте состояние раунда, баланс и историю операций.",
      "Не следует многократно отправлять одинаковый запрос, пока приложение показывает ожидание подтверждения. Сначала проверьте, принят ли предыдущий запрос.",
      "Для разбора обращения поддержке могут понадобиться название игры, примерное время события, номер раунда и описание последовательности действий.",
      "Не передавайте в открытых сообщениях пароли, коды входа или другие сведения, которые дают доступ к аккаунту Telegram.",
      "Если обнаружено расхождение, проверка проводится по доступным данным операции и игрового раунда.",
    ],
  },
  {
    title: "17. Доступность и обновления",
    clauses: [
      "DARK ACE может временно быть недоступно из-за технических работ, обновлений, перебоев Telegram, интернета или других технических причин.",
      "Во время обновления отдельные экраны, игры или функции могут работать иначе, чем ранее, либо быть временно скрыты.",
      "Интерфейс может изменяться для улучшения читаемости, удобства или совместимости с устройствами.",
      "Пользователь должен учитывать актуальную информацию, отображаемую в приложении, а не полагаться на старые изображения или инструкции.",
      "Сервис не обещает, что каждая функция будет доступна непрерывно на каждом устройстве и при любом качестве сети.",
    ],
  },
  {
    title: "18. Временное ограничение функций",
    clauses: [
      "При подозрении на ошибочное, автоматизированное или обходящее правила использование отдельная функция может быть временно ограничена для проверки.",
      "Ограничение может затрагивать только конкретную игру или действие и не обязательно означает удаление аккаунта.",
      "Если пользователь считает, что ограничение применено ошибочно, он может обратиться в поддержку и описать ситуацию.",
      "Для проверки обращения могут запросить сведения о раунде, игровом действии или сообщении об ошибке; отправлять секреты аккаунта не нужно.",
    ],
  },
  {
    title: "19. Игровые материалы и название DARK ACE",
    clauses: [
      "Название, оформление, тексты, интерфейсные элементы и игровые материалы DARK ACE предназначены для использования внутри сервиса.",
      "Нельзя выдавать материалы приложения за официальные материалы другого проекта или изменять их так, чтобы вводить игроков в заблуждение.",
      "Скриншоты и личные игровые результаты пользователь может использовать для личного просмотра и обсуждения, соблюдая уважение к другим игрокам.",
    ],
  },
  {
    title: "20. Обращения в поддержку",
    clauses: [
      "По вопросам работы DARK ACE, спорным операциям и техническим ошибкам можно обратиться в Telegram-поддержку: @nightworth.",
      "Чтобы обращение было понятнее, укажите игру, примерное время события, номер раунда, если он отображается, и кратко опишите проблему.",
      "Не отправляйте пароль, коды подтверждения, данные банковских карт или другие секретные сведения.",
    ],
  },
  {
    title: "21. Обновление текста соглашения",
    clauses: [
      "Текст соглашения может обновляться вместе с изменением функций и интерфейса DARK ACE.",
      "Актуальная версия размещается в приложении в разделе профиля. Перед дальнейшим использованием пользователь может ознакомиться с обновлённым текстом.",
      "Если пользователь не согласен с новой редакцией, он может прекратить пользоваться DARK ACE.",
    ],
  },
  {
    title: "22. Подтверждение пользователя",
    clauses: [
      "Продолжая пользоваться DARK ACE, пользователь подтверждает, что ему исполнилось 18 лет, он ознакомился с правилами и понимает развлекательный характер сервиса.",
      "Пользователь обязуется проверять выбранную игру, сумму и исход до отправки ставки, а также соблюдать правила конкретного режима.",
      "По вопросам работы приложения пользователь может написать в Telegram-поддержку @nightworth.",
    ],
  },
];

export function UserAgreementPage() {
  return <main className="da-hub da-profile-page da-agreement-page">
    <Link href="/profile" className="da-agreement-back" data-testid="link-back-profile-agreement">
      <ArrowLeft size={15} aria-hidden="true" /> Профиль
    </Link>
    <header className="da-page-title">
      <span className="da-kicker">DARK ACE · ДОКУМЕНТЫ</span>
      <h1>Пользовательское соглашение</h1>
      <p>DARK ACE создано в развлекательных целях.</p>
    </header>
    <article className="da-agreement-content da-panel">
      <p className="da-agreement-notice">Документ подробно описывает правила использования DARK ACE и носит информационный характер. DARK ACE создано в развлекательных целях.</p>
      {agreementSections.map((section, sectionIndex) => <section key={section.title}>
        <h2>{section.title}</h2>
        {section.clauses.map((clause, clauseIndex) => <p key={`${sectionIndex + 1}.${clauseIndex + 1}`}>
          <strong>{sectionIndex + 1}.{clauseIndex + 1}.</strong> {clause}
        </p>)}
      </section>)}
      <p className="da-agreement-acceptance">Продолжая пользоваться DARK ACE, пользователь подтверждает, что ознакомился с этим документом, понимает развлекательный характер приложения и обязуется соблюдать правила выбранной игры.</p>
    </article>
  </main>;
}

export function PublicProfilePage({ publicUserId }: { publicUserId: string }) {
  const [tab, setTab] = useState<PublicProfileTab>("overview");
  const profileQuery = useGetDarkAcePublicProfile(publicUserId, {
    query: {
      enabled: Boolean(publicUserId),
      queryKey: getGetDarkAcePublicProfileQueryKey(publicUserId),
      refetchInterval: 15000,
      refetchIntervalInBackground: false,
    },
  });
  if (profileQuery.isLoading) return <main className="da-hub da-profile-page" aria-label="Загрузка публичного профиля">
    <div className="da-heading-skeleton" /><LoadingState rows={5} />
  </main>;
  const errorStatus = (profileQuery.error as { status?: number } | null)?.status;
  if (!publicUserId || errorStatus === 404) return <main className="da-hub da-profile-page">
    <PageTitle eyebrow="DARK ACE · ИГРОК" title="Профиль не найден" detail="Проверьте публичную ссылку и попробуйте снова." />
    <EmptyState icon={UserRound} title="Такого игрока нет" detail="Публичный профиль не найден или больше недоступен." />
  </main>;
  if (profileQuery.isError || !profileQuery.data) return <main className="da-hub da-profile-page">
    <PageTitle eyebrow="DARK ACE · ИГРОК" title="Публичный профиль" detail="Открытая карточка участника клуба." />
    <QueryError onRetry={() => void profileQuery.refetch()} />
  </main>;
  const profile = profileQuery.data;
  if (!profile.publicProfile && !profile.isOwnProfile) return <main className="da-hub da-profile-page">
    <PageTitle eyebrow="DARK ACE · ЗАКРЫТАЯ КАРТОЧКА" title="Профиль закрыт" detail="Владелец ограничил просмотр своей клубной карточки." />
    <EmptyState icon={LockKeyhole} title="Доступ ограничен" detail="Профиль и подарки доступны только при включённой публичности." />
  </main>;
  return <main className="da-hub da-profile-page">
    <PageTitle eyebrow="DARK ACE · ОТКРЫТАЯ КАРТОЧКА" title="Профиль игрока" detail="Публичная идентичность и подтверждённый прогресс." />
    <ProfileIdentity profile={profile} />
    <Tabs label="Разделы профиля игрока" value={tab} onChange={(value) => setTab(value as PublicProfileTab)} items={[
      { id: "overview", label: "Обзор" }, { id: "gifts", label: "Подарки" },
      { id: "stats", label: "Статистика" },
    ]} />
    {tab === "overview" && <section className="da-profile-content da-animate" aria-label="Обзор игрока">
      <FriendsArea profile={profile} />
    </section>}
    {tab === "gifts" && <section className="da-profile-content da-animate" aria-label="Подарки игрока">
      <div className="da-section-head"><div><span className="da-kicker">ЗНАКИ УВАЖЕНИЯ</span><h2>Коллекция подарков</h2></div></div>
      <PublicGiftCollection publicUserId={profile.publicUserId} />
    </section>}
    {tab === "stats" && <section className="da-profile-content da-animate" aria-label="Статистика игрока">
      <div className="da-section-head"><div><span className="da-kicker">ТОЛЬКО РЕАЛЬНЫЕ РЕЗУЛЬТАТЫ</span><h2>Игровая статистика</h2></div></div>
      <ProfileStats stats={profile.stats} />
    </section>}
  </main>;
}

function PageTitle({ eyebrow, title, detail, action }: {
  eyebrow: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return <header className={`da-page-title${action ? " da-page-title-with-action" : ""}`}>
    <div className="da-page-title-copy">
      <span className="da-kicker">{eyebrow}</span><h1>{title}</h1><p>{detail}</p>
    </div>
    {action}
  </header>;
}

function TransferForm() {
  const queryClient = useQueryClient();
  const [recipient, setRecipient] = useState("");
  const [amountText, setAmountText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState("");
  const [formError, setFormError] = useState("");
  const amount = Number(amountText);
  const transferAvailability = useGetDarkAceGameAvailability({
    query: {
      queryKey: getGetDarkAceGameAvailabilityQueryKey(),
      staleTime: 0,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  });
  const transferEnabled = transferAvailability.isSuccess && transferAvailability.data.transferEnabled;
  const recipientValid = uuidPattern.test(recipient.trim());
  const amountValid = Number.isSafeInteger(amount) && amount >= 100 && amount <= 50_000_000;
  const params = useMemo<GetDarkAceTransferQuoteParams>(() => ({
    publicUserId: recipient.trim(),
    amount: Number.isSafeInteger(amount) && amount > 0 ? amount : 100,
  }), [recipient, amount]);
  const quoteEnabled = recipientValid && amountValid && transferEnabled;
  const quote = useGetDarkAceTransferQuote(params, {
    query: { enabled: quoteEnabled, queryKey: getGetDarkAceTransferQuoteQueryKey(params), staleTime: 0 },
  });
  const createTransfer = useCreateDarkAceTransfer();
  const updateForm = (fn: () => void) => {
    fn(); setConfirmed(false); setTransferSuccess(""); setFormError("");
  };
  const submitTransfer = async () => {
    if (!transferEnabled || !quote.data || !confirmed || !recipientValid || !amountValid || createTransfer.isPending) return;
    setFormError("");
    try {
      const freshQuote = await quote.refetch();
      if (freshQuote.isError || !freshQuote.data) {
        setFormError(getPromoErrorMessage(freshQuote.error, "Не удалось проверить актуальную сумму. Обновите расчёт."));
        return;
      }
      createTransfer.mutate({ data: {
        recipientPublicUserId: recipient.trim(),
        amount,
        idempotencyKey: typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
      } }, {
        onSuccess: (result) => {
          setTransferSuccess(`Перевод выполнен: ${credits(result.creditedAmount)} отправлено ${result.recipientName}.`);
          setRecipient(""); setAmountText(""); setConfirmed(false);
          void queryClient.invalidateQueries({ queryKey: getGetDarkAceOwnProfileQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
        },
        onError: (error) => setFormError(getPromoErrorMessage(error, "Перевод не выполнен. Проверьте баланс и попробуйте снова.")),
      });
    } catch {
      setFormError("Не удалось получить свежий расчёт. Попробуйте ещё раз.");
    }
  };
  return <section className="da-transfer da-panel">
    <div className="da-transfer-heading"><span className="da-transfer-icon"><ArrowUpRight size={18} /></span>
      <div><span className="da-kicker">ПЕРЕВОД МЕЖДУ ИГРОКАМИ</span><h2>Отправить кредиты</h2></div></div>
      <p className="da-transfer-explainer">Комиссия вычитается из введённой суммы. Получатель получит остаток после комиссии.</p>
    <form onSubmit={(event) => { event.preventDefault(); void submitTransfer(); }}>
      <label className="da-field"><span>Публичный UUID получателя</span>
          <input autoComplete="off" spellCheck={false} value={recipient} disabled={!transferEnabled} onChange={(event) => updateForm(() => setRecipient(event.target.value))}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" aria-invalid={recipient.length > 0 && !recipientValid}
          data-testid="input-transfer-recipient" />
        {recipient.length > 0 && !recipientValid && <small className="da-field-hint">Введите полный UUID из публичного профиля.</small>}
      </label>
      <label className="da-field"><span>Сумма списания</span>
        <div className="da-amount-input"><input type="number" min={100} max={50_000_000} step={1} inputMode="numeric" value={amountText}
          disabled={!transferEnabled} onChange={(event) => updateForm(() => setAmountText(event.target.value))} placeholder="От 100 до 50 000 000"
          aria-invalid={amountText.length > 0 && !amountValid} data-testid="input-transfer-amount" /><b>кредитов</b></div>
        {amountText.length > 0 && !amountValid && <small className="da-field-hint">Введите целое число от 100 до 50 000 000.</small>}
      </label>
    </form>
    {transferAvailability.isPending && <div className="da-quote-error" role="status">Проверяем доступность переводов…</div>}
    {transferAvailability.isError && <div className="da-quote-error" role="alert">Не удалось проверить доступность переводов. Обновите страницу.</div>}
    {transferAvailability.isSuccess && !transferEnabled && <div className="da-quote-error" role="status">Переводы кредитов временно отключены администратором.</div>}
    {quoteEnabled && <div className="da-quote-area" aria-live="polite">
      {quote.isLoading && <LoadingState rows={2} />}
      {quote.isError && <div className="da-quote-error" role="alert">{getPromoErrorMessage(quote.error, "Получатель или расчёт недоступен.")} <button type="button" onClick={() => void quote.refetch()}>Повторить</button></div>}
      {quote.data && <div className="da-quote" data-testid="transfer-quote">
        <div className="da-quote-head"><span><Check size={14} /> РАСЧЁТ ДЛЯ {quote.data.recipientName}</span>
          <button type="button" aria-label="Обновить расчёт" onClick={() => void quote.refetch()}><RefreshCw size={13} /></button></div>
        <div className="da-quote-row"><span>С вашего баланса</span><b>{credits(quote.data.debitAmount)}</b></div>
        <div className="da-quote-row"><span>Комиссия · {quote.data.feePercent}%</span><b className="da-fee">−{credits(quote.data.feeAmount)}</b></div>
        <div className="da-quote-row da-quote-recipient"><span>Получателю</span><b>{credits(quote.data.creditedAmount)}</b></div>
        <div className="da-quote-limit"><span>Остаток дневного лимита</span><b>{credits(quote.data.remainingDailyLimit)}</b></div>
        <label className="da-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} data-testid="check-transfer-confirm" />
          <span>Подтверждаю перевод <b>{credits(quote.data.debitAmount)}</b> игроку <b>{quote.data.recipientName}</b>. Понимаю, что получателю поступит сумма за вычетом комиссии.</span>
        </label>
        <button type="submit" className="da-button da-transfer-submit" disabled={!confirmed || createTransfer.isPending}
          onClick={(event) => { event.preventDefault(); void submitTransfer(); }} data-testid="button-submit-transfer">
          {createTransfer.isPending ? "Отправляем…" : "Подтвердить перевод"}
        </button>
      </div>}
    </div>}
    {transferSuccess && <div className="da-success da-transfer-result" role="status"><Check size={15} />{transferSuccess}</div>}
    {formError && <div className="da-form-error da-transfer-result" role="alert">{formError}</div>}
    {createTransfer.isError && !formError && <div className="da-form-error" role="alert">Перевод не выполнен. Попробуйте снова.</div>}
  </section>;
}

function GiftEffectOverlay({ giftId, rarity, place }: {
  giftId: string;
  rarity: DarkAceGiftCatalogEntry["rarity"];
  place: "avatar" | "art";
}) {
  const theme = giftEffectTheme(giftId);
  return <span className={`da-gift-effect da-gift-effect--${place} rarity-${rarity} gift-effect-${theme}`} aria-hidden="true">
    <i className="da-gift-effect__spark da-gift-effect__spark--one" />
    <i className="da-gift-effect__spark da-gift-effect__spark--two" />
    <i className="da-gift-effect__spark da-gift-effect__spark--three" />
    {theme === "flame" && <>
      <i className="da-gift-effect__flame da-gift-effect__flame--one" />
      <i className="da-gift-effect__flame da-gift-effect__flame--two" />
      <i className="da-gift-effect__flame da-gift-effect__flame--three" />
    </>}
  </span>;
}

function GiftArt({ gift, label, compact = false }: { gift: DarkAceGiftCatalogEntry; label?: string; compact?: boolean }) {
  const image = giftImage(gift.giftId, gift.imagePath);
  return <div className={`da-gift-image rarity-${gift.rarity} ${giftEffectClass(gift.giftId)} ${compact ? "is-compact" : ""}`} style={giftSeedStyle(gift.giftId)} data-gift-id={gift.giftId} role="img" aria-label={`${gift.name}, ${giftRarityLabels[gift.rarity]}`}>
    <SafeGiftArtwork src={image} name={gift.name} category={gift.category} />
    <GiftEffectOverlay giftId={gift.giftId} rarity={gift.rarity} place="art" />
    {!compact && <i>{label ?? giftRarityLabels[gift.rarity]}</i>}
  </div>;
}

function SafeGiftArtwork({ src, name, category }: { src?: string; name: string; category: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const hue = Array.from(name).reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 360, 17);
  return src && !failed
    ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <span className="da-gift-art-fallback" style={{ "--gift-hue": `${hue}deg` } as CSSProperties} aria-hidden="true">
      <i>{initials || "DA"}</i><small>{category.replaceAll("_", " ")}</small>
    </span>;
}

function GiftCollection({ catalogPage = false, catalogOnly = false }: { catalogPage?: boolean; catalogOnly?: boolean }) {
  const queryClient = useQueryClient();
  const ownProfile = useGetDarkAceOwnProfile();
  const catalog = useGetDarkAceGiftCatalog({ query: { queryKey: getGetDarkAceGiftCatalogQueryKey() } });
  const sent = useGetDarkAceGiftSent({ query: { queryKey: getGetDarkAceGiftSentQueryKey() } });
  const inventory = useGetDarkAceGiftInventory({ query: {
    queryKey: getGetDarkAceGiftInventoryQueryKey(),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  } });
  const purchase = useCreateDarkAceGiftPurchase();
  const sellToShop = useSellDarkAceGiftToShop();
  const sendToPlayer = useSendDarkAceGiftToPlayer();
  const sendOwnedGiftToPlayer = useSendDarkAceOwnedGiftToPlayer();
  const [view, setView] = useState<"catalog" | "collection">("catalog");
  const [collectionView, setCollectionView] = useState<"received" | "sent">("received");
  const [collectionSort, setCollectionSort] = useState<"date" | "rarity">("date");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<GiftCategory>("all");
  const [rarity, setRarity] = useState("all");
  const [priceOrder, setPriceOrder] = useState<"asc" | "desc">("asc");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [giftRecipient, setGiftRecipient] = useState<{ publicUserId: string; displayName: string; username: string | null; avatarUrl: string | null } | null>(null);
  const [giftToSend, setGiftToSend] = useState<DarkAceGiftCatalogEntry | null>(null);
  const [ownedGiftToSend, setOwnedGiftToSend] = useState<DarkAceGiftInventoryEntry | null>(null);
  const [recipientPublicId, setRecipientPublicId] = useState("");
  const [ownedGiftTransferKey, setOwnedGiftTransferKey] = useState(() => makeIdempotencyKey());
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const sellIdempotencyKeys = useRef(new Map<string, string>());
  const recipientsQueryText = recipientQuery.trim();
  const recipients = useGetDarkAceGiftRecipients(
    { query: recipientsQueryText.length >= 2 ? recipientsQueryText : "  " },
    { query: { queryKey: getGetDarkAceGiftRecipientsQueryKey({ query: recipientsQueryText.length >= 2 ? recipientsQueryText : "  " }), enabled: !!giftToSend && recipientsQueryText.length >= 2 } },
  );
  const [confirmation, setConfirmation] = useState<{ title: string; detail: string; action: () => Promise<void> } | null>(null);
  const gifts = catalog.data?.gifts ?? [];
  const owned = inventory.data?.items ?? [];
  const giftById = useMemo(() => new Map(gifts.map((gift) => [gift.giftId, gift])), [gifts]);
  const inventoryById = useMemo(() => new Map(owned.map((item) => [item.instanceId, item])), [owned]);
  const ownedSorted = useMemo(() => [...owned].sort((first, second) => {
    if (collectionSort === "date") return new Date(second.acquiredAt).getTime() - new Date(first.acquiredAt).getTime();
    const rarityWeight: Record<GiftRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
    return (rarityWeight[giftById.get(second.giftId)?.rarity ?? "common"] - rarityWeight[giftById.get(first.giftId)?.rarity ?? "common"])
      || (new Date(second.acquiredAt).getTime() - new Date(first.acquiredAt).getTime());
  }), [owned, collectionSort, giftById]);
  const refreshGifts = () => {
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceGiftCatalogQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceGiftInventoryQueryKey() });
  };
  const refreshCredits = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetDarkAceGiftCatalogQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDarkAceGiftInventoryQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetDarkAceShopQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() }),
    ]);
  };
  const refreshAfterSend = () => {
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceGiftCatalogQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceGiftInventoryQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceGiftSentQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceShopQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
  };
  const confirmAction = (title: string, detail: string, action: () => Promise<void>) => {
    setError("");
    setConfirmation({ title, detail, action });
  };
  const runConfirmed = async () => {
    if (!confirmation) return;
    try {
      await confirmation.action();
      setConfirmation(null);
    } catch (reason) {
      setConfirmation(null);
      setError(reason instanceof Error ? reason.message : "Операция не выполнена. Обновите данные и попробуйте снова.");
    }
  };
  const getGift = (giftId: string) => giftById.get(giftId);
  const sellOwnedGiftToShop = (item: DarkAceGiftInventoryEntry, giftName: string) => {
    const payout = item.acquisitionPrice;
    const idempotencyKey = sellIdempotencyKeys.current.get(item.instanceId) ?? makeIdempotencyKey();
    sellIdempotencyKeys.current.set(item.instanceId, idempotencyKey);
    confirmAction(
      "Продать подарок магазину?",
      `За «${giftName}» будет начислено ${credits(payout)} — 100% цены приобретения. Подарок исчезнет из коллекции.`,
      async () => {
        const result = await sellToShop.mutateAsync({
          instanceId: item.instanceId,
          data: { idempotencyKey },
        });
        sellIdempotencyKeys.current.delete(item.instanceId);
        await refreshCredits();
        setNotice(`Подарок «${giftName}» продан. Начислено ${credits(result.creditsDelta)}.`);
      },
    );
  };
  const doPurchase = (giftId: string) => {
    const gift = getGift(giftId);
    if (!gift) return;
    confirmAction(
      "Подтвердить покупку",
      `${gift.name} · ${credits(gift.priceCredits)} будут списаны с вашего баланса. Покупка проводится за кредиты.`,
      async () => {
        await purchase.mutateAsync({ data: { giftId, idempotencyKey: makeIdempotencyKey() } });
        await refreshCredits();
        setNotice(`${gift.name} добавлен в вашу коллекцию.`);
      },
    );
  };
  const filteredGifts = useMemo(() => gifts
    .filter((gift) => gift.available)
    .filter((gift) => category === "all" || gift.category === category)
    .filter((gift) => rarity === "all" || gift.rarity === rarity)
    .filter((gift) => gift.name.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru")))
    .sort((a, b) => priceOrder === "asc" ? a.priceCredits - b.priceCredits : b.priceCredits - a.priceCredits), [gifts, category, rarity, search, priceOrder]);
  const sendSelectedGift = async () => {
    if (!giftRecipient || !giftToSend || sendToPlayer.isPending) return;
    setError("");
    try {
      const result = await sendToPlayer.mutateAsync({
        publicUserId: giftRecipient.publicUserId,
        data: { giftId: giftToSend.giftId, idempotencyKey: makeIdempotencyKey() },
      });
      refreshAfterSend();
      setNotice(`${giftToSend.name} отправлен игроку ${giftRecipient.displayName}. С баланса списано ${credits(Math.abs(result.creditsDelta))}.`);
      setGiftToSend(null);
      setGiftRecipient(null);
      setRecipientQuery("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setError(/insufficient|balance|credit|недостат|баланс/i.test(message)
        ? "Недостаточно кредитов для отправки. Пополните баланс в разделе «Кредиты»."
        : "Не удалось отправить подарок. Проверьте баланс и попробуйте ещё раз.");
    }
  };
  const startOwnedGiftTransfer = (item: DarkAceGiftInventoryEntry) => {
    setOwnedGiftToSend(item);
    setRecipientPublicId("");
    setOwnedGiftTransferKey(makeIdempotencyKey());
    setError("");
  };
  const sendOwnedGift = async () => {
    const recipientId = recipientPublicId.trim();
    if (!ownedGiftToSend || !uuidPattern.test(recipientId) || sendOwnedGiftToPlayer.isPending) return;
    setError("");
    try {
      await sendOwnedGiftToPlayer.mutateAsync({
        instanceId: ownedGiftToSend.instanceId,
        data: { recipientPublicUserId: recipientId, idempotencyKey: ownedGiftTransferKey },
      });
      refreshGifts();
      void queryClient.invalidateQueries({ queryKey: getGetDarkAceGiftSentQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDarkAceOwnProfileQueryKey() });
      if (ownProfile.data?.publicUserId) {
        void queryClient.invalidateQueries({ queryKey: getGetDarkAcePublicProfileQueryKey(ownProfile.data.publicUserId) });
      }
      setNotice(`${getGift(ownedGiftToSend.giftId)?.name ?? "Подарок"} отправлен игроку ${recipientId}.`);
      setOwnedGiftToSend(null);
      setRecipientPublicId("");
    } catch {
      setError("Не удалось отправить подарок. Проверьте игровой ID получателя и убедитесь, что подарок ещё в вашей коллекции.");
    }
  };
  const busy = purchase.isPending || sellToShop.isPending || sendToPlayer.isPending || sendOwnedGiftToPlayer.isPending;
  const selectedView = catalogOnly ? "catalog" : catalogPage ? view : "collection";
  const categoryLabels: Record<GiftCategory, string> = {
    all: "Все категории", simple: "Простые подарки", romantic: "Романтические", wealth: "Деньги и богатство", luxury: "Роскошь и статус",
    dark_ace: "DARK ACE", characters: "Животные и персонажи", cosmos: "Космос и магия", technology: "Техника и транспорт",
    collectibles: "Редкие и коллекционные", epic: "Эпические", luxury_queen: "Luxury Queen",
  };
  const rarityLabels: Record<GiftRarity, string> = {
    ...giftRarityLabels,
  };
  return <div className="da-gifts">
    {catalogPage && !catalogOnly && <div className="da-gift-intro">
      <span className="da-gift-seal"><Gift size={20} /></span>
      <div><span className="da-kicker">ЗНАКИ, КОТОРЫЕ ОСТАЮТСЯ</span><h2>Подарки DARK ACE</h2><p>Покупайте за кредиты. Собирайте свою историю.</p></div>
    </div>}
    {catalogPage && !catalogOnly && <Tabs label="Разделы подарков" value={view} onChange={(value) => setView(value as typeof view)} items={[
      { id: "catalog", label: "Каталог" }, { id: "collection", label: `Коллекция · ${owned.length}` },
    ]} />}
    {notice && <div className="da-gift-notice" role="status" data-testid="status-gift-success"><Check size={15} />{notice}<button type="button" onClick={() => setNotice("")} aria-label="Закрыть уведомление" data-testid="button-close-gift-success"><X size={14} /></button></div>}
    {error && <div className="da-gift-error" role="alert" data-testid="status-gift-error"><CircleHelp size={15} /><span>{error}</span>{/insufficient|balance|credit|недостат|баланс/i.test(error) && <Link href="/shop/topup" className="da-button da-button-small" data-testid="link-gift-error-topup">Пополнить баланс</Link>}<button type="button" onClick={() => setError("")} aria-label="Закрыть ошибку" data-testid="button-close-gift-error"><X size={14} /></button></div>}
    {(catalog.isError || inventory.isError) && <QueryError onRetry={() => { void catalog.refetch(); void inventory.refetch(); }} />}
    {(catalog.isLoading || inventory.isLoading) && <LoadingState rows={5} />}
    {!(catalog.isLoading || inventory.isLoading || catalog.isError || inventory.isError) && selectedView === "catalog" && <>
      <div className="da-gift-sectionline"><span>КЛУБНЫЙ КАТАЛОГ</span></div>
      <div className="da-gift-filters" aria-label="Фильтры каталога">
        <label className="da-gift-search"><span className="sr-only">Поиск подарков по названию</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти подарок…" data-testid="input-gift-search" /></label>
        <label><span className="sr-only">Категория</span><select value={category} onChange={(event) => setCategory(event.target.value as GiftCategory)} data-testid="select-gift-category">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="sr-only">Редкость</span><select value={rarity} onChange={(event) => setRarity(event.target.value)} data-testid="select-gift-rarity"><option value="all">Любая редкость</option>{["common", "uncommon", "rare", "epic", "legendary", "mythic"].map((value) => <option key={value} value={value}>{rarityLabels[value as GiftRarity]}</option>)}</select></label>
        <button type="button" className="da-gift-sort" onClick={() => setPriceOrder(priceOrder === "asc" ? "desc" : "asc")} aria-label={`Сортировка: цена ${priceOrder === "asc" ? "по возрастанию" : "по убыванию"}`} data-testid="button-sort-gifts">{priceOrder === "asc" ? "Цена ↑" : "Цена ↓"}</button>
      </div>
      {filteredGifts.length ? <div className="da-gift-grid">{filteredGifts.map((gift) => <article key={gift.giftId} style={giftSeedStyle(gift.giftId)} className={`da-gift-card rarity-${gift.rarity} ${giftEffectClass(gift.giftId)} gift-id-${gift.giftId.replace(/[^a-z0-9_-]/gi, "-")}`} aria-label={`${gift.name}, ${rarityLabels[gift.rarity]}`} data-gift-id={gift.giftId} data-testid={`card-gift-${gift.giftId}`}>
        <GiftArt gift={gift} />
        <div className="da-gift-copy"><h3>{gift.name}</h3><small className="da-gift-meta">{categoryLabels[gift.category]} · {rarityLabels[gift.rarity]}</small><div className="da-gift-price"><b><Coins size={14} />{numberFormat.format(gift.priceCredits)}</b></div>
        <div className="da-gift-card-actions"><button type="button" className="da-button da-gift-buy" onClick={() => doPurchase(gift.giftId)} disabled={busy} data-testid={`button-buy-gift-${gift.giftId}`}>{purchase.isPending ? "Проводим…" : "Купить"}</button>
          <button type="button" className="da-button da-button-quiet da-gift-buy" onClick={() => { setGiftToSend(gift); setGiftRecipient(null); setRecipientQuery(""); setError(""); }} disabled={busy} data-testid={`button-gift-gift-${gift.giftId}`}><Gift size={13} /> Подарить</button></div></div>
      </article>)}</div> : <EmptyState icon={Gift} title="Ничего не найдено" detail="Измените запрос или фильтры — подходящие подарки появятся здесь." />}
      {giftToSend && createPortal(<div className="da-gift-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !sendToPlayer.isPending) { setGiftToSend(null); setGiftRecipient(null); setError(""); } }}>
        <section className="da-send-gift-panel" role="dialog" aria-modal="true" aria-labelledby="send-gift-heading" data-testid="panel-send-gift">
        <div className="da-friend-gift-head"><div><span className="da-kicker">ПОДАРОК ИЗ КАТАЛОГА</span><b id="send-gift-heading">{giftRecipient ? `Для ${giftRecipient.displayName}` : `Отправить «${giftToSend.name}»`}</b></div>
          <button type="button" className="da-friend-dismiss" onClick={() => { setGiftToSend(null); setGiftRecipient(null); setError(""); }} aria-label="Закрыть отправку подарка" data-testid="button-close-send-gift"><X size={15} /></button></div>
        {!giftRecipient && <>
          <label className="da-recipient-search"><span>ПОЛУЧАТЕЛЬ DARK ACE</span><input type="search" value={recipientQuery} onChange={(event) => { setRecipientQuery(event.target.value); setGiftRecipient(null); }} placeholder="Telegram ID, имя или @username" autoComplete="off" data-testid="input-gift-recipient-search" /></label>
          {recipientsQueryText.length < 2 ? <p className="da-recipient-hint">Введите не менее двух символов для поиска зарегистрированного игрока.</p>
            : recipients.isLoading ? <LoadingState rows={2} />
              : recipients.isError ? <QueryError onRetry={() => void recipients.refetch()} />
                : (recipients.data?.recipients ?? []).length ? <div className="da-recipient-results" role="listbox" aria-label="Найденные игроки">{(recipients.data?.recipients ?? []).map((person) => <button type="button" role="option" aria-selected="false" key={person.publicUserId} onClick={() => setGiftRecipient(person)} data-testid={`button-select-gift-recipient-${person.publicUserId}`}>
                  <span className="da-recipient-avatar">{person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : person.displayName.slice(0, 1).toUpperCase()}</span><span><b>{person.displayName}</b><small>{person.username ? `@${person.username}` : "Игрок DARK ACE"}</small></span><ChevronRight size={15} />
                </button>)}</div> : <div className="da-inline-empty">Игрок не найден. Проверьте имя или username.</div>}
        </>}
        {giftRecipient && <div className="da-send-gift-review"><div><span>ПОЛУЧАТЕЛЬ</span><b>{giftRecipient.displayName}{giftRecipient.username ? ` · @${giftRecipient.username}` : ""}</b></div><div><span>ПОДАРОК</span><b>{giftToSend.name}</b></div><div><span>ЦЕНА СЕРВЕРА</span><b>{credits(giftToSend.priceCredits)}</b></div>
          <p>Подарок будет доставлен после подтверждения покупки сервером.</p><button type="button" className="da-button" disabled={sendToPlayer.isPending} onClick={() => void sendSelectedGift()} data-testid="button-confirm-send-player-gift">{sendToPlayer.isPending ? "Отправляем…" : `Подтвердить · ${credits(giftToSend.priceCredits)}`}</button>
          <button type="button" className="da-text-button" onClick={() => setGiftRecipient(null)} disabled={sendToPlayer.isPending}>Выбрать другого игрока</button></div>}
        </section>
      </div>, document.body)}
    </>}
    {!(catalog.isLoading || inventory.isLoading || catalog.isError || inventory.isError) && selectedView === "collection" && <Tabs label="История подарков" value={collectionView} onChange={(value) => setCollectionView(value as typeof collectionView)} items={[
      { id: "received", label: `Полученные · ${owned.length}` }, { id: "sent", label: `Отправленные · ${sent.data?.gifts.length ?? 0}` },
    ]} />}
    {!(catalog.isLoading || inventory.isLoading || catalog.isError || inventory.isError) && selectedView === "collection" && collectionView === "received" && <>
      <div className="da-gift-sectionline da-gift-collection-header"><span>ВАША КОЛЛЕКЦИЯ</span><div><small>{owned.length} предметов</small><label><span className="sr-only">Порядок сортировки коллекции</span><select value={collectionSort} onChange={(event) => setCollectionSort(event.target.value as typeof collectionSort)} data-testid="select-gift-collection-sort"><option value="date">Сначала новые</option><option value="rarity">По редкости</option></select></label></div></div>
      {owned.length ? <div className="da-gift-grid">{ownedSorted.map((item) => {
        const gift = getGift(item.giftId);
         const giftName = gift?.name ?? "Подарок DARK ACE";
         const giftRarity = gift?.rarity ?? "common";
         return <article key={item.instanceId} style={gift ? giftSeedStyle(gift.giftId) : undefined} className={`da-gift-card rarity-${giftRarity} ${gift ? giftEffectClass(gift.giftId) : ""} ${gift ? `gift-id-${gift.giftId.replace(/[^a-z0-9_-]/gi, "-")}` : ""}`} aria-label={gift ? `${giftName}, ${giftRarityLabels[giftRarity]}` : giftName} data-gift-id={item.giftId} data-testid={`card-owned-gift-${item.instanceId}`}>
           {gift ? <GiftArt gift={gift} /> : <div className="da-gift-art-fallback" aria-hidden="true"><Gift size={28} /><small>Подарок из коллекции</small></div>}
           <div className="da-gift-copy"><h3>{giftName}</h3><span className="da-gift-seller">{item.giftedByDisplayName ? `Подарок от ${item.giftedByDisplayName}${item.giftedByUsername ? ` · @${item.giftedByUsername}` : ""}` : item.acquisitionSource === "upgrade" ? "Награда UPGRADE" : item.acquisitionSource === "achievement" ? "Награда клуба" : item.acquisitionSource === "player_market" ? "Приобретён у игрока" : "Покупка в каталоге"}</span><small className="da-gift-date">Получен · {giftDate(item.acquiredAt)}</small>
            <div className="da-gift-actions">
              <button type="button" className="da-button da-button-small" disabled={busy} onClick={() => startOwnedGiftTransfer(item)} data-testid={`button-gift-owned-${item.instanceId}`}><Gift size={13} /> Подарить</button>
               <button type="button" className="da-button da-button-small da-button-quiet" disabled={busy} onClick={() => sellOwnedGiftToShop(item, giftName)} data-testid={`button-sell-owned-gift-${item.instanceId}`}>Продать за {credits(item.acquisitionPrice)}</button>
            </div>
          </div>
        </article>;
      })}</div> : <EmptyState icon={Gift} title="Коллекция пока пуста" detail="Купите подарок в каталоге, чтобы он появился здесь." />}
       {ownedGiftToSend && createPortal(<div className="da-gift-modal-backdrop" role="presentation"
         onMouseDown={(event) => { if (event.target === event.currentTarget && !sendOwnedGiftToPlayer.isPending) setOwnedGiftToSend(null); }}>
         <section className="da-send-gift-panel" role="dialog" aria-modal="true" aria-labelledby="owned-gift-send-title" data-testid="panel-owned-gift-send">
           <div className="da-friend-gift-head"><div><span className="da-kicker">ПЕРЕДАТЬ ПОДАРОК</span><b id="owned-gift-send-title">{getGift(ownedGiftToSend.giftId)?.name ?? "Подарок DARK ACE"}</b></div>
             <button type="button" className="da-friend-dismiss" onClick={() => setOwnedGiftToSend(null)} aria-label="Закрыть отправку подарка"><X size={15} /></button></div>
           <label className="da-recipient-search"><span>ИГРОВОЙ ID ПОЛУЧАТЕЛЯ</span>
             <input type="text" inputMode="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={recipientPublicId}
               onChange={(event) => setRecipientPublicId(event.target.value.trim())} placeholder="Вставьте ID из профиля игрока"
               aria-invalid={recipientPublicId.length > 0 && !uuidPattern.test(recipientPublicId)} data-testid="input-owned-gift-recipient-id" />
           </label>
           <div className="da-owned-gift-transfer-info">
              <p>Подарок будет передан целиком без списания кредитов.</p>
             <small>Игровой ID можно скопировать в профиле получателя.</small>
           </div>
           {error && <div className="da-gift-error" role="alert" data-testid="error-owned-gift-transfer">{error}</div>}
           <button type="button" className="da-button" disabled={!uuidPattern.test(recipientPublicId.trim()) || sendOwnedGiftToPlayer.isPending}
             onClick={() => void sendOwnedGift()} data-testid="button-confirm-owned-gift-send">
             {sendOwnedGiftToPlayer.isPending ? "Отправляем…" : "Подарить"}
           </button>
         </section>
       </div>, document.body)}
    </>}
    {selectedView === "collection" && collectionView === "sent" && <section className="da-sent-gifts" aria-label="История отправленных подарков">
      <div className="da-gift-sectionline"><span>ОТПРАВЛЕННЫЕ ПОДАРКИ</span><small>{sent.data?.gifts.length ?? 0} доставок</small></div>
      {sent.isLoading ? <LoadingState rows={4} /> : sent.isError ? <QueryError onRetry={() => void sent.refetch()} />
        : sent.data?.gifts.length ? <div className="da-sent-list">{sent.data.gifts.map((entry) => {
          const gift = getGift(entry.giftId);
          return <article className="da-sent-row" key={entry.instanceId} data-testid={`row-sent-gift-${entry.instanceId}`}>
            {gift ? <GiftArt gift={gift} compact /> : <span className="da-gift-art-fallback" aria-hidden="true"><i>DA</i><small>DARK ACE</small></span>}
            <div><b>{gift?.name ?? "Подарок DARK ACE"}</b><span>Для {entry.recipientDisplayName}{entry.recipientUsername ? ` · @${entry.recipientUsername}` : ""}</span><small>{giftDate(entry.sentAt)}</small></div>
            <strong>{credits(entry.amount)}</strong>
          </article>;
        })}</div> : <EmptyState icon={Gift} title="Вы ещё не отправляли подарки" detail="Подарите знак клуба игроку — доставка появится в этой истории." />}
    </section>}
    {confirmation && createPortal(<div className="da-confirm-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmation(null); }}>
      <section className="da-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="gift-confirm-title">
        <span className="da-gift-seal"><ShieldCheck size={19} /></span><h2 id="gift-confirm-title">{confirmation.title}</h2><p>{confirmation.detail}</p>
        <div><button type="button" className="da-button da-button-quiet" onClick={() => setConfirmation(null)} data-testid="button-gift-confirm-cancel">Вернуться</button><button type="button" className="da-button" onClick={() => void runConfirmed()} disabled={busy} data-testid="button-gift-confirm">{busy ? "Обрабатываем…" : "Подтвердить"}</button></div>
      </section>
    </div>, document.body)}
  </div>;
}

export function BotTopupPage({ botUrl, title = "Пополнение DARK ACE" }: { botUrl?: string | null; title?: string }) {
  const attempted = useRef(false);
  useEffect(() => {
    if (!botUrl || attempted.current) return;
    attempted.current = true;
    const telegram = (window as any).Telegram?.WebApp;
    try {
      if (telegram?.openTelegramLink) {
        telegram.openTelegramLink(botUrl);
        window.setTimeout(() => telegram.close?.(), 250);
      } else {
        window.location.assign(botUrl);
      }
    } catch {
      attempted.current = false;
    }
  }, [botUrl]);

  return (
    <main className="profile-hub-page">
      <section className="profile-hub-card" aria-live="polite">
        <h1>{title}</h1>
        <p>{botUrl ? "Открываем Telegram-бот. Если переход не сработал, нажмите кнопку ниже." : "Ссылка на бота пока не настроена."}</p>
        {botUrl && <a className="da-button" href={botUrl}>Продолжить в боте</a>}
      </section>
    </main>
  );
}

export function MarketPage({ initialDurakView = "topup" }: { initialDurakView?: "topup" | "withdraw" }) {
  const shop = useGetDarkAceShop({
    query: { queryKey: getGetDarkAceShopQueryKey() },
  });
  const [tab, setTab] = useState<MarketTab>("durak");
  const cryptoTopupAvailability = useGetDarkAceCryptoTopupAvailability({
    query: {
      queryKey: getGetDarkAceCryptoTopupAvailabilityQueryKey(),
      enabled: tab === "crypto",
    },
  });
  const [durakView, setDurakView] = useState<"topup" | "withdraw">(initialDurakView);
  const [pendingDurakAmount, setPendingDurakAmount] = useState<number | null>(null);
  const [durakRequestKey, setDurakRequestKey] = useState<string | null>(null);
  const [durakSubmitting, setDurakSubmitting] = useState(false);
  const [durakError, setDurakError] = useState<string | null>(null);
  const [cryptoAmount, setCryptoAmount] = useState<number | null>(null);
  const [cryptoRequestKey, setCryptoRequestKey] = useState<string | null>(null);
  const [cryptoSubmitting, setCryptoSubmitting] = useState(false);
  const [cryptoError, setCryptoError] = useState<string | null>(null);
  const [withdrawalAmountText, setWithdrawalAmountText] = useState("");
  const [reportedGameBalanceText, setReportedGameBalanceText] = useState("");
  const packages = useMemo(() => shop.data?.packages ?? [], [shop.data?.packages]);
  const durakAmounts = [50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000, 15_000_000, 20_000_000, 25_000_000];
  const visibleDurakAmounts = durakView === "withdraw"
    ? durakAmounts.filter((amount) => amount !== 50_000)
    : durakAmounts;
  const withdrawalAmount = parseDurakWholeAmount(withdrawalAmountText);
  const reportedGameBalance = parseDurakWholeAmount(reportedGameBalanceText);
  const wageringRequired = shop.data?.wageringRequiredCredits ?? 0;
  const wageringCompleted = shop.data?.wageringCompletedCredits ?? 0;
  const wageringRemaining = Math.max(0, wageringRequired - wageringCompleted);
  const wageringCompletedDisplay = Math.min(wageringCompleted, wageringRequired);
  const withdrawalWagerSummary = `Общий вейджер: ${credits(wageringRequired)}. Выполнено: ${credits(wageringCompletedDisplay)}. Осталось отыграть: ${credits(wageringRemaining)}.`;
  const openDurakRequest = (amount: number) => {
    setDurakError(null);
    setReportedGameBalanceText("");
    setPendingDurakAmount(amount);
    setDurakRequestKey(crypto.randomUUID());
  };
  const submitDurakRequest = async () => {
    if (pendingDurakAmount === null || durakSubmitting) return;
    if (durakView === "withdraw" && (
      reportedGameBalance === null
      || reportedGameBalance < 0
    )) {
      setDurakError("Укажите баланс в игре от 100 до 50 000 000.");
      return;
    }
    setDurakSubmitting(true);
    setDurakError(null);
    try {
      const response = await fetch(apiUrl("/api/dark-ace/durak/requests"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: durakView === "topup" ? "topup" : "withdrawal",
          amount: pendingDurakAmount,
          idempotencyKey: durakRequestKey ?? crypto.randomUUID(),
          ...(durakView === "withdraw" ? { reportedGameBalance } : {}),
        }),
      });
      const payload = await response.json() as { botUrl?: string; error?: string };
      if (!response.ok || !payload.botUrl) {
        setDurakError(payload.error ?? "Не удалось создать заявку. Попробуйте ещё раз.");
        if (response.status === 403) void shop.refetch();
        return;
      }
      setPendingDurakAmount(null);
      setDurakRequestKey(null);
      setReportedGameBalanceText("");
      openBotLink(payload.botUrl);
    } catch {
      setDurakError("Не удалось связаться с сервером. Проверьте подключение и повторите попытку.");
    } finally {
      setDurakSubmitting(false);
    }
  };
  const submitCryptoTopup = async (amount = cryptoAmount, requestKey = cryptoRequestKey) => {
    if (amount === null || amount === undefined || cryptoSubmitting) return;
    setCryptoSubmitting(true);
    setCryptoError(null);
    try {
      const response = await fetch(apiUrl("/api/dark-ace/crypto-topups"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credits: amount,
          idempotencyKey: requestKey ?? crypto.randomUUID(),
        }),
      });
      const payload = await response.json() as { botUrl?: string; error?: string };
      if (!response.ok || !payload.botUrl) {
        setCryptoError(payload.error ?? "Не удалось создать заявку. Попробуйте ещё раз.");
        if (response.status === 409) void shop.refetch();
        return;
      }
      setCryptoAmount(null);
      setCryptoRequestKey(null);
      openBotLink(payload.botUrl);
    } catch {
      setCryptoError("Не удалось связаться с сервером. Проверьте подключение и повторите попытку.");
    } finally {
      setCryptoSubmitting(false);
    }
  };
  const openBotLink = (botUrl: string) => {
    const telegram = (window as Window & {
      Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void; close?: () => void } };
    }).Telegram?.WebApp;
    if (telegram?.openTelegramLink) {
      telegram.openTelegramLink(botUrl);
      window.setTimeout(() => telegram.close?.(), 180);
      return;
    }
    window.location.assign(botUrl);
  };
  return <main className="da-hub da-market-page">
    <PageTitle
      eyebrow="КЛУБНАЯ КАССА"
      title="Маркет"
      detail="Дурак Онлайн и пополнение баланса Stars."
      action={<Link href="/profile#profile-redeem-promo" className="da-button da-button-small da-market-promo-link" data-testid="link-market-redeem-promo">
        <Ticket size={14} aria-hidden="true" />Ввести промокод
      </Link>}
    />
    <Tabs label="Разделы маркета" value={tab} onChange={(value) => setTab(value as MarketTab)} items={[
      { id: "durak", label: "Дурак Онлайн" }, { id: "stars", label: "Звёзды" }, { id: "crypto", label: "Крипта" },
    ]} />
    {tab === "crypto" && <div className="da-market-content da-animate" data-testid="crypto-topup-market">
      <div className="da-market-notice da-crypto-topup-notice">
        <span><Coins size={16} /></span>
        <p><b>Пополнение USDT</b><small>Цена: {numberFormat.format(cryptoTopupAvailability.data?.creditRubPerMillion ?? 300)} ₽ за 1 млн кредитов. Курс фиксируется на 15 минут; оплату проверяет администратор.</small></p>
      </div>
      {cryptoTopupAvailability.isLoading ? <LoadingState rows={3} />
        : cryptoTopupAvailability.isError ? <QueryError onRetry={() => void cryptoTopupAvailability.refetch()} />
          : <>
            {!cryptoTopupAvailability.data?.enabled && <div className="da-market-reason da-crypto-disabled" role="status">
              <LockKeyhole size={14} aria-hidden="true" />
              <span>{cryptoTopupAvailability.data?.reason || "Пополнение сейчас недоступно."}</span>
            </div>}
            <section className="da-package-list" aria-label="Пакеты пополнения USDT">
              {CRYPTO_TOPUP_CREDIT_AMOUNTS.map((amount, index) => {
                const rubles = Math.ceil(amount * cryptoTopupAvailability.data!.creditRubPerMillion / 1_000_000);
                const selected = cryptoAmount === amount;
                const available = cryptoTopupAvailability.data?.enabled === true;
                return <article className={`da-package da-panel${selected ? " da-crypto-package--selected" : ""}`} key={amount}>
                  <div className="da-package-number">{String(index + 1).padStart(2, "0")}</div>
                  <div className="da-package-main">
                    <span className="da-kicker">ПОПОЛНЕНИЕ USDT</span>
                    <b>{credits(amount)}</b>
                    <span className="da-package-savings">Курс фиксируется на 15 минут</span>
                  </div>
                  <div className="da-package-side">
                    <small>≈ {numberFormat.format(rubles)} ₽</small>
                    <button
                      type="button"
                      className="da-package-buy"
                      disabled={!available || cryptoSubmitting}
                      onClick={() => {
                        const requestKey = selected && cryptoRequestKey ? cryptoRequestKey : crypto.randomUUID();
                        setCryptoAmount(amount);
                        setCryptoRequestKey(requestKey);
                        void submitCryptoTopup(amount, requestKey);
                      }}
                      data-testid={`button-crypto-topup-${amount}`}
                    >
                      {cryptoSubmitting && selected ? "Создаём…" : !available ? "Недоступно" : selected && cryptoError ? "Повторить" : "Пополнить"}
                    </button>
                  </div>
                </article>;
              })}
            </section>
            {cryptoError && <p className="da-crypto-error" role="alert">{cryptoError}</p>}
            {cryptoTopupAvailability.data?.enabled && <p className="da-crypto-topup-footnote">
              Выберите сумму — сеть и реквизиты появятся в Telegram-боте.
            </p>}
          </>}
    </div>}
    {tab === "stars" && <div className="da-market-content da-animate">
      <section className="da-market-notice"><span><LockKeyhole size={16} /></span><p><b>Базовый курс: 285 Stars за 1 млн кредитов</b><small>{shop.data?.purchasesEnabled
        ? "Оплата проходит внутри Telegram. Кредиты зачисляются после подтверждения платежа."
        : "Цена округляется вверх до целых Stars. Покупка станет доступна после настройки Telegram webhook."}</small></p></section>
      {shop.isLoading ? <LoadingState rows={4} /> : shop.isError ? <QueryError onRetry={() => void shop.refetch()} />
        : shop.data && packages.length ? <>
          <section className="da-package-list" aria-label="Пакеты кредитов">
            {packages.map((pack, index) => <StarsPackageCard
              key={`${pack.credits}-${index}`}
              index={index}
              pack={pack}
            />)}
          </section>
          <StarsCustomPurchaseCard
            packages={packages}
            starsPerMillionCredits={shop.data.starsPerMillionCredits}
            minCredits={shop.data.minPurchaseCredits}
            maxCredits={shop.data.maxPurchaseCredits}
            available={shop.data.purchasesEnabled}
          />
        </> : <EmptyState icon={Coins} title="Пакетов пока нет" detail="Настроенные пакеты кредитов появятся здесь." />}
      {shop.data?.reason && <p className="da-market-reason"><ShieldCheck size={14} />{shop.data.reason}</p>}
      <TransferForm />
    </div>}
    {tab === "durak" && <section className="da-market-content da-animate" data-testid="durak-market">
       <div className="da-market-notice da-market-durak-notice">
         <span><Coins size={16} /></span>
          <p><b>Обмен с «Дурак Онлайн»</b><small>{shop.data?.durakExchangeEnabled
             ? "Курс вывода: 1 игровая единица = 1 кредит DARK ACE. Одна активная заявка за раз: новую можно создать после закрытия текущей."
            : shop.data?.durakExchangeReason ?? "Проверяем доступность операций…"}</small></p>
       </div>
        <Tabs label="Операции Дурак Онлайн" value={durakView} onChange={(value) => {
          setDurakView(value as typeof durakView);
          if (value === "withdraw") void shop.refetch();
          setPendingDurakAmount(null);
          setDurakRequestKey(null);
           setReportedGameBalanceText("");
          setDurakError(null);
        }} items={[
          { id: "topup", label: "Пополнить" }, { id: "withdraw", label: "Вывод" },
        ]} />
        <div className="da-market-notice da-durak-withdrawal-rule">
          <span><LockKeyhole size={16} /></span>
          <p><b>{durakView === "topup" ? "Пополнение игрового баланса" : "Условие вывода"}</b>
            <small>{durakView === "withdraw"
              ? wageringRemaining > 0
                ? `${withdrawalWagerSummary} Учитываются завершённые ставки.`
                : `${withdrawalWagerSummary} Условия выполнены. После заявки баланс не меняется до отправки инструкции; тогда сумма замораживается и списывается после подтверждения перевода администратором.`
               : "Выберите сумму, затем подтвердите заявку в Telegram-боте."}</small></p>
        </div>
        {shop.data?.isBlocked && <div className="da-market-durak-blocked" role="status">Доступ к операциям Маркета ограничен.</div>}
        <div className="da-durak-package-grid" aria-label={durakView === "topup" ? "Суммы пополнения" : "Суммы вывода"}>
          {visibleDurakAmounts.map((amount) => (
            <button type="button" key={amount}
              className={`da-durak-package${durakView === "withdraw" && amount === 100_000 ? " da-durak-package--withdraw-first" : ""}`}
              disabled={!!shop.data?.isBlocked || !shop.data?.durakExchangeEnabled || durakSubmitting || (durakView === "withdraw" && wageringRemaining > 0)}
              aria-pressed={pendingDurakAmount === amount}
              onClick={() => {
                 openDurakRequest(amount);
              }}
              data-testid={`button-durak-${durakView}-${amount}`}>
              <b>{formatCompactCredits(amount)}</b>
              <small>{durakView === "topup" ? "кредитов DARK ACE" : "игровой валюты"}</small>
            </button>
          ))}
        </div>
         {durakView === "withdraw" && <form className="da-durak-custom-withdrawal"
           onSubmit={(event) => {
             event.preventDefault();
             if (withdrawalAmount !== null
               && withdrawalAmount >= MIN_DURAK_WITHDRAWAL_AMOUNT
               && withdrawalAmount <= MAX_DURAK_WITHDRAWAL_AMOUNT) {
               openDurakRequest(withdrawalAmount);
             }
           }}>
           <label htmlFor="da-durak-custom-withdrawal">Другая сумма вывода</label>
           <div className="da-durak-custom-withdrawal-row">
             <input id="da-durak-custom-withdrawal" type="text" inputMode="decimal" autoComplete="off"
               placeholder="От 100 000 до 50 000 000" value={withdrawalAmountText}
               onChange={(event) => setWithdrawalAmountText(event.currentTarget.value)}
               aria-describedby="da-durak-withdrawal-amount-hint" />
             <button type="submit" className="da-button"
               disabled={withdrawalAmount === null
                 || withdrawalAmount < MIN_DURAK_WITHDRAWAL_AMOUNT
                 || withdrawalAmount > MAX_DURAK_WITHDRAWAL_AMOUNT
                 || !!shop.data?.isBlocked || !shop.data?.durakExchangeEnabled
                 || durakSubmitting || wageringRemaining > 0}>
               Продолжить
             </button>
           </div>
            <small id="da-durak-withdrawal-amount-hint">Можно указать любую сумму от {formatCompactCredits(MIN_DURAK_WITHDRAWAL_AMOUNT)} до {formatCompactCredits(MAX_DURAK_WITHDRAWAL_AMOUNT)}. Точки и пробелы разделяют тысячи.</small>
         </form>}
        <Dialog.Root
          open={pendingDurakAmount !== null}
          onOpenChange={(open) => {
            if (!open && !durakSubmitting) {
              setPendingDurakAmount(null);
              setDurakRequestKey(null);
              setDurakError(null);
            }
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="da-durak-confirm-overlay" />
            <Dialog.Content className="da-durak-confirm-dialog" data-testid="dialog-durak-confirm">
              <Dialog.Title className="da-durak-confirm-title">
                {durakView === "topup" ? "Подтвердить пополнение?" : "Баланс в игре «Дурак Онлайн»"}
              </Dialog.Title>
              {pendingDurakAmount !== null && <Dialog.Description className="da-durak-confirm-description">
                {durakView === "topup"
                  ? `${formatCompactCredits(pendingDurakAmount)} кредитов DARK ACE`
                  : `${formatCompactCredits(pendingDurakAmount)} игровой валюты «Дурак Онлайн» → ${formatCompactCredits(pendingDurakAmount)} кредитов`}
              </Dialog.Description>}
              {durakView === "withdraw" && <p className="da-durak-confirm-note">
                Укажите текущий игровой баланс. Его увидит администратор вместе с суммой вывода.
              </p>}
              {durakView === "withdraw" && <label className="da-durak-reported-balance" htmlFor="da-durak-reported-balance">
                <span>Ваш баланс в «Дурак Онлайн»</span>
                <input id="da-durak-reported-balance" type="text" inputMode="decimal" autoComplete="off"
                  placeholder="Например, 15.250" maxLength={12} value={reportedGameBalanceText}
                  onChange={(event) => setReportedGameBalanceText(event.currentTarget.value)}
                  aria-describedby="da-durak-reported-balance-hint" />
              <small id="da-durak-reported-balance-hint">Укажите целый баланс. Например, 15.250 означает 15 250.</small>
              </label>}
              {durakError && <p className="da-market-request-error" role="alert">{durakError}</p>}
              <div className="da-durak-confirm-actions">
                <button type="button" className="da-button da-button-quiet" disabled={durakSubmitting}
                  onClick={() => {
                    setPendingDurakAmount(null);
                    setDurakRequestKey(null);
                    setDurakError(null);
                  }}>Отмена</button>
                <button type="button" className="da-button"
                  disabled={durakSubmitting || !!shop.data?.isBlocked || !shop.data?.durakExchangeEnabled
                    || (durakView === "withdraw" && (wageringRemaining > 0 || reportedGameBalance === null
                      || reportedGameBalance < 0))}
                  onClick={() => void submitDurakRequest()}>
                  {durakSubmitting ? "Создаём…" : durakView === "withdraw" ? "Подтвердить и перейти в бота" : "Подтвердить и перейти в бота"}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
     </section>}
  </main>;
}

type StarsPurchasePack = {
  credits: number;
  stars: number | null;
  baseStars: number;
  discountPercent: number;
  savingsStars: number;
  available: boolean;
};

type StarsPaymentStage = "idle" | "opening" | "confirming" | "cancelling" | "cancel-failed" | "paid" | "cancelled" | "failed" | "waiting";

function useStarsInvoiceCheckout(pack: Pick<StarsPurchasePack, "credits" | "stars" | "available"> | null) {
  const queryClient = useQueryClient();
  const createInvoice = useCreateDarkAceShopInvoice();
  const cancelInvoice = useCancelDarkAceShopPurchase();
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  const [paymentStage, setPaymentStage] = useState<StarsPaymentStage>("idle");
  const purchase = useGetDarkAceShopPurchase(purchaseId ?? "", {
    query: {
      enabled: Boolean(purchaseId) && paymentStage === "confirming",
      queryKey: ["dark-ace-shop-purchase", purchaseId],
      refetchInterval: paymentStage === "confirming" ? 1_200 : false,
      refetchIntervalInBackground: false,
    },
  });

  useEffect(() => {
    if (paymentStage === "confirming" && purchase.data?.status === "paid") {
      setPaymentStage("paid");
      void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDarkAceOwnProfileQueryKey() });
    } else if (paymentStage === "confirming" && purchase.data?.status === "failed") {
      setPaymentStage("failed");
    }
  }, [paymentStage, purchase.data?.status, queryClient]);

  const markPaid = () => {
    setPaymentStage("paid");
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListDarkAceTransactionsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDarkAceOwnProfileQueryKey() });
  };

  const cancelUnpaidInvoice = async (id: string, resultStage: "cancelled" | "failed" = "cancelled") => {
    setPurchaseId(id);
    setPaymentStage("cancelling");
    let result: Awaited<ReturnType<typeof cancelInvoice.mutateAsync>> | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await cancelInvoice.mutateAsync({ purchaseId: id });
        break;
      } catch {
        if (attempt === 1) {
          setPaymentStage("cancel-failed");
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    }
    if (result?.status === "paid") {
      markPaid();
    } else if (result?.status === "cancelled") {
      setPaymentStage(resultStage);
    } else if (result?.status === "failed") {
      setPaymentStage("failed");
    } else {
      setPaymentStage("cancel-failed");
    }
  };

  useEffect(() => {
    if (paymentStage !== "confirming") return;
    const timeout = window.setTimeout(() => setPaymentStage((current) => current === "confirming" ? "waiting" : current), 30_000);
    return () => window.clearTimeout(timeout);
  }, [paymentStage, purchaseId]);

  const beginPurchase = async () => {
    if (!pack?.available || pack.stars === null || createInvoice.isPending) return;
    setPaymentStage("opening");
    let createdPurchaseId: string | null = null;
    try {
      const invoice = await createInvoice.mutateAsync({ data: { credits: pack.credits } });
      createdPurchaseId = invoice.purchaseId;
      setPurchaseId(invoice.purchaseId);
      const webApp = (window as any).Telegram?.WebApp;
      if (typeof webApp?.openInvoice !== "function") {
        void cancelUnpaidInvoice(invoice.purchaseId, "failed");
        return;
      }
      webApp.openInvoice(invoice.invoiceUrl, (status: string) => {
        if (status === "paid") setPaymentStage("confirming");
        else if (status === "cancelled") void cancelUnpaidInvoice(invoice.purchaseId, "cancelled");
        else void cancelUnpaidInvoice(invoice.purchaseId, "failed");
      });
    } catch {
      if (createdPurchaseId) void cancelUnpaidInvoice(createdPurchaseId, "failed");
      else setPaymentStage("failed");
    }
  };

  const statusText = paymentStage === "opening" ? "Создаём счёт…"
    : paymentStage === "confirming" ? "Подтверждаем оплату…"
      : paymentStage === "cancelling" ? "Закрываем неоплаченный счёт…"
        : paymentStage === "cancel-failed" ? "Не удалось закрыть счёт — нажмите «Повторить отмену»"
          : paymentStage === "paid" ? "Оплачено — кредиты зачислены"
            : paymentStage === "cancelled" ? "Оплата отменена"
              : paymentStage === "waiting" ? "Подтверждение задерживается — проверить"
                : paymentStage === "failed" ? "Не удалось открыть оплату"
                  : null;

  const onPurchaseClick = () => {
    if (paymentStage === "cancel-failed" && purchaseId) {
      void cancelUnpaidInvoice(purchaseId);
      return;
    }
    if (paymentStage === "waiting") {
      setPaymentStage("confirming");
      return;
    }
    void beginPurchase();
  };

  return {
    createInvoice,
    isCancelling: cancelInvoice.isPending || paymentStage === "cancelling",
    paymentStage,
    statusText,
    onPurchaseClick,
  };
}

function StarsPackageCard({ index, pack }: {
  index: number;
  pack: StarsPurchasePack;
}) {
  const checkout = useStarsInvoiceCheckout(pack);
  const isBestDeal = pack.discountPercent === 10;

  return <article className={`da-package da-panel${isBestDeal ? " da-package--best" : ""}`} data-testid={`market-package-${pack.credits}`}>
    <div className={`da-package-number${isBestDeal ? " da-package-number--best" : ""}`}>{String(index + 1).padStart(2, "0")}</div>
    <div className="da-package-main">
      <span className="da-kicker">{isBestDeal ? "МАКСИМАЛЬНАЯ СКИДКА" : "ПАКЕТ КРЕДИТОВ"}</span>
      <b>{credits(pack.credits)}</b>
      <span className="da-package-savings">{pack.discountPercent}% скидка · экономия {numberFormat.format(pack.savingsStars)} Stars</span>
    </div>
    <div className="da-package-side">
      <small>{pack.stars === null ? "Цена уточняется" : `${numberFormat.format(pack.stars)} Stars`}</small>
      <button
        type="button"
        className="da-package-buy"
        disabled={!pack.available || pack.stars === null || checkout.createInvoice.isPending || checkout.isCancelling || checkout.paymentStage === "opening" || checkout.paymentStage === "confirming"}
        onClick={checkout.onPurchaseClick}
        data-testid={`button-buy-credits-${pack.credits}`}
      >
        {checkout.isCancelling ? "Отменяем…" : checkout.paymentStage === "cancel-failed" ? "Повторить отмену" : checkout.createInvoice.isPending || checkout.paymentStage === "opening" ? "Подождите…" : checkout.paymentStage === "waiting" ? "Проверить" : pack.available ? "Купить" : "Недоступно"}
      </button>
      {checkout.statusText && <span className={checkout.paymentStage === "paid" ? "da-package-ready" : "da-package-off"} role="status">{checkout.statusText}</span>}
    </div>
  </article>;
}

function StarsCustomPurchaseCard({
  packages,
  starsPerMillionCredits,
  minCredits,
  maxCredits,
  available,
}: {
  packages: StarsPurchasePack[];
  starsPerMillionCredits: number;
  minCredits: number;
  maxCredits: number;
  available: boolean;
}) {
  const [creditsText, setCreditsText] = useState("");
  const creditsValue = /^\d+$/.test(creditsText) ? Number(creditsText) : NaN;
  const isValid = Number.isSafeInteger(creditsValue) && creditsValue >= minCredits && creditsValue <= maxCredits;
  const discountPercent = isValid
    ? packages.reduce((best, pack) => pack.credits <= creditsValue ? Math.max(best, pack.discountPercent) : best, 0)
    : 0;
  const baseStars = isValid ? Math.ceil((creditsValue * starsPerMillionCredits) / 1_000_000) : null;
  const stars = isValid
    ? Math.ceil((creditsValue * starsPerMillionCredits * (100 - discountPercent)) / 100_000_000)
    : null;
  const savingsStars = baseStars !== null && stars !== null ? Math.max(0, baseStars - stars) : 0;
  const pack = isValid && stars !== null && baseStars !== null
    ? { credits: creditsValue, stars, baseStars, discountPercent, savingsStars, available }
    : null;
  const checkout = useStarsInvoiceCheckout(pack);

  return <section className="da-custom-stars da-panel" aria-label="Покупка произвольной суммы кредитов">
    <div className="da-custom-stars-heading">
      <div><span className="da-kicker">СВОЯ СУММА</span><h2>Сколько кредитов нужно?</h2></div>
      <Coins size={19} aria-hidden="true" />
    </div>
    <label className="da-custom-stars-label" htmlFor="dark-ace-custom-stars-credits">Количество кредитов</label>
    <input
      id="dark-ace-custom-stars-credits"
      className="da-custom-stars-input"
      type="number"
      inputMode="numeric"
      min={minCredits}
      max={maxCredits}
      step={1}
      value={creditsText}
      onChange={(event) => setCreditsText(event.target.value)}
      placeholder="Например, 1 250 000"
      aria-describedby="dark-ace-custom-stars-help"
      aria-invalid={creditsText.length > 0 && !isValid}
      disabled={checkout.paymentStage === "confirming" || checkout.paymentStage === "opening" || checkout.isCancelling || checkout.paymentStage === "cancel-failed"}
      data-testid="input-custom-stars-credits"
    />
    <small id="dark-ace-custom-stars-help" className="da-custom-stars-help">
      От {numberFormat.format(minCredits)} до {numberFormat.format(maxCredits)} целых кредитов. Цена рассчитывается на сервере и округляется вверх.
    </small>
    {isValid && baseStars !== null && stars !== null
      ? <div className="da-custom-stars-quote" aria-live="polite">
        <span>{discountPercent > 0 ? `Скидка ${discountPercent}%` : "Без скидки"}</span>
        <span>Экономия {numberFormat.format(savingsStars)} Stars</span>
        <strong>{numberFormat.format(stars)} Stars</strong>
      </div>
      : <p className="da-custom-stars-invalid" role="status">
        {creditsText.length === 0 ? "Введите сумму — покажем точную цену до оплаты."
          : `Сумма должна быть целым числом от ${numberFormat.format(minCredits)} до ${numberFormat.format(maxCredits)}.`}
      </p>}
    <button
      type="button"
      className="da-custom-stars-buy"
      disabled={!pack || !available || pack.stars === null || checkout.createInvoice.isPending || checkout.isCancelling || checkout.paymentStage === "opening" || checkout.paymentStage === "confirming"}
      onClick={checkout.onPurchaseClick}
      data-testid="button-buy-custom-credits"
    >
      {checkout.isCancelling ? "Отменяем…"
        : checkout.paymentStage === "cancel-failed" ? "Повторить отмену"
          : checkout.createInvoice.isPending || checkout.paymentStage === "opening" ? "Создаём счёт…"
            : checkout.paymentStage === "waiting" ? "Проверить оплату"
              : available ? "Купить за Stars" : "Покупки временно недоступны"}
    </button>
    {checkout.statusText && <span className={`da-custom-stars-status${checkout.paymentStage === "paid" ? " da-package-ready" : " da-package-off"}`} role="status">{checkout.statusText}</span>}
  </section>;
}
