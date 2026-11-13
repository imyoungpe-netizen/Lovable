import { useState } from "react";
import type { FormEvent } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  WalletCards,
} from "lucide-react";
import {
  getGetDarkAceAdminFinancialOperationsQueryKey,
  useGetDarkAceAdminFinancialOperations,
} from "@workspace/api-client-react";
import type { DarkAceAdminFinancialOperation } from "@workspace/api-client-react";
import "./AdminFinancialOperations.css";

const PAGE_SIZE = 40;
const HISTORY_PAGE_SIZE = 40;
const numberFormat = new Intl.NumberFormat("ru-RU");
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});

const operationLabels: Record<string, string> = {
  bet: "Ставка",
  win: "Выплата",
  refund: "Возврат",
  bonus: "Промокод или бонус",
  admin_adjustment: "Изменение администратором",
  stars_purchase: "Покупка за Stars",
  crypto_purchase: "Пополнение криптовалютой",
  ruble_purchase: "Пополнение за рубли",
  transfer_sent: "Перевод отправлен",
  transfer_received: "Перевод получен",
  durak_topup: "Пополнение в «Дурак Онлайн»",
  durak_withdrawal_completed: "Вывод выполнен",
  durak_withdrawal_reserve: "Резерв для вывода",
  durak_withdrawal_release: "Возврат резерва вывода",
  gift_purchase: "Покупка подарка",
  gift_shop_sale: "Продажа подарка",
  upgrade_stake: "Ставка UPGRADE",
};

const sourceLabels = {
  wallet: "Кошелёк",
  durak_request: "Заявка в «Дурак Онлайн»",
  stars_payment: "Платёж Stars",
} as const;

const unavailableSourceLabels = {
  durak_request: "заявки «Дурак Онлайн»",
  stars_payment: "платежи Stars",
} as const;

const statusLabels: Record<string, string> = {
  recorded: "Записано",
  pending_admin: "Ожидает администратора",
  instructions_sent: "Инструкции отправлены",
  awaiting_player_confirmation: "Ожидает подтверждения игрока",
  awaiting_admin_fulfillment: "Ожидает выполнения",
  completed: "Выполнено",
  rejected: "Отклонено",
  cancelled: "Отменено",
  expired_player: "Истёк срок игрока",
  expired_admin: "Истёк срок администратора",
  fraud_closed: "Закрыто проверкой",
  pending: "Ожидает оплаты",
  failed: "Ошибка оплаты",
};

const errorStatuses = new Set([
  "rejected",
  "cancelled",
  "expired_player",
  "expired_admin",
  "fraud_closed",
  "failed",
]);

