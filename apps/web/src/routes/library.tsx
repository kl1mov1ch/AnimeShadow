import type { LibraryEntry, LibraryStatus } from "@animeshadow/shared";
import type { CSSProperties } from "react";
import {
  BookmarkIcon,
  LayoutGridIcon,
  ListIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimeGridSkeleton } from "@/components/anime/anime-grid";
import { EmptyState, ErrorState } from "@/components/common/states";
import { STATUSES, STATUS_META } from "@/components/library/library-meta";
import {
  ContinueStrip,
  LibraryRow,
  LibraryRowHeader,
  LibraryTile,
} from "@/components/library/library-views";
import { RandomPick } from "@/components/library/random-pick";
import { useLibraryEdit } from "@/components/library/use-library-edit";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { useLibrary } from "@/lib/query";
import { cn } from "@/lib/utils";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";

const VIEW_KEY = "animeshadow.library.view.v1";
const SORT_KEY = "animeshadow.library.sort.v1";

const SORTS = ["recent", "added", "title", "score", "rating", "progress", "year"] as const;
type SortKey = (typeof SORTS)[number];
type ViewMode = "grid" | "list";

const ALL_GENRES = "__all";

function readStored<T extends string>(key: string, fallback: T, valid: readonly T[]): T {
  try {
    const raw = localStorage.getItem(key);
    return valid.includes(raw as T) ? (raw as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — the choice just is not remembered */
  }
}

// The same key on both layouts, so a title typed with the wrong one active
// still matches — "ljrnjh" is "доктор".
const EN_KEYS = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./";
const RU_KEYS = "ёйцукенгшщзхъфывапролджэячсмитьбю.";

function swapLayout(text: string, from: string, to: string): string {
  let out = "";
  for (const ch of text) {
    const i = from.indexOf(ch);
    out += i >= 0 ? to[i] : ch;
  }
  return out;
}

/** Lowercase, and nothing but letters and digits: spacing stops mattering. */
function compact(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, "");
}

function matcher(query: string): ((entry: LibraryEntry) => boolean) | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const variants = [
    ...new Set([q, swapLayout(q, EN_KEYS, RU_KEYS), swapLayout(q, RU_KEYS, EN_KEYS)].map(compact)),
  ].filter(Boolean);
  if (variants.length === 0) return null;
  return (entry) => {
    const a = entry.anime;
    const haystack = [a.title, a.titleEnglish, a.titleJapanese, a.titleLocalized]
      .filter((s): s is string => Boolean(s))
      .map(compact);
    return variants.some((v) => haystack.some((h) => h.includes(v)));
  };
}

/** Rough watch time: a TV episode is ~24 minutes, a film about 100. */
function minutesWatched(entry: LibraryEntry): number {
  return entry.progress * (entry.anime.type === "MOVIE" ? 100 : 24);
}

