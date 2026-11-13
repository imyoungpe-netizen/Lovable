import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw, Search, Ticket } from "lucide-react";
import {
  useGetDarkAceAdminPromos, useGetDarkAcePromoRedemptionAudit, useUpdateDarkAceAdminPromo,
  getGetDarkAceAdminPromosQueryKey, getGetDarkAcePromoRedemptionAuditQueryKey,
  getGetDarkAcePromoSummaryQueryKey,
  type DarkAceAdminPromo,
} from "@workspace/api-client-react";
import "./AdminPromoCodes.css";

const format = new Intl.NumberFormat("ru-RU");
const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" });
const MAX_REWARD = 250_000_000;

function errorText(error: unknown, fallback: string) {
  const data = (error as { data?: { error?: string } } | undefined)?.data;
  return typeof data?.error === "string" ? data.error : fallback;
}

function PromoCard({ promo }: { promo: DarkAceAdminPromo }) {
  const queryClient = useQueryClient();
  const mutation = useUpdateDarkAceAdminPromo();
  const [playerAmount, setPlayerAmount] = useState(String(promo.playerRewardCredits));
  const [ownerAmount, setOwnerAmount] = useState(String(promo.ownerRewardCredits));
  const [showRedemptions, setShowRedemptions] = useState(false);
  const [redemptionPage, setRedemptionPage] = useState(1);
  const redemptionsQuery = useGetDarkAcePromoRedemptionAudit(
    { promoId: promo.id, page: redemptionPage },
    { query: {
      queryKey: getGetDarkAcePromoRedemptionAuditQueryKey({ promoId: promo.id, page: redemptionPage }),
      enabled: showRedemptions,
      refetchInterval: showRedemptions ? 15_000 : false,
      refetchOnMount: "always",
      staleTime: 0,
    } },
  );
  const edited = useRef(false);
  useEffect(() => {
    if (!edited.current) {
      setPlayerAmount(String(promo.playerRewardCredits));
      setOwnerAmount(String(promo.ownerRewardCredits));
    }
  }, [promo.playerRewardCredits, promo.ownerRewardCredits]);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const valid = [playerAmount, ownerAmount].every((value) =>
    /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    && Number(value) >= 1 && Number(value) <= MAX_REWARD);
  const changed = Number(playerAmount) !== promo.playerRewardCredits || Number(ownerAmount) !== promo.ownerRewardCredits;
  const redemptionPages = Math.max(1, Math.ceil(
    (redemptionsQuery.data?.total ?? 0) / (redemptionsQuery.data?.pageSize ?? 20),
  ));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid || mutation.isPending) return;
    setNotice(null);
    try {
      const saved = await mutation.mutateAsync({
        promoId: promo.id,
        data: { playerRewardCredits: Number(playerAmount), ownerRewardCredits: Number(ownerAmount) },
      });
      edited.current = false;
      setPlayerAmount(String(saved.playerRewardCredits));
      setOwnerAmount(String(saved.ownerRewardCredits));
      setNotice({ text: "Сохранено. Новые суммы действуют со следующей активации.", error: false });
      void queryClient.invalidateQueries({ queryKey: getGetDarkAceAdminPromosQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDarkAcePromoSummaryQueryKey() });
    } catch (error) {
      setNotice({ text: errorText(error, "Не удалось сохранить бонусы. Повторите попытку."), error: true });
    }
  }

  return <article className="admin-promo-card" data-testid={`admin-promo-${promo.id}`}>
    <div className="admin-promo-card-head">
      <code>{promo.code}</code>
      <span>Применений <b>{format.format(promo.redeemedCount)}</b></span>
    </div>
    <p className="admin-promo-owner"><strong>{promo.displayName}</strong>
      {promo.username && <span>@{promo.username}</span>}
      <small>Игровой ID: {promo.ownerId}</small>
    </p>
    <div className="admin-promo-current">
      <span>Игроку <b>{format.format(promo.playerRewardCredits)}</b></span>
      <span>Владельцу <b>{format.format(promo.ownerRewardCredits)}</b></span>
    </div>
    <p className="admin-promo-risk-note">
      Активировавшему начисляется до 25 000 при первом использовании с IP и до 5 000 при повторе; более низкая настройка для него сохраняется. Владельцу начисляется настроенная сумма при первом использовании и 5 000 при повторе с того же IP.
    </p>
    <section className="admin-promo-redemptions" aria-label={`Активации промокода ${promo.code}`}>
      <button className="outline-button" type="button" aria-expanded={showRedemptions}
        onClick={() => setShowRedemptions((open) => !open)}>
        {showRedemptions ? "Скрыть активации" : `Проверить игроков (${format.format(promo.redeemedCount)})`}
      </button>
      {showRedemptions && <div className="admin-promo-redemption-list">
        <p className="admin-promo-risk-note">
          Совпадение установки — только сигнал для проверки, а не доказательство одного владельца.
        </p>
        {redemptionsQuery.isLoading && <p role="status">Загружаем активации…</p>}
        {redemptionsQuery.isError && <p role="alert" className="admin-promo-notice is-error">
          Не удалось загрузить активации. <button type="button" onClick={() => void redemptionsQuery.refetch()}>Повторить</button>
        </p>}
        {redemptionsQuery.data?.redemptions.map((redemption) => (
          <article className="admin-promo-redemption" key={redemption.redeemerId}>
            <header>
              <strong>{redemption.displayName}</strong>
              {redemption.username && <span>@{redemption.username}</span>}
              <b>{format.format(redemption.rewardCredits)} кредитов</b>
            </header>
            <p className="admin-promo-redemption-id">Telegram ID: {redemption.redeemerId}</p>
            <p>Аккаунт DARK ACE: {dateFormat.format(new Date(redemption.accountCreatedAt))}</p>
            <p>Промокод активирован: {dateFormat.format(new Date(redemption.redeemedAt))}</p>
            {!redemption.deviceSignalAvailable
              ? <p className="admin-promo-signal-muted">Сигнал установки недоступен</p>
              : redemption.sameDeviceAccountCount === 0
                ? <p className="admin-promo-signal-clear">Совпадений установки не найдено</p>
                : <div className="admin-promo-signal-flag">
                  <strong>Возможное совпадение установки: {format.format(redemption.sameDeviceAccountCount)} других аккаунтов</strong>
                  {redemption.sameDeviceAccounts.map((account) => (
                    <p key={account.redeemerId}>
                      {account.displayName}{account.username ? ` (@${account.username})` : ""}
                      {account.isPromoOwner ? " — владелец промокода" : ""}
                      {" · ID "}{account.redeemerId}
                      {" · в DARK ACE с "}{dateFormat.format(new Date(account.accountCreatedAt))}
                    </p>
                  ))}
                  {redemption.sameDeviceAccountCount > redemption.sameDeviceAccounts.length
                    && <small>Показаны первые {redemption.sameDeviceAccounts.length} совпадений.</small>}
                </div>}
          </article>
        ))}
        {redemptionsQuery.data && redemptionsQuery.data.redemptions.length === 0
          && <p>Пока нет активаций.</p>}
        {redemptionsQuery.data && redemptionsQuery.data.total > redemptionsQuery.data.pageSize
          && <div className="admin-promos-pagination">
            <button type="button" className="outline-button" aria-label="Предыдущая страница активаций"
              disabled={redemptionPage <= 1 || redemptionsQuery.isFetching}
              onClick={() => setRedemptionPage((value) => value - 1)}><ChevronLeft size={16} /></button>
            <span>{redemptionPage} / {redemptionPages}</span>
            <button type="button" className="outline-button" aria-label="Следующая страница активаций"
              disabled={redemptionPage >= redemptionPages || redemptionsQuery.isFetching}
              onClick={() => setRedemptionPage((value) => value + 1)}><ChevronRight size={16} /></button>
          </div>}
      </div>}
    </section>
    <details>
      <summary>Настроить бонусы</summary>
      <form onSubmit={(event) => void save(event)} className="admin-promo-rewards">
        <label>Бонус игроку, кредитов
          <input aria-label={`Бонус игроку для ${promo.code}`} inputMode="numeric" type="text"
            value={playerAmount} onChange={(event) => { edited.current = true; setPlayerAmount(event.target.value); }}
            disabled={mutation.isPending} maxLength={9} />
        </label>
        <label>Бонус владельцу, кредитов
          <input aria-label={`Бонус владельцу для ${promo.code}`} inputMode="numeric" type="text"
            value={ownerAmount} onChange={(event) => { edited.current = true; setOwnerAmount(event.target.value); }}
            disabled={mutation.isPending} maxLength={9} />
        </label>
        <small>От 1 до 250 млн кредитов. Уже начисленные награды не изменятся.</small>
        <button className="gold-button" type="submit" disabled={!valid || !changed || mutation.isPending}>
          {mutation.isPending ? "Сохраняем…" : "Сохранить бонусы"}
        </button>
      </form>
    </details>
    {notice && <p className={`admin-promo-notice${notice.error ? " is-error" : ""}`}
      role={notice.error ? "alert" : "status"}>{notice.text}</p>}
  </article>;
}

