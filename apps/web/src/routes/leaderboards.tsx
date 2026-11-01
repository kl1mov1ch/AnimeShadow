import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRightIcon,
  Clock3Icon,
  CrownIcon,
  InfoIcon,
  PlayIcon,
  RefreshCwIcon,
  ShieldIcon,
  SparklesIcon,
  StarIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/states";
import {
  PodiumCard,
  RankSeal,
  ViewerAvatar,
  WatchRankingRow,
} from "@/components/leaderboards/watch-rank";
import { watchTimeLabel, type WatchBoard } from "@/lib/watch-leaderboard";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { useDocumentHead } from "@/lib/seo";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import "./leaderboards.css";

const PERIODS = {
  all: "За всё время",
  month: "За последние 30 дней",
  week: "За последние 7 дней",
} as const;
type Period = keyof typeof PERIODS;

function HallTrophy() {
  return (
    <div className="hall-hero-art" aria-hidden>
      <div className="hall-hero-halo" />
      <LogoGlyph className="hall-hero-mark" />
      <svg viewBox="0 0 240 220" fill="none">
        <path
          d="M83 48h74v32c0 34-16 55-37 55S83 114 83 80V48Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M82 60H61v18c0 23 12 37 30 38m67-56h21v18c0 23-12 37-30 38m-29 19v29m-26 10h52m-60 10h68"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="m120 70 5 12 13 1-10 9 3 13-11-7-11 7 3-13-10-9 13-1Z"
          fill="currentColor"
          fillOpacity=".8"
        />
        <path
          d="M73 170C37 149 23 110 36 73m131 97c36-21 50-60 37-97"
          stroke="currentColor"
          strokeOpacity=".3"
        />
        <path
          d="m44 128-16-9 9 20 15 8m-13-42-14-9 7 18 10 9m5-40-8-13 2 19 5 10m150 29 16-9-9 20-15 8m13-42 14-9-7 18-10 9m-5-40 8-13-2 19-5 10"
          fill="currentColor"
          fillOpacity=".35"
        />
        <path
          d="m55 39 2 7 7 2-7 2-2 7-2-7-7-2 7-2Zm129-15 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"
          fill="currentColor"
          fillOpacity=".7"
        />
      </svg>
    </div>
  );
}

