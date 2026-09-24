import type { AnimeSummary } from "@animeshadow/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  BookmarkIcon,
  CakeIcon,
  CalendarDaysIcon,
  CheckIcon,
  CircleHelpIcon,
  CrownIcon,
  EyeIcon,
  FlameIcon,
  HeartIcon,
  LightbulbIcon,
  type LucideIcon,
  MedalIcon,
  MessageSquareIcon,
  PlayIcon,
  RadioIcon,
  RotateCcwIcon,
  ShuffleIcon,
  SparklesIcon,
  StarIcon,
  TrophyIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useLocale, useT } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------------ */
/* Shared pieces                                                             */
/* ------------------------------------------------------------------------ */

/** The section surface every panel on the site wears. */
const PANEL =
  "relative flex flex-col overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 backdrop-blur-sm sm:p-5";

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
  aside,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-2.5 font-display text-lg tracking-tight sm:text-xl">
          <span
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--accent-line-soft)] bg-[var(--accent-surface-strong)] text-[var(--accent-ink)]"
          >
            <Icon className="size-4" />
          </span>
          {title}
        </h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {aside}
    </div>
  );
}

function PanelLabel({
  icon: Icon,
  children,
  aside,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="relative flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent-ink)]">
        <span className="grid size-6 place-items-center rounded-md bg-primary/15">
          <Icon className="size-3.5" />
        </span>
        {children}
      </span>
      {aside}
    </div>
  );
}

