import type { LibraryEntry } from "@animeshadow/shared";
import { type LibraryStatus, libraryStatusSchema } from "@animeshadow/shared";
import type { CSSProperties } from "react";
import {
  BookmarkIcon,
  CheckCircle2Icon,
  LayoutGridIcon,
  ListIcon,
  NotebookPenIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  SearchIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimeCard } from "@/components/anime/anime-card";
import { AnimeGridSkeleton } from "@/components/anime/anime-grid";
import { LibraryControls } from "@/components/anime/library-controls";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useLibrary, useLibrarySummary } from "@/lib/query";
import { cn } from "@/lib/utils";

const STATUSES = libraryStatusSchema.options;
const VIEW_KEY = "animeshadow.library.view.v1";
const SORT_KEY = "animeshadow.library.sort.v1";

const STATUS_ICON: Record<LibraryStatus, typeof PlayCircleIcon> = {
  WATCHING: PlayCircleIcon,
  PLANNED: BookmarkIcon,
  COMPLETED: CheckCircle2Icon,
  ON_HOLD: PauseCircleIcon,
  DROPPED: XCircleIcon,
};

type SortKey = "recent" | "title" | "score" | "progress";
type ViewMode = "grid" | "list";

function readStored<T extends string>(key: string, fallback: T, valid: readonly T[]): T {
  try {
    const raw = localStorage.getItem(key);
    return valid.includes(raw as T) ? (raw as T) : fallback;
  } catch {
    return fallback;
  }
}

