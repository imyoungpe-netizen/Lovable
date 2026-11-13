import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock3, Coins, Flame, Gift, RefreshCw, ShieldCheck, Target, X } from "lucide-react";
import { Link } from "wouter";
import {
  getGetDarkAceBootstrapQueryKey,
  getGetDarkAceDailyQuestsQueryKey,
  useClaimDarkAceDailyReward,
  useClaimDarkAceDailyQuest,
  useGetDarkAceBootstrap,
  useGetDarkAceDailyQuests,
} from "@workspace/api-client-react";
import type { DarkAceDailyQuestsResponse } from "@workspace/api-client-react";
import "./ProfileMarketHub.css";
import { parseUtcDate } from "./daily-quest-date";

const numberFormat = new Intl.NumberFormat("ru-RU");
const formatCredits = (value: number) => `${numberFormat.format(value)} кредитов`;

type QuestNotification = { id: string; kind: "quest" | "milestone"; message: string };

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remaining = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function DailyQuestSkeleton() {
  return <div className="dq-skeleton" role="status" aria-label="Загружаем ежедневные задания" data-testid="loading-daily-quests">
    <div className="dq-skeleton-hero" />
    <div className="dq-skeleton-milestones"><i /><i /><i /><i /></div>
    <div className="dq-skeleton-list"><i /><i /><i /><i /><i /><i /></div>
  </div>;
}

function statusLabel(status: string) {
  if (status === "in_progress") return "В процессе";
  if (status === "completed") return "Награда готова";
  if (status === "claimed") return "Получено";
  return "Доступно";
}

function StreakMilestones({ data }: { data: DarkAceDailyQuestsResponse }) {
  return <section className="dq-milestone-panel" aria-labelledby="dq-milestones-title">
    <div className="dq-section-heading">
      <div><span className="dq-kicker">ПОСТОЯНСТВО КЛУБА</span><h2 id="dq-milestones-title">Рубежи серии</h2></div>
      <span className="dq-milestone-note">Награды за входы подряд</span>
    </div>
    <div className="dq-milestones" data-testid="list-streak-milestones">
      {data.streakMilestones.map((milestone) => {
        const reached = milestone.status === "awarded";
        const progress = Math.max(0, Math.min(100, milestone.progress / milestone.days * 100));
        return <article className={`dq-milestone ${reached ? "is-awarded" : ""}`} key={milestone.days}
          data-testid={`milestone-${milestone.days}-days`} data-state={milestone.status}>
          <div className="dq-milestone-top"><span>{String(milestone.days).padStart(2, "0")}<small>ДН.</small></span>
            {reached ? <Check size={14} aria-label="Награда начислена" /> : <span className="dq-milestone-mark" />}</div>
          <b>{formatCredits(milestone.rewardCredits)}</b>
          <div className="dq-milestone-track" role="progressbar" aria-label={`Прогресс до ${milestone.days} дней`}
            aria-valuemin={0} aria-valuemax={milestone.days} aria-valuenow={Math.min(milestone.days, milestone.progress)}>
            <i style={{ width: `${progress}%` }} />
          </div>
          <small>{reached ? "Начислено" : `${Math.min(milestone.progress, milestone.days)} из ${milestone.days} дней`}</small>
        </article>;
      })}
    </div>
  </section>;
}