export function Component() {
  const [params, setParams] = useSearchParams();
  const candidate = params.get("period");
  const period: Period =
    candidate === "week" || candidate === "month" ? candidate : "all";
  const { user, status } = useAuth();
  const board = useQuery({
    queryKey: ["watch-board", period, user?.id],
    queryFn: ({ signal }) =>
      apiRequest<WatchBoard>("/leaderboards/watch", { signal, query: { period } }),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  useDocumentHead({
    title: "Зал легенд — топ зрителей | AnimeShadow",
    description:
      "Лидеры AnimeShadow: подиум лучших зрителей и рейтинг по времени просмотра за неделю, месяц и всё время.",
    path: "/leaderboards",
  });
  const data = board.data;
  const remaining = data?.top.slice(3) ?? [];
  const leaderSeconds = data?.top[0]?.seconds ?? 1;
  const empty = Boolean(data && data.top.length === 0);
  const fatal = board.isError && !data;
  return (
    <div className="watch-hall mx-auto flex w-full max-w-6xl flex-col gap-7 sm:gap-9">
      <header className="hall-hero">
        <div className="relative z-10 max-w-2xl">
          <p className="hall-hero-label">
            <TrophyIcon className="size-4" />
            Топ зрителей AnimeShadow
          </p>
          <h1 className="mt-4 font-display text-3xl leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl">
            Зал легенд
          </h1>
          <p className="mt-4 max-w-[37rem] text-sm leading-relaxed text-muted-foreground sm:text-base">
            Рейтинг тех, кто провёл больше всего времени в мирах аниме. Любимые истории
            становятся частью твоего пути к вершине.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <UsersIcon className="size-3.5" />
              {data ? (
                <>
                  <strong className="font-semibold tabular-nums text-foreground">
                    {data.participants.toLocaleString("ru-RU")}
                  </strong>{" "}
                  в рейтинге
                </>
              ) : (
                "Сообщество зрителей"
              )}
            </span>
            <span className="flex items-center gap-2">
              <Clock3Icon className="size-3.5" />
              По времени просмотра
            </span>
          </div>
        </div>
        <HallTrophy />
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={period}
          onValueChange={(value) =>
            setParams(value === "all" ? {} : { period: value }, {
              replace: true,
              preventScrollReset: true,
            })
          }
        >
          <TabsList
            aria-label="Период рейтинга"
            className="hall-periods w-full sm:w-fit"
          >
            <TabsTrigger value="all">Всё время</TabsTrigger>
            <TabsTrigger value="month">Месяц</TabsTrigger>
            <TabsTrigger value="week">Неделя</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="hall-refresh-label">
          {board.isError && data ? (
            <button
              className="flex min-h-8 items-center gap-1.5 text-primary"
              onClick={() => void board.refetch()}
            >
              <RefreshCwIcon className="size-3" />
              Повторить обновление
            </button>
          ) : (
            <>
              <span className="hall-live-dot" />
              Обновляется каждую минуту
            </>
          )}
        </span>
      </div>

      <section
        aria-label="Подиум лидеров"
        aria-busy={board.isPending}
        className="hall-stage"
        key={`podium-${period}`}
      >
        <div className="hall-section-heading">
          <div>
            <p className="text-xs text-muted-foreground">{PERIODS[period]}</p>
            <h2 className="mt-1 flex items-center gap-2 font-display text-lg sm:text-xl">
              <CrownIcon className="size-5 text-[var(--hall-gold)]" />
              На вершине рейтинга
            </h2>
          </div>
          <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
            <ShieldIcon className="size-3.5" />
            Три места. Три истории.
          </span>
        </div>
        {fatal ? (
          <div className="hall-list-surface p-5">
            <ErrorState onRetry={() => void board.refetch()} />
          </div>
        ) : (
          <div className="hall-podium-grid">
            {board.isPending
              ? Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="hall-podium-skeleton" />
                ))
              : Array.from({ length: 3 }, (_, slot) => (
                  <PodiumCard
                    key={data?.top[slot]?.userId ?? `vacant-${slot}`}
                    slot={slot}
                    row={data?.top[slot]}
                    currentUserId={user?.id}
                  />
                ))}
          </div>
        )}
        {empty && (
          <div className="hall-empty">
            <SparklesIcon className="size-5 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">Вершина пока свободна</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                За этот период ещё нет публичных просмотров. Включи любимое аниме — и
                начни свою историю в рейтинге.
              </p>
            </div>
            <Link
              className="hall-action"
              to={status === "authenticated" ? "/browse" : "/register"}
            >
              {status === "authenticated" ? "Выбрать аниме" : "Занять своё место"}
              <ArrowUpRightIcon className="size-3.5" />
            </Link>
          </div>
        )}
      </section>

      {status === "authenticated" && data && (
        <section aria-label="Твоё место в рейтинге" className="hall-personal">
          {data.me ? (
            <>
              <RankSeal rank={data.me.rank} />
              <ViewerAvatar row={data.me} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Твоё место</p>
                <p className="mt-0.5 truncate text-sm font-semibold">
                  {data.me.displayName}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-sm tabular-nums text-primary sm:text-base">
                  {watchTimeLabel(data.me.seconds)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {data.me.titles} аниме за этот период
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <StarIcon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Здесь может быть твоё имя</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Смотри аниме и открой статистику профиля для участия в топе.
                </p>
              </div>
              <Link className="hall-action shrink-0" to="/browse">
                <PlayIcon className="size-3.5" />
                <span className="hidden sm:inline">Выбрать аниме</span>
              </Link>
            </>
          )}
        </section>
      )}

      {(remaining.length > 0 || board.isPending) && (
        <section aria-label="Рейтинг зрителей" className="hall-list-surface">
          <div className="hall-section-heading px-4 pb-4 pt-5 sm:px-6">
            <div>
              <h2 className="font-display text-lg">Путь к вершине</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Каждая история приближает к лидерам
              </p>
            </div>
            {data && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {data.participants > 50
                  ? "Лучшие 50"
                  : `${data.participants} в рейтинге`}
              </span>
            )}
          </div>
          <div className="hall-table-head">
            <span>Место</span>
            <span>Зритель</span>
            <span className="hidden text-right sm:block">Аниме</span>
            <span className="text-right">Время</span>
          </div>
          {board.isPending ? (
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : (
            <ol className="hall-ranking-list" key={`list-${period}`}>
              {remaining.map((row, index) => (
                <WatchRankingRow
                  key={row.userId}
                  row={row}
                  leaderSeconds={leaderSeconds}
                  mine={row.userId === user?.id}
                  index={index}
                />
              ))}
            </ol>
          )}
        </section>
      )}

      {status === "anonymous" && !empty && (
        <section className="hall-join">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <TrophyIcon className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold sm:text-base">
                Твоя следующая история — в этом рейтинге
              </h2>
              <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">
                Войди, чтобы сохранять время просмотра и следить за своим местом среди
                зрителей AnimeShadow.
              </p>
            </div>
          </div>
          <Link
            to="/register"
            state={{ from: "/leaderboards" }}
            className="hall-action shrink-0"
          >
            Занять своё место
            <ArrowUpRightIcon className="size-4" />
          </Link>
        </section>
      )}

      <details className="hall-rules">
        <summary>
          <InfoIcon className="size-3.5" />
          Как устроен рейтинг
        </summary>
        <p>
          Учитывается время просмотра в плеере: за последние 7 дней, 30 дней или весь
          период. Данные обновляются в течение минуты. В общий топ попадают профили с
          публичной статистикой; изменить доступ можно в настройках приватности. Число
          аниме означает тайтлы с просмотром, а не количество завершённых сериалов. При
          одинаковом времени зрители делят место.
        </p>
      </details>
    </div>
  );
}
