import type { FrameMatch } from "@animeshadow/shared";
import {
  ImageIcon,
  Loader2Icon,
  PlayIcon,
  RotateCcwIcon,
  ScanSearchIcon,
  UploadIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { EmptyState } from "@/components/common/states";
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

  if (status !== "loading" && status !== "authenticated") {
    return (
      <EmptyState
        title={t("frameSearch.signedOutTitle")}
        description={t("frameSearch.signedOutBody")}
        action={
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/login">{t("common.signIn")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/register">{t("common.createAccount")}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const reset = () => {
    setPreview(null);
    setLocalError(null);
    search.reset();
  };

  const serverError = search.isError
    ? search.error instanceof ApiRequestError
      ? search.error.message
      : t("errors.genericBody")
    : null;

  return (
    <div className="reveal-group mx-auto flex max-w-4xl flex-col gap-6 py-6">
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
        </div>
        <h1 className="font-display text-2xl sm:text-3xl">{t("frameSearch.title")}</h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {t("frameSearch.lead")}
        </p>
      </header>

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
    </div>
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
