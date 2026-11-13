import { useState } from "react";
import { ChevronLeft, ChevronRight, History, RefreshCw } from "lucide-react";
import {
  getGetDarkAceAdminAuditLogQueryKey,
  useGetDarkAceAdminAuditLog,
} from "@workspace/api-client-react";
import "./AdminActionLog.css";

const PAGE_SIZE = 20;
const numberFormat = new Intl.NumberFormat("ru-RU");
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
});

function playerLabel(name: string | null, username: string | null, id: string | null) {
  if (!id) return null;
  return `${name ?? "Игрок"}${username ? ` · @${username}` : ""} · ID ${id}`;
}

export default function AdminActionLog() {
  const [page, setPage] = useState(1);
  const params = { page, limit: PAGE_SIZE };
  const query = useGetDarkAceAdminAuditLog(params, {
    query: {
      queryKey: getGetDarkAceAdminAuditLogQueryKey(params),
      refetchInterval: 30_000,
      refetchOnMount: "always",
      staleTime: 0,
    },
  });
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));

  return <section className="admin-action-log panel rounded-2xl" aria-label="Журнал действий администратора">
    <header className="admin-action-log-heading">
      <div>
        <span className="eyebrow">ИСТОРИЯ ОПЕРАЦИЙ</span>
        <h2><History size={18} /> Журнал действий</h2>
        <p>Начисления, списания, сбросы, изменения промокодов и настройки.</p>
      </div>
      <button type="button" className="outline-button" aria-label="Обновить журнал"
        disabled={query.isFetching} onClick={() => void query.refetch()} data-testid="button-refresh-admin-audit">
        <RefreshCw size={15} />
      </button>
    </header>

    {query.isLoading && <p className="admin-action-log-state" role="status">Загружаем журнал…</p>}
    {query.isError && <p className="admin-action-log-state is-error" role="alert">
      Не удалось загрузить журнал. <button type="button" onClick={() => void query.refetch()}>Повторить</button>
    </p>}
    {query.data && <>
      <div className="admin-action-log-meta">
        <span>Всего записей</span><b>{numberFormat.format(query.data.total)}</b>
      </div>
      {query.data.entries.length
        ? <div className="admin-action-log-list">
          {query.data.entries.map((entry) => {
            const target = playerLabel(entry.targetDisplayName, entry.targetUsername, entry.targetUserId);
            return <article className="admin-action-log-entry" key={entry.id} data-testid={`admin-audit-entry-${entry.id}`}>
              <div className="admin-action-log-entry-mark" aria-hidden="true"><History size={15} /></div>
              <div className="admin-action-log-entry-main">
                <div className="admin-action-log-entry-title">
                  <b>{entry.actionLabel}</b>
                  <time dateTime={entry.createdAt}>{dateFormat.format(new Date(entry.createdAt))}</time>
                </div>
                <p>{entry.summary}</p>
                <div className="admin-action-log-people">
                  <span>Администратор: <b>{entry.adminDisplayName}</b>{entry.adminUsername ? ` · @${entry.adminUsername}` : ""} · ID {entry.adminUserId}</span>
                  {target && <span>Игрок: <b>{target}</b></span>}
                </div>
              </div>
            </article>;
          })}
        </div>
        : <p className="admin-action-log-state">Пока нет записанных действий.</p>}

      {query.data.total > PAGE_SIZE && <nav className="admin-action-log-pagination" aria-label="Страницы журнала">
        <button type="button" className="outline-button" aria-label="Предыдущая страница"
          disabled={page <= 1 || query.isFetching} onClick={() => setPage((value) => value - 1)}>
          <ChevronLeft size={16} />
        </button>
        <span>{page} / {totalPages}</span>
        <button type="button" className="outline-button" aria-label="Следующая страница"
          disabled={page >= totalPages || query.isFetching} onClick={() => setPage((value) => value + 1)}>
          <ChevronRight size={16} />
        </button>
      </nav>}
    </>}
  </section>;
}
