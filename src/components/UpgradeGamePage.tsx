import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowDown, Check, ChevronRight, CircleHelp, Coins, Gem, RotateCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import {
  getGetDarkAceBootstrapQueryKey,
  getGetDarkAceGiftCatalogQueryKey,
  getGetDarkAceGiftInventoryQueryKey,
  getGetDarkAceUpgradeHistoryQueryKey,
  getGetDarkAceUpgradeCommitmentQueryKey,
  useCreateDarkAceUpgradeAttempt,
  useGetDarkAceUpgradeCommitment,
  useGetDarkAceGiftCatalog,
  useGetDarkAceGiftInventory,
  useGetDarkAceUpgradeHistory,
} from "@workspace/api-client-react";
import type { DarkAceGiftCatalogEntry, DarkAceUpgradeAttemptResponse } from "@workspace/api-client-react";
import "./UpgradeGamePage.css";
import type { WinCelebrationInput } from "@/components/WinCelebration";
import { verifyUpgradeFairness } from "@/lib/fairness-proof";
import { getGiftArtworkPath } from "@/lib/gift-art";

type Props = { sessionReady: boolean; gameEnabled: boolean; balance?: number; onWin: (event: WinCelebrationInput) => void };
type Mode = "gift" | "credits";
const numberFormat = new Intl.NumberFormat("ru-RU");
const credits = (value: number) => `${numberFormat.format(value)} кредитов`;
const maxUpgradeStake = 250_000_000;
const maxSelectedGifts = 50;
const idempotencyKey = () => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : `upgrade-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const rarityLabel: Record<string, string> = {
  common: "Обычный", uncommon: "Необычный", rare: "Редкий", epic: "Эпический", legendary: "Легендарный", mythic: "Мифический",
};
const giftSeedStyle = (giftId: string) => ({
  "--gift-seed": `${Array.from(giftId).reduce((seed, character) => (seed * 33 + character.charCodeAt(0)) % 360, 29)}deg`,
} as CSSProperties);
const calculateChance = (stakeValueCredits: number, targetPriceCredits: number) => {
  if (!Number.isSafeInteger(stakeValueCredits) || !Number.isSafeInteger(targetPriceCredits)
    || stakeValueCredits <= 0 || targetPriceCredits <= 0) return 0;
  const stake = BigInt(stakeValueCredits);
  const target = BigInt(targetPriceCredits);
  let houseEdgeBasisPoints: number;
  if (stake * 10n <= target) houseEdgeBasisPoints = 50;
  else if (stake * 4n <= target) houseEdgeBasisPoints = 100;
  else if (stake * 5n <= target * 2n) houseEdgeBasisPoints = 200;
  else if (stake * 2n <= target) houseEdgeBasisPoints = 300;
  else if (stake * 100n <= target * 67n) houseEdgeBasisPoints = 400;
  else houseEdgeBasisPoints = 500;

  const rawChance = stake * BigInt(10_000 - houseEdgeBasisPoints) / target;
  if (rawChance < 1n) return 1;
  return Number(rawChance > 9_500n ? 9_500n : rawChance);
};
const formatChance = (chanceBasisPoints: number) => {
  const decimals = chanceBasisPoints % 100 === 0 ? 0 : chanceBasisPoints % 10 === 0 ? 1 : 2;
  return `${(chanceBasisPoints / 100).toFixed(decimals)}%`;
};
const getSuccessWedgePath = (chanceBasisPoints: number) => {
  if (chanceBasisPoints <= 0) return "";
  const sweep = chanceBasisPoints / 10_000 * 360;
  const start = 180 - sweep / 2;
  const end = 180 + sweep / 2;
  const point = (angle: number) => {
    const radians = angle * Math.PI / 180;
    return {
      x: 50 + 48 * Math.sin(radians),
      y: 50 - 48 * Math.cos(radians),
    };
  };
  const startPoint = point(start);
  const endPoint = point(end);
  return `M 50 50 L ${startPoint.x.toFixed(4)} ${startPoint.y.toFixed(4)} A 48 48 0 ${sweep > 180 ? 1 : 0} 1 ${endPoint.x.toFixed(4)} ${endPoint.y.toFixed(4)} Z`;
};
const giftImages = import.meta.glob("../assets/gifts/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const fallbackIdempotencyKey = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
  const random = Math.floor(Math.random() * 16);
  return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
});
const makeIdempotencyKey = () => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : fallbackIdempotencyKey();

function GiftImage({ gift, compact = false }: { gift: DarkAceGiftCatalogEntry; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const initials = gift.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const image = giftImages[`../assets/gifts/${gift.giftId}.webp`]
    ?? getGiftArtworkPath(gift.giftId, gift.imagePath);
  return <span className={`upgrade-gift-art rarity-${gift.rarity} ${compact ? "is-compact" : ""}`} style={giftSeedStyle(gift.giftId)} aria-hidden="true">
    {image && !failed
      ? <img src={image} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <span className="upgrade-gift-fallback">{initials || "DA"}</span>}
  </span>;
}

function UpgradeSkeleton() {
  return <section className="upgrade-page" aria-label="Загрузка UPGRADE" data-testid="upgrade-loading">
    <div className="upgrade-skeleton-title" />
    <div className="upgrade-skeleton-stage">
      <div className="upgrade-skeleton-wheel" />
      <div className="upgrade-skeleton-form"><i /><i /><i /><i /></div>
    </div>
    <div className="upgrade-skeleton-history"><i /><i /><i /></div>
  </section>;
}

export default function UpgradeGamePage({ sessionReady, gameEnabled, balance = 0, onWin }: Props) {
  const queryClient = useQueryClient();
  const catalogQuery = useGetDarkAceGiftCatalog({ query: { enabled: sessionReady, queryKey: getGetDarkAceGiftCatalogQueryKey() } });
  const inventoryQuery = useGetDarkAceGiftInventory({ query: { enabled: sessionReady, queryKey: getGetDarkAceGiftInventoryQueryKey() } });
  const historyQuery = useGetDarkAceUpgradeHistory({ query: { enabled: sessionReady, queryKey: getGetDarkAceUpgradeHistoryQueryKey() } });
  const commitmentQuery = useGetDarkAceUpgradeCommitment({
    query: { enabled: sessionReady, queryKey: getGetDarkAceUpgradeCommitmentQueryKey() },
  });
  const attemptMutation = useCreateDarkAceUpgradeAttempt();
  const [mode, setMode] = useState<Mode>("gift");
  const [stakeGiftInstanceIds, setStakeGiftInstanceIds] = useState<string[]>([]);
  const [targetGiftIds, setTargetGiftIds] = useState<string[]>([]);
  const [targetSearch, setTargetSearch] = useState("");
  const [creditText, setCreditText] = useState("1 000");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<DarkAceUpgradeAttemptResponse | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [proofVerified, setProofVerified] = useState<boolean | null>(null);
  const [showGameInfo, setShowGameInfo] = useState(false);
  const transitionTimer = useRef<number | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const gifts = catalogQuery.data?.gifts ?? [];
  const giftById = useMemo(() => new Map(gifts.map((gift) => [gift.giftId, gift])), [gifts]);
  const owned = useMemo(() => (inventoryQuery.data?.items ?? [])
    .filter((item) => item.listedPrice === null && giftById.has(item.giftId))
    .map((item) => ({ item, gift: giftById.get(item.giftId)! }))
    .sort((first, second) => first.gift.priceCredits - second.gift.priceCredits
      || first.gift.name.localeCompare(second.gift.name, "ru-RU")), [inventoryQuery.data?.items, giftById]);
  const targets = useMemo(() => gifts.filter((gift) => gift.available)
    .sort((first, second) => first.priceCredits - second.priceCredits
      || first.name.localeCompare(second.name, "ru-RU")), [gifts]);
  const filteredTargets = useMemo(() => {
    const normalized = targetSearch.trim().toLocaleLowerCase("ru-RU");
    return normalized
      ? targets.filter((gift) => `${gift.name} ${gift.giftId}`.toLocaleLowerCase("ru-RU").includes(normalized))
      : targets;
  }, [targetSearch, targets]);
  const selectedOwned = owned.filter(({ item }) => stakeGiftInstanceIds.includes(item.instanceId));
  const selectedTargets = targets.filter((gift) => targetGiftIds.includes(gift.giftId));
  const stakeCredits = Number(creditText.replace(/[^\d]/g, ""));
  const stakeValue = mode === "gift"
    ? selectedOwned.reduce((sum, { gift }) => sum + gift.priceCredits, 0)
    : stakeCredits;
  const targetPrice = selectedTargets.reduce((sum, gift) => sum + gift.priceCredits, 0);
  const validGiftStake = selectedOwned.length > 0
    && selectedOwned.length <= maxSelectedGifts
    && Number.isSafeInteger(stakeValue)
    && stakeValue <= maxUpgradeStake;
  const validCreditStake = Number.isSafeInteger(stakeCredits) && stakeCredits >= 100 && stakeCredits <= maxUpgradeStake && stakeCredits % 100 === 0;
  const validTargetBundle = selectedTargets.length > 0
    && selectedTargets.length <= maxSelectedGifts
    && Number.isSafeInteger(targetPrice)
    && targetPrice > 0;
  const chance = stakeValue > 0 && validTargetBundle ? calculateChance(stakeValue, targetPrice) : 0;
  const ready = validTargetBundle && (mode === "gift" ? validGiftStake : validCreditStake && stakeCredits <= balance);
  const loading = catalogQuery.isLoading || inventoryQuery.isLoading || historyQuery.isLoading;
  const queryError = catalogQuery.isError || inventoryQuery.isError || historyQuery.isError || commitmentQuery.isError;
  const displayedWheelChance = result ? result.attempt.chanceBasisPoints : chance;

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
  }, []);
  useEffect(() => {
    const availableIds = new Set(owned.map(({ item }) => item.instanceId));
    setStakeGiftInstanceIds((selected) => selected.filter((id) => availableIds.has(id)));
  }, [owned]);
  useEffect(() => {
    const availableIds = new Set(targets.map((gift) => gift.giftId));
    setTargetGiftIds((selected) => selected.filter((id) => availableIds.has(id)));
  }, [targets]);

  const retryQueries = () => {
    void catalogQuery.refetch();
    void inventoryQuery.refetch();
    void historyQuery.refetch();
    void commitmentQuery.refetch();
  };
  const launch = async () => {
    if (!ready || !commitmentQuery.data || spinning || attemptMutation.isPending || !gameEnabled) return;
    setSubmitError("");
    setResult(null);
    setProofVerified(null);
    setSpinning(true);
    const previousRotation = rotation;
    const requestKey = idempotencyKeyRef.current ?? makeIdempotencyKey();
    idempotencyKeyRef.current = requestKey;
    const sourceIds = mode === "gift" ? selectedOwned.map(({ item }) => item.instanceId) : [];
    const selectedTargetIds = selectedTargets.map((gift) => gift.giftId);
    try {
      const response = await attemptMutation.mutateAsync({
        data: {
          mode,
          stakeGiftInstanceId: sourceIds[0] ?? null,
          stakeGiftInstanceIds: sourceIds,
          stakeCredits: mode === "credits" ? stakeCredits : null,
          targetGiftId: selectedTargetIds[0]!,
          targetGiftIds: selectedTargetIds,
          idempotencyKey: requestKey,
          fairnessCommitmentId: commitmentQuery.data.id,
        },
      });
      // The server-selected angle and attempt are the only source of the outcome.
      const stop = response.wheelStopAngleCentidegrees / 100;
      const nextRotation = previousRotation + 5 * 360 + ((stop - (previousRotation % 360) + 720) % 360);
      setRotation(nextRotation);
      setResult(response);
      if (response.fairness.serverSeedReveal) {
        void verifyUpgradeFairness(response.fairness).then(setProofVerified);
      } else {
        setProofVerified(null);
      }
      idempotencyKeyRef.current = null;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const spinDuration = reducedMotion ? 80 : 5_000;
      transitionTimer.current = window.setTimeout(() => setSpinning(false), spinDuration);
      const attempt = response.attempt;
      const resultAmount = attempt.won ? attempt.targetPriceCredits : attempt.stakeValueCredits;
      if (resultAmount > 0) {
        window.setTimeout(() => onWin({
          eventId: `upgrade:${attempt.id}`,
          outcome: attempt.won ? "win" : "loss",
          amount: resultAmount,
          caption: attempt.won ? "СТОИМОСТЬ ПОЛУЧЕННОГО НАБОРА ПО КАТАЛОГУ" : "СТАВКА СПИСАНА",
        }), spinDuration);
      }
      void queryClient.invalidateQueries({ queryKey: getGetDarkAceGiftInventoryQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDarkAceUpgradeHistoryQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDarkAceUpgradeCommitmentQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
    } catch (error) {
      setSpinning(false);
      setSubmitError(error instanceof Error ? error.message : "Попытка не принята сервером. Проверьте данные и повторите.");
    }
  };

  if (!sessionReady || (loading && !catalogQuery.data && !inventoryQuery.data && !historyQuery.data)) return <UpgradeSkeleton />;
  if (queryError && !catalogQuery.data && !inventoryQuery.data && !historyQuery.data) return <section className="upgrade-page">
    <div className="upgrade-load-error panel" role="alert" data-testid="upgrade-load-error">
      <AlertCircle size={22} /><h2>Не удалось открыть UPGRADE</h2><p>Каталог, инвентарь или история недоступны.</p>
      <button type="button" onClick={retryQueries} data-testid="button-retry-upgrade-data"><RotateCw size={15} /> Повторить загрузку</button>
    </div>
  </section>;

  const history = (historyQuery.data?.attempts ?? []).slice(0, 20);
  const wedge = displayedWheelChance ? formatChance(displayedWheelChance) : "—";
  const currentError = catalogQuery.error ?? inventoryQuery.error ?? historyQuery.error;
  const errorMessage = currentError instanceof Error
    ? currentError.message
    : "Не удалось обновить часть данных.";

  return <section className="upgrade-page" aria-label="Игра UPGRADE" data-testid="upgrade-page">
    <h1 className="sr-only">UPGRADE</h1>
    {!gameEnabled && <div className="upgrade-disabled" role="status" data-testid="upgrade-disabled">
      <ShieldCheck size={17} /><span><b>Игра на паузе</b> — приём попыток временно закрыт.</span>
    </div>}
    {queryError && <div className="upgrade-inline-error" role="status" data-testid="upgrade-partial-error">
      {errorMessage} <button type="button" onClick={retryQueries} data-testid="button-retry-upgrade-partial">Повторить</button>
    </div>}

    <div className="upgrade-workbench">
      <section className={`upgrade-wheel-panel panel ${result ? "has-result" : ""}`} aria-label="Колесо вероятности">
        <div className="upgrade-wheel-top"><span><Sparkles size={14} /> ШАНС УСПЕХА</span></div>
        <div className={`upgrade-wheel-wrap ${spinning ? "is-spinning" : ""}`}>
          <div className="upgrade-wheel" data-testid="upgrade-wheel" aria-label={`Неподвижное колесо вероятности, успешная зона ${wedge}`}>
            <svg className="upgrade-wheel-sectors" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id="upgrade-success-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#e4c879" />
                  <stop offset="55%" stopColor="#c4a24f" />
                  <stop offset="100%" stopColor="#e1c36d" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="48" fill="#302f37" />
              <path className="upgrade-wheel-success-sector" data-testid="upgrade-success-sector"
                d={getSuccessWedgePath(displayedWheelChance)} fill="url(#upgrade-success-gradient)" />
              <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(250, 230, 175, .24)" strokeWidth=".55" />
            </svg>
          </div>
          <div className="upgrade-wheel-pointer-rotor" style={{ transform: `rotate(${rotation}deg)` } as CSSProperties}
            aria-label={spinning ? "Стрелка вращается" : "Стрелка остановилась"}>
            <ArrowDown className="upgrade-wheel-pointer" size={25} aria-hidden="true" />
          </div>
          <div className={`upgrade-wheel-center ${spinning ? "is-spinning" : ""}`} aria-hidden={spinning}>
            <Gem size={25} />
            {!spinning && <small data-testid="upgrade-chance">{displayedWheelChance ? wedge : "—"}</small>}
          </div>
        </div>
        <div className="upgrade-wheel-legend"><span><i /> УСПЕХ</span><span><i /> НЕУДАЧА</span></div>
        {result && !spinning && <div className={`upgrade-outcome ${result.attempt.won ? "outcome-win" : ""}`} role="status" data-testid="upgrade-result">
          {result.attempt.won ? <Check size={16} /> : <AlertCircle size={16} />}
          <div>
            <b>{result.attempt.won ? "Апгрейд успешен" : "Неудача"}</b>
            <span>{result.attempt.won
              ? `Вы получили набор стоимостью ${credits(result.attempt.targetPriceCredits)}`
              : `Ставка ${credits(result.attempt.stakeValueCredits)} списана`}</span>
          </div>
        </div>}
         {spinning && <p className="upgrade-spinning-copy" role="status" data-testid="upgrade-spinning">
           {result ? "Результат уже зафиксирован сервером · колесо останавливается" : "Запрос отправлен серверу · ждём результат"}
         </p>}
      </section>

      <section className="upgrade-control-panel panel" aria-label="Настройка попытки">
        <div className="upgrade-panel-heading">
          <span className="upgrade-step">01</span>
          <div><h2>Выберите ставку</h2><small>Подарок или сумма кредитов</small></div>
          <button type="button" className="upgrade-help-button" aria-label={showGameInfo ? "Скрыть правила и честность" : "Показать правила и честность"}
            aria-expanded={showGameInfo} aria-controls="upgrade-game-info" onClick={() => setShowGameInfo((open) => !open)}
            data-testid="button-upgrade-info"><CircleHelp size={18} /></button>
        </div>
        <div className="upgrade-mode-switch" role="group" aria-label="Тип ставки">
          <button type="button" className={mode === "gift" ? "selected" : ""} aria-pressed={mode === "gift"} disabled={spinning || attemptMutation.isPending}
            onClick={() => { setMode("gift"); setSubmitError(""); setResult(null); idempotencyKeyRef.current = null; }} data-testid="button-upgrade-mode-gift"><Gem size={15} /> Подарок</button>
          <button type="button" className={mode === "credits" ? "selected" : ""} aria-pressed={mode === "credits"} disabled={spinning || attemptMutation.isPending}
            onClick={() => { setMode("credits"); setSubmitError(""); setResult(null); idempotencyKeyRef.current = null; }} data-testid="button-upgrade-mode-credits"><Coins size={15} /> Кредиты</button>
        </div>
        {mode === "gift" ? <div className="upgrade-select-block">
          <label>Ваши подарки · выберите один или несколько</label>
          {owned.length ? <div className="upgrade-gift-picker" role="listbox" aria-multiselectable="true" aria-label="Выберите подарки для общей ставки">
            {owned.map(({ item, gift }) => {
              const selected = stakeGiftInstanceIds.includes(item.instanceId);
              const selectionLimitReached = !selected && stakeGiftInstanceIds.length >= maxSelectedGifts;
              return <button type="button" role="option" aria-selected={selected}
               className={`upgrade-inventory-card rarity-${gift.rarity} ${selected ? "is-selected" : ""}`}
               key={item.instanceId} disabled={spinning || attemptMutation.isPending || selectionLimitReached}
               onClick={() => { setStakeGiftInstanceIds((current) => selected
                 ? current.filter((id) => id !== item.instanceId)
                 : [...current, item.instanceId]); setSubmitError(""); setResult(null); idempotencyKeyRef.current = null; }}
               aria-label={`${gift.name}, ${rarityLabel[gift.rarity] ?? gift.rarity}, ${credits(gift.priceCredits)}${selected ? ", выбрано" : ""}`}
               data-testid={`button-upgrade-stake-${item.instanceId}`}>
              <GiftImage gift={gift} /><span className="upgrade-item-copy"><b>{gift.name}</b><small>{rarityLabel[gift.rarity] ?? gift.rarity}</small></span>
               <strong>{credits(gift.priceCredits)}</strong>{selected && <Check size={15} className="upgrade-selected-check" />}
            </button>;})}
          </div> : <div className="upgrade-empty-inventory" data-testid="upgrade-empty-inventory">
            <Gem size={21} /><b>Нет доступных подарков</b><span>Ставкой могут стать только ваши подарки, не выставленные на рынок.</span>
          </div>}
          <small className="upgrade-field-note">Выбрано: {selectedOwned.length} · общая стоимость {credits(stakeValue)} · не более 50 подарков.</small>
          {selectedOwned.length > 0 && !validGiftStake && <small className="upgrade-validation" role="status" data-testid="upgrade-gift-stake-validation">
            Сумма выбранных подарков не должна превышать 250 000 000 кредитов.
          </small>}
        </div> : <div className="upgrade-select-block">
          <label htmlFor="upgrade-credit-stake">Сумма ставки</label>
          <div className="upgrade-credit-input"><input id="upgrade-credit-stake" inputMode="numeric" type="text" value={creditText}
             disabled={spinning || attemptMutation.isPending}
             onChange={(event) => { setCreditText(event.target.value.replace(/[^\d]/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ")); setResult(null); idempotencyKeyRef.current = null; }}
            aria-label="Ставка в кредитах" aria-invalid={!validCreditStake || stakeCredits > balance}
            data-testid="input-upgrade-credit-stake" /><span>кредитов</span></div>
          <small className="upgrade-field-note">От 100 до 250 000 000 · шаг 100. На балансе {credits(balance)}.</small>
          {(!validCreditStake || stakeCredits > balance) && <small className="upgrade-validation" role="status" data-testid="upgrade-stake-validation">
            {stakeCredits > balance ? "Недостаточно кредитов." : "Введите сумму от 100, кратную 100."}
          </small>}
        </div>}

        <div className="upgrade-step-divider"><span>02</span><b>Выберите приз</b>
          {selectedTargets.length > 0 && <small>{selectedTargets.length} · {credits(targetPrice)}</small>}
        </div>
        {targets.length ? <>
          <label className="upgrade-search" htmlFor="upgrade-target-search"><Search size={14} /><input id="upgrade-target-search" type="search"
            disabled={spinning || attemptMutation.isPending}
            placeholder="Найти подарок" value={targetSearch} onChange={(event) => setTargetSearch(event.target.value)}
            aria-label="Найти целевой подарок" data-testid="input-upgrade-target-search" /></label>
          <div className="upgrade-target-list" role="listbox" aria-multiselectable="true" aria-label="Выберите целевой набор подарков">
            {filteredTargets.map((gift) => {
              const selected = targetGiftIds.includes(gift.giftId);
              const selectionLimitReached = !selected && targetGiftIds.length >= maxSelectedGifts;
              return <button type="button" role="option" aria-selected={selected}
              key={gift.giftId} disabled={spinning || attemptMutation.isPending || selectionLimitReached}
              onClick={() => { setTargetGiftIds((current) => selected
                ? current.filter((id) => id !== gift.giftId)
                : [...current, gift.giftId]); setSubmitError(""); setResult(null); idempotencyKeyRef.current = null; }}
               className={`upgrade-target-card rarity-${gift.rarity} ${selected ? "is-selected" : ""}`}
               style={giftSeedStyle(gift.giftId)}
               aria-label={`${gift.name}, ${rarityLabel[gift.rarity] ?? gift.rarity}, ${credits(gift.priceCredits)}${selected ? ", выбрано" : ""}`}
               data-testid={`button-upgrade-target-${gift.giftId}`}>
              <GiftImage gift={gift} compact /><span><b>{gift.name}</b><small>{rarityLabel[gift.rarity] ?? gift.rarity}</small></span>
              <strong>{credits(gift.priceCredits)}</strong>{selected ? <Check size={15} /> : <ChevronRight size={15} />}
            </button>;})}
            {!filteredTargets.length && <div className="upgrade-no-targets">Подарки не найдены.</div>}
          </div>
          <small className="upgrade-field-note">Выбранные подарки выдаются всем набором. {selectedTargets.length} из 50 · стоимость {targetPrice ? credits(targetPrice) : "—"}.</small>
        </> : <div className="upgrade-empty-targets" data-testid="upgrade-empty-targets">Нет доступных подарков для цели.</div>}

        <div className="upgrade-preview" data-testid="upgrade-preview">
          <div><span>Ваша ставка</span><b>{stakeValue ? credits(stakeValue) : "—"}</b></div>
          <div><span>Приз при успехе</span><b>{validTargetBundle ? credits(targetPrice) : "—"}</b></div>
          <div className="upgrade-preview-chance"><span>Ваш шанс</span><b>{chance ? formatChance(chance) : "—"}</b></div>
        </div>
        {submitError && <div className="upgrade-submit-error" role="alert" data-testid="upgrade-attempt-error"><AlertCircle size={15} /><span>{submitError}</span></div>}
        <button type="button" className="upgrade-launch" disabled={!gameEnabled || !ready || !commitmentQuery.data || attemptMutation.isPending || spinning}
          onClick={() => void launch()} aria-busy={attemptMutation.isPending || spinning}
          data-testid="button-launch-upgrade">
          {attemptMutation.isPending || spinning ? <><span className="upgrade-button-pulse" /> Результат фиксируется…</>
            : <><Sparkles size={17} /> Апгрейд</>}
        </button>
        <p className="upgrade-consent"><ShieldCheck size={13} /> Ставка расходуется при любом исходе. Результат определяет сервер.</p>
        {showGameInfo && <div className="upgrade-game-info" id="upgrade-game-info" data-testid="upgrade-game-info">
          <div className="upgrade-info-block">
            <b>Как рассчитывается шанс</b>
            <p className="upgrade-formula">Стоимость ставки относительно цены набора определяет базовый шанс. Затем применяется преимущество магазина 0,5–5%; максимальный шанс — 95%.</p>
          </div>
          <div className="upgrade-fairness-proof" data-testid="upgrade-fairness-proof">
            <b>Проверка честности</b>
            {commitmentQuery.data
              ? <code>{commitmentQuery.data.serverSeedHash}</code>
              : <span>{commitmentQuery.isLoading ? "Подготавливаем ключ…" : "Ключ недоступен — попытка временно отключена."}</span>}
            {result && <div className="upgrade-fairness-result" role="status">
              <span>{result.fairness.serverSeedReveal
                ? "Seed раскрыт."
                : result.fairness.clientSeed.startsWith("da-daily-v1|")
                  ? "Дневной seed раскроется после окончания дня по Москве."
                  : "Используется прежняя проверка с отдельным seed попытки."}</span>
              <b className={proofVerified === false ? "is-invalid" : proofVerified ? "is-valid" : ""}>
                {proofVerified === null
                  ? result.fairness.serverSeedReveal ? "Проверяем хэш и результат…" : "Проверка будет доступна после раскрытия"
                  : proofVerified ? "Проверка пройдена" : "Проверка не пройдена"}
              </b>
            </div>}
          </div>
        </div>}
      </section>
    </div>

    <section className="upgrade-history panel" aria-label="История попыток UPGRADE" data-testid="upgrade-history">
      <div className="upgrade-history-heading"><div><p className="eyebrow">ЛИЧНАЯ ЛЕНТА</p><h2>Последние попытки</h2></div><span>{history.length}/20</span></div>
      {historyQuery.isLoading && !historyQuery.data ? <div className="upgrade-history-skeleton"><i /><i /><i /></div>
        : history.length ? <div className="upgrade-history-list">{history.map((attempt) => {
          const sourceGiftIds = attempt.stakeGiftIds.length ? attempt.stakeGiftIds : attempt.stakeGiftId ? [attempt.stakeGiftId] : [];
          const targetIds = attempt.targetGiftIds.length ? attempt.targetGiftIds : [attempt.targetGiftId];
          const sourceNames = sourceGiftIds.map((giftId) => giftById.get(giftId)?.name ?? "Подарок");
          const targetNames = targetIds.map((giftId) => giftById.get(giftId)?.name ?? "Подарок");
          const sourceLabel = attempt.mode === "gift"
            ? sourceNames.length > 1 ? `Набор из ${sourceNames.length} подарков` : sourceNames[0] ?? "Подарок"
            : credits(attempt.stakeValueCredits);
          const targetLabel = targetNames.length > 1 ? `Набор из ${targetNames.length} подарков` : targetNames[0] ?? "Подарок";
          return <article className="upgrade-history-row" key={attempt.id} data-testid={`upgrade-history-${attempt.id}`}>
            <span className={`upgrade-history-status ${attempt.won ? "won" : "lost"}`}>{attempt.won ? <Check size={14} /> : <AlertCircle size={14} />}</span>
            <span className="upgrade-history-copy"><b>{attempt.won ? "Успех" : "Неудача"} <i>·</i> {targetLabel}</b>
              <small>{sourceLabel} → {credits(attempt.targetPriceCredits)} · {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(attempt.createdAt))}</small>
            </span>
            <span className="upgrade-history-chance">{(attempt.chanceBasisPoints / 100).toFixed(attempt.chanceBasisPoints % 100 ? 2 : 0)}%</span>
          </article>;
        })}</div> : <div className="upgrade-history-empty"><Sparkles size={19} /><b>Пока нет попыток</b><span>Завершённые сервером результаты появятся здесь.</span></div>}
    </section>
  </section>;
}
