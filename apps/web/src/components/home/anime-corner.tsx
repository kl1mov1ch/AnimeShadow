import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  CrownIcon,
  FlameIcon,
  LockIcon,
  type LucideIcon,
  MedalIcon,
  RotateCcwIcon,
  ShuffleIcon,
  TrophyIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LogoWatermark } from "@/components/brand/logo-watermark";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useLocale, useT } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { animeHref, imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------------ */
/* Shared pieces                                                             */
/* ------------------------------------------------------------------------ */

/** The section surface every panel on the site wears. */
const PANEL =
  "relative flex flex-col overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 sm:p-5";

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
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <GameGate />
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

/** Signed in: the game. Signed out: why to sign in — the game itself only
 *  runs for accounts, so a guest costs no rounds and no frames. */
function GameGate() {
  const t = useT();
  const { status } = useAuth();
  if (status === "loading") {
    return <article className={cn(PANEL, "aspect-video animate-pulse p-3")} />;
  }
  if (status !== "authenticated") {
    return (
      <article className={cn(PANEL, "items-center justify-center gap-3 p-6 text-center sm:p-8")}>
        <span className="grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary shadow-lg">
          <LockIcon className="size-6" />
        </span>
        <p className="font-display text-lg">{t("home.game.lockedTitle")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t("home.game.lockedBody")}</p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Link
            to="/login"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg active:scale-95"
          >
            {t("common.signIn")}
          </Link>
          <Link
            to="/register"
            className="inline-flex h-10 items-center rounded-lg border border-primary/35 bg-primary/10 px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            {t("common.createAccount")}
          </Link>
        </div>
      </article>
    );
  }
  return <GuessGame />;
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

  // The frame failed to load — ask for another in its place. The server
  // allows a few of these an hour without ending the run.
  const replacing = useRef(false);
  const replaceFrame = async () => {
    if (!round || replacing.current || picked != null) return;
    replacing.current = true;
    try {
      const r = await apiRequest<GuessRound>("/games/guess/replace", {
        method: "POST",
        body: { roundId: round.roundId },
      });
      setRound(r);
      setLoaded(false);
    } catch {
      setError(true);
    } finally {
      replacing.current = false;
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
    <article className={cn(PANEL, "gap-3 p-3 sm:p-4")}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-stretch">
      {/* The frame, large; the run and the record sit on it. */}
      <div
        className={cn(
          "relative aspect-video w-full overflow-hidden rounded-xl bg-muted ring-2 transition-[box-shadow] duration-300",
          !revealed ? "ring-white/10" : result.correct ? "ring-emerald-500/70" : "ring-rose-500/70",
        )}
      >
        {round && (
          <img
            key={round.frame}
            src={imageSrc(round.frame)}
            alt=""
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => void replaceFrame()}
            className={cn(
              "size-full object-cover transition-[opacity,filter,transform] duration-500 ease-out",
              revealed ? "scale-100 blur-0" : "scale-105 blur-[3px]",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        )}
        <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-2">
          <span className="rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">Чей это кадр?</span>
          <span className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <span key={streak} className={cn("inline-flex cursor-default items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-bold tabular-nums text-white", streak > 0 && "morph-pop text-amber-300")}>
                  <FlameIcon className="size-3.5" />
                  {streak}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("home.game.streakNow")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-default items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-bold tabular-nums text-white">
                  <TrophyIcon className="size-3.5" />
                  {best}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("home.game.bestNow")}</TooltipContent>
            </Tooltip>
          </span>
        </div>
        {(!round || !loaded) && !error && (
          <span className="absolute inset-0 grid place-items-center">
            <span className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          </span>
        )}
        {revealed && answer && (
          <span className="absolute inset-x-0 bottom-0 animate-in bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-10 text-sm font-semibold text-white fade-in-0 slide-in-from-bottom-2 duration-300">
            {name(answer)}
          </span>
        )}
        {over && (
          <div className="absolute inset-0 grid animate-in place-items-center bg-black/70 fade-in-0 duration-300">
            <div className="flex flex-col items-center gap-2 px-4 text-center text-white">
              <TrophyIcon className="size-8 text-amber-400" />
              <p className="font-display text-lg">{t("home.game.over", { n: streak })}</p>
              <button
                type="button"
                onClick={restart}
                className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95"
              >
                <RotateCcwIcon className="size-4" />
                {t("home.game.again")}
              </button>
            </div>
          </div>
        )}
        {error && (
          <button type="button" onClick={() => void showNext()} className="absolute inset-0 grid place-items-center text-sm text-white/80">
            <RotateCcwIcon className="size-6" />
          </button>
        )}
      </div>

      {/* Four answers: two by two, or a column beside the frame on a computer. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:grid-rows-4">
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
              className={cn(
                "flex min-h-12 items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-[13px] font-medium transition-[background-color,border-color,opacity] duration-200",
                !revealed && picked == null && "border-border/60 bg-card/60 hover:border-foreground/30 hover:bg-card active:scale-[0.98]",
                !revealed && isPicked && "border-primary/60 bg-primary/10",
                !revealed && picked != null && !isPicked && "border-border/40 opacity-60",
                isAnswer && "border-emerald-500/60 bg-emerald-500/10",
                wrong && "border-rose-500/60 bg-rose-500/10",
                revealed && !isAnswer && !isPicked && "border-border/40 opacity-50",
              )}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold",
                  isAnswer ? "bg-emerald-500 text-white" : wrong ? "bg-rose-500 text-white" : "bg-foreground/[0.08] text-muted-foreground",
                )}
              >
                {isAnswer ? <CheckIcon className="size-4" /> : wrong ? <XIcon className="size-4" /> : OPTION_KEYS[i]}
              </span>
              <span className="line-clamp-2 min-w-0 flex-1 leading-snug">{name(option)}</span>
            </button>
          );
        })}
        {!round && Array.from({ length: 4 }, (_, i) => <span key={i} className="min-h-12 animate-pulse rounded-xl bg-foreground/[0.06]" />)}
      </div>
      </div>
      <p className="text-center text-[11px] text-muted-foreground pointer-coarse:hidden">{t("home.game.keys")}</p>
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
    <article className={cn(PANEL, "isolate gap-2 p-3 sm:p-3")}>
      <LogoWatermark className="-bottom-16 -right-12 size-56 -rotate-12" />
      <div className="flex items-center justify-between gap-2">
        <PanelLabel icon={CrownIcon}>{t("home.game.board")}</PanelLabel>
        {data && data.top.length > 0 && (
          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
            {t("home.game.boardCount", { n: data.top.length })}
          </span>
        )}
      </div>

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
        <ol className="-mr-1.5 flex max-h-[22rem] flex-col gap-1 overflow-y-auto pr-1.5 [scrollbar-width:thin]">
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
              <li key={row.userId}>
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

interface ApiFact {
  id: string;
  title: string;
  text: string;
  anime: { id: number; slug: string; title: string; image: string | null } | null;
}

/**
 * "Did you know": four facts at a time, dealt at random from a pool of
 * several thousand the API reads off the catalogue itself (ranks, scores,
 * audiences, studios, seasons, running time). The shuffle deals four new
 * ones; the hand-written eight stand in if the API is unreachable.
 */
function FactsStrip() {
  const t = useT();
  const [deal, setDeal] = useState(0);
  const [offset, setOffset] = useState(() => (dayNumber() * 4) % FACT_KEYS.length);
  const facts = useQuery({
    queryKey: ["fun-facts", deal],
    queryFn: ({ signal }) => apiRequest<{ facts: ApiFact[]; total: number }>("/fun/facts", { signal, query: { count: 4 } }),
    staleTime: Infinity,
    gcTime: 60_000,
    retry: 1,
    placeholderData: (prev) => prev,
  });

  const fallback = useMemo(
    () =>
      Array.from({ length: 4 }, (_, i): ApiFact => {
        const key = FACT_KEYS[(offset + i) % FACT_KEYS.length]!;
        return {
          id: key,
          title: t(`home.facts.${key}.title` as "home.facts.sazae.title"),
          text: t(`home.facts.${key}.body` as "home.facts.sazae.body"),
          anime: null,
        };
      }),
    [offset, t],
  );
  const shown = facts.data?.facts.length ? facts.data.facts : facts.isError ? fallback : null;
  const [at, setAt] = useState(0);
  useEffect(() => setAt(0), [deal]);
  const touch = useRef<number | null>(null);
  const count = shown?.length ?? 0;
  const step = (d: number) => count > 0 && setAt((i) => (i + d + count) % count);
  const fact = shown?.[at];
  const more = () => {
    setDeal((d) => d + 1);
    setOffset((o) => (o + 4) % FACT_KEYS.length);
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading
        title={t("home.corner.facts")}
        subtitle={facts.data ? `${facts.data.total.toLocaleString("ru-RU")} фактов из каталога` : undefined}
      />
      <div
        className={cn(PANEL, "gap-4 sm:flex-row sm:items-center")}
        onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          const x0 = touch.current;
          const x1 = e.changedTouches[0]?.clientX;
          touch.current = null;
          if (x0 != null && x1 != null && Math.abs(x1 - x0) > 40) step(x1 < x0 ? 1 : -1);
        }}
      >
        {!fact ? (
          <div className="h-32 w-full animate-pulse rounded-xl bg-foreground/[0.05]" />
        ) : (
          <>
            {fact.anime?.image ? (
              <Link to={animeHref(fact.anime)} viewTransition className="hidden shrink-0 sm:block">
                <img src={imageSrc(fact.anime.image)} alt="" loading="lazy" className="aspect-[2/3] w-24 rounded-xl object-cover ring-1 ring-white/10" />
              </Link>
            ) : (
              <span className="hidden size-24 shrink-0 place-items-center rounded-xl bg-foreground/[0.05] font-display text-4xl text-muted-foreground/40 sm:grid">影</span>
            )}
            <div key={`${deal}-${at}`} className="flex min-w-0 flex-1 animate-in flex-col gap-1.5 duration-300 fade-in-0">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Факт {at + 1} из {count}
              </span>
              <p className="font-display text-xl leading-tight">{fact.title}</p>
              <p className="text-sm leading-relaxed text-foreground/80">{fact.text}</p>
              {fact.anime && (
                <Link to={animeHref(fact.anime)} viewTransition className="mt-1 w-fit text-xs font-semibold text-primary hover:underline">
                  Открыть «{fact.anime.title}» →
                </Link>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:flex-col">
              <div className="flex gap-1.5">
                <button type="button" onClick={() => step(-1)} aria-label="Предыдущий факт" className="grid size-9 place-items-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
                  ‹
                </button>
                <button type="button" onClick={() => step(1)} aria-label="Следующий факт" className="grid size-9 place-items-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
                  ›
                </button>
              </div>
              <button type="button" onClick={more} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground sm:ml-0">
                <ShuffleIcon className="size-3.5" />
                {t("home.facts.more")}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