export default function AdminPromoCodes() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const query = useGetDarkAceAdminPromos(
    { search: debouncedSearch || undefined, page },
    { query: {
      queryKey: getGetDarkAceAdminPromosQueryKey({ search: debouncedSearch || undefined, page }),
      refetchInterval: 15_000, refetchOnMount: "always", staleTime: 0,
    } },
  );
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 25)));
  return <section className="admin-promos panel rounded-2xl" aria-label="Промокоды игроков">
    <header className="admin-promos-heading">
      <div><p className="eyebrow">ПРОМОКОДЫ И БОНУСЫ</p><h2><Ticket size={19} /> Промокоды игроков</h2>
        <p>Все созданные коды, число применений и отдельные бонусы обеим сторонам.</p></div>
      <button className="outline-button" type="button" aria-label="Обновить промокоды"
        disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={16} /></button>
    </header>
    <label className="admin-promos-search"><Search size={16} />
      <input aria-label="Поиск промокода или игрока" placeholder="Промокод, имя или игровой ID"
        value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} />
    </label>
    {query.isLoading && <p role="status">Загружаем промокоды…</p>}
    {query.isError && <p role="alert" className="admin-promo-notice is-error">
      Не удалось загрузить промокоды. <button type="button" onClick={() => void query.refetch()}>Повторить</button>
    </p>}
    {query.data && <>
      <p className="admin-promos-total">Найдено кодов: {format.format(query.data.total)}</p>
      <div className="admin-promos-list">{query.data.promos.map((promo) =>
        <PromoCard key={promo.id} promo={promo} />)}</div>
      {!query.data.promos.length && <p>Промокоды не найдены.</p>}
      <div className="admin-promos-pagination">
        <button type="button" className="outline-button" aria-label="Предыдущая страница промокодов"
          disabled={page <= 1 || query.isFetching} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></button>
        <span>{page} / {totalPages}</span>
        <button type="button" className="outline-button" aria-label="Следующая страница промокодов"
          disabled={page >= totalPages || query.isFetching} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button>
      </div>
    </>}
  </section>;
}
