import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  CrownIcon,
  FlameIcon,
  type LucideIcon,
  MedalIcon,
  RotateCcwIcon,
  ShuffleIcon,
  TrophyIcon,
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
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------------ */
/* Shared pieces                                                             */
/* ------------------------------------------------------------------------ */

/** The section surface every panel on the site wears. */
const PANEL =
  "relative flex flex-col overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 backdrop-blur-sm sm:p-5";

function SectionHeading({
  title,
  subtitle,
  aside,
}: {
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg tracking-tight sm:text-xl">{title}</h2>
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

/* ------------------------------------------------------------------------ */
/* The corner                                                                */
/* ------------------------------------------------------------------------ */

/**
 * The part of the front page that isn't a shelf: one small game and its
 * leaderboard, side by side, and a strip of facts below. Kept deliberately
 * compact — it sits between rows of posters and should read as a pause,
 * not as a second page.
 */
export function AnimeCorner() {
  const t = useT();
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <SectionHeading title={t("home.corner.guess")} subtitle={t("home.corner.subtitle")} />
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <GuessGame />
          <Leaderboard />
        </div>
      </section>
      <FactsStrip />
    </div>
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
    <article className={cn(PANEL, "gap-2.5 p-3 sm:p-3")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{t("home.game.keys")}</p>
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
      </div>

      <div className="grid gap-2.5 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:items-stretch">
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

      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-1 md:grid-rows-4">
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
      </div>
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

  const mine = data?.top.slice(0, 5).some((row) => row.userId === user?.id) ?? false;

  return (
    <article className={cn(PANEL, "gap-2 p-3 sm:p-3")}>
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
          {data.top.slice(0, 5).map((row, i) => {
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
              "reveal group min-h-36 gap-2 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10",
            )}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-3 -top-6 font-display text-8xl leading-none text-primary/10 transition-transform duration-500 group-hover:rotate-12 group-hover:scale-110"
            >
              ?
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
