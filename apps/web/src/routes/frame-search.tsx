import type { FrameMatch } from "@animeshadow/shared";
import {
  CheckIcon,
  FlaskConicalIcon,
  ImageIcon,
  Loader2Icon,
  PlayIcon,
  RotateCcwIcon,
  ScanSearchIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { animeHref, imageSrc } from "@/lib/format";
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
  // actually have one to hand — Win+Shift+S, then Ctrl+V here, with no file
  // saved anywhere in between.
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

  // Signed out still gets the pitch, not just the door. Anyone can reach this
  // page from the header now, and a bare "sign in" panel would tell them
  // nothing about what they would be signing in for.
  if (status !== "loading" && status !== "authenticated") {
    return (
      <div className="reveal-group mx-auto flex max-w-4xl flex-col gap-6 py-6">
        <Hero />
        <div
          className="reveal flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border/70 p-8 text-center sm:p-10"
          style={step(1)}
        >
          <span
            aria-hidden
            className="grid size-12 place-items-center rounded-2xl border border-border/60 bg-secondary/40 text-muted-foreground"
          >
            <ScanSearchIcon className="size-5" />
          </span>
          <p className="font-medium">{t("frameSearch.signedOutTitle")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t("frameSearch.signedOutBody")}
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Button asChild>
              <Link to="/login">{t("common.signIn")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/register">{t("common.createAccount")}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const reset = () => {
    setPreview(null);
    setLocalError(null);
    search.reset();
  };

  const serverError = search.isError ? describeError(search.error, t) : null;

  return (
    <div className="reveal-group mx-auto flex max-w-4xl flex-col gap-6 py-6">
      <Hero />

      <section className="reveal" style={step(1)}>
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
            "flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed p-8 text-center transition-all duration-200 sm:p-12",
            dragging
              ? "border-primary/60 bg-primary/5"
              : "border-border/70 hover:border-primary/40",
          )}
        >
          {preview ? (
            <img
              src={preview}
              alt=""
              className="max-h-56 w-auto rounded-2xl border border-border/60 object-contain shadow-lg"
            />
          ) : (
            <span
              aria-hidden
              className="grid size-14 place-items-center rounded-2xl border border-border/60 bg-secondary/40 text-muted-foreground"
            >
              <ImageIcon className="size-6" />
            </span>
          )}

          <p className="text-sm font-medium">{t("frameSearch.dropHint")}</p>
          <p className="text-xs text-muted-foreground">{t("frameSearch.pasteHint")}</p>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={search.isPending}
              className="group relative overflow-hidden bg-gradient-to-r from-primary via-primary/85 to-primary font-semibold shadow-lg shadow-primary/25 transition-all duration-200 hover:-translate-y-0.5"
            >
              <UploadIcon className="relative z-10 size-4" />
              <span className="relative z-10">{t("frameSearch.pickFile")}</span>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
              />
            </Button>
            {(preview || search.data) && (
              <Button type="button" variant="outline" onClick={reset}>
                <RotateCcwIcon className="size-3.5" />
                {t("frameSearch.reset")}
              </Button>
            )}
          </div>
        </div>
      </section>

      {(localError || serverError) && (
        <p className="animate-in fade-in slide-in-from-top-1 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive duration-200">
          {localError ?? serverError}
        </p>
      )}

      {search.isPending && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin text-primary" />
          {t("frameSearch.searching")}
        </div>
      )}

      {search.data && !search.isPending && (
        <section className="reveal flex flex-col gap-3" style={step(2)}>
          {search.data.results.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
              {t("frameSearch.noMatches")}
            </p>
          ) : (
            <>
              <h2 className="font-display text-lg tracking-tight sm:text-xl">
                {t("frameSearch.resultsHeading")}
              </h2>
              <div className="flex flex-col gap-3">
                {search.data.results.map((match, i) => (
                  <MatchRow key={`${match.title}-${i}`} match={match} index={i} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground/70">
                {t("frameSearch.framesSearched", {
                  count: search.data.framesSearched.toLocaleString(),
                })}
              </p>
            </>
          )}
        </section>
      )}

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

/** The pitch. Shown whether or not the visitor can actually run a search —
 *  it is what tells them the feature exists at all. */
function Hero() {
  const t = useT();
  return (
    <header
      className="reveal relative flex flex-col gap-2 overflow-hidden rounded-3xl border border-border/60 bg-card/40 p-5 sm:p-7"
      style={step(0)}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-4 -top-8 select-none font-display text-[10rem] leading-none text-foreground/[0.03]"
      >
        影
      </span>
      <div className="flex items-center gap-2 text-primary">
        <ScanSearchIcon className="size-5" />
        <span className="text-sm font-medium uppercase tracking-wide">
          {t("frameSearch.eyebrow")}
        </span>
        <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
          {t("frameSearch.beta")}
        </span>
      </div>
      <h1 className="font-display text-2xl sm:text-3xl">{t("frameSearch.title")}</h1>
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        {t("frameSearch.lead")}
      </p>
      {/* Said up front rather than discovered on failure: the search runs on
          an outside service with a small shared quota, so it genuinely will
          not always answer. */}
      <p className="flex max-w-prose items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-foreground/80">
        <FlaskConicalIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
        {t("frameSearch.betaNote")}
      </p>
    </header>
  );
}

function MatchRow({ match, index }: { match: FrameMatch; index: number }) {
  const t = useT();
  const labels = useLabels();
  const [playing, setPlaying] = useState(false);
  const percent = Math.round(match.similarity * 100);
  const title = match.anime ? labels.title(match.anime) : match.title;

  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-2 flex gap-3 rounded-2xl border border-border/60 bg-card/40 p-3 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 sm:gap-4"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "backwards" }}
    >
      {/* The moment itself. Starts as the still trace.moe returns and only
          fetches the clip once asked — five autoplaying videos on one screen
          is a lot of bandwidth for something you glance at. */}
      <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-xl bg-black sm:w-48">
        {playing && match.previewVideo ? (
          <video
            src={match.previewVideo}
            autoPlay
            loop
            muted
            playsInline
            className="size-full object-cover"
          />
        ) : match.previewImage ? (
          <>
            <img
              src={match.previewImage}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
            {match.previewVideo && (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                aria-label={t("frameSearch.playMoment")}
                className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition-opacity duration-200 hover:opacity-100"
              >
                <span className="grid size-9 place-items-center rounded-full bg-background/30 text-white ring-1 ring-white/40 backdrop-blur-md">
                  <PlayIcon className="size-4 translate-x-[1px] fill-current" />
                </span>
              </button>
            )}
          </>
        ) : match.anime ? (
          <PosterFallback title={title} seed={match.anime.id} />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          {match.anime ? (
            <Link
              to={animeHref(match.anime)}
              className="line-clamp-2 font-medium leading-snug transition-colors hover:text-primary"
            >
              {title}
            </Link>
          ) : (
            <span className="line-clamp-2 font-medium leading-snug">{title}</span>
          )}
          {/* A percentage is the one number that decides whether to trust the
              row at all, so it stays visible rather than living in a tooltip. */}
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
              percent >= 95
                ? "bg-primary/15 text-primary"
                : "bg-secondary/60 text-muted-foreground",
            )}
          >
            {percent}%
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          {match.episode != null
            ? t("frameSearch.episodeAt", {
                episode: match.episode,
                time: formatTimestamp(match.fromSeconds),
              })
            : t("frameSearch.atTime", { time: formatTimestamp(match.fromSeconds) })}
        </p>

        {match.anime ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="sm" variant="outline">
              <Link to={animeHref(match.anime)}>{t("frameSearch.openPage")}</Link>
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/70">
            {t("frameSearch.notInCatalogue")}
          </p>
        )}
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

  const tips = [
    t("frameSearch.tips.fromEpisode"),
    t("frameSearch.tips.wholeFrame"),
    t("frameSearch.tips.sharp"),
    t("frameSearch.tips.noOverlay"),
    t("frameSearch.tips.screenshot"),
  ];

  return (
    <section className="reveal flex flex-col gap-4" style={step(3)}>
      <div className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card/40 p-5">
        <h2 className="font-display text-lg tracking-tight">{t("frameSearch.tipsTitle")}</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {tips.map((tip) => (
            <li key={tip} className="flex items-start gap-2 text-sm text-foreground/85">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              {tip}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg tracking-tight">{t("frameSearch.examplesTitle")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {examples.map(({ good, label, render }, i) => (
            <figure
              key={label}
              className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-2 duration-500"
              style={{ animationDelay: `${i * 70}ms`, animationFillMode: "backwards" }}
            >
              <div
                className={cn(
                  "relative aspect-video overflow-hidden rounded-xl border-2 bg-black",
                  good ? "border-emerald-500/60" : "border-rose-500/50",
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