function signedCredits(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${numberFormat.format(value)} кр.`;
}

function operationLabel(operation: string) {
  return operationLabels[operation] ?? operation;
}

function statusLabel(status: string) {
  return statusLabels[status] ?? status;
}

function operationCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const suffix = lastTwo >= 11 && lastTwo <= 14
    ? "операций"
    : last === 1 ? "операция" : last >= 2 && last <= 4 ? "операции" : "операций";
  return `${numberFormat.format(count)} ${suffix}`;
}

export default function AdminFinancialOperations() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const params = { page, limit: PAGE_SIZE, view: "players" as const, ...(search ? { search } : {}) };
  const operations = useGetDarkAceAdminFinancialOperations(params, {
    query: {
      queryKey: getGetDarkAceAdminFinancialOperationsQueryKey(params),
      refetchInterval: 20_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
      staleTime: 0,
    },
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setExpandedPlayerId(null);
    setSearch(searchInput.trim());
  }

  return <section className="admin-financial-operations panel rounded-2xl" aria-label="Финансовые операции">
    <header className="admin-financial-heading">
      <div>
        <span className="eyebrow">КОШЕЛЁК · ПОПОЛНЕНИЯ · ВЫВОДЫ · ПЕРЕВОДЫ</span>
        <h2><WalletCards size={18} /> Финансовые операции</h2>
        <p>Операции за 30 дней и все незакрытые заявки. Пароли и инструкции не отображаются.</p>
      </div>
      <button type="button" className="outline-button" aria-label="Обновить финансовые операции"
        disabled={operations.isFetching} onClick={() => void operations.refetch()}
        data-testid="button-refresh-admin-financial-operations">
        <RefreshCw size={15} />
      </button>
    </header>

    <form className="admin-financial-search" onSubmit={submitSearch} role="search">
      <label>
        <span className="sr-only">Найти игрока</span>
        <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)}
          maxLength={100} placeholder="Username, имя или ID игрока" />
      </label>
      <button type="submit" className="outline-button" aria-label="Найти операции игрока">
        <Search size={15} />
      </button>
      {search && <button type="button" className="admin-financial-clear"
        onClick={() => { setSearchInput(""); setSearch(""); setPage(1); setExpandedPlayerId(null); }}>
        Сбросить
      </button>}
    </form>

    {operations.isLoading && <p className="admin-financial-state" role="status">Загружаем финансовые операции…</p>}
    {operations.isError && <p className="admin-financial-state is-error" role="alert">
      Не удалось загрузить операции. <button type="button" onClick={() => void operations.refetch()}>Повторить</button>
    </p>}
    {operations.data && <>
      {operations.data.unavailableSources.length > 0 && <p className="admin-financial-warning" role="alert">
        В текущей базе не найдены таблицы для: {operations.data.unavailableSources.map((source) => unavailableSourceLabels[source]).join(", ")}.
        Эти заявки не попали в список. Проверьте миграции базы данных.
      </p>}
      {operations.data.entries.length
        ? <div className="admin-financial-list">
          {operations.data.entries.map((entry) => {
            const expanded = expandedPlayerId === entry.playerId;
            return <article className="admin-financial-player-group" key={entry.playerId}
              data-testid={`admin-financial-player-${entry.playerId}`}>
              <button type="button" className="admin-financial-player-toggle" aria-expanded={expanded}
                aria-controls={`admin-financial-history-${entry.playerId}`}
                data-testid={`button-admin-financial-player-${entry.playerId}`}
                onClick={() => setExpandedPlayerId((current) => current === entry.playerId ? null : entry.playerId)}>
                <span className="admin-financial-player">
                  <b>{entry.playerDisplayName}</b>
                  <small>{entry.playerUsername ? `@${entry.playerUsername} · ` : ""}ID {entry.playerId}</small>
                </span>
                <span className="admin-financial-player-latest">
                  <span>{operationLabel(entry.operation)} · {statusLabel(entry.status)}</span>
                  <strong className={entry.amount !== null && entry.amount > 0 ? "is-positive" : entry.amount !== null && entry.amount < 0 ? "is-negative" : ""}>
                    {signedCredits(entry.amount)}
                  </strong>
                  <small>{operationCountLabel(entry.operationCount)} · последнее действие</small>
                  <time dateTime={entry.createdAt}>{dateFormat.format(new Date(entry.createdAt))}</time>
                </span>
                <ChevronDown className={`admin-financial-expand-icon ${expanded ? "is-expanded" : ""}`} size={17} />
              </button>
              {expanded && <div id={`admin-financial-history-${entry.playerId}`} className="admin-financial-expanded">
                <AdminFinancialPlayerHistory playerId={entry.playerId} />
              </div>}
            </article>;
          })}
        </div>
        : <p className="admin-financial-state">
          {search ? "По этому игроку операций не найдено." : "За выбранный период операций нет."}
        </p>}

      {operations.data.entries.length > 0 && <nav className="admin-financial-pagination" aria-label="Страницы финансовых операций">
        <button type="button" className="outline-button" aria-label="Предыдущая страница"
          disabled={page <= 1 || operations.isFetching} onClick={() => setPage((value) => value - 1)}>
          <ChevronLeft size={16} />
        </button>
        <span>Страница {page}</span>
        <button type="button" className="outline-button" aria-label="Следующая страница"
          disabled={!operations.data.hasMore || operations.isFetching} onClick={() => setPage((value) => value + 1)}>
          <ChevronRight size={16} />
        </button>
      </nav>}
    </>}
  </section>;
}

function AdminFinancialPlayerHistory({ playerId }: { playerId: string }) {
  const [page, setPage] = useState(1);
  const params = { view: "history" as const, playerId, page, limit: HISTORY_PAGE_SIZE };
  const history = useGetDarkAceAdminFinancialOperations(params, {
    query: {
      queryKey: getGetDarkAceAdminFinancialOperationsQueryKey(params),
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
      staleTime: 0,
    },
  });

  if (history.isLoading) return <p className="admin-financial-state" role="status">Загружаем историю игрока…</p>;
  if (history.isError) return <p className="admin-financial-state is-error" role="alert">
    Не удалось загрузить историю. <button type="button" onClick={() => void history.refetch()}>Повторить</button>
  </p>;
  if (!history.data?.entries.length) return <p className="admin-financial-state">История игрока пуста.</p>;

  return <>
    <div className="admin-financial-history-list" data-testid={`admin-financial-history-list-${playerId}`}>
      {history.data.entries.map((entry) => <FinancialOperationDetails key={entry.id} entry={entry} />)}
    </div>
    {(history.data.hasMore || page > 1) && <nav className="admin-financial-history-pagination" aria-label="Страницы истории игрока">
      <button type="button" className="outline-button" aria-label="Предыдущая страница истории игрока"
        disabled={page <= 1 || history.isFetching} onClick={() => setPage((value) => value - 1)}>
        <ChevronLeft size={15} />
      </button>
      <span>История · страница {page}</span>
      <button type="button" className="outline-button" aria-label="Следующая страница истории игрока"
        disabled={!history.data.hasMore || history.isFetching} onClick={() => setPage((value) => value + 1)}>
        <ChevronRight size={15} />
      </button>
    </nav>}
  </>;
}

function FinancialOperationDetails({ entry }: { entry: DarkAceAdminFinancialOperation }) {
  return <article className="admin-financial-history-entry" data-testid={`admin-financial-operation-${entry.id}`}>
    <div className="admin-financial-row-top">
      <b className="admin-financial-operation-name">{operationLabel(entry.operation)}</b>
      <span className={`admin-financial-status ${errorStatuses.has(entry.status) ? "is-error" : ""}`}>
        {statusLabel(entry.status)}
      </span>
      <time dateTime={entry.createdAt}>{dateFormat.format(new Date(entry.createdAt))}</time>
    </div>
    <div className="admin-financial-context">
      <span>{sourceLabels[entry.source]}</span>
      <strong className={entry.amount !== null && entry.amount > 0 ? "is-positive" : entry.amount !== null && entry.amount < 0 ? "is-negative" : ""}>
        {signedCredits(entry.amount)}
      </strong>
    </div>
    {entry.details && <p className="admin-financial-details">{entry.details}</p>}
    {entry.balanceAfter !== null && <small className="admin-financial-balance">
      Баланс после операции: {numberFormat.format(entry.balanceAfter)} кредитов
    </small>}
  </article>;
}
