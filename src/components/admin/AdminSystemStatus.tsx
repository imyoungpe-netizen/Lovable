import type { ReactNode } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, RefreshCw, Send, Server } from "lucide-react";
import { getGetDarkAceAdminSystemStatusQueryKey, useGetDarkAceAdminSystemStatus } from "@workspace/api-client-react";
import "./AdminSystemStatus.css";

const dateTime = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });

export default function AdminSystemStatus() {
  const status = useGetDarkAceAdminSystemStatus({
    query: {
      queryKey: getGetDarkAceAdminSystemStatusQueryKey(),
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  });
  const data = status.data;

  return <section className="admin-system-status panel rounded-2xl" aria-label="Состояние сервисов DARK ACE">
    <header className="admin-system-status-heading">
      <div>
        <span className="eyebrow">МОНИТОРИНГ</span>
        <h2><Activity size={17} /> Состояние системы</h2>
        <p>Бот сообщает настроенным администраторам о сбое webhook или контролируемого фонового процесса и о восстановлении. Полную остановку самого API можно обнаружить только внешним мониторингом.</p>
      </div>
      <button type="button" className="outline-button" aria-label="Обновить состояние системы"
        disabled={status.isFetching} onClick={() => void status.refetch()}>
        <RefreshCw size={15} />
      </button>
    </header>
    {status.isLoading && <p className="admin-system-status-message" role="status">Проверяем сервисы…</p>}
    {status.isError && <p className="admin-system-status-message is-error" role="alert">
      Не удалось загрузить состояние. <button type="button" onClick={() => void status.refetch()}>Повторить</button>
    </p>}
    {data && <>
      <div className="admin-system-status-grid">
        <StatusTile icon={<Server size={15} />} label="API" ok text={`Работает · ${Math.floor(data.uptimeSeconds / 60)} мин.`} />
        <StatusTile icon={<Database size={15} />} label="База данных" ok={data.databaseAvailable}
          text={data.databaseAvailable ? "Подключена" : "Нет ответа"} />
        <StatusTile icon={<Send size={15} />} label="Telegram" ok={data.telegramBotConfigured}
          text={data.telegramBotConfigured ? "Токен настроен" : "Токен не настроен"} />
        <div className="admin-system-status-tile">
          <Clock3 size={15} />
          <span><b>Webhook</b><small>{data.lastTelegramWebhookAt
            ? `Последний запрос · ${dateTime.format(new Date(data.lastTelegramWebhookAt))}`
            : "Событий с перезапуска пока не было"}</small></span>
        </div>
        <div className={`admin-system-status-tile${data.telegramWebhookFailures ? " is-warning" : " is-ok"}`}>
          {data.telegramWebhookFailures ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
          <span><b>Ошибки webhook</b><small>{data.telegramWebhookFailures
            ? `${data.telegramWebhookFailures} сбоев с перезапуска · последнее ${data.lastTelegramWebhookFailureAt ? dateTime.format(new Date(data.lastTelegramWebhookFailureAt)) : "—"}`
            : "Сбоев с перезапуска нет"}</small></span>
        </div>
      </div>
      <div className="admin-system-workers">
        <span className="eyebrow">ФОНОВЫЕ ПРОЦЕССЫ</span>
        {data.workers.map((worker) => <div key={worker.name} className="admin-system-worker">
          {worker.running ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          <span>{worker.name}</span><b>{worker.running ? "Активен" : "Не обнаружен"}</b>
        </div>)}
      </div>
      <p className="admin-system-checked">Проверено {dateTime.format(new Date(data.checkedAt))}</p>
    </>}
  </section>;
}

function StatusTile({ icon, label, text, ok }: { icon: ReactNode; label: string; text: string; ok: boolean }) {
  return <div className={`admin-system-status-tile${ok ? " is-ok" : " is-warning"}`}>
    {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
    <span>{icon}<b>{label}</b><small>{text}</small></span>
  </div>;
}
