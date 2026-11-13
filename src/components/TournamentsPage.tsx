import { useEffect, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  Check,
  CircleDot,
  ExternalLink,
  Medal,
  Radio,
  RotateCw,
  ShieldCheck,
  Trophy,
  UsersRound,
} from "lucide-react";
import {
  getGetDarkAceTournamentsQueryKey,
  useGetDarkAceTournaments,
  type DarkAceTournament,
  type DarkAceTournamentBracketMatch,
  type DarkAceTournamentCurrentMatch,
  type DarkAceTournamentStanding,
} from "@workspace/api-client-react";
import "./TournamentsPage.css";

type TournamentTab = "upcoming" | "active" | "archive";

const TAB_LABELS: Record<TournamentTab, string> = {
  upcoming: "Ближайшие",
  active: "Идут",
  archive: "Архив",
};

const MOSCOW_DATE = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const MOSCOW_TIME = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  hour: "2-digit",
  minute: "2-digit",
});
const NUMBER_FORMAT = new Intl.NumberFormat("ru-RU");

function formatDateTime(value: string | null): string {
  if (!value) return "Дата не указана";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата не указана";
  return `${MOSCOW_DATE.format(date)} · ${MOSCOW_TIME.format(date)} МСК`;
}

function formatCredits(value: number): string {
  return `${NUMBER_FORMAT.format(value)} кр.`;
}

function participantRequirementLabel(tournament: DarkAceTournament): string {
  const count = tournament.participantCount;
  const plural = new Intl.PluralRules("ru").select(count);
  const participantNoun = plural === "one" ? "участник" : plural === "few" ? "участника" : "участников";
  return `${NUMBER_FORMAT.format(count)} ${participantNoun}`;
}

function statusLabel(tournament: DarkAceTournament): string {
  if (tournament.status === "registration") return "Регистрация";
  if (tournament.status === "active") return "Идёт турнир";
  if (tournament.status === "cancelled") return "Отменён";
  return "Завершён";
}

function matchKindLabel(match: DarkAceTournamentCurrentMatch): string {
  if (match.kind === "final") return "Финал";
  if (match.kind === "third_place") return "За третье место";
  return `Раунд ${match.roundNumber}`;
}

function bracketMatchKindLabel(match: DarkAceTournamentBracketMatch): string {
  if (match.kind === "final") return "Финал";
  if (match.kind === "third_place") return "Матч за третье место";
  return `Матч ${match.matchNumber}`;
}

function bracketMatchStatusLabel(match: DarkAceTournamentBracketMatch): string {
  if (match.status === "active") return "Идёт матч";
  if (match.status === "completed") return "Матч завершён";
  if (match.status === "bye") return "Автоматический проход";
  return "Ожидает начала";
}

function matchRequirementLabel(match: DarkAceTournamentCurrentMatch | DarkAceTournamentBracketMatch): string {
  return match.kind === "final" ? `до ${match.winsRequired} побед подряд` : "одна победа";
}

function matchScoreLabel(match: DarkAceTournamentCurrentMatch | DarkAceTournamentBracketMatch): string {
  return match.kind === "final" ? "Счёт серии" : "Счёт матча";
}

function mergeArchiveRows(
  existing: DarkAceTournament[],
  incoming: DarkAceTournament[],
  prependNew: boolean,
): DarkAceTournament[] {
  const existingIds = new Set(existing.map((tournament) => tournament.id));
  const incomingById = new Map(incoming.map((tournament) => [tournament.id, tournament]));
  const updatedExisting = existing.map((tournament) => incomingById.get(tournament.id) ?? tournament);
  const newRows = incoming.filter((tournament) => !existingIds.has(tournament.id));
  return prependNew
    ? [...newRows, ...updatedExisting]
    : [...updatedExisting, ...newRows];
}

function placeLabel(standing: DarkAceTournamentStanding): string {
  return standing.placeStart === standing.placeEnd
    ? `${standing.placeStart} место`
    : `${standing.placeStart}–${standing.placeEnd} места`;
}

