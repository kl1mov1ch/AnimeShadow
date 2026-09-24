import type { AnimeSummary } from "@animeshadow/shared";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  EyeIcon,
  LightbulbIcon,
  RotateCcwIcon,
  SparklesIcon,
  StarIcon,
  TrophyIcon,
  XIcon,
  CheckIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocale, useT } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Days since the epoch in the viewer's own calendar — "today" for picks. */
function dayNumber(): number {
  const now = new Date();
  return Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
}

/**
 * The part of the front page that isn't a shelf.
 *
 * Every other section is a row of posters to scroll past; this one gives a
 * visitor something to do. Three things side by side: one title picked for
 * today (the same for everyone, all day, so it can be talked about), a
 * one-question game of guessing a show from its blurred poster, and a
 * rotating card of things worth knowing about anime.
 *
 * Built only from titles the page already loaded — no extra requests.
 */
export function AnimeCorner({ pool }: { pool: AnimeSummary[] }) {
  const t = useT();

  // Only titles with a poster and a score can carry any of the three.
  const usable = useMemo(() => {
    const seen = new Set<number>();
    return pool.filter((a) => {
      if (seen.has(a.id) || !a.imageUrl || a.score == null) return false;
      seen.add(a.id);
      return true;
    });
  }, [pool]);

  if (usable.length < 4) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-2.5 font-display text-lg tracking-tight sm:text-xl">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--accent-line-soft)] bg-[var(--accent-surface-strong)] text-[var(--accent-ink)]"
          >
            <SparklesIcon className="size-4" />
          </span>
          {t("home.corner.title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("home.corner.subtitle")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <PickOfTheDay pool={usable} />
        <GuessGame />
        <FactsCard />
      </div>
    </section>
  );
}

const CARD =
  "relative flex min-h-[21rem] flex-col overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 backdrop-blur-sm sm:p-5";

function CardHeading({
  icon: Icon,
  children,
  aside,
}: {
  icon: typeof StarIcon;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="relative flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent-ink)]">
        <Icon className="size-4" />
        {children}
      </span>
      {aside}
    </div>
  );
}

/**
 * One title for today. Chosen by the date, so it is the same for every
 * visitor until midnight and different tomorrow — a small shared thing,
 * rather than a random one each reload that nobody else ever sees.
 */
function PickOfTheDay({ pool }: { pool: AnimeSummary[] }) {
  const t = useT();
  const labels = useLabels();
  // The better half of the pool: "anime of the day" should be worth it.
  const ranked = [...pool].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = ranked.slice(0, Math.max(4, Math.ceil(ranked.length / 2)));
  const anime = top[dayNumber() % top.length]!;
  const title = labels.title(anime);

  return (
    <article className={cn(CARD, "group")}>
      <img
        aria-hidden
        src={imageSrc(anime.imageLargeUrl ?? anime.imageUrl)}
        alt=""
        loading="lazy"
        className="absolute inset-0 size-full scale-110 object-cover opacity-25 blur-xl transition-transform duration-1000 group-hover:scale-125"
      />
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-card/40"
      />

      <CardHeading
        icon={CalendarDaysIcon}
        aside={
          <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] tabular-nums text-primary backdrop-blur-sm">
            {new Date().toLocaleDateString(labels.locale, { day: "numeric", month: "long" })}
          </span>
        }
      >
        {t("home.corner.pick")}
      </CardHeading>

      <div className="relative mt-4 flex flex-1 gap-4">
        <Link
          to={animeHref(anime)}
          viewTransition
          className="h-44 w-[7.5rem] shrink-0 overflow-hidden rounded-xl border border-border/60 shadow-xl shadow-black/30 transition-transform duration-500 group-hover:-rotate-2 group-hover:scale-[1.03]"
        >
          <img
            src={imageSrc(anime.imageLargeUrl ?? anime.imageUrl)}
            alt={title}
            loading="lazy"
            className="size-full object-cover"
          />
        </Link>
        <div className="flex min-w-0 flex-col">
          <Link
            to={animeHref(anime)}
            viewTransition
            className="line-clamp-3 font-display text-base leading-tight transition-colors hover:text-primary"
          >
            {title}
          </Link>
          <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold">
            <StarIcon className="size-4 fill-amber-400 text-amber-400" />
            {anime.score?.toFixed(1)}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">
            {[labels.typeLabel(anime.type), labels.seasonYearLabel(anime)].filter(Boolean).join(" · ")}
          </span>
          <div className="mt-2 flex flex-wrap gap-1">
            {anime.genres.slice(0, 3).map((g) => (
              <span
                key={g}
                className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
              >
                {labels.genreLabel(g)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {anime.synopsis && (
        <p className="relative mt-3 line-clamp-3 text-xs leading-relaxed text-foreground/75">
          {anime.synopsis}
        </p>
      )}

      <Link
        to={`${animeHref(anime)}#watch`}
        viewTransition
        className="btn-sheen relative mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-all duration-200 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98]"
      >
        {t("home.heroWatch")}
        <ArrowRightIcon className="size-4" />
      </Link>
    </article>
  );
}

interface GuessRound {
  frame: string;
  answerId: number;
  options: Array<{
    id: number;
    slug: string;
    title: string;
    titleLocalized: string | null;
    imageUrl: string | null;
  }>;
}

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

/**
 * Guess the show from a frame of it.
 *
 * A still from the show itself rather than its poster: the poster has the
 * title's own art direction and often its name on it, a frame is the
 * actual question. Rounds come from the server, which only deals titles
 * with stored frames and enough ratings that people have plausibly seen
 * them. The frame starts blurred and sharpens once you answer; a streak
 * counts how many in a row, and the keys 1–4 answer too.
 */
function GuessGame() {
  const t = useT();
  const { locale } = useLocale();
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["anime", "guess", round],
    queryFn: ({ signal }) => apiRequest<GuessRound>("/anime/guess", { signal }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });

  const revealed = picked != null;
  const correct = data != null && picked === data.answerId;
  const answer = data?.options.find((o) => o.id === data.answerId);
  const name = (o: GuessRound["options"][number]) =>
    locale === "ru" ? (o.titleLocalized ?? o.title) : o.title;

  const choose = (id: number) => {
    if (revealed || !data) return;
    setPicked(id);
    if (id === data.answerId) {
      setStreak((s) => {
        const next = s + 1;
        setBest((b) => Math.max(b, next));
        return next;
      });
    } else {
      setStreak(0);
    }
  };

  const next = () => {
    setPicked(null);
    setLoaded(false);
    setRound((r) => r + 1);
  };

  // 1–4 pick an answer, Enter moves on — the game is quicker by keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (!data) return;
      const n = Number(e.key);
      if (!revealed && n >= 1 && n <= data.options.length) choose(data.options[n - 1]!.id);
      if (revealed && e.key === "Enter") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <article className={CARD}>
      <CardHeading
        icon={CircleHelpIcon}
        aside={
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                key={streak}
                className={cn(
                  "inline-flex cursor-default items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  streak > 0
                    ? "morph-pop border-amber-400/50 bg-amber-400/15 text-amber-500"
                    : "border-primary/30 bg-primary/10 text-primary",
                )}
              >
                <TrophyIcon className="size-3" />
                {streak}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">{t("home.corner.streak", { best })}</TooltipContent>
          </Tooltip>
        }
      >
        {t("home.corner.guess")}
      </CardHeading>

      {/* The frame: blurred and desaturated until answered, then it
          sharpens into colour. Ringed in the result's colour afterwards. */}
      <div
        className={cn(
          "relative mt-4 aspect-video w-full overflow-hidden rounded-xl border-2 bg-muted transition-colors duration-500",
          !revealed
            ? "border-primary/30"
            : correct
              ? "border-emerald-500/70 shadow-lg shadow-emerald-500/20"
              : "border-rose-500/70 shadow-lg shadow-rose-500/20",
        )}
      >
        {data && (
          <img
            key={data.frame}
            src={imageSrc(data.frame)}
            alt=""
            onLoad={() => setLoaded(true)}
            className={cn(
              "size-full object-cover transition-all duration-700 ease-out",
              revealed ? "scale-100 blur-0 saturate-100" : "scale-110 blur-[6px] saturate-50",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        )}
        {(isPending || !loaded) && !isError && (
          <span className="absolute inset-0 animate-pulse bg-gradient-to-br from-primary/20 via-primary/5 to-transparent" />
        )}
        {!revealed && data && loaded && (
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-11 place-items-center rounded-full border border-primary/50 bg-primary/25 text-primary-foreground shadow-lg shadow-primary/30 backdrop-blur-sm">
              <EyeIcon className="size-5" />
            </span>
          </span>
        )}
        {revealed && answer && (
          <span className="absolute inset-x-0 bottom-0 animate-in bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-6 text-xs font-semibold text-white fade-in-0 slide-in-from-bottom-2 duration-500">
            {name(answer)}
          </span>
        )}
        {isError && (
          <button
            type="button"
            onClick={() => void refetch()}
            className="absolute inset-0 grid place-items-center text-xs text-muted-foreground"
          >
            <RotateCcwIcon className="size-5" />
          </button>
        )}
      </div>

      <div className="relative mt-3 grid grid-cols-2 gap-1.5">
        {(data?.options ?? []).map((option, i) => {
          const isAnswer = option.id === data?.answerId;
          const isPicked = option.id === picked;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => choose(option.id)}
              disabled={revealed}
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
              className={cn(
                "group/opt btn-sheen flex min-h-11 animate-in items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs font-medium fade-in-0 slide-in-from-bottom-1 duration-300 transition-all",
                !revealed &&
                  "border-primary/30 bg-primary/10 text-foreground hover:-translate-y-0.5 hover:border-primary hover:bg-primary/20 hover:shadow-md hover:shadow-primary/20 active:scale-[0.97]",
                revealed && isAnswer &&
                  "border-emerald-500/70 bg-emerald-500/15 text-emerald-600 shadow-md shadow-emerald-500/20 dark:text-emerald-400",
                revealed && isPicked && !isAnswer && "border-rose-500/70 bg-rose-500/15 text-rose-500",
                revealed && !isAnswer && !isPicked && "border-primary/15 bg-primary/5 opacity-50",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-md font-display text-[11px] transition-colors",
                  !revealed && "bg-primary/20 text-primary group-hover/opt:bg-primary group-hover/opt:text-primary-foreground",
                  revealed && isAnswer && "bg-emerald-500 text-white",
                  revealed && isPicked && !isAnswer && "bg-rose-500 text-white",
                  revealed && !isAnswer && !isPicked && "bg-primary/10 text-primary/60",
                )}
              >
                {revealed && (isAnswer || isPicked) ? (
                  <MorphIcon on={isAnswer} off={XIcon} onIcon={CheckIcon} className="size-3.5" />
                ) : (
                  OPTION_KEYS[i]
                )}
              </span>
              <span className="line-clamp-2 min-w-0 flex-1 leading-snug">{name(option)}</span>
            </button>
          );
        })}
        {isPending &&
          Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="min-h-11 animate-pulse rounded-lg border border-primary/20 bg-primary/10" />
          ))}
      </div>

      <div className="relative mt-auto flex items-center justify-between gap-2 pt-3">
        <p
          className={cn(
            "text-xs font-medium transition-colors",
            !revealed ? "text-muted-foreground" : correct ? "text-emerald-500" : "text-rose-500",
          )}
        >
          {!revealed
            ? t("home.corner.guessHint")
            : correct
              ? t("home.corner.guessRight")
              : t("home.corner.guessWrong")}
        </p>
        {revealed && answer && (
          <div className="flex shrink-0 animate-in items-center gap-1.5 fade-in-0 slide-in-from-right-2 duration-300">
            <Link
              to={`/anime/${answer.slug}`}
              viewTransition
              className="rounded-lg border border-primary/35 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary/20"
            >
              {t("home.corner.open")}
            </Link>
            <button
              type="button"
              onClick={next}
              className="btn-sheen group/next inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-transform active:scale-95"
            >
              <RotateCcwIcon className="size-3.5 transition-transform duration-500 group-hover/next:-rotate-180" />
              {t("home.corner.again")}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Things worth knowing about anime. Every one of these is a documented,
 * checkable fact — no rumours, no "fun facts" that fall apart on a search.
 * Opens on a different one each day and can be flipped through; it turns
 * on its own every few seconds until someone takes the wheel.
 */
function FactsCard() {
  const t = useT();
  const facts = FACT_KEYS;
  const [index, setIndex] = useState(() => dayNumber() % facts.length);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (manual) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % facts.length), 9000);
    return () => clearInterval(timer);
  }, [manual, facts.length]);

  const go = (direction: 1 | -1) => {
    setManual(true);
    setIndex((i) => (i + direction + facts.length) % facts.length);
  };

  const key = facts[index]!;

  return (
    <article className={CARD}>
      <CardHeading
        icon={LightbulbIcon}
        aside={
          <span className="font-display text-[10px] tabular-nums text-muted-foreground">
            {String(index + 1).padStart(2, "0")} / {String(facts.length).padStart(2, "0")}
          </span>
        }
      >
        {t("home.corner.facts")}
      </CardHeading>

      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 bottom-10 font-display text-[9rem] leading-none text-foreground/[0.04]"
      >
        ?
      </span>

      <div key={key} className="relative mt-5 flex flex-1 animate-in flex-col fade-in-0 slide-in-from-right-3 duration-500">
        <p className="font-display text-lg leading-snug text-foreground">
          {t(`home.facts.${key}.title` as "home.facts.sazae.title")}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t(`home.facts.${key}.body` as "home.facts.sazae.body")}
        </p>
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {facts.map((f, i) => (
            <span
              key={f}
              aria-hidden
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                i === index ? "w-5 bg-primary" : "w-1.5 bg-foreground/15",
              )}
            />
          ))}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label={t("common.previous")}
            className="btn-sheen grid size-8 place-items-center rounded-lg border border-primary/35 bg-primary/10 text-primary transition-all duration-200 hover:bg-primary hover:text-primary-foreground hover:shadow-md hover:shadow-primary/30 active:scale-90"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label={t("common.next")}
            className="btn-sheen grid size-8 place-items-center rounded-lg border border-primary/35 bg-primary/10 text-primary transition-all duration-200 hover:bg-primary hover:text-primary-foreground hover:shadow-md hover:shadow-primary/30 active:scale-90"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

const FACT_KEYS = [
  "sazae",
  "astro",
  "spirited",
  "onepiece",
  "word",
  "ghibli",
  "pokemon",
  "akira",
] as const;
