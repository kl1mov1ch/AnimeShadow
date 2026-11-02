import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRightIcon,
  CalendarClockIcon,
  ChevronDownIcon,
  CrownIcon,
  InfoIcon,
  PlayIcon,
  RefreshCwIcon,
  TrophyIcon,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/states";
import { MembersOnly } from "@/components/common/members-only";
import {
  PodiumCard,
  RankSeal,
  WatchRankingRow,
  ViewerAvatar,
} from "@/components/leaderboards/watch-rank";
import { watchTimeLabel, type WatchBoard } from "@/lib/watch-leaderboard";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { useDocumentHead } from "@/lib/seo";
import { ShadowAvatarFrame } from "@/components/profile/shadow-avatar-frame";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import "./leaderboards.css";

const PERIODS = {
  week: "Эта неделя",
  month: "Этот месяц",
  all: "Всё время",
} as const;
type Period = keyof typeof PERIODS;

export function Component() {
  return (
    <MembersOnly
      title="Рейтинг для своих"
      description="Войдите, чтобы увидеть лучших зрителей, своё место и награды сообщества AnimeShadow."
    >
      <WatchLeaderboard />
    </MembersOnly>
  );
}

function WatchLeaderboard() {
  const [params, setParams] = useSearchParams();
  const candidate = params.get("period");
  const period: Period =
    candidate === "all" || candidate === "month" ? candidate : "week";
  const { user, status } = useAuth();
  const board = useQuery({
    queryKey: ["watch-board", period, user?.id],
    queryFn: ({ signal }) =>
      apiRequest<WatchBoard>("/leaderboards/watch", { signal, query: { period } }),
    enabled: status === "authenticated",
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  useDocumentHead({
    title: "Топ зрителей — недельные награды PRO | AnimeShadow",
    description:
      "Лучшие зрители AnimeShadow. Каждую неделю тройка лидеров получает 7, 5 и 3 дня PRO.",
    path: "/leaderboards",
  });
  const data = board.data;
  const leaders = data?.top.filter((row) => row.rank <= 3) ?? [];
  const remaining = data?.top.filter((row) => row.rank > 3) ?? [];
  const fatal = board.isError && !data;
  const deadline =
    data?.week &&
    new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      timeZone: "Europe/Moscow",
    }).format(new Date(data.week.endsAt));
  return (
    <div className="watch-hall mx-auto w-full max-w-7xl">
      <header className="hall-heading">
        <div>
          <div className="hall-title-row">
            <span className="hall-heading-icon">
              <TrophyIcon className="size-5" />
            </span>
            <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
              Топ зрителей
            </h1>
          </div>
          <p>Смотри любимые истории, поднимайся в рейтинге и забирай награды.</p>
        </div>
      </header>

      <div className="hall-board">
        <div className="hall-toolbar">
          <Tabs
            value={period}
            onValueChange={(value) =>
              setParams(value === "week" ? {} : { period: value }, {
                replace: true,
                preventScrollReset: true,
              })
            }
          >
            <TabsList aria-label="Период рейтинга" className="hall-periods">
              <TabsTrigger value="week">Неделя</TabsTrigger>
              <TabsTrigger value="month">Месяц</TabsTrigger>
              <TabsTrigger value="all">Всё время</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="hall-refresh-label" aria-live="polite">
            {board.isError && data ? (
              <button
                onClick={() => void board.refetch()}
                type="button"
                className="flex items-center gap-1.5 text-primary"
              >
                <RefreshCwIcon className="size-3" />
                Повторить обновление
              </button>
            ) : (
              <>
                {board.isFetching ? (
                  <RefreshCwIcon aria-hidden className="size-3 animate-spin" />
                ) : (
                  <span className="hall-live-dot" />
                )}
                {board.isFetching ? "Обновляем рейтинг" : "Обновляется раз в минуту"}
              </>
            )}
          </div>
        </div>

        <section
          aria-label="Лидеры рейтинга"
          aria-busy={board.isPending}
          className="hall-stage"
        >
          <div className="hall-section-heading">
            <h2 className="font-display text-base">
              {data?.top.length && leaders.length === 0 ? (
                "Рейтинг зрителей"
              ) : (
                <>
                  Лидеры{" "}
                  {period === "week"
                    ? "недели"
                    : period === "month"
                      ? "месяца"
                      : "за всё время"}
                </>
              )}
            </h2>
            <span className="hall-period-caption">{PERIODS[period]}</span>
          </div>
          {fatal ? (
            <div className="p-5">
              <ErrorState onRetry={() => void board.refetch()} />
            </div>
          ) : board.isPending ? (
            <div className="hall-loading" role="status" aria-label="Загружаем рейтинг">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-12 rounded-xl" />
              ))}
            </div>
          ) : leaders.length ? (
            <div className="hall-podium-grid" key={period} data-count={leaders.length}>
              {leaders.map((row, slot) => (
                <PodiumCard
                  key={row.userId}
                  slot={slot}
                  row={row}
                  currentUserId={user?.id}
                  proDays={
                    period === "week" ? data?.week?.proDays[row.rank - 1] : undefined
                  }
                />
              ))}
            </div>
          ) : !data?.top.length ? (
            <div className="hall-empty">
              <span className="hall-empty-icon">
                <TrophyIcon aria-hidden className="size-6" />
              </span>
              <div className="hall-empty-copy">
                <h3 className="font-display">Здесь начинается твой топ</h3>
                <p>
                  За этот период пока нет результатов. Выбери аниме и смотри в плеере
                  сайта — время появится в рейтинге.
                </p>
              </div>
              <Link to="/browse" className="hall-action">
                Выбрать аниме
                <ArrowUpRightIcon className="size-3.5" />
              </Link>
            </div>
          ) : null}
        </section>

        {remaining.length > 0 && (
          <section aria-label="Рейтинг зрителей" className="hall-list-surface">
            <div className="hall-section-heading hall-list-heading">
              <h2 className="font-display text-base">В погоне за вершиной</h2>
            </div>
            <div className="hall-table-head">
              <span>Место</span>
              <span>Зритель</span>
              <span className="hidden text-right sm:block">Аниме</span>
              <span className="text-right">Просмотрено</span>
            </div>
            <ol className="hall-ranking-list">
              {remaining.map((row, index) => (
                <WatchRankingRow
                  key={row.userId}
                  row={row}
                  leaderSeconds={data?.top[0]?.seconds ?? 1}
                  mine={row.userId === user?.id}
                  index={index}
                />
              ))}
            </ol>
          </section>
        )}
        {status === "authenticated" && data && (
          <section aria-label="Твоё место в рейтинге" className="hall-personal">
            {data.me ? (
              <>
                <RankSeal rank={data.me.rank} />
                <div className="hall-personal-avatar">
                  <ViewerAvatar row={data.me} size={32} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    Твоё место · {PERIODS[period].toLocaleLowerCase("ru-RU")}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold">
                    {data.me.displayName}
                  </p>
                </div>
                <strong className="hall-personal-time">
                  {watchTimeLabel(data.me.seconds)}
                </strong>
              </>
            ) : (
              <>
                <span className="hall-personal-play">
                  <PlayIcon aria-hidden className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Твоё место ещё впереди</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Для участия нужны публичный профиль и открытая статистика просмотра.
                  </p>
                </div>
                <Link to="/browse" className="hall-personal-link">
                  Продолжить смотреть{" "}
                  <ArrowUpRightIcon aria-hidden className="size-3.5" />
                </Link>
              </>
            )}
          </section>
        )}
      </div>

      <div className="hall-rewards" aria-label="Награды рейтинга">
        <section
          className="hall-reward-card hall-reward-card--pro"
          aria-label="Недельные награды PRO"
        >
          <div className="hall-reward-intro">
            <span className="hall-gift-icon">
              <CrownIcon aria-hidden className="size-5" />
            </span>
            <div>
              <h2>На вершине — PRO</h2>
              <p>Для тройки лидеров недели</p>
            </div>
          </div>
          <div className="hall-reward-places" aria-label="Призы за места">
            {[7, 5, 3].map((days, index) => (
              <div
                key={days}
                className="hall-reward-place"
                data-metal={["gold", "silver", "bronze"][index]}
              >
                <RankSeal rank={index + 1} />
                <strong>
                  +{days}
                  <small>{days === 3 ? "дня" : "дней"} PRO</small>
                </strong>
              </div>
            ))}
          </div>
          <p className="hall-reward-note">
            Дни прибавятся к действующему PRO. За каждое место в тройке также
            открывается постоянная медальная приписка к нику.
          </p>
          <div className="hall-card-footer">
            <CalendarClockIcon aria-hidden className="size-3.5" />
            <span>Итоги {deadline ?? "каждый понедельник"}, 00:00 по Москве</span>
          </div>
        </section>

        <section
          className="hall-reward-card hall-reward-card--frames"
          aria-label="Рамки за топ просмотров"
        >
          <div className="hall-reward-intro">
            <span className="hall-gift-icon">
              <TrophyIcon aria-hidden className="size-5" />
            </span>
            <div>
              <h2>Твоё место — на рамке</h2>
              <p>Постоянная награда за топ-999</p>
            </div>
          </div>
          <div className="hall-frame-rewards">
            {(
              [
                {
                  frame: "shadow-weekly",
                  title: "Лидер недели",
                  note: "За завершённую неделю",
                },
                {
                  frame: "shadow-monthly",
                  title: "Лидер месяца",
                  note: "За календарный месяц",
                },
              ] as const
            ).map((prize) => (
              <div key={prize.frame} className="hall-frame-reward">
                <div className="hall-frame-preview">
                  <ShadowAvatarFrame frame={prize.frame} size={36}>
                    <span className="grid size-9 place-items-center rounded-full bg-background text-primary">
                      <LogoGlyph className="size-4" />
                    </span>
                  </ShadowAvatarFrame>
                </div>
                <div className="min-w-0">
                  <h3>{prize.title}</h3>
                  <p>{prize.note}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="hall-reward-note">
            На рамке появится твоё лучшее заработанное место. Новые результаты могут
            улучшить номер, а сама награда останется навсегда.
          </p>
          <div className="hall-card-footer">
            <TrophyIcon aria-hidden className="size-3.5" />
            <span>Рамки недели и месяца выдаются отдельно</span>
          </div>
        </section>
      </div>

      <details className="hall-rules">
        <summary>
          <InfoIcon className="size-3.5" />
          Правила рейтинга и наград
          <ChevronDownIcon aria-hidden className="hall-rules-chevron size-4" />
        </summary>
        <div className="hall-rules-content">
          <p>
            Неделя длится с понедельника 00:00 до следующего понедельника 00:00 по
            Москве. В первые минуты после окончания недели первое место получает 7 дней
            PRO, второе — 5, третье — 3. Награда продлевает действующий PRO или пробный
            срок; бессрочный PRO сохраняется. При отсутствии PRO срок начинается с
            момента выдачи.
          </p>
          <p>
            Учитывается время просмотра в плеере сайта. Участие доступно
            незаблокированным аккаунтам с публичным профилем и публичной статистикой.
            При равном времени выше тот, кто посмотрел больше разных аниме; далее
            порядок определяется постоянным идентификатором аккаунта. Месячный рейтинг
            идёт с первого числа 00:00 до первого числа следующего месяца по Москве. За
            топ-999 недели и месяца выдаются постоянные рамки с номером лучшего места.
            Первые три места недели открывают постоянные медальные приписки. Каждая
            награда выдаётся один раз после завершения периода.
          </p>
        </div>
      </details>
    </div>
  );
}