function QuestCard({ quest, onClaim, pending, claimError, monthlyLimitReached }: {
  quest: DarkAceDailyQuestsResponse["quests"][number];
  onClaim: (questId: string) => void;
  pending: boolean;
  claimError: boolean;
  monthlyLimitReached: boolean;
}) {
  const progressPercent = Math.max(0, Math.min(100, quest.progress / quest.target * 100));
  const completed = quest.status === "completed";
  return <article className={`dq-quest-card dq-status-${quest.status}`} data-testid={`card-daily-quest-${quest.id}`}
    data-state={quest.status}>
    <div className="dq-quest-mark" aria-hidden="true"><Target size={17} /></div>
    <div className="dq-quest-main">
      <div className="dq-quest-heading">
        <div className="dq-quest-title-group"><h3>{quest.title}</h3><span className={`dq-status-pill dq-pill-${quest.status}`} data-testid={`status-quest-${quest.id}`}>{statusLabel(quest.status)}</span></div>
        <span className="dq-quest-reward"><Coins size={14} />{formatCredits(quest.rewardCredits)}</span>
      </div>
      <p>{quest.description}</p>
      <div className="dq-progress-meta"><span>{quest.progressLabel}</span><b>{numberFormat.format(quest.progress)} / {numberFormat.format(quest.target)}</b></div>
      <div className="dq-progress-track" role="progressbar" aria-label={`Прогресс: ${quest.title}`}
        aria-valuemin={0} aria-valuemax={quest.target} aria-valuenow={Math.min(quest.progress, quest.target)}>
        <i style={{ width: `${progressPercent}%` }} />
      </div>
      <div className="dq-quest-foot">
        {quest.status === "claimed"
          ? <span className="dq-claimed-copy"><Check size={13} />Награда зачислена</span>
          : quest.status === "available"
            ? <span className="dq-available-copy">Начните задание сегодня</span>
            : quest.status === "in_progress"
              ? <span className="dq-available-copy">Прогресс подтверждает сервер</span>
              : <span className="dq-ready-copy">Выполнено · можно забрать</span>}
        {completed && monthlyLimitReached
          ? <span className="dq-available-copy">Все ежедневные награды на этот месяц получены</span>
          : completed && <div className="dq-claim-area">
          <button type="button" className="dq-claim-button" onClick={() => onClaim(quest.id)} disabled={pending}
            data-testid={`button-claim-quest-${quest.id}`}>
            {pending ? <><RefreshCw size={14} className="dq-spin" />Зачисляем</> : <><Check size={14} />Забрать награду</>}
          </button>
          {claimError && <div className="dq-claim-error" role="alert" data-testid={`error-claim-quest-${quest.id}`}>
            <span>Не удалось получить награду.</span>
            <button type="button" onClick={() => onClaim(quest.id)} disabled={pending} data-testid={`button-retry-claim-${quest.id}`}>Повторить</button>
          </div>}
        </div>}
      </div>
    </div>
  </article>;
}

