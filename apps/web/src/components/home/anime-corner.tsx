import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  CrownIcon,
  FlameIcon,
  LockIcon,
  Music2Icon,
  PlayIcon,
  PauseIcon,
  type LucideIcon,
  MedalIcon,
  RotateCcwIcon,
  ShuffleIcon,
  TrophyIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FrameGameGoal } from "@/components/games/frame-game-goal";
import { FramePeek } from "@/components/games/frame-peek";
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
export function AnimeCorner({ mode = "guess", compact = false }: { mode?: "guess" | "opening"; compact?: boolean }) {
  const [streak, setStreak] = useState(0);
  return (
    <div className={cn("flex flex-col gap-10", compact && "w-full")}>
      <section className="flex flex-col gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {mode === "opening"
            ? "Послушай 20 секунд опенинга и выбери название аниме."
            : "Рассмотри кадр и выбери одно из четырёх названий."}{" "}
          Верные ответы продлевают серию, ошибка завершает её.
        </p>
        <div className={cn("grid gap-4", compact ? "items-stretch md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_13rem_15rem]" : "items-start xl:grid-cols-[minmax(0,1fr)_19rem]")}>
          <div className={cn("min-w-0 [&>article]:h-full", compact && "md:col-span-2 lg:col-span-1")}><GameGate mode={mode} compact={compact} onStreakChange={setStreak} /></div>
          <Leaderboard mode={mode} compact={compact} />{compact && mode === "guess" && <FrameGameGoal streak={streak} />}
        </div>
      </section>
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

const fetchRound = (mode: "guess" | "opening") =>
  apiRequest<GuessRound>(`/games/${mode}/round`);

/** Starts downloading an image before it is needed. */
function preload(url: string | undefined) {
  if (!url) return;
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}

/** Signed in: the game. Signed out: why to sign in — the game itself only
 *  runs for accounts, so a guest costs no rounds and no frames. */
function GameGate({ mode, compact, onStreakChange }: { mode: "guess" | "opening"; compact: boolean; onStreakChange: (value: number) => void }) {
  const t = useT();
  const { status } = useAuth();
  useEffect(() => { if (status !== "authenticated") onStreakChange(0); }, [status, onStreakChange]);
  if (status === "loading") {
    return <article className={cn(PANEL, "aspect-video animate-pulse p-3")} />;
  }
  if (status !== "authenticated" && compact) return (
    <article className={cn(PANEL, "min-h-44 justify-center gap-3")}><div className="flex items-center gap-3"><LockIcon className="size-8 shrink-0 text-primary" /><div><p className="font-semibold">Узнаешь аниме по одному кадру?</p><p className="mt-1 text-xs text-muted-foreground">Войди, чтобы играть и сохранять рекорд.</p></div></div><Link to="/login" className="mt-1 inline-flex min-h-10 items-center justify-center self-start rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">Начать игру</Link></article>
  );
  if (status !== "authenticated") {
    return (
      <article
        className={cn(
          PANEL,
          "items-center justify-center gap-3 p-6 text-center sm:p-8",
        )}
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary shadow-lg">
          {mode === "opening" ? (
            <Music2Icon className="size-6" />
          ) : (
            <LockIcon className="size-6" />
          )}
        </span>
        <p className="font-display text-lg">Войди и начни свою серию</p>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Твой рекорд сохранится, а лучшие серии попадут в рейтинг. Количество попыток
          не ограничено.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Link
            to="/login"
            state={{ from: `/games/${mode}` }}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg active:scale-95"
          >
            {t("common.signIn")}
          </Link>
          <Link
            to="/register"
            state={{ from: `/games/${mode}` }}
            className="inline-flex h-10 items-center rounded-lg border border-primary/35 bg-primary/10 px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            {t("common.createAccount")}
          </Link>
        </div>
      </article>
    );
  }
  return <GuessGame key={mode} mode={mode} compact={compact} onStreakChange={onStreakChange} />;
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
function GuessGame({ mode, compact, onStreakChange }: { mode: "guess" | "opening"; compact: boolean; onStreakChange: (value: number) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const queryClient = useQueryClient();

  const [round, setRound] = useState<GuessRound | null>(null);
  const nextRef = useRef<Promise<GuessRound> | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<GuessResult | null>(null);
  const [streak, setStreak] = useState(0);
  useEffect(() => onStreakChange(streak), [streak, onStreakChange]);
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
    const promise = fetchRound(mode);
    promise
      .then((r) => {
        if (mode === "guess") preload(imageSrc(r.frame));
      })
      .catch(() => undefined);
    nextRef.current = promise;
  }, [mode]);

  const showNext = useCallback(async () => {
    setError(false);
    const source = nextRef.current;
    nextRef.current = null;
    try {
      const r = await (source ?? fetchRound(mode));
      setRound(r);
      setPicked(null);
      setResult(null);
      setLoaded(false);
    } catch {
      setError(true);
    }
  }, [mode]);

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
      const res = await apiRequest<GuessResult>(`/games/${mode}/answer`, {
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
      const r = await apiRequest<GuessRound>(`/games/${mode}/replace`, {
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
      if (round && n >= 1 && n <= round.options.length)
        void choose(round.options[n - 1]!.id);
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
      <div className={cn("grid gap-3", compact && mode === "guess" && "md:grid-cols-[1.2fr_1fr] md:items-stretch")}>
        {/* The frame, large; the run and the record sit on it. */}
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-xl bg-muted ring-1 transition-[box-shadow] duration-300",
            mode === "opening" ? "min-h-64 sm:min-h-80" : "aspect-video",
            !revealed
              ? "ring-white/10"
              : result.correct
                ? "ring-emerald-500/70"
                : "ring-rose-500/70",
          )}
        >
          {round && mode === "opening" && (
            <OpeningAudio
              key={round.roundId}
              src={round.frame}
              onError={() => void replaceFrame()}
            />
          )}
          {round && mode === "guess" && (
            <FramePeek key={round.frame} src={imageSrc(round.frame)} revealed={revealed} loaded={loaded} onLoad={() => setLoaded(true)} onError={() => void replaceFrame()} />
          )}
          <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-2">
            <span className="rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
              {mode === "opening" ? "Чей это опенинг?" : "Чей это кадр?"}
            </span>
            <span className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    key={streak}
                    className={cn(
                      "inline-flex cursor-default items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-bold tabular-nums text-white",
                      streak > 0 && "morph-pop text-amber-300",
                    )}
                  >
                    <FlameIcon className="size-3.5" />
                    {streak}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t("home.game.streakNow")}
                </TooltipContent>
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
          {(!round || (mode === "guess" && !loaded)) && !error && (
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
                <p className="font-display text-lg">
                  {t("home.game.over", { n: streak })}
                </p>
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
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 p-5 text-center">
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                Не удалось загрузить раунд. Проверь соединение или попробуй ещё раз.
              </p>
              <button
                type="button"
                onClick={() => void showNext()}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                <RotateCcwIcon className="size-4" />
                Повторить загрузку
              </button>
            </div>
          )}
        </div>

        {/* Four answers: two by two, or a column beside the frame on a computer. */}
        <div className={cn("grid gap-2", compact ? "grid-cols-2 md:grid-cols-1" : "grid-cols-1 sm:grid-cols-2 sm:gap-3")}>
          {(round?.options ?? []).map((option, i) => {
            const isAnswer = revealed && option.id === result.answerId;
            const isPicked = option.id === picked;
            const wrong = revealed && isPicked && !isAnswer;
            return (
              <button
                key={`${round?.roundId}-${option.id}`}
                type="button"
                onClick={() => void choose(option.id)}
                disabled={picked != null || over || error}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-medium transition-[background-color,border-color,opacity] duration-200 focus-visible:outline-2 focus-visible:outline-primary sm:min-h-16",
                  compact && "min-h-11! gap-2! px-2! py-2! text-xs sm:min-h-11!",
                  !revealed &&
                    picked == null &&
                    "border-border/60 bg-card/60 hover:border-foreground/30 hover:bg-card active:scale-[0.98]",
                  !revealed && isPicked && "border-primary/60 bg-primary/10",
                  !revealed &&
                    picked != null &&
                    !isPicked &&
                    "border-border/40 opacity-60",
                  isAnswer && "border-emerald-500/60 bg-emerald-500/10",
                  wrong && "border-rose-500/60 bg-rose-500/10",
                  revealed && !isAnswer && !isPicked && "border-border/40 opacity-50",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold",
                    isAnswer
                      ? "bg-emerald-500 text-white"
                      : wrong
                        ? "bg-rose-500 text-white"
                        : "bg-foreground/[0.08] text-muted-foreground",
                  )}
                >
                  {isAnswer ? (
                    <CheckIcon className="size-4" />
                  ) : wrong ? (
                    <XIcon className="size-4" />
                  ) : (
                    OPTION_KEYS[i]
                  )}
                </span>
                <span className="line-clamp-2 min-w-0 flex-1 leading-snug">
                  {name(option)}
                </span>
              </button>
            );
          })}
          {!round &&
            Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                className="min-h-12 animate-pulse rounded-xl bg-foreground/[0.06]"
              />
            ))}
        </div>
      </div>
      <p className="text-center text-[11px] text-muted-foreground pointer-coarse:hidden">
        {t("home.game.keys")}
      </p>
    </article>
  );
}

