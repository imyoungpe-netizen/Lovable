import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, History, RefreshCw } from "lucide-react";
import {
  getGetDarkAceAdminFinancialOperationsQueryKey,
  getListDarkAceAdminPlayerGameHistoryQueryKey,
  useGetDarkAceAdminFinancialOperations,
  useListDarkAceAdminPlayerGameHistory,
} from "@workspace/api-client-react";
import "./AdminPlayerTimeline.css";

const PAGE_SIZE = 25;
const SOURCE_PAGE_SIZE = 25;
const numberFormat = new Intl.NumberFormat("ru-RU");
const creditsFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const gameLabels: Record<string, string> = {
  roulette_do: "Рулетка ДО",
  european_roulette: "Европейская рулетка",
  legacy_roulette: "Старая рулетка",
  dice: "DICE",
  group_dice: "Кубики в Telegram",
  fruits: "Фрукты",
  high_card: "Высшая карта",
  plinko: "Plinko",
  crash: "Crash",
  blackjack: "Blackjack",
  battle: "Баттл",
  upgrade: "UPGRADE",
  x_rush: "X-RUSH",
};
const operationLabels: Record<string, string> = {
  bet: "Списание ставки",
  win: "Начисление выигрыша",
  refund: "Возврат ставки",
  bonus: "Бонус / промокод",
  admin_adjustment: "Операция администратора",
  stars_purchase: "Покупка за Stars",
  crypto_purchase: "Пополнение криптовалютой",
  ruble_purchase: "Пополнение за рубли",
  gift_purchase: "Покупка подарка",
  gift_shop_sale: "Продажа подарка",
  transfer_sent: "Перевод отправлен",
  transfer_received: "Перевод получен",
  durak_topup: "Пополнение «Дурак Онлайн»",
  durak_withdrawal_completed: "Вывод выполнен",
  durak_withdrawal_reserve: "Резерв вывода",
  durak_withdrawal_release: "Возврат резерва вывода",
  upgrade_stake: "Ставка UPGRADE",
};
const statusLabels: Record<string, string> = {
  recorded: "Записано",
  pending_admin: "Ожидает администратора",
  instructions_sent: "Инструкции отправлены",
  awaiting_player_confirmation: "Ожидает подтверждения",
  awaiting_admin_fulfillment: "Ожидает выполнения",
  completed: "Выполнено",
  rejected: "Отклонено",
  cancelled: "Отменено",
  expired_player: "Истёк срок",
  expired_admin: "Истёк срок",
  fraud_closed: "Закрыто проверкой",
  pending: "Ожидает оплаты",
  failed: "Ошибка",
};
const sourceLabels: Record<string, string> = {
  wallet: "Баланс",
  durak_request: "Заявка «Дурак Онлайн»",
  stars_payment: "Платёж Stars",
};

type GameEvent = {
  kind: "game";
  id: string;
  at: string;
  game: string;
  outcome: string;
  roundNumber: number | null;
  stake: number | null;
  payout: number | null;
  profit: number | null;
  details: string;
  balanceChanges: Array<{
    stakeCredits: number;
    balanceBefore: number;
    balanceAfter: number;
    playedAt: string;
  }>;
};

type FinancialEvent = {
  kind: "financial";
  id: string;
  at: string;
  operation: string;
  status: string;
  source: string;
  amount: number | null;
  balanceAfter: number | null;
  details: string;
};

type TimelineEvent = GameEvent | FinancialEvent;

function mergeEvents(current: TimelineEvent[], incoming: TimelineEvent[]) {
  const byId = new Map(current.map((event) => [`${event.kind}:${event.id}`, event]));
  for (const event of incoming) byId.set(`${event.kind}:${event.id}`, event);
  return [...byId.values()].sort((left, right) =>
    Date.parse(right.at) - Date.parse(left.at) || right.id.localeCompare(left.id),
  );
}

