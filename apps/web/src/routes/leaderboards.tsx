import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRightIcon,
  CalendarClockIcon,
  CrownIcon,
  InfoIcon,
  PlayIcon,
  RefreshCwIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/states";
import {
  PodiumCard,
  RankSeal,
  WatchRankingRow,
} from "@/components/leaderboards/watch-rank";
import { watchTimeLabel, type WatchBoard } from "@/lib/watch-leaderboard";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { useDocumentHead } from "@/lib/seo";
import "./leaderboards.css";

const PERIODS = {
  week: "Эта неделя",
  month: "Последние 30 дней",
  all: "Всё время",
} as const;
type Period = keyof typeof PERIODS;

export function Component() {
  const [params, setParams] = useSearchParams();
  const candidate = params.get("period");
  const period: Period =
    candidate === "all" || candidate === "month" ? candidate : "week";
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
    title: "Топ зрителей — недельные награды PRO | AnimeShadow",
    description:
      "Лучшие зрители AnimeShadow. Каждую неделю тройка лидеров получает 7, 5 и 3 дня PRO.",
    path: "/leaderboards",
  });
  const data = board.data;
  const remaining = data?.top.slice(3) ?? [];
  const fatal = board.isError && !data;
  const deadline =
    data?.week &&
    new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      timeZone: "Europe/Moscow",
    }).format(new Date(data.week.endsAt));
  return (
    <div className="watch-hall mx-auto w-full max-w-6xl">
      <header className="hall-heading">
        <div>
          <div className="hall-heading-icon">
            <TrophyIcon className="size-5" />
          </div>
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">
            Топ зрителей
          </h1>
          <p>Любимые истории. Время просмотра. Твоё место среди лучших.</p>
        </div>
        <div className="hall-community">
          <UsersIcon className="size-4" />
          <span>
            <strong>{data?.participants.toLocaleString("ru-RU") ?? "—"}</strong>{" "}
            зрителей в рейтинге
          </span>
        </div>
      </header>

      <section className="hall-weekly-reward" aria-label="Недельные награды PRO">
        <div className="hall-reward-intro">
          <span className="hall-gift-icon">
            <CrownIcon className="size-5" />
          </span>
          <div>
            <h2>Неделя просмотра — дни PRO в подарок</h2>
            <p>Тройке лидеров каждую неделю. Награда прибавляется к твоему PRO.</p>
          </div>
        </div>
        <div className="hall-reward-places" aria-label="Призы за места">
          <span>
            <b>1</b>
            <strong>7</strong> дней
          </span>
          <span>
            <b>2</b>
            <strong>5</strong> дней
          </span>
          <span>
            <b>3</b>
            <strong>3</strong> дня
          </span>
        </div>
      </section>

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
        <span className="hall-deadline">
          <CalendarClockIcon className="size-3.5" />
          {period === "week"
            ? `Итоги ${deadline ?? "в понедельник"}, 00:00 МСК`
            : PERIODS[period]}
        </span>
      </div>

      <section
        aria-label="Подиум лидеров"
        aria-busy={board.isPending}
        className="hall-stage"
      >
        <div className="hall-section-heading">
          <h2 className="font-display text-lg">
            Лидеры{" "}
            {period === "week"
              ? "недели"
              : period === "month"
                ? "месяца"
                : "за всё время"}
          </h2>
          <span className="hall-refresh-label">
            {board.isError && data ? (
              <button
                onClick={() => void board.refetch()}
                className="flex items-center gap-1.5 text-primary"
              >
                <RefreshCwIcon className="size-3" />
                Обновить
              </button>
            ) : (
              <>
                <span className="hall-live-dot" />
                Обновление раз в минуту
              </>
            )}
          </span>
        </div>
        {fatal ? (
          <div className="hall-list-surface p-5">
            <ErrorState onRetry={() => void board.refetch()} />
          </div>
        ) : (
          <div className="hall-podium-grid" key={period}>
            {board.isPending
              ? Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="hall-podium-skeleton" />
                ))
              : Array.from({ length: 3 }, (_, slot) => (
                  <PodiumCard
                    key={data?.top[slot]?.userId ?? slot}
                    slot={slot}
                    row={data?.top[slot]}
                    currentUserId={user?.id}
                    proDays={period === "week" ? data?.week?.proDays[slot] : undefined}
                  />
                ))}
          </div>
        )}
      </section>

      {status === "authenticated" && data && (
        <section aria-label="Твоё место в рейтинге" className="hall-personal">
          {data.me ? (
            <>
              <RankSeal rank={data.me.rank} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Твоё место</p>
                <p className="mt-1 truncate text-sm font-semibold">
                  {data.me.displayName}
                </p>
              </div>
              <strong className="text-sm tabular-nums text-primary">
                {watchTimeLabel(data.me.seconds)}
              </strong>
            </>
          ) : (
            <>
              <PlayIcon className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Начни неделю с любимого аниме</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Смотри в плеере сайта и открой статистику профиля для участия.
                </p>
              </div>
              <Link to="/browse" className="hall-action">
                В каталог
                <ArrowUpRightIcon className="size-3.5" />
              </Link>
            </>
          )}
        </section>
      )}

      {(remaining.length > 0 || board.isPending) && (
        <section aria-label="Рейтинг зрителей" className="hall-list-surface">
          <div className="hall-section-heading px-4 py-5 sm:px-6">
            <h2 className="font-display text-lg">В погоне за лидерами</h2>
            <span className="text-xs text-muted-foreground">
              {data &&
                (data.participants > 50
                  ? "Лучшие 50"
                  : `${data.participants} участников`)}
            </span>
          </div>
          <div className="hall-table-head">
            <span>Место</span>
            <span>Зритель</span>
            <span className="hidden text-right sm:block">Аниме</span>
            <span className="text-right">Просмотрено</span>
          </div>
          {board.isPending ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : (
            <ol className="hall-ranking-list">
              {remaining.map((row) => (
                <WatchRankingRow
                  key={row.userId}
                  row={row}
                  leaderSeconds={data?.top[0]?.seconds ?? 1}
                  mine={row.userId === user?.id}
                />
              ))}
            </ol>
          )}
        </section>
      )}

      {status === "anonymous" && (
        <section className="hall-join">
          <div>
            <h2 className="text-sm font-semibold">
              Смотри аниме. Поднимайся в рейтинге.
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Войди, чтобы сохранять просмотренное время и участвовать в недельном топе.
            </p>
          </div>
          <Link
            to="/register"
            state={{ from: "/leaderboards" }}
            className="hall-action shrink-0"
          >
            Участвовать
            <ArrowUpRightIcon className="size-3.5" />
          </Link>
        </section>
      )}

      <details className="hall-rules">
        <summary>
          <InfoIcon className="size-3.5" />
          Правила рейтинга и наград
        </summary>
        <p>
          Неделя длится с понедельника 00:00 до следующего понедельника 00:00 по Москве.
          В первые минуты после окончания недели первое место получает 7 дней PRO,
          второе — 5, третье — 3. Награда продлевает действующий PRO или пробный срок;
          бессрочный PRO сохраняется. При отсутствии PRO срок начинается с момента
          выдачи. За пропущенные во время обслуживания недели награды выдаются после
          восстановления сайта.
        </p>
        <p>
          Учитывается время просмотра в плеере сайта. Участие доступно незаблокированным
          аккаунтам с публичным профилем и публичной статистикой. При равном времени
          выше тот, кто посмотрел больше разных аниме; далее порядок определяется
          постоянным идентификатором аккаунта. Месячный рейтинг охватывает последние 30
          дней. Награды предусмотрены только за календарную неделю. Каждая награда
          выдаётся один раз.
        </p>
      </details>
    </div>
  );
}