export function Component() {
  const t = useT();
  const labels = useLabels();
  const { status: authStatus } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState(ALL_GENRES);
  const [sortBy, setSortBy] = useState<SortKey>(() => readStored(SORT_KEY, "recent", SORTS));
  const [view, setView] = useState<ViewMode>(() => readStored(VIEW_KEY, "grid", ["grid", "list"]));

  const rawStatus = searchParams.get("status");
  const activeStatus = STATUSES.includes(rawStatus as LibraryStatus)
    ? (rawStatus as LibraryStatus)
    : undefined;

  const isAuthed = authStatus === "authenticated";
  // The whole list, always: the tabs, the counts, the stats and the strip
  // all come from it, and filtering a few hundred rows locally is instant —
  // switching tabs never waits on the network.
  const { data: entries, isPending, isError, refetch } = useLibrary(undefined, isAuthed);
  const edit = useLibraryEdit();

  // "/" jumps to the search box, as on most sites with one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const all = useMemo(() => entries ?? [], [entries]);

  const counts = useMemo(() => {
    const out = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<LibraryStatus, number>;
    for (const e of all) out[e.status] += 1;
    return out;
  }, [all]);

  const stats = useMemo(() => {
    const scored = all.filter((e) => e.score != null);
    return {
      episodes: all.reduce((sum, e) => sum + e.progress, 0),
      hours: Math.round(all.reduce((sum, e) => sum + minutesWatched(e), 0) / 60),
      avgScore:
        scored.length > 0
          ? (scored.reduce((sum, e) => sum + (e.score ?? 0), 0) / scored.length).toFixed(1)
          : null,
      completed: counts.COMPLETED,
    };
  }, [all, counts]);

  /** The library's own genres, most common first — a filter that never comes up empty. */
  const genres = useMemo(() => {
    const tally = new Map<string, number>();
    for (const e of all) for (const g of e.anime.genres) tally.set(g, (tally.get(g) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [all]);

  const filtered = useMemo(() => {
    const match = matcher(query);
    const list = all.filter(
      (e) =>
        (!activeStatus || e.status === activeStatus) &&
        (genre === ALL_GENRES || e.anime.genres.includes(genre)) &&
        (!match || match(e)),
    );
    const byTitle = (a: LibraryEntry, b: LibraryEntry) =>
      labels.title(a.anime).localeCompare(labels.title(b.anime), labels.locale);
    const ratio = (e: LibraryEntry) =>
      e.anime.episodes ? e.progress / e.anime.episodes : e.progress > 0 ? 0.01 : 0;
    switch (sortBy) {
      case "title":
        return list.sort(byTitle);
      case "score":
        return list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || byTitle(a, b));
      case "rating":
        return list.sort((a, b) => (b.anime.score ?? -1) - (a.anime.score ?? -1));
      case "progress":
        return list.sort((a, b) => ratio(b) - ratio(a) || b.progress - a.progress);
      case "year":
        return list.sort((a, b) => (b.anime.year ?? 0) - (a.anime.year ?? 0));
      case "added":
        return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      default:
        return list.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    }
  }, [all, activeStatus, genre, query, sortBy, labels]);

  const continuing = useMemo(
    () =>
      all
        .filter(
          (e) =>
            e.status === "WATCHING" &&
            (!e.anime.episodes || e.progress < e.anime.episodes),
        )
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, 12),
    [all],
  );

  const planned = useMemo(() => all.filter((e) => e.status === "PLANNED"), [all]);

  if (authStatus === "loading") {
    return <AnimeGridSkeleton count={16} />;
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

  const setStatus = (next: LibraryStatus | "") => {
    const params = new URLSearchParams(searchParams);
    if (!next) params.delete("status");
    else params.set("status", next);
    setSearchParams(params, { replace: true });
  };

  const filtering = Boolean(query || activeStatus || genre !== ALL_GENRES);
  const total = all.length;

  return (
    <div className="reveal-group flex flex-col gap-4">
      {/* Header: the name of the page and what is in it, in one band. */}
      <header
        className="reveal relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5"
        style={{ "--i": 0 } as CSSProperties}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-2 -top-6 select-none font-display text-[7rem] leading-none text-foreground/[0.03]"
        >
          <SlicedGlyph />
        </span>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-primary">
            <BookmarkIcon className="size-4" />
            <span className="text-xs font-medium uppercase tracking-wide">{t("nav.library")}</span>
          </div>
          <h1 className="font-display text-2xl">{t("library.title")}</h1>
          {total === 0 && !isPending && (
            <p className="text-sm text-muted-foreground">{t("library.nothingTracked")}</p>
          )}
        </div>
        {total > 0 && (
          <dl className="relative grid grid-cols-5 gap-1 text-center sm:flex sm:gap-5">
            <Stat value={total} label={t("library.stats.titles")} />
            <Stat value={stats.episodes} label={t("library.stats.episodes")} />
            <Stat value={stats.hours} label={t("library.stats.hours")} />
            <Stat value={stats.completed} label={t("library.stats.completed")} />
            <Stat value={stats.avgScore ?? "—"} label={t("library.stats.avgScore")} accent />
          </dl>
        )}
      </header>

      {/* Status tabs. Each carries its colour and count, so the tabs double
          as a breakdown of the whole list. */}
      <nav
        className="reveal -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0"
        style={{ "--i": 1 } as CSSProperties}
        aria-label={t("library.col.status")}
      >
        <StatusTab label={t("common.all")} count={total} active={!activeStatus} onClick={() => setStatus("")} />
        {STATUSES.map((s) => (
          <StatusTab
            key={s}
            label={t(`status.${s}`)}
            count={counts[s]}
            active={activeStatus === s}
            dot={STATUS_META[s].dot}
            onClick={() => setStatus(activeStatus === s ? "" : s)}
          />
        ))}
      </nav>

      {!filtering && <ContinueStrip entries={continuing} edit={edit} />}

      {/* Toolbar */}
      <div className="reveal flex flex-wrap items-center gap-2" style={{ "--i": 3 } as CSSProperties}>
        <div className="group relative min-w-0 flex-1 basis-48 sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
            placeholder={t("library.searchPlaceholder")}
            title={t("library.searchShortcut")}
            className="h-10 w-full rounded-full border border-border/60 bg-card/70 pl-10 pr-9 text-sm outline-none transition-all duration-200 placeholder:text-muted-foreground/80 focus-visible:border-primary/50 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-primary/15"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("common.clear")}
              className="animate-in zoom-in-75 absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border/70 px-1.5 text-[10px] text-muted-foreground sm:block">
              /
            </kbd>
          )}
        </div>

        {genres.length > 1 && (
          <Select value={genre} onValueChange={setGenre}>
            <SelectTrigger
              className={cn(
                "h-10! w-[150px] rounded-full bg-card/70 text-sm",
                genre !== ALL_GENRES && "border-primary/50 text-primary",
              )}
              aria-label={t("library.allGenres")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value={ALL_GENRES}>{t("library.allGenres")}</SelectItem>
              {genres.map((g) => (
                <SelectItem key={g.name} value={g.name}>
                  {labels.genreLabel(g.name)}
                  <span className="ml-1 text-muted-foreground">{g.count}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={sortBy}
          onValueChange={(v) => {
            setSortBy(v as SortKey);
            store(SORT_KEY, v);
          }}
        >
          <SelectTrigger className="h-10! w-[160px] rounded-full bg-card/70 text-sm" aria-label={t("library.sortBy")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`library.sort.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <RandomPick planned={planned} shown={filtered} />
          {/* Two plain buttons in one pill rather than a ToggleGroup: its
              outline variant drew its own borders between and around the
              items, which fought the pill's and left the edges uneven. */}
          <div
            role="radiogroup"
            aria-label={t("library.viewGrid")}
            className="flex h-10 items-center gap-0.5 rounded-full border border-border/60 bg-card/70 p-1"
          >
            {(
              [
                ["grid", LayoutGridIcon, t("library.viewGrid")],
                ["list", ListIcon, t("library.viewList")],
              ] as const
            ).map(([mode, Icon, label]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={view === mode}
                aria-label={label}
                title={label}
                onClick={() => {
                  setView(mode);
                  store(VIEW_KEY, mode);
                }}
                className={cn(
                  "grid size-8 place-items-center rounded-full transition-all duration-200",
                  view === mode
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtering && filtered.length > 0 && (
        <p className="-mt-2 text-xs text-muted-foreground">
          {t("library.showing", { count: filtered.length })}
        </p>
      )}

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <AnimeGridSkeleton count={16} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={
            query || genre !== ALL_GENRES
              ? t("library.noSearchResults")
              : activeStatus
                ? t("library.emptyStatusTitle", { status: t(`status.${activeStatus}`) })
                : t("library.emptyTitle")
          }
          description={query || genre !== ALL_GENRES ? undefined : t("library.emptyBody")}
          action={
            query || genre !== ALL_GENRES ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setGenre(ALL_GENRES);
                }}
              >
                {t("common.clear")}
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link to="/browse">{t("common.browseCatalogue")}</Link>
              </Button>
            )
          }
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
          {filtered.map((entry, i) => (
            <LibraryTile key={entry.anime.id} entry={entry} edit={edit} index={i} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          <LibraryRowHeader />
          {filtered.map((entry, i) => (
            <LibraryRow key={entry.anime.id} entry={entry} edit={edit} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ value, label, accent }: { value: number | string; label: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center sm:items-end">
      <dd className={cn("font-display text-lg tabular-nums leading-none sm:text-xl", accent && "text-amber-400")}>
        {value}
      </dd>
      <dt className="mt-1 truncate text-[10px] leading-none text-muted-foreground sm:text-[11px]">{label}</dt>
    </div>
  );
}

function StatusTab({
  label,
  count,
  active,
  dot,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm transition-all duration-200",
        active
          ? "border-transparent bg-primary text-primary-foreground shadow-md shadow-primary/25"
          : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
    >
      {dot && <span className={cn("size-2 rounded-full", dot, active && "ring-2 ring-primary-foreground/60")} />}
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-xs tabular-nums",
          active ? "bg-primary-foreground/20" : "bg-foreground/5",
        )}
      >
        {count}
      </span>
    </button>
  );
}
