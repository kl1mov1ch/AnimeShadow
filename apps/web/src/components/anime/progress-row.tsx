import type { ProgressDetail } from "@animeshadow/shared";
import { PlayCircleIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";

type TFn = (k: string, p?: Record<string, string | number>) => string;

export function fmtDuration(t: TFn, seconds: number) {
  const total = Math.round(seconds);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  return d > 0
    ? t("profile.summary.durationDHM", { d, h, m })
    : t("profile.summary.durationHM", { h, m });
}

export function mmss(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * One line of real watch progress — poster, title, progress bar, resume
 * point. `onDelete`, when given, adds a trash button that forgets the title
 * entirely (its own confirm dialog — the caller just gets a callback once
 * the user actually confirms).
 */
export function ProgressRow({
  row,
  onDelete,
  deleting,
}: {
  row: ProgressDetail;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const t = useT();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const total = row.episodesTotal ?? 0;
  const percent = total > 0 ? Math.round((row.episode / total) * 100) : 0;
  const remaining =
    row.durationSeconds != null
      ? Math.max(0, row.durationSeconds - row.positionSeconds)
      : null;

  return (
    <article className="group flex gap-3 rounded-xl border border-border/60 bg-card/40 p-3 transition-colors hover:border-border sm:gap-4">
      <Link
        to={`/anime/${row.slug}`}
        className="h-24 w-16 shrink-0 overflow-hidden rounded-md bg-muted sm:h-28 sm:w-20"
      >
        {row.imageUrl ? (
          <img
            src={imageSrc(row.imageUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <PosterFallback title={row.title} seed={row.animeId} />
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <Link
            to={`/anime/${row.slug}`}
            className="line-clamp-2 font-medium leading-snug transition-colors hover:text-primary"
          >
            {row.title}
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            {row.status && (
              <span className="rounded-md border border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {t(`status.${row.status}`)}
              </span>
            )}
            {onDelete && (
              <button
                type="button"
                aria-label={t("profile.progressCard.delete")}
                disabled={deleting}
                onClick={() => setConfirmDelete(true)}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("profile.progressCard.episodesOfTotal", {
              done: row.episode,
              total: total || "?",
              percent,
            })}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground/80">
          <span>
            {t("profile.progressCard.totalTime", {
              time: fmtDuration(t, row.totalSecondsOnTitle),
            })}
          </span>
          {row.positionSeconds > 0 && !row.completed && (
            <>
              <span>
                {t("profile.progressCard.stoppedAt", {
                  time: mmss(row.positionSeconds),
                  ep: row.episode,
                })}
              </span>
              {remaining != null && (
                <span>
                  {t("profile.progressCard.untilEnd", { time: mmss(remaining) })}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {onDelete && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("profile.progressCard.deleteTitle")}
          description={t("profile.progressCard.deleteBody", { title: row.title })}
          pending={deleting}
          onConfirm={onDelete}
        />
      )}
    </article>
  );
}

export function ProgressEmpty() {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 bg-card/20 px-6 py-10 text-center">
      <PlayCircleIcon className="size-6 text-muted-foreground/60" />
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("library.nothingTracked")}
      </p>
      <Button asChild size="sm" variant="outline">
        <Link to="/browse">{t("common.browseCatalogue")}</Link>
      </Button>
    </div>
  );
}
