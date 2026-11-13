import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, Info, ShieldCheck } from "lucide-react";
import {
  getGetDarkAceFairnessProofQueryKey,
  useGetDarkAceDailyFairness,
  useGetDarkAceFairnessProof,
} from "@workspace/api-client-react";
import { SUPPORT_URL } from "@/lib/support";
import { verifyFairnessOutcome } from "@/lib/fairness-proof";
import "./FairnessPage.css";

function FairnessCard({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="da-fairness-card">
      <div className="da-fairness-card-title">
        <span>{number}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

type FairnessGame = "lenta" | "european_roulette" | "dice" | "crash" | "fruits" | "blackjack" | "upgrade" | "battle" | "plinko";
const isFairnessGame = (value: string | null): value is FairnessGame =>
  value !== null && ["lenta", "european_roulette", "dice", "crash", "fruits", "blackjack", "upgrade", "battle", "plinko"].includes(value);
const FAIRNESS_GAME_LABELS: Record<FairnessGame, string> = {
  lenta: "Лента",
  european_roulette: "Европейская рулетка",
  dice: "DICE",
  crash: "Crash",
  fruits: "Фрукты",
  blackjack: "Blackjack",
  upgrade: "UPGRADE",
  battle: "Battle",
  plinko: "Plinko",
};

export default function FairnessPage() {
  const [game, setGame] = useState<FairnessGame>(() => {
    const initial = new URLSearchParams(window.location.search).get("game");
    return isFairnessGame(initial) ? initial : "lenta";
  });
  const [roundKey, setRoundKey] = useState("");
  const [lookup, setLookup] = useState<{ game: FairnessGame; roundKey: string } | null>(null);
  const dailyQuery = useGetDarkAceDailyFairness({ game });
  const proofQuery = useGetDarkAceFairnessProof(
    { game: lookup?.game ?? game, roundKey: lookup?.roundKey ?? roundKey },
    { query: {
      enabled: Boolean(lookup?.roundKey),
      queryKey: lookup
        ? getGetDarkAceFairnessProofQueryKey(lookup)
        : getGetDarkAceFairnessProofQueryKey({ game, roundKey }),
    } },
  );
  const [proofStatus, setProofStatus] = useState<"checking" | "valid" | "invalid" | null>(null);
  const proof = proofQuery.data;

  useEffect(() => {
    if (!proof?.serverSeedHash || !proof.serverSeedReveal) {
      setProofStatus(null);
      return;
    }
    setProofStatus("checking");
    void verifyFairnessOutcome(proof)
      .then((valid) => setProofStatus(valid ? "valid" : "invalid"));
  }, [proof]);

  const inspectRound = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (roundKey.trim()) setLookup({ game, roundKey: roundKey.trim() });
  };

  return (
    <main className="da-fairness-page">
      <Link href="/" className="da-fairness-back" data-testid="link-fairness-home">
        <ArrowLeft size={15} /> На главную
      </Link>

      <header className="da-fairness-header">
        <span className="da-fairness-kicker"><ShieldCheck size={14} /> ПРАВИЛА И РЕЗУЛЬТАТЫ</span>
        <h1>Честность</h1>
        <p>
          Результаты рассчитывает сервер по правилам каждой игры. Анимация только показывает
          исход и не может изменить его.
        </p>
      </header>

      <div className="da-fairness-note">
        <Info size={17} />
        <p>
          <b>Один хеш на игру в день:</b> до начала раундов публикуется хеш дневного seed.
          Все раунды выбранной игры за этот день используют его с отдельным номером раунда.
          Сам seed раскрывается после окончания дня по московскому времени.
        </p>
      </div>

      <section className="da-fairness-verifier">
        <div className="da-fairness-card-title"><span>✓</span><h2>Дневной хеш игры</h2></div>
        <p>Выберите игру: здесь один хеш на каждый день, а не отдельный хеш для каждого раунда.</p>
        <div className="da-fairness-active">
          <b>{dailyQuery.isLoading ? "Загружаем дневной seed…" : `Дневные данные · ${FAIRNESS_GAME_LABELS[game]}`}</b>
          {dailyQuery.isError && <span>Дневная схема ещё не активирована. После миграции базы здесь появится один хеш выбранной игры на день.</span>}
          {dailyQuery.data?.days.map((day) => (
            <div key={`${day.game}:${day.date}`}>
              <span>{day.date} · {new Intl.NumberFormat("ru-RU").format(day.roundCount)} завершённых раундов{day.serverSeedReveal ? " · seed раскрыт" : " · seed будет раскрыт после дня"}</span>
              <code>{day.serverSeedHash}</code>
              {day.serverSeedReveal && <code>Seed: {day.serverSeedReveal}</code>}
            </div>
          ))}
          <span>Раунды до включения дневной схемы сохраняют прежние доказательства.</span>
        </div>
        <form className="da-fairness-lookup" onSubmit={inspectRound}>
          <label>Игра
            <select value={game} onChange={(event) => setGame(event.target.value as FairnessGame)}>
              <option value="lenta">Лента</option>
              <option value="european_roulette">Европейская рулетка</option>
              <option value="dice">DICE</option>
              <option value="crash">Crash</option>
              <option value="fruits">Фрукты</option>
              <option value="blackjack">Blackjack</option>
              <option value="battle">Battle</option>
              <option value="upgrade">UPGRADE</option>
              <option value="plinko">Plinko</option>
            </select>
          </label>
          <label>Номер раунда / ID спина
            <input value={roundKey} onChange={(event) => setRoundKey(event.target.value)} placeholder="Например, 128 или 2:128" />
          </label>
          <button type="submit" disabled={!roundKey.trim()}>Показать</button>
        </form>
        {proofQuery.isFetching && <p>Загружаем доказательство…</p>}
        {proofQuery.isError && <p className="da-fairness-error">Раунд не найден или его доказательство ещё недоступно.</p>}
        {proof && <div className="da-fairness-proof-result">
          <b>{proof.game} · раунд {proof.roundKey}</b>
          <span>Алгоритм: {proof.algorithmVersion}</span>
          {proof.serverSeedReveal
            ? <strong className={proofStatus === "valid" ? "is-valid" : proofStatus === "invalid" ? "is-invalid" : ""}>
                {proofStatus === "valid" ? "Результат сверён с дневным seed"
                  : proofStatus === "invalid" ? "Проверка не пройдена" : "Проверяем результат…"}
              </strong>
            : <span>{proof.clientSeed?.startsWith("da-daily-v1|")
              ? "Раунд рассчитан; общий seed выбранной игры раскроется после окончания дня по Москве."
              : "Раунд ещё не завершён или его старое доказательство недоступно."}</span>}
          <div><small>Исход</small><pre>{JSON.stringify(proof.outcome, null, 2)}</pre></div>
          <div><small>Данные для воспроизведения</small><pre>{JSON.stringify(proof.inputs, null, 2)}</pre></div>
        </div>}
      </section>

      <div className="da-fairness-list">
        <FairnessCard number="01" title="Лента — общий стол">
          <p>
            Сервер определяет общий исход раунда до показа анимации. Игроки за столом видят один
            и тот же результат, а ставки рассчитываются по правилам выбранного исхода.
          </p>
        </FairnessCard>

        <FairnessCard number="02" title="Европейская рулетка">
          <p>
            Номер для каждого раунда выбирает сервер. Колесо и шарик лишь визуально показывают
            уже установленный результат и не влияют на выбор числа.
          </p>
        </FairnessCard>

        <FairnessCard number="03" title="DICE">
          <p>
            Сервер рассчитывает общий бросок двух костей для раунда. Все участники видят одни и
            те же кости; результат ставки проверяется по сумме выпавших значений.
          </p>
          <p className="da-fairness-footnote">
            При разрешённой комбинации исходов каждая часть ставки обрабатывается отдельно.
          </p>
        </FairnessCard>

        <FairnessCard number="04" title="Crash">
          <p>
            Множитель раунда и расчёт ставок определяются сервером по правилам Crash. График
            отображает ход раунда и не управляет результатом.
          </p>
        </FairnessCard>

        <FairnessCard number="05" title="Blackjack">
          <p>
            Карты перемешиваются сервером. Раздача, действия дилера и расчёт результата проходят
            по правилам стола; анимация не меняет карты и исход.
          </p>
        </FairnessCard>

        <FairnessCard number="06" title="Фрукты">
          <p>
            Итоговый фрукт выбирает сервер по таблице правил игры. Анимация прокрутки показывает
            выбранный символ, но не определяет его.
          </p>
        </FairnessCard>

        <FairnessCard number="07" title="Upgrade">
          <p>
            Сервер рассчитывает шанс до попытки и определяет результат случайным розыгрышем.
            Колесо использует тот же результат, поэтому его анимация не может изменить исход.
          </p>
        </FairnessCard>

        <FairnessCard number="08" title="Battle">
          <p>
            Если режим доступен, сервер выбирает победителя случайным розыгрышем с учётом ставок
            участников. Победитель определяется сервером, а не интерфейсом.
          </p>
        </FairnessCard>

        <FairnessCard number="09" title="Plinko">
          <p>Дневной seed определяет последовательность направлений шарика для каждого спина; таблица выплат зависит от рядов и риска.</p>
        </FairnessCard>

      </div>

      <div className="da-fairness-summary">
        <Check size={16} />
        <p>
          Перед игрой ознакомьтесь с правилами выбранного режима. При вопросах по конкретному
          раунду сохраните его номер и обратитесь в{" "}
          <a href={SUPPORT_URL} target="_blank" rel="noreferrer">поддержку</a>.
        </p>
      </div>
    </main>
  );
}