export function Component() {
  const t = useT();
  const labels = useLabels();
  const { status: authStatus } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>(() =>
    readStored(SORT_KEY, "recent", ["recent", "title", "score", "progress"]),
  );
  const [view, setView] = useState<ViewMode>(() =>
    readStored(VIEW_KEY, "grid", ["grid", "list"]),
  );

  const rawStatus = searchParams.get("status");
  const activeStatus = STATUSES.includes(rawStatus as LibraryStatus)
    ? (rawStatus as LibraryStatus)
    : undefined;

  const isAuthed = authStatus === "authenticated";
  const { data: summary } = useLibrarySummary(isAuthed);
  const {
    data: entries,
    isPending,
    isError,
    refetch,
  } = useLibrary(activeStatus, isAuthed);

  const filtered = useMemo(() => {
    const list = entries ?? [];
    const q = query.trim().toLowerCase();
    const searched = q
      ? list.filter((e) => labels.title(e.anime).toLowerCase().includes(q))
      : list;

    const sorted = [...searched];
    switch (sortBy) {
      case "title":
        sorted.sort((a, b) => labels.title(a.anime).localeCompare(labels.title(b.anime), "ru"));
        break;
      case "score":
        sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
        break;
      case "progress":
        sorted.sort((a, b) => b.progress - a.progress);
        break;
      default:
        sorted.sort(
          (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
        );
    }
    return sorted;
  }, [entries, query, sortBy, labels]);

  if (authStatus === "loading") {
    return <AnimeGridSkeleton count={12} />;
  }

  if (!isAuthed) {
    return (
      <EmptyState
        title={t("library.signedOutTitle")}
        description={t("library.signedOutBody")}
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

  const setStatus = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (!next) params.delete("status");
    else params.set("status", next);
    setSearchParams(params, { replace: true });
  };

  const changeSort = (next: SortKey) => {
    setSortBy(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const changeView = (next: ViewMode) => {
    if (!next) return;
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const total = summary?.total ?? 0;

  return (
    <div className="reveal-group flex flex-col gap-6">
      <PageHeader
        title={t("library.title")}
        description={
          total > 0
            ? t("library.countTracked", { count: total })
            : t("library.nothingTracked")
        }
      />

      {/* Status dashboard — clickable stat cards double as the filter. */}
      <div className="reveal grid grid-cols-3 gap-2 sm:grid-cols-6">
        <StatCard
          label={t("common.all")}
          count={total}
          active={!activeStatus}
          onClick={() => setStatus("")}
        />
        {STATUSES.map((s) => (
          <StatCard
            key={s}
            label={t(`status.${s}`)}
            count={summary?.byStatus?.[s] ?? 0}
            active={activeStatus === s}
            Icon={STATUS_ICON[s]}
            onClick={() => setStatus(activeStatus === s ? "" : s)}
          />
        ))}
      </div>

      {/* Toolbar */}
      <div className="reveal flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("library.searchPlaceholder")}
            className="h-9 w-full rounded-md border border-border bg-transparent pl-8 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("common.cancel")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>

        <Select value={sortBy} onValueChange={(v) => changeSort(v as SortKey)}>
          <SelectTrigger className="h-9 w-[150px]" aria-label={t("library.sortBy")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">{t("library.sort.recent")}</SelectItem>
            <SelectItem value="title">{t("library.sort.title")}</SelectItem>
            <SelectItem value="score">{t("library.sort.score")}</SelectItem>
            <SelectItem value="progress">{t("library.sort.progress")}</SelectItem>
          </SelectContent>
        </Select>

        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => changeView(v as ViewMode)}
          variant="outline"
          className="ml-auto"
        >
          <ToggleGroupItem value="grid" aria-label={t("library.viewGrid")}>
            <LayoutGridIcon className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label={t("library.viewList")}>
            <ListIcon className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <AnimeGridSkeleton count={12} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={
            query
              ? t("library.noSearchResults")
              : activeStatus
                ? t("library.emptyStatusTitle", { status: t(`status.${activeStatus}`) })
                : t("library.emptyTitle")
          }
          description={query ? undefined : t("library.emptyBody")}
          action={
            !query && (
              <Button asChild variant="outline">
                <Link to="/browse">{t("common.browseCatalogue")}</Link>
              </Button>
            )
          }
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((entry, i) => (
            <div
              key={entry.anime.id}
              className="reveal flex flex-col gap-2"
              style={{ "--i": i % 12 } as CSSProperties}
            >
              <AnimeCard anime={entry.anime} />
              <EntryMeta entry={entry} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((entry, i) => (
            <LibraryRow key={entry.anime.id} entry={entry} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  count,
  active,
  Icon,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  Icon?: typeof PlayCircleIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border/60 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {Icon && <Icon className="size-4" />}
      <span className="font-display text-lg tabular-nums leading-none">{count}</span>
      <span className="text-[11px] leading-tight">{label}</span>
    </button>
  );
}

function ProgressBar({ entry }: { entry: LibraryEntry }) {
  const total = entry.anime.episodes ?? 0;
  if (total <= 0 || entry.progress <= 0) return null;
  const percent = Math.min(100, Math.round((entry.progress / total) * 100));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
    </div>
  );
}

function EntryMeta({ entry }: { entry: LibraryEntry }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1">
      <ProgressBar entry={entry} />
      <div className="flex items-center justify-between gap-2 text-xs">
        <Badge variant="secondary" className="font-normal">
          {t(`status.${entry.status}`)}
        </Badge>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {entry.notes && <NotebookPenIcon className="size-3 text-primary" />}
          {entry.score != null && (
            <span className="tabular-nums">{entry.score}/10</span>
          )}
        </div>
      </div>
    </div>
  );
}

function LibraryRow({ entry, index }: { entry: LibraryEntry; index: number }) {
  const labels = useLabels();
  const title = labels.title(entry.anime);
  const total = entry.anime.episodes ?? 0;

  return (
    <div
      className="reveal flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-3 sm:flex-row sm:items-center sm:gap-4"
      style={{ "--i": index % 12 } as CSSProperties}
    >
      <Link
        to={animeHref(entry.anime)}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
          {entry.anime.imageUrl ? (
            <img
              src={imageSrc(entry.anime.imageUrl)}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <PosterFallback title={title} seed={entry.anime.id} />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-medium hover:text-primary">{title}</p>
          <p className="text-xs text-muted-foreground">
            {total > 0
              ? `${entry.progress}/${total}`
              : entry.progress > 0
                ? String(entry.progress)
                : null}
          </p>
          <div className="w-40">
            <ProgressBar entry={entry} />
          </div>
          {entry.notes && (
            <p className="line-clamp-1 max-w-sm text-xs text-muted-foreground/80">
              «{entry.notes}»
            </p>
          )}
        </div>
      </Link>

      <div className="sm:ml-auto">
        <LibraryControls animeId={entry.anime.id} title={title} />
      </div>
    </div>
  );
}
