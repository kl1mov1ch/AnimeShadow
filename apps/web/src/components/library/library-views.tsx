import type { LibraryEntry } from "@animeshadow/shared";
import { useQueryClient } from "@tanstack/react-query";
import { NotebookPenIcon, PlusIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { useLocale, useT } from "@/i18n";
import { isSlowConnection } from "@/lib/connection";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { animeQueryOptions } from "@/lib/query";
import { cn } from "@/lib/utils";
import { STATUS_META, progressLabel } from "./library-meta";
import { EntryMenu, ProgressLine, ProgressStepper, UserScore } from "./library-parts";
import type { LibraryEdit } from "./use-library-edit";

/** Same idea as the catalogue cards: a hover that lingers loads the page. */
function usePrefetch(entry: LibraryEntry) {
  const client = useQueryClient();
  const { locale } = useLocale();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return {
    onPointerEnter: () => {
      if (isSlowConnection()) return;
      timer.current = setTimeout(() => {
        void client.prefetchQuery(animeQueryOptions(entry.anime.slug || entry.anime.id, locale));
      }, 150);
    },
    onPointerLeave: () => {
      if (timer.current) clearTimeout(timer.current);
    },
  };
}

function Poster({ entry, className }: { entry: LibraryEntry; className?: string }) {
  const labels = useLabels();
  return (
    <div className={cn("overflow-hidden bg-muted", className)}>
      {entry.anime.imageUrl ? (
        <img
          src={imageSrc(entry.anime.imageUrl)}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <PosterFallback title={labels.title(entry.anime)} seed={entry.anime.id} />
      )}
    </div>
  );
}

function metaLine(entry: LibraryEntry, labels: ReturnType<typeof useLabels>): string {
  return [
    labels.typeLabel(entry.anime.type),
    entry.anime.year,
    labels.episodeLabel(entry.anime.episodes, entry.anime.type),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The grid card. Poster first, with everything that fits on it drawn over
 * it — status, your score, the site score, whether it is still airing, and
 * progress as a bar along the bottom edge — so the only thing under the
 * poster is the one control used most: the episode counter.
 */
export function LibraryTile({
  entry,
  edit,
  index,
}: {
  entry: LibraryEntry;
  edit: LibraryEdit;
  index: number;
}) {
  const t = useT();
  const labels = useLabels();
  const title = labels.title(entry.anime);
  const meta = STATUS_META[entry.status];
  const prefetch = usePrefetch(entry);

  return (
    <div className="reveal group/tile flex min-w-0 flex-col gap-1.5" style={{ "--i": index % 16 } as CSSProperties}>
      <Link
        to={animeHref(entry.anime)}
        {...prefetch}
        className="relative block aspect-[2/3] overflow-hidden rounded-xl ring-1 ring-border/50 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 hover:ring-primary/50"
      >
        <Poster entry={entry} className="absolute inset-0 transition-transform duration-500 group-hover/tile:scale-[1.04]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />

        <div className="absolute inset-x-1.5 top-1.5 flex items-start justify-between gap-1">
          <span
            className="inline-flex max-w-[70%] items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
            title={t(`status.${entry.status}`)}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
            <span className="truncate">{t(`status.${entry.status}`)}</span>
          </span>
          <div className="flex flex-col items-end gap-1">
            {entry.score != null && (
              <UserScore
                score={entry.score}
                className="rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm"
              />
            )}
            {entry.anime.score != null && (
              <span
                className="rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] tabular-nums text-white/80 backdrop-blur-sm"
                title="MyAnimeList"
              >
                {entry.anime.score.toFixed(1)}
              </span>
            )}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-2 pb-2.5">
          {entry.anime.airing === "AIRING" && (
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500/90 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white">
              <span className="size-1 animate-pulse rounded-full bg-white" />
              {t("airing.airingShort")}
            </span>
          )}
          <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-white">{title}</p>
          <p className="truncate text-[10px] text-white/65">{metaLine(entry, labels)}</p>
        </div>
        <ProgressLine entry={entry} className="absolute inset-x-0 bottom-0 h-[3px] rounded-none bg-white/15" />
      </Link>

      <div className="flex items-center justify-between gap-1">
        <ProgressStepper entry={entry} edit={edit} />
        <div className="flex items-center gap-0.5">
          {entry.notes && (
            <NotebookPenIcon className="size-3 text-primary" aria-label={t("library.notesLabel")} />
          )}
          <EntryMenu entry={entry} edit={edit} />
        </div>
      </div>
    </div>
  );
}

function relativeTime(iso: string, locale: string): string {
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, seconds] of steps) {
    if (Math.abs(diff) >= seconds) return rtf.format(Math.round(diff / seconds), unit);
  }
  return rtf.format(0, "minute");
}

/**
 * The list view: one line per title, table-like on wide screens so a long
 * list can be scanned by column — progress, your score, the site score.
 */
export function LibraryRow({
  entry,
  edit,
  index,
}: {
  entry: LibraryEntry;
  edit: LibraryEdit;
  index: number;
}) {
  const t = useT();
  const labels = useLabels();
  const { locale } = useLocale();
  const title = labels.title(entry.anime);
  const meta = STATUS_META[entry.status];
  const prefetch = usePrefetch(entry);
  const genres = entry.anime.genres.slice(0, 3).map(labels.genreLabel).join(", ");

  return (
    <div
      className="reveal group/row grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 border-b border-border/40 px-2 py-1.5 transition-colors hover:bg-card/60 md:grid-cols-[auto_minmax(0,1fr)_8.5rem_3rem_3rem_7.5rem_6.5rem_auto]"
      style={{ "--i": index % 16 } as CSSProperties}
    >
      <Link to={animeHref(entry.anime)} {...prefetch} className="relative row-span-2 md:row-span-1">
        <Poster entry={entry} className="h-14 w-10 rounded-md" />
        <span className={cn("absolute -left-0.5 -top-0.5 size-2 rounded-full ring-2 ring-background", meta.dot)} />
      </Link>

      <div className="min-w-0">
        <Link
          to={animeHref(entry.anime)}
          {...prefetch}
          className="block truncate text-sm font-medium transition-colors hover:text-primary"
        >
          {title}
        </Link>
        <p className="truncate text-[11px] text-muted-foreground">
          {metaLine(entry, labels)}
          {genres && <span className="hidden text-muted-foreground/70 lg:inline"> · {genres}</span>}
        </p>
        {entry.notes && (
          <p className="hidden truncate text-[11px] italic text-muted-foreground/80 md:block">
            «{entry.notes}»
          </p>
        )}
      </div>

      {/* Mobile: the menu stays top-right, the rest wraps to a second line. */}
      <EntryMenu entry={entry} edit={edit} className="md:hidden" />

      <div className="col-start-2 col-end-4 flex items-center gap-3 md:contents">
        <div className="flex flex-col gap-1 md:px-1">
          <ProgressStepper entry={entry} edit={edit} className="justify-center" />
          <ProgressLine entry={entry} className="hidden md:block" />
        </div>
        <div className="text-center text-xs">
          {entry.score != null ? <UserScore score={entry.score} className="font-semibold" /> : <span className="text-muted-foreground/40">—</span>}
        </div>
        <div className="text-center text-xs tabular-nums text-muted-foreground">
          {entry.anime.score?.toFixed(1) ?? "—"}
        </div>
        <span className={cn("inline-flex items-center gap-1.5 text-xs", meta.text)}>
          <meta.Icon className="size-3.5 shrink-0" />
          <span className="truncate">{t(`status.${entry.status}`)}</span>
        </span>
        <span className="hidden truncate text-[11px] text-muted-foreground md:block">
          {relativeTime(entry.updatedAt, locale)}
        </span>
        <EntryMenu entry={entry} edit={edit} className="hidden md:flex" />
      </div>
    </div>
  );
}

/** Column headings for the list view, wide screens only. */
export function LibraryRowHeader() {
  const t = useT();
  return (
    <div className="hidden grid-cols-[auto_minmax(0,1fr)_8.5rem_3rem_3rem_7.5rem_6.5rem_auto] gap-x-3 border-b border-border/60 px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
      <span className="w-10" />
      <span>{t("library.col.title")}</span>
      <span className="text-center">{t("library.col.progress")}</span>
      <span className="text-center">{t("library.col.myScore")}</span>
      <span className="text-center">{t("library.col.rating")}</span>
      <span>{t("library.col.status")}</span>
      <span>{t("library.col.updated")}</span>
      <span className="w-6" />
    </div>
  );
}

/**
 * What is being watched right now, next episode first — the one thing most
 * visits to this page are for, one click from done.
 */
export function ContinueStrip({ entries, edit }: { entries: LibraryEntry[]; edit: LibraryEdit }) {
  const t = useT();
  const labels = useLabels();
  if (entries.length === 0) return null;
  return (
    <section className="reveal flex flex-col gap-2" style={{ "--i": 2 } as CSSProperties}>
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
        {t("library.continueTitle")}
        <span className="text-xs font-normal text-muted-foreground">{entries.length}</span>
      </h2>
      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] sm:mx-0 sm:px-0">
        {entries.map((entry) => (
          <div
            key={entry.anime.id}
            className="group/cont relative flex w-64 shrink-0 snap-start items-center gap-2.5 overflow-hidden rounded-xl border border-border/60 bg-card/50 p-1.5 pr-2 transition-colors hover:border-emerald-500/40"
          >
            <Link to={animeHref(entry.anime)} className="shrink-0">
              <Poster entry={entry} className="h-16 w-11 rounded-lg" />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link
                to={animeHref(entry.anime)}
                className="truncate text-xs font-medium transition-colors hover:text-primary"
              >
                {labels.title(entry.anime)}
              </Link>
              <p className="text-[11px] text-muted-foreground">
                {t("library.nextEpisode", { n: entry.progress + 1 })}
                <span className="text-muted-foreground/60"> · {progressLabel(entry)}</span>
              </p>
              <ProgressLine entry={entry} />
            </div>
            <button
              type="button"
              onClick={() => edit.step(entry, 1)}
              aria-label={t("library.plusOne")}
              title={t("library.plusOne")}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 transition-all hover:bg-emerald-500 hover:text-white active:scale-90"
            >
              <PlusIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
