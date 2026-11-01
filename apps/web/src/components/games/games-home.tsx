import {
  CalendarDaysIcon,
  CheckIcon,
  ChevronRightIcon,
  FlameIcon,
  HeadphonesIcon,
  ImageIcon,
  PlayIcon,
  TrophyIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useBrowse } from "@/lib/query";
import { imageSrc } from "@/lib/format";
import { LogoWatermark } from "@/components/brand/logo-watermark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const WAVE = [
  18, 30, 22, 48, 34, 60, 42, 76, 54, 86, 66, 46, 72, 94, 62, 40, 80, 58, 100, 70, 48,
  82, 56, 34, 64, 42, 24, 46, 30, 18,
];

export function GamesHome() {
  const { status } = useAuth();
  const catalog = useBrowse({
    page: 1,
    perPage: 6,
    orderBy: "popularity",
    sort: "desc",
    minScore: 8,
    hasPlayer: true,
  });
  const covers = (catalog.data?.items ?? [])
    .filter((anime) => anime.imageLargeUrl || anime.imageUrl)
    .slice(0, 5);
  return (
    <div className="flex flex-col gap-5 sm:gap-7">
      <header className="relative isolate overflow-hidden rounded-3xl border border-border/70 bg-card">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-[48%] overflow-hidden sm:block [mask-image:linear-gradient(to_right,transparent,black_35%)]"
        >
          <div className="absolute -right-6 -top-14 grid w-full rotate-[8deg] grid-cols-3 gap-3 opacity-55">
            {covers.map((anime, i) => (
              <img
                key={anime.id}
                src={imageSrc(anime.imageLargeUrl ?? anime.imageUrl, 240)}
                alt=""
                decoding="async"
                className={cn(
                  "aspect-[2/3] w-full rounded-xl object-cover",
                  i % 2 === 0 && "translate-y-16",
                )}
              />
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-card/20" />
        </div>
        <LogoWatermark className="-bottom-12 -right-8 size-64 sm:hidden" />
        <div className="flex max-w-2xl flex-col items-start gap-5 px-5 py-7 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-primary">
            <FlameIcon className="size-4" />
            Территория знатоков аниме
          </div>
          <h1 className="max-w-lg text-balance font-display text-[1.75rem] leading-[1.25] sm:text-4xl lg:text-[2.75rem]">
            Узнаешь с первого кадра?
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            Знакомые миры, любимые мелодии и тот самый момент: «Я это смотрел!» Играй в
            своём темпе или брось вызов всему сообществу.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to="/games/guess">
                <PlayIcon data-icon="inline-start" />
                Играть по картинке
              </Link>
            </Button>
            <Link
              to="/leaderboards"
              className="inline-flex min-h-11 items-center gap-2 px-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <TrophyIcon className="size-4" />
              Топ зрителей
            </Link>
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CheckIcon className="size-3.5 text-primary" />
              Три режима игры
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckIcon className="size-3.5 text-primary" />
              Рекорды сохраняются
            </span>
          </p>
        </div>
      </header>
      <section
        aria-labelledby="daily-feature-title"
        className="relative isolate grid overflow-hidden rounded-2xl border border-primary/30 bg-primary/[0.06] sm:grid-cols-[1fr_auto]"
      >
        <div className="flex flex-col items-start gap-4 p-5 sm:p-7">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-primary">
            <CalendarDaysIcon className="size-4" />
            Общий вызов дня
          </span>
          <h2
            id="daily-feature-title"
            className="text-balance font-display text-xl sm:text-2xl"
          >
            Десять кадров. Твой результат.
          </h2>
          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
            Сегодня у всех одни и те же вопросы. Пройди одну зачётную попытку и узнай,
            насколько хорошо ты помнишь аниме.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span>10 вопросов</span>
            <span>1 попытка в сутки</span>
            <span>Новый вызов в 00:00 МСК</span>
          </div>
          <Button asChild>
            <Link to="/games/daily">
              Принять вызов
              <ChevronRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
        <div
          aria-hidden
          className="pointer-events-none relative hidden w-48 items-center justify-center border-l border-primary/15 p-6 sm:flex lg:w-64"
        >
          <div className="absolute size-44 rounded-full border border-primary/10" />
          <div className="absolute size-32 rounded-full border border-primary/20" />
          <span className="flex flex-col items-center gap-1">
            <TrophyIcon className="size-10 text-primary" />
            <span className="mt-2 font-display text-4xl text-foreground">
              10<span className="ml-1 text-lg text-muted-foreground">/10</span>
            </span>
            <span className="text-xs text-muted-foreground">Сможешь угадать все?</span>
          </span>
        </div>
      </section>
      <section aria-labelledby="free-games-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="free-games-title" className="font-display text-xl sm:text-2xl">
            Ещё один раунд?
          </h2>
          <p className="text-sm text-muted-foreground">
            Без лимита попыток. Каждый правильный ответ продлевает серию.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            to="/games/guess"
            className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card outline-none transition-colors hover:border-primary/45 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div
              aria-hidden
              className="relative flex h-36 items-center justify-center overflow-hidden bg-secondary/50 sm:h-44"
            >
              <div className="absolute inset-0 flex gap-1.5 opacity-35">
                {covers.slice(0, 4).map((anime) => (
                  <img
                    key={anime.id}
                    src={imageSrc(anime.imageLargeUrl ?? anime.imageUrl, 240)}
                    alt=""
                    loading="lazy"
                    className="h-full min-w-0 flex-1 object-cover"
                  />
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-card/20" />
              <span className="relative grid size-20 place-items-center rounded-2xl border border-foreground/20 bg-background/70 text-foreground backdrop-blur-sm">
                <ImageIcon className="size-9" />
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-xl">По картинке</h3>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">
                  Визуальная память
                </span>
              </div>
              <p className="max-w-md flex-1 text-sm leading-relaxed text-muted-foreground">
                Один кадр, четыре названия. Узнай аниме по деталям и собери свою лучшую
                серию.
              </p>
              <span className="mt-1 inline-flex min-h-10 items-center gap-2 self-start text-sm font-semibold text-primary">
                Угадывать по кадрам
                <ChevronRightIcon className="size-4" />
              </span>
            </div>
          </Link>
          <Link
            to="/games/opening"
            className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card outline-none transition-colors hover:border-primary/45 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div
              aria-hidden
              className="relative flex h-36 items-center justify-center overflow-hidden bg-secondary/50 sm:h-44"
            >
              <div className="absolute inset-x-5 flex h-24 items-center justify-center gap-1 opacity-25">
                {WAVE.map((height, i) => (
                  <span
                    key={i}
                    style={{ height: `${height}%` }}
                    className="w-1.5 rounded-full bg-primary sm:w-2"
                  />
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-card/20" />
              <span className="relative grid size-20 place-items-center rounded-full border border-primary/30 bg-background/80 text-primary">
                <HeadphonesIcon className="size-9" />
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-xl">По опенингу</h3>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">
                  Музыкальная память
                </span>
              </div>
              <p className="max-w-md flex-1 text-sm leading-relaxed text-muted-foreground">
                Всего 20 секунд знакомой мелодии. Вспомни, какое аниме начиналось с этой
                песни.
              </p>
              <span className="mt-1 inline-flex min-h-10 items-center gap-2 self-start text-sm font-semibold text-primary">
                Включить опенинг
                <ChevronRightIcon className="size-4" />
              </span>
            </div>
          </Link>
        </div>
      </section>
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex items-start gap-3">
          <TrophyIcon className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold">У каждого режима свой топ</h2>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              В обычных играх побеждает самая длинная серия. В вызове дня — число верных
              ответов; при равном счёте место общее.
              {status !== "authenticated" && " Войди, чтобы сохранить результат."}
            </p>
          </div>
        </div>
        {status === "anonymous" && (
          <Link
            to="/register"
            state={{ from: "/games" }}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 self-start text-sm font-medium text-primary"
          >
            Создать аккаунт
            <ChevronRightIcon className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