export default function DailyQuestsPage({ embedded = false }: { embedded?: boolean }) {
  const PageContainer = embedded ? "div" : "main";
  const queryClient = useQueryClient();
  const bootstrapQuery = useGetDarkAceBootstrap({
    query: { queryKey: getGetDarkAceBootstrapQueryKey() },
  });
  const questsQuery = useGetDarkAceDailyQuests({
    query: {
      queryKey: getGetDarkAceDailyQuestsQueryKey(),
      refetchInterval: 10000,
      refetchIntervalInBackground: false,
    },
  });
  const claimDailyReward = useClaimDarkAceDailyReward();
  const claimQuest = useClaimDarkAceDailyQuest();
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [claimFeedback, setClaimFeedback] = useState("");
  const [dailyRewardFeedback, setDailyRewardFeedback] = useState("");
  const [dailyRewardError, setDailyRewardError] = useState(false);
  const [claimErrorQuestId, setClaimErrorQuestId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<QuestNotification[]>([]);
  const previousStatuses = useRef<{
    activityDate: string;
    streakStartedDate: string;
    quests: Map<string, string>;
    milestones: Map<number, string>;
  } | null>(null);
  const notifiedQuestIds = useRef(new Set<string>());
  const notifiedMilestoneDays = useRef(new Set<string>());
  const data = questsQuery.data;
  const dailyReward = bootstrapQuery.data?.dailyReward;

  useEffect(() => {
    if (!data) return;
    const currentQuests = new Map(data.quests.map((quest) => [quest.id, quest.status]));
    const currentMilestones = new Map(data.streakMilestones.map((milestone) => [milestone.days, milestone.status]));
    const previous = previousStatuses.current;

    if (previous) {
      const newDailyCycle = previous.activityDate !== data.activityDate;
      const newStreak = previous.streakStartedDate !== data.streakStartedDate;
      if (newDailyCycle) setNotifications([]);
      const arrived: QuestNotification[] = [];
      if (!newDailyCycle) {
        for (const quest of data.quests) {
          const notificationKey = `${data.activityDate}:${quest.id}`;
          const wasCompleted = previous.quests.get(quest.id) === "completed";
          if (quest.status === "completed" && !wasCompleted && !notifiedQuestIds.current.has(notificationKey)) {
            notifiedQuestIds.current.add(notificationKey);
            arrived.push({
              id: `quest-${notificationKey}`,
              kind: "quest",
              message: `Задание «${quest.title}» выполнено. Награда доступна к получению.`,
            });
          }
        }
      }
      if (!newStreak) {
        for (const milestone of data.streakMilestones) {
          const notificationKey = `${data.streakStartedDate}:${milestone.days}`;
          const wasAwarded = previous.milestones.get(milestone.days) === "awarded";
          if (milestone.status === "awarded" && !wasAwarded && !notifiedMilestoneDays.current.has(notificationKey)) {
            notifiedMilestoneDays.current.add(notificationKey);
            arrived.push({
              id: `milestone-${notificationKey}`,
              kind: "milestone",
              message: `Рубеж серии в ${milestone.days} дней достигнут. Начислено ${formatCredits(milestone.rewardCredits)}.`,
            });
          }
        }
      }
      if (arrived.length) setNotifications((current) => [...current, ...arrived]);
    }
    previousStatuses.current = {
      activityDate: data.activityDate,
      streakStartedDate: data.streakStartedDate,
      quests: currentQuests,
      milestones: currentMilestones,
    };
  }, [data]);

  useEffect(() => {
    if (!data) return;
    setSecondsLeft(data.secondsUntilReset);
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [data?.secondsUntilReset, data?.nextResetAt]);

  const claim = (questId: string) => {
    if (claimQuest.isPending) return;
    setClaimFeedback("");
    setClaimErrorQuestId(null);
    claimQuest.mutate({ questId }, {
      onSuccess: (result) => {
        setClaimFeedback(`${formatCredits(result.rewardCredits)} зачислено. Баланс клуба: ${formatCredits(result.balance)}.`);
        void queryClient.invalidateQueries({ queryKey: getGetDarkAceDailyQuestsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
      },
      onError: () => setClaimErrorQuestId(questId),
    });
  };

  const claimLoginReward = () => {
    if (claimDailyReward.isPending || !dailyReward?.available || !data?.monthlyRewards.remainingCredits) return;
    setDailyRewardFeedback("");
    setDailyRewardError(false);
    claimDailyReward.mutate({ data: {} }, {
      onSuccess: (result) => {
        setDailyRewardFeedback(`${formatCredits(result.amount)} зачислено.`);
        void queryClient.invalidateQueries({ queryKey: getGetDarkAceDailyQuestsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
      },
      onError: () => {
        setDailyRewardError(true);
        void queryClient.invalidateQueries({ queryKey: getGetDarkAceDailyQuestsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDarkAceBootstrapQueryKey() });
      },
    });
  };

  if (questsQuery.isLoading || (!data && !questsQuery.isError)) return <PageContainer className={`dq-page${embedded ? " dq-page-embedded" : ""}`}><DailyQuestSkeleton /></PageContainer>;
  if (questsQuery.isError || !data) return <PageContainer className={`dq-page${embedded ? " dq-page-embedded" : ""}`}>
    <div className="dq-query-error" role="alert" data-testid="error-daily-quests">
      <ShieldCheck size={23} /><span className="dq-kicker">СВЯЗЬ С СЕРВЕРОМ</span>
      <h1>Задания не загрузились</h1>
      <p>Состояние заданий и наград подтверждает сервер клуба. Повторите запрос, чтобы продолжить.</p>
      <button type="button" onClick={() => void questsQuery.refetch()} data-testid="button-retry-daily-quests"><RefreshCw size={15} />Повторить</button>
    </div>
  </PageContainer>;

  const dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(parseUtcDate(data.activityDate));
  return <PageContainer className={`dq-page${embedded ? " dq-page-embedded" : ""}`} data-testid="page-daily-quests">
    <header className="dq-page-head fade-up">
      <div className="dq-page-head-top">{!embedded && <Link href="/profile" className="dq-back-link" data-testid="link-back-profile"><ArrowLeft size={15} />Профиль клуба</Link>}
        <span className="dq-live-mark"><i />СЕРВЕРНЫЕ ЗАДАНИЯ</span></div>
      <div className="dq-title-row">
        <div><span className="dq-kicker">DARK ACE / ЕЖЕДНЕВНЫЕ НАГРАДЫ</span><h1>Ежедневные задания</h1>
          <p>Бонус за вход, задания и серия входов — все ежедневные награды в одном месте.</p></div>
        <div className="dq-reset-box" data-testid="text-reset-countdown">
          <span><Clock3 size={13} />СБРОС UTC</span><b>{formatCountdown(secondsLeft)}</b>
          <small>следующий цикл · {dateLabel}</small>
        </div>
      </div>
    </header>

    {claimFeedback && <div className="dq-success-banner" role="status" data-testid="status-quest-claim-success"><Check size={16} /><span>{claimFeedback}</span></div>}
    <section className="dq-login-reward" aria-label="Бонус за ежедневный вход" data-testid="panel-daily-login-reward">
      <div className="dq-login-reward-icon"><Gift size={19} /></div>
      <div className="dq-login-reward-copy">
        <span className="dq-kicker">ЕЖЕДНЕВНЫЙ ВХОД</span>
        <b>{dailyReward?.available ? `Бонус · ${formatCredits(dailyReward.amount)}` : "Бонус за вход"}</b>
        <small>{data.monthlyRewards.remainingCredits <= 0
          ? "Все ежедневные награды на этот месяц получены."
          : !dailyReward
            ? "Загружаем сегодняшнюю награду."
            : dailyReward.available
            ? "Заберите сегодняшнюю награду."
            : "Сегодняшний бонус уже получен."}</small>
      </div>
      <button type="button" className="dq-login-claim-button" onClick={claimLoginReward}
        disabled={!dailyReward?.available || claimDailyReward.isPending || data.monthlyRewards.remainingCredits <= 0}
        data-testid="button-claim-daily-login">
        {claimDailyReward.isPending
          ? <><RefreshCw size={13} className="dq-spin" />Зачисляем</>
          : dailyReward?.available
            ? <><Gift size={13} />Забрать</>
            : data.monthlyRewards.remainingCredits <= 0
              ? "Лимит"
              : !dailyReward
                ? "Загрузка"
            : <><Check size={13} />Получено</>}
      </button>
      {dailyRewardError && <div className="dq-login-reward-error" role="alert">Не удалось забрать бонус. Обновите страницу и попробуйте снова.</div>}
      {dailyRewardFeedback && <div className="dq-login-reward-success" role="status">{dailyRewardFeedback}</div>}
    </section>
    {notifications.length > 0 && <div className="dq-notification-stack" aria-label="Обновления заданий">
      {notifications.map((notification) => <div className={`dq-transition-notice dq-notice-${notification.kind}`} role="status"
        key={notification.id} data-testid={`notification-${notification.kind}-${notification.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`}>
        {notification.kind === "quest" ? <Check size={15} /> : <Flame size={15} />}
        <span>{notification.message}</span>
        <button type="button" onClick={() => setNotifications((current) => current.filter((item) => item.id !== notification.id))}
          aria-label="Закрыть уведомление" data-testid={`button-dismiss-notification-${notification.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`}><X size={13} /></button>
      </div>)}
    </div>}
    {questsQuery.isRefetchError && <div className="dq-refresh-warning" role="status" data-testid="status-quests-refresh-error">Не удалось обновить данные. Показано последнее подтверждённое состояние.</div>}

    <section className="dq-streak-hero" aria-label="Текущая серия входов" data-testid="panel-current-streak">
      <div className="dq-streak-emblem"><Flame size={25} /></div>
      <div className="dq-streak-copy"><span className="dq-kicker">СЕРИЯ ВХОДОВ</span><b>{numberFormat.format(data.currentStreak)} <small>{data.currentStreak === 1 ? "день" : "дней"}</small></b>
        <span>С вами с {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parseUtcDate(data.streakStartedDate))}</span></div>
      <div className="dq-streak-aside"><span>СЕГОДНЯ</span><b>{dateLabel}</b><small>UTC · день клуба</small></div>
    </section>

    <StreakMilestones data={data} />

    <section className="dq-quest-section" aria-labelledby="dq-quest-list-title">
      <div className="dq-section-heading dq-quest-section-heading">
        <div><span className="dq-kicker">ЗАДАЧИ НА СЕГОДНЯ</span><h2 id="dq-quest-list-title">Шесть шагов клуба</h2></div>
        <span className="dq-ready-count" data-testid="text-ready-count"><b>{numberFormat.format(data.readyCount)}</b> готовы</span>
      </div>
      {data.quests.length
        ? <div className="dq-quest-list" data-testid="list-daily-quests">
          {data.quests.map((quest) => <QuestCard key={quest.id} quest={quest} onClaim={claim}
            pending={claimQuest.isPending && claimQuest.variables?.questId === quest.id}
            claimError={claimErrorQuestId === quest.id}
            monthlyLimitReached={data.monthlyRewards.remainingCredits <= 0} />)}
        </div>
        : <div className="dq-empty-state" data-testid="empty-daily-quests"><Target size={23} /><b>Заданий пока нет</b><span>Список обновится, когда сервер откроет дневной цикл.</span></div>}
    </section>
    <footer className="dq-trust-note"><ShieldCheck size={14} /><span>Награды начисляются только после подтверждения сервера DARK ACE.</span>
      <span className="dq-next-reset-iso" aria-label="Время следующего сброса UTC">{new Date(data.nextResetAt).toISOString().slice(11, 16)} UTC</span></footer>
  </PageContainer>;
}
