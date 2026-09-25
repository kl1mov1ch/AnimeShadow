import type { FrameMatch } from "@animeshadow/shared";
import {
  ArrowRightIcon,
  CheckIcon,
  ClipboardPasteIcon,
  FlaskConicalIcon,
  ImageUpIcon,
  LightbulbIcon,
  LockIcon,
  PlayIcon,
  RotateCcwIcon,
  ScanSearchIcon,
  SparklesIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { PageHero, SectionTitle } from "@/components/common/page-hero";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { animeHref } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useFrameSearch } from "@/lib/query";
import { cn } from "@/lib/utils";

const step = (i: number) => ({ "--i": i }) as CSSProperties;

/** 4MB is what the API accepts once decoded; stop it here rather than after
 *  spending the upload. */
const MAX_BYTES = 4 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Identify a screenshot: trace.moe matches the frame against its index of
 * episode footage and answers with the title, the episode and the exact
 * moment it came from.
 *
 * Two columns on a wide screen — the frame you gave on the left, what it
 * was on the right — so the picture and the answer sit side by side instead
 * of the answer landing below the fold. While it searches, a scan line runs
 * over your frame; the best match gets a card of its own, the rest a list.
 */
export function Component() {
  const t = useT();
  const { status } = useAuth();
  const search = useFrameSearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const submit = useCallback(
    async (file: File) => {
      setLocalError(null);
      if (!file.type.startsWith("image/")) {
        setLocalError(t("frameSearch.errorNotImage"));
        return;
      }
      if (file.size > MAX_BYTES) {
        setLocalError(t("frameSearch.errorTooLarge"));
        return;
      }
      const dataUrl = await readAsDataUrl(file);
      setPreview(dataUrl);
      search.mutate(dataUrl);
    },
    [search, t],
  );

  // Pasting a screenshot straight from the clipboard is how most people
  // actually have one to hand — Win+Shift+S, then Ctrl+V here.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.items ?? [])]
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();
      if (file) void submit(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [submit]);

  const signedOut = status !== "loading" && status !== "authenticated";

  const reset = () => {
    setPreview(null);
    setLocalError(null);
    search.reset();
  };

  const serverError = search.isError ? describeError(search.error, t) : null;
  const results = search.data?.results ?? [];
  const [best, ...rest] = results;

  return (
    <div className="reveal-group mx-auto flex max-w-6xl flex-col gap-6 py-4 sm:gap-8 sm:py-6">
      <div className="reveal" style={step(0)}>
        <PageHero
          icon={ScanSearchIcon}
          eyebrow={t("frameSearch.eyebrow")}
          badge={t("frameSearch.beta")}
          title={t("frameSearch.title")}
          lead={t("frameSearch.lead")}
        >
          {/* Said up front rather than discovered on failure: the search
              runs on an outside service with a small shared quota. */}
          <p className="flex max-w-prose items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3 text-xs leading-relaxed text-foreground/80">
            <FlaskConicalIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            {t("frameSearch.betaNote")}
          </p>
        </PageHero>
      </div>

      {signedOut ? (
        // Signed out still gets the pitch and the guide, not just a door.
        <section
          className="reveal relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-dashed border-primary/40 bg-[var(--accent-surface)] p-8 text-center sm:p-12"
          style={step(1)}
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary shadow-lg shadow-primary/20">
            <LockIcon className="size-6" />
          </span>
          <p className="font-display text-lg">{t("frameSearch.signedOutTitle")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("frameSearch.signedOutBody")}</p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Link
              to="/login"
              className="btn-sheen inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 active:scale-95"
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
        </section>
      ) : (
        <div className="reveal grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]" style={step(1)}>
          <section className="flex flex-col gap-3">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void submit(file);
                // Cleared so picking the same file twice still fires a change.
                event.target.value = "";
              }}
            />

            <div
              role="button"
              tabIndex={0}
              onClick={() => !search.isPending && inputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !search.isPending) {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void submit(file);
              }}
              className={cn(
                "group relative flex aspect-video cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed p-6 text-center outline-none transition-all duration-300 focus-visible:ring-4 focus-visible:ring-primary/25",
                dragging
                  ? "scale-[1.01] border-primary bg-primary/10 shadow-xl shadow-primary/20"
                  : preview
                    ? "border-primary/40 bg-black"
                    : "border-primary/30 bg-[var(--accent-surface)] hover:border-primary/70 hover:bg-primary/[0.06]",
              )}
            >
              {preview ? (
                <>
                  <img src={preview} alt="" className="absolute inset-0 size-full object-contain" />
                  {search.isPending && (
                    // A scan line sweeping the frame while trace.moe looks.
                    <>
                      <span aria-hidden className="absolute inset-0 bg-primary/10" />
                      <span aria-hidden className="frame-scan absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-primary/45 to-transparent" />
                      <span aria-hidden className="frame-scan absolute inset-x-0 h-0.5 bg-primary shadow-[0_0_12px_2px_var(--primary)]" />
                    </>
                  )}
                </>
              ) : (
                <>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(color-mix(in_srgb,var(--primary)_35%,transparent)_1px,transparent_1px)] [background-size:18px_18px]"
                  />
                  <span className="relative grid size-16 place-items-center rounded-2xl bg-primary/15 text-primary shadow-lg shadow-primary/20 transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-105">
                    <ImageUpIcon className="size-7" />
                  </span>
                  <p className="relative font-semibold">{t("frameSearch.dropHint")}</p>
                  <p className="relative flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ClipboardPasteIcon className="size-3.5 text-primary" />
                    {t("frameSearch.pasteHint")}
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={search.isPending}
                className="btn-sheen inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-60"
              >
                <UploadIcon className="size-4" />
                {t("frameSearch.pickFile")}
              </button>
              {(preview || search.data) && (
                <button
                  type="button"
                  onClick={reset}
                  className="group inline-flex h-10 items-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  <RotateCcwIcon className="size-3.5 transition-transform duration-500 group-hover:-rotate-180" />
                  {t("frameSearch.reset")}
                </button>
              )}
            </div>

            {(localError || serverError) && (
              <p className="animate-in rounded-xl border border-destructive/40 bg-destructive/[0.07] p-3 text-sm text-destructive fade-in slide-in-from-top-1 duration-200">
                {localError ?? serverError}
              </p>
            )}
          </section>

          <section className="flex min-w-0 flex-col gap-3">
            {search.isPending ? (
              <div className="flex flex-col gap-3">
                <p className="flex items-center gap-2 text-sm font-medium text-primary">
                  <ScanSearchIcon className="size-4 animate-pulse" />
                  {t("frameSearch.searching")}
                </p>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3 rounded-xl border border-[var(--accent-line-soft)] bg-card/50 p-3">
                    <span className="aspect-video w-32 shrink-0 animate-pulse rounded-lg bg-primary/10" />
                    <span className="flex flex-1 flex-col gap-2 pt-1">
                      <span className="h-3.5 w-3/4 animate-pulse rounded bg-primary/10" />
                      <span className="h-3 w-1/3 animate-pulse rounded bg-primary/10" />
                    </span>
                  </div>
                ))}
              </div>
            ) : search.data ? (
              results.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-primary/30 p-8 text-center text-sm text-muted-foreground">
                  {t("frameSearch.noMatches")}
                </p>
              ) : (
                <>
                  <SectionTitle icon={SparklesIcon} title={t("frameSearch.resultsHeading")} />
                  {best && <BestMatch match={best} />}
                  {rest.map((match, i) => (
                    <MatchRow key={`${match.title}-${i}`} match={match} index={i} />
                  ))}
                  <p className="text-xs text-muted-foreground/70">
                    {t("frameSearch.framesSearched", { count: search.data.framesSearched.toLocaleString() })}
                  </p>
                </>
              )
            ) : (
              <Tips />
            )}
          </section>
        </div>
      )}

      {(signedOut || search.data) && <Tips className="reveal" />}
      <FrameGuide />
    </div>
  );
}