function BracketMatch({ match, tournamentId }: { match: DarkAceTournamentBracketMatch; tournamentId: string }) {
  const matchId = `${tournamentId}-${match.roundNumber}-${match.matchNumber}-${match.kind}`;
  const unresolvedPlayerLabel = match.status === "bye" ? "Нет соперника" : "Ожидает участника";
  const playerOne = match.playerOne ?? unresolvedPlayerLabel;
  const playerTwo = match.playerTwo ?? unresolvedPlayerLabel;

  return (
    <article
      className={`da-tournaments-bracket-match${match.kind === "final" ? " is-final" : ""}${match.kind === "third_place" ? " is-third-place" : ""}`}
      data-status={match.status}
      data-kind={match.kind}
      data-testid={`tournament-bracket-match-${matchId}`}
    >
      <div className="da-tournaments-bracket-match-head">
        <span className="da-tournaments-bracket-kind" data-testid={`tournament-bracket-kind-${matchId}`}>
          {bracketMatchKindLabel(match)}
        </span>
        <span className="da-tournaments-bracket-status" data-testid={`tournament-bracket-status-${matchId}`}>
          {bracketMatchStatusLabel(match)}
        </span>
      </div>
      <div className="da-tournaments-bracket-players" data-testid={`tournament-bracket-players-${matchId}`}>
        <div className="da-tournaments-bracket-player">
          <span>{playerOne}</span>
        </div>
        <span className="da-tournaments-vs">VS</span>
        <div className="da-tournaments-bracket-player">
          <span>{playerTwo}</span>
        </div>
      </div>
      {match.winner && (
        <p className="da-tournaments-bracket-winner" data-testid={`tournament-bracket-winner-${matchId}`}>
          Победитель матча: <b>{match.winner}</b>
        </p>
      )}
      {match.status !== "bye" && (
        <div className="da-tournaments-bracket-series" data-testid={`tournament-bracket-series-${matchId}`}>
          <span>{matchScoreLabel(match)}</span>
          <b>{match.playerOneWins} : {match.playerTwoWins} · {matchRequirementLabel(match)}</b>
        </div>
      )}
      {match.status === "bye" && (
        <p className="da-tournaments-bracket-bye" data-testid={`tournament-bracket-bye-${matchId}`}>
          Автоматический проход без матча
        </p>
      )}
      {match.games.length > 0 && (
        <div className="da-tournaments-bracket-games" aria-label="Игры матча" data-testid={`tournament-bracket-games-${matchId}`}>
          {match.games.map((game) => (
            <div
              className="da-tournaments-bracket-game"
              key={`${matchId}-${game.gameNumber}`}
              data-testid={`tournament-bracket-game-${matchId}-${game.gameNumber}`}
            >
              <span>Игра {game.gameNumber}</span>
              <b>{game.playerOneSum}–{game.playerTwoSum}</b>
              {game.winner && <small>Победитель: {game.winner}</small>}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function TournamentBracket({ tournament, initiallyExpanded }: { tournament: DarkAceTournament; initiallyExpanded: boolean }) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  if (tournament.bracket.length === 0) {
    return <p className="da-tournaments-bracket-empty" data-testid={`tournament-bracket-empty-${tournament.id}`}>Сетка турнира пока не сформирована.</p>;
  }

  const rounds = [...new Set(
    tournament.bracket
      .filter((match) => match.kind === "round")
      .map((match) => match.roundNumber),
  )].sort((a, b) => a - b);
  const renderMatches = (matches: DarkAceTournamentBracketMatch[]) => matches
    .slice()
    .sort((a, b) => a.roundNumber - b.roundNumber || a.matchNumber - b.matchNumber)
    .map((match) => (
      <BracketMatch
        key={`${match.roundNumber}-${match.matchNumber}-${match.kind}`}
        match={match}
        tournamentId={tournament.id}
      />
    ));
  return (
    <details
      className="da-tournaments-bracket"
      aria-label={`Сетка турнира, ${tournament.bracket.length} матчей`}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      data-testid={`tournament-bracket-${tournament.id}`}
    >
      <summary className="da-tournaments-bracket-heading" data-testid={`tournament-bracket-summary-${tournament.id}`}>
        <span>Путь турнира</span>
        <span className="da-tournaments-bracket-match-count">{tournament.bracket.length} матчей</span>
      </summary>
      <div className="da-tournaments-bracket-content">
        {rounds.map((roundNumber) => {
          const matches = tournament.bracket.filter((match) => match.kind === "round" && match.roundNumber === roundNumber);
          return (
            <div className="da-tournaments-bracket-round" key={roundNumber} data-testid={`tournament-bracket-round-${tournament.id}-${roundNumber}`}>
              <h4>Раунд {roundNumber}</h4>
              <div className="da-tournaments-bracket-round-matches">{renderMatches(matches)}</div>
            </div>
          );
        })}
        {(["final", "third_place"] as const).map((kind) => {
          const matches = tournament.bracket.filter((match) => match.kind === kind);
          if (matches.length === 0) return null;
          const heading = kind === "final" ? "Финал" : "Матч за третье место";
          return (
            <div className={`da-tournaments-bracket-round da-tournaments-bracket-special-group is-${kind}`} key={kind} data-testid={`tournament-bracket-group-${tournament.id}-${kind}`}>
              <h4>{heading}</h4>
              <div className="da-tournaments-bracket-round-matches">{renderMatches(matches)}</div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function MatchPanel({ match }: { match: DarkAceTournamentCurrentMatch }) {
  const playerOne = match.playerOne ?? "Участник определяется";
  const playerTwo = match.playerTwo ?? "Участник определяется";
  const matchStatus = match.status === "active"
    ? `Игра ${match.gameNumber || match.games.length + 1}`
    : match.status === "completed"
      ? "Матч завершён"
      : match.status === "bye"
        ? "Технический проход"
        : "Ожидает начала";

  return (
    <section className="da-tournaments-match" aria-label="Текущий матч" data-testid="tournament-current-match">
      <div className="da-tournaments-match-label">
        <span>{matchKindLabel(match)}</span>
        <span>{matchStatus}</span>
      </div>
      <div className="da-tournaments-match-pair">
        <span className="da-tournaments-player">{playerOne}</span>
        <span className="da-tournaments-vs">VS</span>
        <span className="da-tournaments-player">{playerTwo}</span>
      </div>
      <div className="da-tournaments-series">
        <span>{matchScoreLabel(match)}</span>
        <b>{match.playerOneWins} : {match.playerTwoWins} · {matchRequirementLabel(match)}</b>
      </div>
      {match.games.length > 0 && (
        <div className="da-tournaments-games" aria-label="Результаты игр матча">
          {match.games.map((game) => (
            <span className="da-tournaments-game-score" key={game.gameNumber} data-testid={`tournament-game-${game.gameNumber}`}>
              Игра {game.gameNumber}: {game.playerOneSum}–{game.playerTwoSum}
            </span>
          ))}
        </div>
      )}
      {match.currentRoller && (
        <div className="da-tournaments-series" data-testid="tournament-current-roller">
          <span>Сейчас бросает</span>
          <b>{match.currentRoller}</b>
        </div>
      )}
    </section>
  );
}

function Standings({ standings }: { standings: DarkAceTournamentStanding[] }) {
  if (standings.length === 0) {
    return <p className="da-tournaments-topic-note" data-testid="tournament-no-standings">Итоговая таблица пока недоступна.</p>;
  }
  return (
    <section className="da-tournaments-results" aria-label="Итоговые результаты" data-testid="tournament-standings">
      <div className="da-tournaments-results-heading">
        <span>Итоговые места</span>
        <span>Приз</span>
      </div>
      <div className="da-tournaments-standings">
        {standings.map((standing, index) => (
          <div className="da-tournaments-standing" key={`${standing.displayName}-${standing.placeStart}-${index}`} data-testid={`tournament-standing-${index}`}>
            <span className="da-tournaments-place">{standing.placeStart}{standing.placeEnd !== standing.placeStart ? "–" : ""}</span>
            <span className="da-tournaments-standing-name">
              <b>{standing.displayName}</b>
              {standing.username && <small>@{standing.username.replace(/^@/, "")}</small>}
              {standing.placeEnd !== standing.placeStart && <small>{placeLabel(standing)}</small>}
            </span>
            <span className="da-tournaments-prize">{formatCredits(standing.prize)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TournamentCard({ tournament, showBracket = false }: { tournament: DarkAceTournament; showBracket?: boolean }) {
  const cancelled = tournament.status === "cancelled";
  const completed = tournament.status === "completed";
  const date = completed && tournament.completedAt ? tournament.completedAt : tournament.startsAt;

  return (
    <article
      className="da-tournaments-card"
      data-status={tournament.status}
      data-testid={`tournament-card-${tournament.id}`}
    >
      <div className="da-tournaments-card-top">
        <div>
          <h3 className="da-tournaments-card-title">Турнир по кубикам</h3>
          <div className="da-tournaments-card-date" data-testid={`tournament-date-${tournament.id}`}>
            <CalendarClock size={13} aria-hidden="true" />
            <time dateTime={date}>{formatDateTime(date)}</time>
          </div>
        </div>
        <span className="da-tournaments-status" data-status={tournament.status} data-testid={`tournament-status-${tournament.id}`}>
          <i className="da-tournaments-status-dot" aria-hidden="true" />
          {statusLabel(tournament)}
        </span>
      </div>

      <div className="da-tournaments-metrics" data-testid={`tournament-metrics-${tournament.id}`}>
        <div className="da-tournaments-metric">
          <span>Кубиков</span>
          <b>{NUMBER_FORMAT.format(tournament.diceCount)}</b>
        </div>
        <div className="da-tournaments-metric">
          <span>Участие в турнире</span>
          <b data-testid={`tournament-participant-count-${tournament.id}`}>{participantRequirementLabel(tournament)}</b>
        </div>
        <div className="da-tournaments-metric">
          <span>Призовой фонд</span>
          <b>{formatCredits(tournament.prizePool)}</b>
        </div>
      </div>

      <div className="da-tournaments-participant" data-registered={tournament.isParticipant} data-testid={`tournament-participation-${tournament.id}`}>
        {tournament.isParticipant ? <Check size={13} aria-hidden="true" /> : <UsersRound size={13} aria-hidden="true" />}
        <span>{tournament.isParticipant ? "Вы зарегистрированы" : "Вы не зарегистрированы"}</span>
      </div>

      {tournament.status === "active" && tournament.currentMatch && <MatchPanel match={tournament.currentMatch} />}
      {(tournament.status === "active" || showBracket) && (
        <TournamentBracket tournament={tournament} initiallyExpanded={tournament.status === "active"} />
      )}
      {completed && <Standings standings={tournament.standings} />}
      {cancelled && (
        <div className="da-tournaments-cancelled-note" data-testid={`tournament-cancelled-note-${tournament.id}`}>
          <AlertCircle size={14} aria-hidden="true" />
          <span>Турнир отменён. Выплаты и призовые места не назначены.</span>
        </div>
      )}

      {tournament.announcementUrl ? (
        <a
          className="da-tournaments-announcement"
          href={tournament.announcementUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`tournament-announcement-${tournament.id}`}
        >
          <Radio size={13} aria-hidden="true" />
          Открыть объявление в Telegram
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      ) : (
        <p className="da-tournaments-topic-note" data-testid={`tournament-topic-note-${tournament.id}`}>
          <CircleDot size={12} aria-hidden="true" />
          Регистрация — реакцией на объявление в теме «Турниры» группы. Игры проходят в теме «Кубик».
        </p>
      )}
      {tournament.announcementUrl && (
        <p className="da-tournaments-topic-note" data-testid={`tournament-games-topic-${tournament.id}`}>
          <ShieldCheck size={12} aria-hidden="true" />
          Регистрация — реакцией на объявление в группе; игры проходят в теме «Кубик».
        </p>
      )}
    </article>
  );
}

export default function TournamentsPage() {
  const [tab, setTab] = useState<TournamentTab>("upcoming");
  const [archiveRows, setArchiveRows] = useState<DarkAceTournament[]>([]);
  const [archiveNextCursor, setArchiveNextCursor] = useState<string | null>(null);
  const [hasLoadedArchiveContinuation, setHasLoadedArchiveContinuation] = useState(false);
  const [requestedArchiveCursor, setRequestedArchiveCursor] = useState<string | null>(null);
  const tournamentsQuery = useGetDarkAceTournaments(undefined, {
    query: {
      queryKey: getGetDarkAceTournamentsQueryKey(),
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  });
  const archivePageParams = { archiveCursor: requestedArchiveCursor ?? undefined };
  const archivePageQuery = useGetDarkAceTournaments(archivePageParams, {
    query: {
      queryKey: getGetDarkAceTournamentsQueryKey(archivePageParams),
      enabled: requestedArchiveCursor !== null,
      refetchOnWindowFocus: false,
    },
  });

  useEffect(() => {
    if (!tournamentsQuery.data) return;
    setArchiveRows((current) => mergeArchiveRows(current, tournamentsQuery.data.archive, true));
    if (!hasLoadedArchiveContinuation) {
      setArchiveNextCursor(tournamentsQuery.data.archiveNextCursor);
    }
  }, [tournamentsQuery.data, hasLoadedArchiveContinuation]);

  useEffect(() => {
    if (!requestedArchiveCursor || !archivePageQuery.data || archivePageQuery.isError) return;
    setArchiveRows((current) => mergeArchiveRows(current, archivePageQuery.data.archive, false));
    setArchiveNextCursor(archivePageQuery.data.archiveNextCursor);
    setHasLoadedArchiveContinuation(true);
    setRequestedArchiveCursor(null);
  }, [archivePageQuery.data, archivePageQuery.isError, requestedArchiveCursor]);

  const tournaments = tab === "archive"
    ? archiveRows
    : tournamentsQuery.data?.[tab] ?? [];
  const counts: Record<TournamentTab, number> = {
    upcoming: tournamentsQuery.data?.upcoming.length ?? 0,
    active: tournamentsQuery.data?.active.length ?? 0,
    archive: archiveRows.length,
  };

  return (
    <div className="da-tournaments-page" data-testid="page-tournaments">
      <header className="da-tournaments-hero">
        <div className="da-tournaments-kicker"><Trophy size={14} aria-hidden="true" /> ТУРНИРНЫЙ КЛУБ</div>
        <h1>Турниры</h1>
        <p>Расписание, текущие матчи и итоги игр DARK ACE. Турниры проходят в Telegram.</p>
      </header>

      <div className="da-tournaments-switcher" role="tablist" aria-label="Раздел турниров" data-testid="tournaments-tabs">
        {(["upcoming", "active", "archive"] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="da-tournaments-tab"
            aria-selected={tab === key}
            aria-controls="da-tournaments-panel"
            id={`da-tournaments-tab-${key}`}
            onClick={() => setTab(key)}
            data-testid={`tournaments-tab-${key}`}
          >
            {TAB_LABELS[key]}
            <span className="da-tournaments-tab-count">{counts[key]}</span>
          </button>
        ))}
      </div>

      <section
        id="da-tournaments-panel"
        role="tabpanel"
        aria-labelledby={`da-tournaments-tab-${tab}`}
        data-testid={`tournaments-panel-${tab}`}
      >
        <div className="da-tournaments-section-heading">
          <h2>{TAB_LABELS[tab]}</h2>
          <span>{tab === "upcoming" ? "Расписание" : tab === "active" ? "В эфире" : "Результаты"}</span>
        </div>

        {tournamentsQuery.isLoading && (
          <div className="da-tournaments-skeleton-list" aria-label="Загружаем турниры" data-testid="tournaments-loading">
            <div className="da-tournaments-skeleton" />
            <div className="da-tournaments-skeleton" />
          </div>
        )}

        {tournamentsQuery.isError && (
          <div className="da-tournaments-error" role="alert" data-testid="tournaments-error">
            <AlertCircle size={21} aria-hidden="true" />
            <h3>Не удалось загрузить турниры</h3>
            <p>Проверьте соединение и попробуйте ещё раз. Список обновляется автоматически, когда страница открыта.</p>
            <button type="button" className="da-tournaments-retry" onClick={() => void tournamentsQuery.refetch()} data-testid="button-tournaments-retry">
              <RotateCw size={13} aria-hidden="true" />
              Повторить
            </button>
          </div>
        )}

        {!tournamentsQuery.isLoading && !tournamentsQuery.isError && tournamentsQuery.data && tournaments.length === 0 && (
          <div className="da-tournaments-empty" data-testid={`tournaments-empty-${tab}`}>
            {tab === "active" ? <Radio size={22} aria-hidden="true" /> : tab === "archive" ? <Medal size={22} aria-hidden="true" /> : <CalendarClock size={22} aria-hidden="true" />}
            <h3>{tab === "upcoming" ? "Пока нет ближайших турниров" : tab === "active" ? "Сейчас матчей нет" : "Результатов пока нет"}</h3>
            <p>{tab === "upcoming"
              ? "Когда появится новое объявление в Telegram, оно отобразится здесь."
              : tab === "active"
                ? "Активные матчи появятся в этом разделе."
                : "Завершённые и отменённые турниры появятся в архиве."}</p>
          </div>
        )}

        {!tournamentsQuery.isLoading && !tournamentsQuery.isError && tournaments.length > 0 && (
          <div className="da-tournaments-list" data-testid={`tournaments-list-${tab}`}>
            {tournaments.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} showBracket={tab === "archive"} />)}
          </div>
        )}

        {tab === "archive" && tournaments.length > 0 && archiveNextCursor && (
          <div className="da-tournaments-archive-more" data-testid="tournaments-archive-pagination">
            {archivePageQuery.isError && (
              <p className="da-tournaments-archive-error" role="alert" data-testid="tournaments-archive-load-error">
                Не удалось загрузить следующую страницу архива. Уже загруженные турниры сохранены.
              </p>
            )}
            <button
              type="button"
              className="da-tournaments-load-more"
              aria-label={archivePageQuery.isError ? "Повторить загрузку архива" : "Показать ещё турниры архива"}
              disabled={archivePageQuery.isFetching}
              onClick={() => {
                if (archivePageQuery.isError && requestedArchiveCursor) {
                  void archivePageQuery.refetch();
                } else if (archiveNextCursor) {
                  setRequestedArchiveCursor(archiveNextCursor);
                }
              }}
              data-testid="button-tournaments-load-more"
            >
              {archivePageQuery.isFetching ? <RotateCw size={14} aria-hidden="true" /> : null}
              {archivePageQuery.isFetching ? "Загружаем…" : archivePageQuery.isError ? "Повторить" : "Показать ещё"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