/* ------------------------------------------------------------------------ */
/* Leaderboard                                                               */
/* ------------------------------------------------------------------------ */

function OpeningAudio({ src, onError }: { src: string; onError: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card px-4 pb-5 pt-10 text-center sm:gap-4">
      <div aria-hidden className="flex h-12 items-center gap-1 text-primary/50">
        {[20, 35, 55, 40, 70, 90, 55, 75, 100, 60, 85, 45, 65, 35, 20].map(
          (height, i) => (
            <span
              key={i}
              style={{ height: `${height}%` }}
              className={cn(
                "w-1.5 rounded-full bg-current transition-opacity",
                playing ? "opacity-100" : "opacity-40",
              )}
            />
          ),
        )}
      </div>
      <audio
        ref={audio}
        src={src}
        preload="none"
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onError={() => {
          setFailed(true);
          setPlaying(false);
        }}
        onTimeUpdate={() => {
          const el = audio.current;
          if (!el) return;
          setElapsed(Math.min(20, el.currentTime));
          if (el.currentTime >= 20) {
            el.pause();
            el.currentTime = 0;
          }
        }}
      />
      <button
        type="button"
        onClick={() => {
          const el = audio.current;
          if (!el) return;
          if (playing) el.pause();
          else {
            setFailed(false);
            void el.play().catch(() => setFailed(true));
          }
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
      >
        {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
        {playing ? "Пауза" : "Послушать опенинг"}
      </button>
      <div className="flex w-full max-w-56 items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
        <span>{Math.floor(elapsed).toString().padStart(2, "0")}</span>
        <progress
          aria-label="Прослушано секунд"
          max={20}
          value={elapsed}
          className="h-1 w-full accent-primary"
        />
        <span>20 с</span>
      </div>
      {failed ? (
        <button
          type="button"
          onClick={onError}
          className="min-h-9 text-xs text-primary"
        >
          Звук не загрузился — заменить
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">
          20 секунд. Можно слушать повторно.
        </p>
      )}
      <span className="text-[10px] text-muted-foreground">
        Музыка из архива AnimeThemes
      </span>
    </div>
  );
}

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
export function Leaderboard({ mode = "guess", compact = false }: { mode?: "guess" | "opening"; compact?: boolean }) {
  const t = useT();
  const { status, user } = useAuth();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["games", "leaderboard", mode, user?.id],
    queryFn: ({ signal }) =>
      apiRequest<Board>(`/games/${mode}/leaderboard`, { signal }),
    staleTime: 30_000,
  });

  const mine = data?.top.some((row) => row.userId === user?.id) ?? false;

  return (
    <article className={cn(PANEL, "isolate min-w-0 gap-2 p-3 sm:p-3", compact && "h-full")}>
      {!compact && <LogoWatermark className="-bottom-16 -right-12 size-56 -rotate-12" />}
      <div className="flex items-center justify-between gap-2">
        <PanelLabel icon={CrownIcon}>{t("home.game.board")}</PanelLabel>
        {data && data.top.length > 0 && (
          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
            {t("home.game.boardCount", { n: data.top.length })}
          </span>
        )}
      </div>

      {isError ? (
        <button
          type="button"
          onClick={() => void refetch()}
          className="min-h-12 text-sm text-primary"
        >
          Обновить рейтинг
        </button>
      ) : isPending ? (
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
          {data.top.slice(0, compact ? 5 : 10).map((row, i) => {
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
                  {row.avatarUrl && (
                    <AvatarImage src={imageSrc(row.avatarUrl)} alt="" />
                  )}
                  <AvatarFallback className="text-[10px] font-semibold">
                    {row.displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {row.displayName}
                </span>
                <span className="inline-flex items-center gap-1 font-display text-sm tabular-nums text-primary">
                  <FlameIcon className="size-3.5" />
                  {row.best}
                </span>
              </>
            );
            const rowClass = cn(
              "flex items-center gap-2 rounded-lg border px-2 py-1 transition-colors",
              me
                ? "border-primary bg-primary/15"
                : "border-transparent hover:border-primary/40 hover:bg-primary/10",
            );
            return (
              <li key={row.userId}>
                {row.username ? (
                  <Link
                    to={`/profile/${row.username}`}
                    viewTransition
                    className={rowClass}
                  >
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
          <span className="font-medium">
            {t("home.game.myPlace", { n: data.me.rank ?? "—" })}
          </span>
          <span className="inline-flex items-center gap-1 font-display tabular-nums text-primary">
            <FlameIcon className="size-3.5" />
            {data.me.best}
          </span>
        </div>
      )}
      {status !== "authenticated" && (
        <Link
          to="/login"
          className="mt-auto rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-center text-xs font-medium text-primary transition-colors hover:bg-primary/20"
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
  return Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
}

const FACT_KIND = {
  history: "История создания",
  record: "Рекорд",
  drama: "Поворот судьбы",
  trivia: "Любопытно",
} as const;

interface ApiFact {
  source?: string;
  id: string;
  kind?: "history" | "record" | "drama" | "trivia";
  year?: number | null;
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
export function FactsStrip() {
  const t = useT();
  const [deal, setDeal] = useState(0);
  const [offset, setOffset] = useState(() => (dayNumber() * 4) % FACT_KEYS.length);
  const facts = useQuery({
    queryKey: ["fun-facts", deal],
    queryFn: ({ signal }) =>
      apiRequest<{ facts: ApiFact[]; total: number }>("/fun/facts", {
        signal,
        query: { count: 4 },
      }),
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
  const shown = facts.data?.facts.length
    ? facts.data.facts
    : facts.isError
      ? fallback
      : null;
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
        subtitle="История создания, рекорды и неожиданные повороты"
      />
      <div
        className={cn(PANEL, "isolate min-h-52 flex-col gap-3 sm:flex-row sm:gap-4")}
        onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          const x0 = touch.current;
          const x1 = e.changedTouches[0]?.clientX;
          touch.current = null;
          if (x0 != null && x1 != null && Math.abs(x1 - x0) > 40)
            step(x1 < x0 ? 1 : -1);
        }}
      >
        {!fact ? (
          <div className="h-40 w-full animate-pulse rounded-xl bg-foreground/[0.05]" />
        ) : (
          <>
            {fact.anime?.image && (
              <img
                aria-hidden
                src={imageSrc(fact.anime.image)}
                alt=""
                loading="lazy"
                className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden h-full w-1/2 object-cover opacity-15 [mask-image:linear-gradient(to_left,#000,transparent)] sm:block"
              />
            )}
            {/* A computer: the poster as a column beside the fact. */}
            {fact.anime?.image ? (
              <Link
                to={animeHref(fact.anime)}
                viewTransition
                className="hidden shrink-0 self-start sm:block"
              >
                <img
                  src={imageSrc(fact.anime.image)}
                  alt=""
                  loading="lazy"
                  className="aspect-[2/3] w-32 rounded-xl object-cover ring-1 ring-white/10"
                />
              </Link>
            ) : (
              <span className="hidden aspect-[2/3] w-32 shrink-0 place-items-center rounded-xl bg-foreground/[0.05] font-display text-5xl text-muted-foreground/40 sm:grid">
                影
              </span>
            )}
            <div
              key={`${deal}-${at}`}
              className="flex min-w-0 flex-1 animate-in flex-col gap-2.5 duration-300 fade-in-0"
            >
              {/* A phone: a small poster beside the label and the title; the text gets the whole width below. */}
              <div className="flex items-start gap-3">
                {fact.anime?.image && (
                  <Link
                    to={animeHref(fact.anime)}
                    viewTransition
                    className="shrink-0 sm:hidden"
                  >
                    <img
                      src={imageSrc(fact.anime.image)}
                      alt=""
                      loading="lazy"
                      className="aspect-[2/3] w-14 rounded-lg object-cover ring-1 ring-white/10"
                    />
                  </Link>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="rounded-md bg-primary/12 px-1.5 py-0.5 text-primary">
                      {FACT_KIND[fact.kind ?? "trivia"]}
                    </span>
                    {fact.year && <span className="tabular-nums">{fact.year}</span>}
                  </span>
                  <p className="font-display text-lg leading-tight [overflow-wrap:anywhere] sm:text-2xl">
                    {fact.title}
                  </p>
                </div>
              </div>
              <p className="max-w-3xl text-sm leading-relaxed text-foreground/85 sm:text-[15px]">
                {fact.text}
              </p>

              {fact.source && (
                <a
                  href={fact.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-fit text-[11px] text-muted-foreground underline underline-offset-4 hover:text-primary"
                >
                  Источник факта
                </a>
              )}
              {/* Which fact of how many, as dots. */}
              <div
                className="flex items-center gap-1.5"
                aria-label={`Факт ${at + 1} из ${count}`}
              >
                {Array.from({ length: count }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAt(i)}
                    aria-label={`Факт ${i + 1}`}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === at
                        ? "w-6 bg-primary"
                        : "w-1.5 bg-foreground/20 hover:bg-foreground/40",
                    )}
                  />
                ))}
              </div>

              <div className="mt-auto flex items-center gap-1.5 pt-0.5">
                {fact.anime && (
                  <Link
                    to={animeHref(fact.anime)}
                    viewTransition
                    className="inline-flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 sm:flex-none"
                  >
                    <span className="truncate">Смотреть «{fact.anime.title}»</span>
                  </Link>
                )}
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label="Предыдущий факт"
                    className="grid size-9 place-items-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label="Следующий факт"
                    className="grid size-9 place-items-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    onClick={more}
                    aria-label={t("home.facts.more")}
                    title={t("home.facts.more")}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground sm:px-3"
                  >
                    <ShuffleIcon className="size-3.5" />
                    <span className="hidden sm:inline">{t("home.facts.more")}</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
