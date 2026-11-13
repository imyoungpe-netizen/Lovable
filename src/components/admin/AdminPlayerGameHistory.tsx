import { useState } from "react";
import { ChevronLeft, ChevronRight, History, RefreshCw } from "lucide-react";
import {
  getListDarkAceAdminPlayerGameHistoryQueryKey,
  useListDarkAceAdminPlayerGameHistory,
} from "@workspace/api-client-react";
import type { ListDarkAceAdminPlayerGameHistoryParams } from "@workspace/api-client-react";
import "./AdminPlayerGameHistory.css";

const PAGE_SIZE = 25;
const numberFormat = new Intl.NumberFormat("ru-RU");
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});
const actionTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const gameLabels: Record<string, string> = {
  roulette_do: "Рулетка ДО",
  european_roulette: "Европейская рулетка",
  high_card: "Высшая карта",
  plinko: "Plinko",
  legacy_roulette: "Старая рулетка",
  dice: "DICE",
  group_dice: "Кубики в Telegram",
  fruits: "Фрукты",
  crash: "Crash",
  blackjack: "Blackjack",
  battle: "Баттл",
  upgrade: "UPGRADE",
  x_rush: "X-RUSH",
};

const outcomeLabels = {
  win: "Победа",
  loss: "Поражение",
  refund: "Возврат",
} as const;

const gameOptions = Object.entries(gameLabels).filter(([value]) =>
  ["roulette_do", "european_roulette", "legacy_roulette", "dice", "group_dice", "fruits", "high_card", "plinko", "crash", "blackjack", "battle", "upgrade", "x_rush"].includes(value),
) as [NonNullable<ListDarkAceAdminPlayerGameHistoryParams["game"]>, string][];