function compact(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/* ------------------------------------------------------------------------ */
/* The corner                                                                */
/* ------------------------------------------------------------------------ */

/**
 * The part of the front page that isn't a shelf.
 *
 * Two halves side by side — the title of the day with everything that says
 * why it is, and the frame-guessing game with its leaderboard under it —
 * and the facts as their own strip below, rather than a third card
 * squeezed in beside two that have far more going on.
 */
export function AnimeCorner() {
  const t = useT();
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <SectionHeading
          icon={SparklesIcon}
          title={t("home.corner.title")}
          subtitle={t("home.corner.subtitle")}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <AnimeOfTheDay />
          <div className="grid gap-4">
            <GuessGame />
            <Leaderboard />
          </div>
        </div>
      </section>
      <FactsStrip />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Anime of the day                                                          */
/* ------------------------------------------------------------------------ */

interface DayPick {
  anime: AnimeSummary;
  stats: {
    score: number | null;
    scoredBy: number | null;
    members: number | null;
    rank: number | null;
    topPercent: number | null;
    views: number;
    inLists: number;
    watching: number;
    completed: number;
    siteScore: number | null;
    siteVotes: number;
    comments: number;
  };
  reasons: Array<{ code: string; value?: number }>;
}

const REASON_ICON: Record<string, LucideIcon> = {
  anniversary: CakeIcon,
  topRated: TrophyIcon,
  beloved: HeartIcon,
  airing: RadioIcon,
  ourUsers: UsersIcon,
  pick: SparklesIcon,
};

/**
 * One title for today, with the reasons it was chosen and what we know
 * about it: its score and how that compares with the rest of the
 * catalogue, how many people rated it, and how it is doing on this site —
 * views, lists, watching now, our own users' average. A figure nobody has
 * produced yet (a zero on a quiet day) is left out rather than shown as a
 * sad zero.
 */
function AnimeOfTheDay() {
  const t = useT();
  const labels = useLabels();
  const { locale } = useLocale();
  const { data, isPending } = useQuery({
    queryKey: ["games", "anime-of-the-day"],
    queryFn: ({ signal }) => apiRequest<DayPick>("/games/anime-of-the-day", { signal }),
    staleTime: 60 * 60_000,
  });

  if (isPending || !data) {
    return <div className={cn(PANEL, "min-h-[30rem] animate-pulse")} />;
  }

  const { anime, stats, reasons } = data;
  const title = labels.title(anime);
  const art = imageSrc(anime.imageLargeUrl ?? anime.imageUrl);

  const figures = (
    [
      stats.score != null && { icon: StarIcon, value: stats.score.toFixed(2), label: t("home.day.score"), star: true },
      stats.scoredBy != null && stats.scoredBy > 0 && { icon: UsersIcon, value: compact(stats.scoredBy, locale), label: t("home.day.votes") },
      stats.members != null && stats.members > 0 && { icon: BookmarkIcon, value: compact(stats.members, locale), label: t("home.day.members") },
      stats.views > 0 && { icon: EyeIcon, value: compact(stats.views, locale), label: t("home.day.views") },
      stats.inLists > 0 && { icon: BookmarkIcon, value: String(stats.inLists), label: t("home.day.inLists") },
      stats.watching > 0 && { icon: PlayIcon, value: String(stats.watching), label: t("home.day.watching") },
      stats.siteScore != null && { icon: HeartIcon, value: stats.siteScore.toFixed(1), label: t("home.day.siteScore", { n: stats.siteVotes }) },
      stats.comments > 0 && { icon: MessageSquareIcon, value: String(stats.comments), label: t("home.day.comments") },
    ].filter(Boolean) as Array<{ icon: LucideIcon; value: string; label: string; star?: boolean }>
  ).slice(0, 6);

  return (
    <article className={cn(PANEL, "group gap-4 p-0 sm:p-0")}>
      {/* The key art as a wash across the top, the card rising out of it. */}
      <div className="relative h-36 overflow-hidden">
        {art && (
          <img
            aria-hidden
            src={art}
            alt=""
            className="home-kenburns absolute inset-0 size-full scale-110 object-cover opacity-50 blur-sm"
          />
        )}
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-primary/25 via-transparent to-[var(--card)]"
        />
        <div className="absolute inset-x-4 top-4 sm:inset-x-5">
          <PanelLabel
            icon={CalendarDaysIcon}
            aside={
              <span className="rounded-md border border-primary/30 bg-background/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-primary backdrop-blur-sm">
                {new Date().toLocaleDateString(locale, { day: "numeric", month: "long" })}
              </span>
            }
          >
            {t("home.corner.pick")}
          </PanelLabel>
        </div>
      </div>

      <div className="relative -mt-24 flex gap-4 px-4 sm:px-5">
        <Link
          to={animeHref(anime)}
          viewTransition
          className="h-48 w-32 shrink-0 overflow-hidden rounded-xl border-2 border-primary/40 shadow-2xl shadow-primary/20 transition-transform duration-500 group-hover:-rotate-2 group-hover:scale-[1.03]"
        >
          {art && <img src={art} alt={title} className="size-full object-cover" />}
        </Link>
        <div className="flex min-w-0 flex-col justify-end pt-16">
          <Link
            to={animeHref(anime)}
            viewTransition
            className="line-clamp-3 font-display text-lg leading-tight transition-colors hover:text-primary sm:text-xl"
          >
            {title}
          </Link>
          <span className="mt-1 text-xs text-muted-foreground">
            {[labels.typeLabel(anime.type), labels.seasonYearLabel(anime), labels.episodeLabel(anime.episodes, anime.type)]
              .filter(Boolean)
              .join(" · ")}
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

      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-5">
        {/* Why this one. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("home.day.why")}
          </span>
          <ul className="reveal-group flex flex-col gap-1.5">
            {reasons.map((reason, i) => {
              const Icon = REASON_ICON[reason.code] ?? SparklesIcon;
              return (
                <li
                  key={reason.code}
                  style={{ "--i": i } as CSSProperties}
                  className="reveal flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1.5 text-xs font-medium"
                >
                  <Icon className="size-4 shrink-0 text-primary" />
                  {t(`home.day.reason.${reason.code}` as "home.day.reason.pick", {
                    n: reason.value != null ? compact(reason.value, locale) : "",
                  })}
                </li>
              );
            })}
          </ul>
        </div>

        {/* The figures. */}
        {figures.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {figures.map(({ icon: Icon, value, label, star }) => (
              <div
                key={label}
                className="flex flex-col gap-0.5 rounded-xl border border-[var(--accent-line-soft)] bg-card/60 p-2.5"
              >
                <span className="flex items-center gap-1 font-display text-base tabular-nums leading-none">
                  <Icon className={cn("size-3.5", star ? "fill-amber-400 text-amber-400" : "text-primary")} />
                  {value}
                </span>
                <span className="truncate text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Score against the whole catalogue, as a bar. */}
        {stats.score != null && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t("home.day.scoreBar")}</span>
              {stats.topPercent != null && (
                <span className="font-medium text-primary">
                  {t("home.day.topPercent", { n: stats.topPercent })}
                </span>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-primary/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-[width] duration-1000 ease-out"
                style={{ width: `${Math.min(100, stats.score * 10)}%` }}
              />
            </div>
          </div>
        )}

        {anime.synopsis && (
          <p className="line-clamp-3 text-xs leading-relaxed text-foreground/75">{anime.synopsis}</p>
        )}

        <div className="mt-auto flex gap-2">
          <Link
            to={`${animeHref(anime)}#watch`}
            viewTransition
            className="btn-sheen inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-[0.98]"
          >
            <PlayIcon className="size-4 fill-current" />
            {t("home.heroWatch")}
          </Link>
          <Link
            to={animeHref(anime)}
            viewTransition
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
          >
            {t("home.corner.open")}
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------------ */
/* Guess the anime                                                           */
/* ------------------------------------------------------------------------ */

interface GuessRound {
  roundId: string;
  frame: string;
  options: Array<{
    id: number;
    slug: string;
    title: string;
    titleLocalized: string | null;
    imageUrl: string | null;
  }>;
}

interface GuessResult {
  correct: boolean;
  answerId: number;
  streak: number | null;
  best: number | null;
}

const OPTION_KEYS = ["1", "2", "3", "4"] as const;
/** How long a right answer stays on screen before the next frame. */
const NEXT_AFTER_MS = 900;

const fetchRound = () => apiRequest<GuessRound>("/games/guess/round");

/** Starts downloading an image before it is needed. */
function preload(url: string | undefined) {
  if (!url) return;
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}

/**
 * Guess the show from a frame of it, as a run: a right answer rolls
 * straight into the next frame, and the run lasts until the first miss.
 *
 * Built to feel instant. The next round is always fetched — and its frame
 * downloaded — while the current one is being looked at, so a right answer
 * swaps pictures without a wait. Answers are checked on the server; for a
 * signed-in player that is also where the run is counted, which is what
 * the leaderboard reads. Keys 1–4 answer, Enter starts over.
 */
function GuessGame() {
  const t = useT();
  const { locale } = useLocale();
  const { status } = useAuth();
  const authed = status === "authenticated";
  const queryClient = useQueryClient();

  const [round, setRound] = useState<GuessRound | null>(null);
  const nextRef = useRef<Promise<GuessRound> | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<GuessResult | null>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [over, setOver] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The next round is fetched only once the current one has been answered:
  // for a signed-in player the server treats asking for a new round while
  // one is open as giving that one up, so fetching ahead of the answer
  // would end the run it was meant to speed up.
  const queueNext = useCallback(() => {
    const promise = fetchRound();
    promise.then((r) => preload(imageSrc(r.frame))).catch(() => undefined);
    nextRef.current = promise;
  }, []);

  const showNext = useCallback(async () => {
    setError(false);
    const source = nextRef.current;
    nextRef.current = null;
    try {
      const r = await (source ?? fetchRound());
      setRound(r);
      setPicked(null);
      setResult(null);
      setLoaded(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void showNext();
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [showNext]);

  const choose = async (optionId: number) => {
    if (!round || picked != null || over) return;
    setPicked(optionId);
    try {
      const res = await apiRequest<GuessResult>("/games/guess/answer", {
        method: "POST",
        body: { roundId: round.roundId, optionId },
      });
      setResult(res);
      queueNext();
      if (res.correct) {
        const value = res.streak ?? streak + 1;
        setStreak(value);
        setBest((b) => Math.max(b, res.best ?? value));
        advanceTimer.current = setTimeout(() => void showNext(), NEXT_AFTER_MS);
      } else {
        setOver(true);
        if (res.best != null) setBest(res.best);
        void queryClient.invalidateQueries({ queryKey: ["games", "leaderboard"] });
      }
    } catch {
      setError(true);
      setPicked(null);
    }
  };

  const restart = () => {
    setOver(false);
    setStreak(0);
    void showNext();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (over && e.key === "Enter") return restart();
      const n = Number(e.key);
      if (round && n >= 1 && n <= round.options.length) void choose(round.options[n - 1]!.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const name = (o: GuessRound["options"][number]) =>
    locale === "ru" ? (o.titleLocalized ?? o.title) : o.title;
  const revealed = result != null;
  const answer = round?.options.find((o) => o.id === result?.answerId);

  return (
    <article className={cn(PANEL, "gap-3")}>
      <PanelLabel
        icon={CircleHelpIcon}
        aside={
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  key={streak}
                  className={cn(
                    "inline-flex cursor-default items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold tabular-nums",
                    streak > 0
                      ? "morph-pop border-amber-400/50 bg-amber-400/15 text-amber-500"
                      : "border-primary/30 bg-primary/10 text-primary",
                  )}
                >
                  <FlameIcon className="size-3.5" />
                  {streak}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("home.game.streakNow")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-default items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary">
                  <TrophyIcon className="size-3.5" />
                  {best}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("home.game.bestNow")}</TooltipContent>
            </Tooltip>
          </div>
        }
      >
        {t("home.corner.guess")}
      </PanelLabel>

      <div
        className={cn(
          "relative aspect-video w-full overflow-hidden rounded-xl border-2 bg-muted transition-all duration-300",
          !revealed
            ? "border-primary/30"
            : result.correct
              ? "border-emerald-500/70 shadow-lg shadow-emerald-500/25"
              : "border-rose-500/70 shadow-lg shadow-rose-500/25",
        )}
      >
        {round && (
          <img
            key={round.frame}
            src={imageSrc(round.frame)}
            alt=""
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            className={cn(
              "size-full object-cover transition-all duration-500 ease-out",
              revealed ? "scale-100 blur-0" : "scale-105 blur-[3px]",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        )}
        {(!round || !loaded) && !error && (
          <span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-primary/20 via-primary/5 to-transparent">
            <span className="size-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </span>
        )}
        {revealed && answer && (
          <span className="absolute inset-x-0 bottom-0 animate-in bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8 text-sm font-semibold text-white fade-in-0 slide-in-from-bottom-2 duration-300">
            {name(answer)}
          </span>
        )}
        {over && (
          <div className="absolute inset-0 grid animate-in place-items-center bg-black/60 backdrop-blur-sm fade-in-0 duration-300">
            <div className="flex flex-col items-center gap-2 px-4 text-center text-white">
              <TrophyIcon className="size-8 text-amber-400" />
              <p className="font-display text-lg">{t("home.game.over", { n: streak })}</p>
              {!authed && <p className="text-xs text-white/70">{t("home.game.signInForBoard")}</p>}
              <button
                type="button"
                onClick={restart}
                className="btn-sheen group/again mt-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/40 transition-transform active:scale-95"
              >
                <RotateCcwIcon className="size-4 transition-transform duration-500 group-hover/again:-rotate-180" />
                {t("home.game.again")}
              </button>
            </div>
          </div>
        )}
        {error && (
          <button
            type="button"
            onClick={() => void showNext()}
            className="absolute inset-0 grid place-items-center text-sm text-muted-foreground"
          >
            <RotateCcwIcon className="size-6" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {(round?.options ?? []).map((option, i) => {
          const isAnswer = revealed && option.id === result.answerId;
          const isPicked = option.id === picked;
          const wrong = revealed && isPicked && !isAnswer;
          return (
            <button
              key={`${round?.roundId}-${option.id}`}
              type="button"
              onClick={() => void choose(option.id)}
              disabled={picked != null || over}
              style={{ animationDelay: `${i * 50}ms`, animationFillMode: "both" }}
              className={cn(
                "group/opt btn-sheen flex min-h-11 animate-in items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs font-medium transition-all duration-200 fade-in-0 slide-in-from-bottom-1",
                !revealed && picked == null &&
                  "border-primary/30 bg-primary/10 hover:-translate-y-0.5 hover:border-primary hover:bg-primary/20 hover:shadow-md hover:shadow-primary/20 active:scale-[0.97]",
                !revealed && isPicked && "border-primary bg-primary/25",
                !revealed && picked != null && !isPicked && "border-primary/15 bg-primary/5 opacity-60",
                isAnswer && "border-emerald-500/70 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                wrong && "border-rose-500/70 bg-rose-500/15 text-rose-500",
                revealed && !isAnswer && !isPicked && "border-primary/15 bg-primary/5 opacity-50",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-md font-display text-[11px] transition-colors",
                  isAnswer
                    ? "bg-emerald-500 text-white"
                    : wrong
                      ? "bg-rose-500 text-white"
                      : "bg-primary/20 text-primary group-hover/opt:bg-primary group-hover/opt:text-primary-foreground",
                )}
              >
                {isAnswer || wrong ? (
                  <MorphIcon on={isAnswer} off={XIcon} onIcon={CheckIcon} className="size-3.5" />
                ) : (
                  OPTION_KEYS[i]
                )}
              </span>
              <span className="line-clamp-2 min-w-0 flex-1 leading-snug">{name(option)}</span>
            </button>
          );
        })}
        {!round &&
          Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="min-h-11 animate-pulse rounded-lg border border-primary/20 bg-primary/10" />
          ))}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">{t("home.game.keys")}</p>
    </article>
  );
}

/* ------------------------------------------------------------------------ */
/* Leaderboard                                                               */
/* ------------------------------------------------------------------------ */

interface Board {
  top: Array<{
    rank: number;
    best: number;
    userId: string;
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
  }>;
  me: { best: number; current: number; played: number; rank: number | null } | null;
}

const PLACE_STYLE = [
  "bg-amber-400 text-amber-950 shadow-md shadow-amber-400/40",
  "bg-slate-300 text-slate-900 shadow-md shadow-slate-300/40",
  "bg-orange-400 text-orange-950 shadow-md shadow-orange-400/40",
];

/**
 * The best runs, signed-in players only — an anonymous run has no name to
 * put against it and no server-side record to trust. The viewer's own
 * place is shown under the list when they aren't in the top ten.
 */
function Leaderboard() {
  const t = useT();
  const { status, user } = useAuth();
  const { data, isPending } = useQuery({
    queryKey: ["games", "leaderboard"],
    queryFn: ({ signal }) => apiRequest<Board>("/games/guess/leaderboard", { signal }),
    staleTime: 30_000,
  });

  const mine = data?.top.some((row) => row.userId === user?.id) ?? false;

  return (
    <article className={cn(PANEL, "gap-3")}>
      <PanelLabel icon={CrownIcon}>{t("home.game.board")}</PanelLabel>

      {isPending ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="h-9 animate-pulse rounded-lg bg-primary/10" />
          ))}
        </div>
      ) : !data || data.top.length === 0 ? (
        <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 text-center text-xs text-muted-foreground">
          {t("home.game.boardEmpty")}
        </p>
      ) : (
        <ol className="reveal-group flex flex-col gap-1">
          {data.top.map((row, i) => {
            const me = row.userId === user?.id;
            const content = (
              <>
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-md font-display text-[11px]",
                    PLACE_STYLE[i] ?? "bg-primary/15 text-primary",
                  )}
                >
                  {i < 3 ? <MedalIcon className="size-3.5" /> : row.rank}
                </span>
                <Avatar className="size-7">
                  {row.avatarUrl && <AvatarImage src={imageSrc(row.avatarUrl)} alt="" />}
                  <AvatarFallback className="text-[10px] font-semibold">
                    {row.displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{row.displayName}</span>
                <span className="inline-flex items-center gap-1 font-display text-sm tabular-nums text-primary">
                  <FlameIcon className="size-3.5" />
                  {row.best}
                </span>
              </>
            );
            const rowClass = cn(
              "flex items-center gap-2 rounded-lg border px-2 py-1 transition-colors",
              me ? "border-primary bg-primary/15" : "border-transparent hover:border-primary/40 hover:bg-primary/10",
            );
            return (
              <li key={row.userId} style={{ "--i": i } as CSSProperties} className="reveal">
                {row.username ? (
                  <Link to={`/profile/${row.username}`} viewTransition className={rowClass}>
                    {content}
                  </Link>
                ) : (
                  <div className={rowClass}>{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {status === "authenticated" && data?.me && !mine && data.me.best > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs">
          <span className="font-medium">{t("home.game.myPlace", { n: data.me.rank ?? "—" })}</span>
          <span className="inline-flex items-center gap-1 font-display tabular-nums text-primary">
            <FlameIcon className="size-3.5" />
            {data.me.best}
          </span>
        </div>
      )}
      {status !== "authenticated" && (
        <Link
          to="/login"
          className="rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-center text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          {t("home.game.signInForBoard")}
        </Link>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------------ */
/* Facts                                                                     */
/* ------------------------------------------------------------------------ */

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

/** Days since the epoch in the viewer's own calendar. */
function dayNumber(): number {
  const now = new Date();
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000);
}

/**
 * Things worth knowing about anime, as their own strip: four at a time,
 * a different four each day, and a shuffle for the rest. Every one is a
 * documented, checkable fact.
 */
function FactsStrip() {
  const t = useT();
  const [offset, setOffset] = useState(() => (dayNumber() * 4) % FACT_KEYS.length);
  const [spin, setSpin] = useState(0);
  const shown = useMemo(
    () => Array.from({ length: 4 }, (_, i) => FACT_KEYS[(offset + i) % FACT_KEYS.length]!),
    [offset],
  );

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading
        icon={LightbulbIcon}
        title={t("home.corner.facts")}
        aside={
          <button
            type="button"
            onClick={() => {
              setOffset((o) => (o + 4) % FACT_KEYS.length);
              setSpin((s) => s + 1);
            }}
            className="btn-sheen inline-flex items-center gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary hover:text-primary-foreground active:scale-95"
          >
            <ShuffleIcon
              className="size-3.5 transition-transform duration-500"
              style={{ transform: `rotate(${spin * 180}deg)` }}
            />
            {t("home.facts.more")}
          </button>
        }
      />
      <div className="reveal-group grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((key, i) => (
          <article
            key={`${key}-${offset}`}
            style={{ "--i": i } as CSSProperties}
            className={cn(
              PANEL,
              "reveal group min-h-44 gap-2 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10",
            )}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-3 -top-6 font-display text-8xl leading-none text-primary/10 transition-transform duration-500 group-hover:rotate-12 group-hover:scale-110"
            >
              ?
            </span>
            <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <LightbulbIcon className="size-4" />
            </span>
            <p className="relative font-display text-sm leading-snug">
              {t(`home.facts.${key}.title` as "home.facts.sazae.title")}
            </p>
            <p className="relative text-xs leading-relaxed text-muted-foreground">
              {t(`home.facts.${key}.body` as "home.facts.sazae.body")}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