/**
 * Turns a failed search into a sentence someone can act on. The server says
 * which limit was hit, because the two free-tier limits ask for different
 * things: one means wait a minute, the other means wait for next month.
 */
function describeError(error: unknown, t: ReturnType<typeof useT>): string {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return t("frameSearch.errorTimeout");
  }
  if (error instanceof ApiRequestError) {
    const reason = error.fieldError("reason");
    if (reason === "quota") return t("frameSearch.errorQuota");
    if (reason === "busy") return t("frameSearch.errorBusy");
    // A 400 is about the image itself (too large, not an image) - that one
    // is worth passing on as the server phrased it.
    if (error.status === 400) return error.message;
  }
  return t("frameSearch.errorUnavailable");
}

function Tips({ className }: { className?: string }) {
  const t = useT();
  const tips = [
    t("frameSearch.tips.fromEpisode"),
    t("frameSearch.tips.wholeFrame"),
    t("frameSearch.tips.sharp"),
    t("frameSearch.tips.noOverlay"),
    t("frameSearch.tips.screenshot"),
  ];
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-5", className)}>
      <SectionTitle icon={LightbulbIcon} title={t("frameSearch.tipsTitle")} />
      <ul className="grid gap-2">
        {tips.map((tip, i) => (
          <li
            key={tip}
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
            className="flex animate-in items-start gap-2.5 text-sm text-foreground/85 fade-in-0 slide-in-from-left-1 duration-500"
          >
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <CheckIcon className="size-3" strokeWidth={3} />
            </span>
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The moment itself — the still first, the clip only once asked for. */
function MatchMedia({ match, title, className }: { match: FrameMatch; title: string; className?: string }) {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  return (
    <div className={cn("relative aspect-video shrink-0 overflow-hidden rounded-lg bg-black", className)}>
      {playing && match.previewVideo ? (
        <video src={match.previewVideo} autoPlay loop muted playsInline className="size-full object-cover" />
      ) : match.previewImage ? (
        <>
          <img src={match.previewImage} alt="" loading="lazy" className="size-full object-cover" />
          {match.previewVideo && (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={t("frameSearch.playMoment")}
              className="group/play absolute inset-0 grid place-items-center bg-black/25 transition-colors hover:bg-black/40"
            >
              <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform group-hover/play:scale-110">
                <PlayIcon className="size-4 translate-x-[1px] fill-current" />
              </span>
            </button>
          )}
        </>
      ) : match.anime ? (
        <PosterFallback title={title} seed={match.anime.id} />
      ) : null}
    </div>
  );
}

function Similarity({ percent }: { percent: number }) {
  const good = percent >= 90;
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
        <span
          className={cn("block h-full rounded-full", good ? "bg-primary shadow-[0_0_8px_var(--primary)]" : "bg-muted-foreground/60")}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className={cn("text-xs font-bold tabular-nums", good ? "text-primary" : "text-muted-foreground")}>{percent}%</span>
    </div>
  );
}

function when(match: FrameMatch, t: ReturnType<typeof useT>) {
  return match.episode != null
    ? t("frameSearch.episodeAt", { episode: match.episode, time: formatTimestamp(match.fromSeconds) })
    : t("frameSearch.atTime", { time: formatTimestamp(match.fromSeconds) });
}

function BestMatch({ match }: { match: FrameMatch }) {
  const t = useT();
  const labels = useLabels();
  const title = match.anime ? labels.title(match.anime) : match.title;
  return (
    <article className="relative flex animate-in flex-col gap-3 overflow-hidden rounded-2xl border border-primary/50 bg-gradient-to-br from-primary/[0.12] via-card/60 to-card/40 p-3 shadow-xl shadow-primary/10 fade-in-0 zoom-in-95 duration-500 sm:p-4">
      <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow-md shadow-primary/30">
        <SparklesIcon className="size-3" />
        {t("frameSearch.bestMatch")}
      </span>
      <MatchMedia match={match} title={title} className="w-full rounded-xl" />
      <div className="flex flex-col gap-2">
        {match.anime ? (
          <Link to={animeHref(match.anime)} viewTransition className="font-display text-lg leading-snug transition-colors hover:text-primary">
            {title}
          </Link>
        ) : (
          <span className="font-display text-lg leading-snug">{title}</span>
        )}
        <p className="text-sm text-muted-foreground">{when(match, t)}</p>
        <Similarity percent={Math.round(match.similarity * 100)} />
        {match.anime ? (
          <Link
            to={animeHref(match.anime)}
            viewTransition
            className="btn-sheen group mt-1 inline-flex h-10 w-fit items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 active:scale-95"
          >
            {t("frameSearch.openPage")}
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground/70">{t("frameSearch.notInCatalogue")}</p>
        )}
      </div>
    </article>
  );
}

function MatchRow({ match, index }: { match: FrameMatch; index: number }) {
  const t = useT();
  const labels = useLabels();
  const title = match.anime ? labels.title(match.anime) : match.title;

  return (
    <div
      className="flex animate-in gap-3 rounded-xl border border-[var(--accent-line-soft)] bg-card/50 p-2.5 fade-in slide-in-from-bottom-2 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
      style={{ animationDelay: `${(index + 1) * 60}ms`, animationFillMode: "backwards" }}
    >
      <MatchMedia match={match} title={title} className="w-28 sm:w-36" />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        {match.anime ? (
          <Link to={animeHref(match.anime)} viewTransition className="line-clamp-2 text-sm font-semibold leading-snug transition-colors hover:text-primary">
            {title}
          </Link>
        ) : (
          <span className="line-clamp-2 text-sm font-semibold leading-snug">{title}</span>
        )}
        <p className="text-xs text-muted-foreground">{when(match, t)}</p>
        <Similarity percent={Math.round(match.similarity * 100)} />
      </div>
    </div>
  );
}

/**
 * The sample frame every example below is made from: a plain landscape at
 * dusk, drawn inline. Drawn rather than taken from a real episode on purpose —
 * it costs no download, it can be degraded any way the examples need, and it
 * reproduces nobody's artwork.
 */
function SampleScene({ variant }: { variant: "poster" | "frame" }) {
  if (variant === "poster") {
    return (
      <svg viewBox="0 0 90 160" className="h-full w-auto" aria-hidden>
        <defs>
          <linearGradient id="fs-poster" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#3b1d5e" />
            <stop offset="1" stopColor="#e2557b" />
          </linearGradient>
        </defs>
        <rect width="90" height="160" fill="url(#fs-poster)" />
        <circle cx="45" cy="70" r="26" fill="#ffd9a8" opacity="0.9" />
        <path d="M20 160 L45 95 L70 160 Z" fill="#1c1030" />
        <rect x="10" y="12" width="70" height="10" rx="2" fill="#fff" opacity="0.9" />
        <rect x="22" y="27" width="46" height="5" rx="2" fill="#fff" opacity="0.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 160 90" className="size-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="fs-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2a1f5c" />
          <stop offset="0.55" stopColor="#c8567a" />
          <stop offset="1" stopColor="#f6b27a" />
        </linearGradient>
      </defs>
      <rect width="160" height="90" fill="url(#fs-sky)" />
      <circle cx="112" cy="46" r="15" fill="#ffe3b3" opacity="0.95" />
      <path d="M0 64 L28 44 L52 60 L80 38 L110 62 L136 48 L160 60 L160 90 L0 90 Z" fill="#5a2d5c" />
      <path d="M0 74 L34 58 L66 72 L98 56 L128 72 L160 64 L160 90 L0 90 Z" fill="#2c1638" />
      {/* a little torii on the ridge, so the frame reads as a scene */}
      <g fill="#150a1c">
        <rect x="30" y="50" width="2" height="12" />
        <rect x="42" y="50" width="2" height="12" />
        <rect x="27" y="48" width="20" height="2.2" />
        <rect x="29" y="52" width="16" height="1.4" />
      </g>
    </svg>
  );
}

type Example = {
  good: boolean;
  label: string;
  render: () => React.ReactNode;
};

/**
 * What a searchable frame looks like, and the ways it usually goes wrong —
 * shown as pictures rather than described, since "a clean full frame" means
 * little until you see the blurred and the cropped one next to it.
 */
function FrameGuide() {
  const t = useT();

  const examples: Example[] = [
    {
      good: true,
      label: t("frameSearch.examples.fullFrame"),
      render: () => <SampleScene variant="frame" />,
    },
    {
      good: false,
      label: t("frameSearch.examples.blurry"),
      render: () => (
        <div className="size-full blur-[3px] saturate-50">
          <SampleScene variant="frame" />
        </div>
      ),
    },
    {
      good: false,
      label: t("frameSearch.examples.overlay"),
      render: () => (
        <div className="relative size-full">
          <SampleScene variant="frame" />
          {/* burned-in subtitles and a player's controls on top */}
          <span className="absolute inset-x-6 bottom-6 h-2 rounded bg-black/65" />
          <span className="absolute inset-x-0 bottom-0 flex h-4 items-center gap-1 bg-black/75 px-1.5">
            <span className="size-1.5 rounded-full bg-white" />
            <span className="h-0.5 flex-1 rounded bg-white/40">
              <span className="block h-full w-1/3 rounded bg-red-500" />
            </span>
          </span>
        </div>
      ),
    },
    {
      good: false,
      label: t("frameSearch.examples.cropped"),
      render: () => (
        <div className="size-full origin-[70%_45%] scale-[3]">
          <SampleScene variant="frame" />
        </div>
      ),
    },
    {
      good: false,
      label: t("frameSearch.examples.photo"),
      render: () => (
        // A photo of a screen: at an angle, darker, with the screen's own
        // edge showing.
        <div className="flex size-full items-center justify-center bg-neutral-800">
          <div className="h-[78%] w-[82%] -rotate-6 skew-x-6 overflow-hidden rounded-sm border-2 border-neutral-900 brightness-75 contrast-75">
            <SampleScene variant="frame" />
          </div>
        </div>
      ),
    },
    {
      good: false,
      label: t("frameSearch.examples.poster"),
      render: () => (
        <div className="flex size-full items-center justify-center bg-secondary/60 py-1">
          <SampleScene variant="poster" />
        </div>
      ),
    },
  ];

  return (
    <section className="reveal flex flex-col gap-4 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-5" style={step(3)}>
      <SectionTitle icon={ScanSearchIcon} title={t("frameSearch.examplesTitle")} />
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {examples.map(({ good, label, render }, i) => (
            <figure
              key={label}
              className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-2 duration-500"
              style={{ animationDelay: `${i * 70}ms`, animationFillMode: "backwards" }}
            >
              <div
                className={cn(
                  "relative aspect-video overflow-hidden rounded-xl border-2 bg-black",
                  good ? "border-emerald-500/70 shadow-lg shadow-emerald-500/15" : "border-rose-500/50",
                )}
              >
                {render()}
                <span
                  className={cn(
                    "absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full text-white shadow-md",
                    good ? "bg-emerald-500" : "bg-rose-500",
                  )}
                >
                  {good ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
                </span>
              </div>
              <figcaption className="text-xs leading-snug text-muted-foreground">{label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