function credits(value: number | null) {
  if (value === null) return "—";
  const magnitude = Math.abs(value);
  const divisor = magnitude >= 1_000_000_000 ? 1_000_000_000
    : magnitude >= 1_000_000 ? 1_000_000
    : magnitude >= 1_000 ? 1_000 : 1;
  const suffix = divisor === 1_000_000_000 ? " млрд"
    : divisor === 1_000_000 ? " М"
    : divisor === 1_000 ? " К" : "";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value / divisor)}${suffix}`;
}

export default function AdminPlayerGameHistory({ userId }: { userId?: string } = {}) {
  const [page, setPage] = useState(1);
  const [game, setGame] = useState<ListDarkAceAdminPlayerGameHistoryParams["game"] | "">("");
  const [outcome, setOutcome] = useState<ListDarkAceAdminPlayerGameHistoryParams["outcome"] | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [roundSearch, setRoundSearch] = useState("");
  const invalidRange = Boolean(fromDate && toDate && fromDate > toDate);
  const params = {
    ...(userId ? { userId } : {}),
    page,
    limit: PAGE_SIZE,
    game: game || undefined,
    outcome: outcome || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    roundSearch: roundSearch.trim() || undefined,
  };
  const history = useListDarkAceAdminPlayerGameHistory(params, {
    query: {
      queryKey: getListDarkAceAdminPlayerGameHistoryQueryKey(params),
      enabled: !invalidRange,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
      staleTime: 0,
    },
  });

  const resetFilters = () => {
    setGame("");
    setOutcome("");
    setFromDate("");
    setToDate("");
    setRoundSearch("");
    setPage(1);
  };

  return <section className={`admin-player-history panel rounded-2xl${userId ? "" : " is-own-history"}`} aria-label={userId ? "История игр игрока" : "Ваша история игр"}>
    <header className="admin-player-history-heading">
      <div>
        <span className="eyebrow">{userId ? "ВЫБРАННЫЙ ИГРОК" : "ВАШИ РАУНДЫ"}</span>
        <h2><History size={17} /> {userId ? "История игр" : "Моя история"}</h2>
        <p>{userId
          ? "Показан баланс до и сразу после списания ставки — до выплаты за раунд."
          : "Ваши завершённые раунды и попытки во всех играх. Доступна только вам."} Хранятся последние 2 000 раундов каждой игры.</p>
      </div>
      <button type="button" className="outline-button" aria-label="Обновить историю игр"
        disabled={history.isFetching} onClick={() => void history.refetch()} data-testid="button-refresh-player-history">
        <RefreshCw size={15} />
      </button>
    </header>

    <div className="admin-player-history-filters" aria-label="Фильтры истории">
      <label>Игра
        <select value={game} onChange={(event) => { setGame(event.target.value as typeof game); setPage(1); }}>
          <option value="">Все игры</option>
          {gameOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>
      <label>Результат
        <select value={outcome} onChange={(event) => { setOutcome(event.target.value as typeof outcome); setPage(1); }}>
          <option value="">Любой</option>
          {Object.entries(outcomeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>
      <label>С даты
        <input type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setPage(1); }} />
      </label>
      <label>По дату
        <input type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); setPage(1); }} />
      </label>
      <label className="admin-player-history-round-filter">Номер раунда
        <input type="search" inputMode="numeric" maxLength={64} value={roundSearch}
          onChange={(event) => { setRoundSearch(event.target.value); setPage(1); }} placeholder="Например, 12345" />
      </label>
      <button type="button" className="outline-button admin-player-history-reset" onClick={resetFilters}
        disabled={!game && !outcome && !fromDate && !toDate && !roundSearch}>Сбросить</button>
    </div>
    {invalidRange && <p className="admin-player-history-state is-error" role="alert">Начальная дата не может быть позже конечной.</p>}
    {history.isLoading && <p className="admin-player-history-state" role="status">Загружаем историю…</p>}
    {history.isError && <p className="admin-player-history-state is-error" role="alert">
      Не удалось загрузить историю игр. <button type="button" onClick={() => void history.refetch()}>Повторить</button>
    </p>}
    {history.data && <>
      {history.data.entries.length
        ? <div className="admin-player-history-list">
          {history.data.entries.map((entry) => <article className="admin-player-history-entry" key={entry.id}
            data-testid={`admin-player-history-${entry.id}`}>
            <div className="admin-player-history-entry-top">
              <b className="admin-player-history-game">{gameLabels[entry.game] ?? entry.game}</b>
              <span className={`admin-player-history-outcome is-${entry.outcome}`}>{outcomeLabels[entry.outcome]}</span>
              <time dateTime={entry.playedAt}>{dateFormat.format(new Date(entry.playedAt))}</time>
            </div>
            <p className="admin-player-history-details">
              {entry.roundNumber === null ? "Попытка" : `Раунд №${numberFormat.format(entry.roundNumber)}`} · {entry.details}
            </p>
            <div className="admin-player-history-values">
              <span>Ставка <b>{credits(entry.stakeCredits)}</b></span>
              <span>Выплата <b>{credits(entry.payoutCredits)}</b></span>
              {entry.profitCredits !== null && <span>Итог <b className={entry.profitCredits > 0 ? "is-positive" : entry.profitCredits < 0 ? "is-negative" : ""}>
                {entry.profitCredits > 0 ? "+" : ""}{credits(entry.profitCredits)}
              </b></span>}
            </div>
            <div className="admin-player-history-balances" aria-label="Изменение баланса по каждой ставке">
              {entry.balanceChanges.length
                ? entry.balanceChanges.map((change, index) => <div className="admin-player-history-balance-change"
                  key={`${change.playedAt}-${index}`}>
                  <span>Ставка <b>{credits(change.stakeCredits)}</b></span>
                  <span>Баланс <b>{credits(change.balanceBefore)}</b> → <b>{credits(change.balanceAfter)}</b></span>
                  {entry.balanceChanges.length > 1 && <time dateTime={change.playedAt}>
                    {actionTimeFormat.format(new Date(change.playedAt))}
                  </time>}
                </div>)
                : <div className="admin-player-history-balance-change">Баланс до/после ставки: —</div>}
            </div>
          </article>)}
        </div>
        : <p className="admin-player-history-state">У этого игрока пока нет сохранённых результатов игр.</p>}

      <nav className="admin-player-history-pagination" aria-label="Страницы истории игр">
        <button type="button" className="outline-button" aria-label="Предыдущая страница истории"
          disabled={page <= 1 || history.isFetching} onClick={() => setPage((value) => value - 1)} data-testid="button-player-history-previous">
          <ChevronLeft size={16} />
        </button>
        <span>Страница {page}</span>
        <button type="button" className="outline-button" aria-label="Следующая страница истории"
          disabled={!history.data.hasMore || history.isFetching} onClick={() => setPage((value) => value + 1)} data-testid="button-player-history-next">
          <ChevronRight size={16} />
        </button>
      </nav>
    </>}
  </section>;
}