function compactCredits(value: number | null) {
  if (value === null) return "—";
  const absolute = Math.abs(value);
  const divisor = absolute >= 1_000_000_000 ? 1_000_000_000
    : absolute >= 1_000_000 ? 1_000_000
    : absolute >= 1_000 ? 1_000 : 1;
  const suffix = divisor === 1_000_000_000 ? " млрд"
    : divisor === 1_000_000 ? " М"
    : divisor === 1_000 ? " К" : "";
  return `${creditsFormat.format(value / divisor)}${suffix}`;
}

function signedCredits(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${numberFormat.format(value)} кр.`;
}

export default function AdminPlayerTimeline({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const [sourcePage, setSourcePage] = useState(1);
  const [loadedEvents, setLoadedEvents] = useState<TimelineEvent[]>([]);
  const gameParams = { userId, page: sourcePage, limit: SOURCE_PAGE_SIZE };
  const financeParams = { view: "history" as const, playerId: userId, page: sourcePage, limit: SOURCE_PAGE_SIZE };
  const gameHistory = useListDarkAceAdminPlayerGameHistory(gameParams, {
    query: {
      queryKey: getListDarkAceAdminPlayerGameHistoryQueryKey(gameParams),
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      refetchInterval: 20_000,
      refetchIntervalInBackground: false,
      staleTime: 0,
    },
  });
  const financialHistory = useGetDarkAceAdminFinancialOperations(financeParams, {
    query: {
      queryKey: getGetDarkAceAdminFinancialOperationsQueryKey(financeParams),
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      refetchInterval: 20_000,
      refetchIntervalInBackground: false,
      staleTime: 0,
    },
  });

  useEffect(() => {
    const incoming: TimelineEvent[] = [
      ...(gameHistory.data?.entries.map((entry) => ({
        kind: "game" as const,
        id: entry.id,
        at: entry.playedAt,
        game: entry.game,
        outcome: entry.outcome,
        roundNumber: entry.roundNumber,
        stake: entry.stakeCredits,
        payout: entry.payoutCredits,
        profit: entry.profitCredits,
        details: entry.details,
        balanceChanges: entry.balanceChanges,
      })) ?? []),
      ...(financialHistory.data?.entries.map((entry) => ({
        kind: "financial" as const,
        id: entry.id,
        at: entry.createdAt,
        operation: entry.operation,
        status: entry.status,
        source: entry.source,
        amount: entry.amount,
        balanceAfter: entry.balanceAfter,
        details: entry.details,
      })) ?? []),
    ];
    if (incoming.length) setLoadedEvents((current) => mergeEvents(current, incoming));
  }, [gameHistory.data, financialHistory.data]);

  const sortedEvents = useMemo(() => [...loadedEvents].sort((left, right) =>
    Date.parse(right.at) - Date.parse(left.at) || right.id.localeCompare(left.id),
  ), [loadedEvents]);
  const visibleEvents = sortedEvents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasMore = sortedEvents.length > page * PAGE_SIZE
    || gameHistory.data?.hasMore === true
    || financialHistory.data?.hasMore === true;
  const isFetching = gameHistory.isFetching || financialHistory.isFetching;
  const sourceError = gameHistory.isError || financialHistory.isError;

  function showNextPage() {
    if (sortedEvents.length < (page + 1) * PAGE_SIZE
      && (gameHistory.data?.hasMore === true || financialHistory.data?.hasMore === true)) {
      setSourcePage((current) => current + 1);
    }
    setPage((current) => current + 1);
  }

  return <section className="admin-player-timeline panel rounded-2xl" aria-label="Единая хронология игрока">
    <header className="admin-player-timeline-heading">
      <div>
        <span className="eyebrow">ЕДИНАЯ ЛЕНТА СОБЫТИЙ</span>
        <h2><History size={17} /> Хронология игрока</h2>
        <p>Игровые результаты, списания и начисления, промокоды, подарки и заявки — по времени.</p>
      </div>
      <button type="button" className="outline-button" aria-label="Обновить хронологию игрока"
        disabled={isFetching}
        onClick={() => { void gameHistory.refetch(); void financialHistory.refetch(); }}
        data-testid="button-refresh-player-timeline">
        <RefreshCw size={15} />
      </button>
    </header>

    {(gameHistory.isError || financialHistory.isError) && <p className="admin-player-timeline-state is-error" role="alert">
      Часть событий не загрузилась. <button type="button" onClick={() => { void gameHistory.refetch(); void financialHistory.refetch(); }}>Повторить</button>
    </p>}
    {gameHistory.isLoading && financialHistory.isLoading && <p className="admin-player-timeline-state" role="status">Загружаем хронологию…</p>}
    {visibleEvents.length > 0
      ? <div className="admin-player-timeline-list" data-testid={`admin-player-timeline-${userId}`}>
        {visibleEvents.map((event) => event.kind === "game"
          ? <article className="admin-player-timeline-entry" key={`game:${event.id}`} data-testid={`timeline-game-${event.id}`}>
            <div className="admin-player-timeline-entry-top">
              <b>{gameLabels[event.game] ?? event.game}</b>
              <span className={`admin-player-timeline-badge is-${event.outcome}`}>
                {event.outcome === "win" ? "Победа" : event.outcome === "refund" ? "Возврат" : "Поражение"}
              </span>
              <time dateTime={event.at}>{dateFormat.format(new Date(event.at))}</time>
            </div>
            <p>{event.roundNumber === null ? "Попытка" : `Раунд №${numberFormat.format(event.roundNumber)}`} · {event.details}</p>
            <div className="admin-player-timeline-values">
              <span>Ставка <b>{compactCredits(event.stake)}</b></span>
              <span>Выплата <b>{compactCredits(event.payout)}</b></span>
              {event.profit !== null && <span>Итог <b className={event.profit > 0 ? "is-positive" : event.profit < 0 ? "is-negative" : ""}>
                {event.profit > 0 ? "+" : ""}{compactCredits(event.profit)}
              </b></span>}
            </div>
            {event.balanceChanges.length > 0 && <small className="admin-player-timeline-balance">
              Баланс до/после ставки: {compactCredits(event.balanceChanges[0].balanceBefore)} → {compactCredits(event.balanceChanges[event.balanceChanges.length - 1].balanceAfter)}
            </small>}
          </article>
          : <article className="admin-player-timeline-entry is-financial" key={`finance:${event.id}`} data-testid={`timeline-finance-${event.id}`}>
            <div className="admin-player-timeline-entry-top">
              <b>{operationLabels[event.operation] ?? event.operation}</b>
              <span className={`admin-player-timeline-badge${["rejected", "cancelled", "failed", "expired_admin", "expired_player", "fraud_closed"].includes(event.status) ? " is-loss" : ""}`}>
                {statusLabels[event.status] ?? event.status}
              </span>
              <time dateTime={event.at}>{dateFormat.format(new Date(event.at))}</time>
            </div>
            <div className="admin-player-timeline-values">
              <span>{sourceLabels[event.source] ?? event.source}</span>
              <b className={event.amount !== null && event.amount > 0 ? "is-positive" : event.amount !== null && event.amount < 0 ? "is-negative" : ""}>
                {signedCredits(event.amount)}
              </b>
            </div>
            {event.details && <p>{event.details}</p>}
            {event.balanceAfter !== null && <small className="admin-player-timeline-balance">
              Баланс после операции: {numberFormat.format(event.balanceAfter)} кредитов
            </small>}
          </article>)}
      </div>
      : !gameHistory.isLoading && !financialHistory.isLoading && !gameHistory.isError && !financialHistory.isError
        ? <p className="admin-player-timeline-state">Событий в доступной истории нет.</p>
        : null}

    {(sortedEvents.length > 0 || hasMore) && <nav className="admin-player-timeline-pagination" aria-label="Страницы хронологии игрока">
      <button type="button" className="outline-button" aria-label="Предыдущая страница хронологии"
        disabled={page <= 1 || isFetching} onClick={() => setPage((value) => value - 1)}>
        <ChevronLeft size={16} />
      </button>
      <span>Страница {page}</span>
      <button type="button" className="outline-button" aria-label="Следующая страница хронологии"
        disabled={!hasMore || isFetching || sourceError} onClick={showNextPage}>
        <ChevronRight size={16} />
      </button>
    </nav>}
  </section>;
}
