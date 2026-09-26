import type { LibraryEntry, LibraryStatus } from "@animeshadow/shared";
import type { AnimeType } from "@animeshadow/shared";
import {
  LayoutGridIcon,
  ListIcon,
  NotebookPenIcon,
  RadioIcon,
  RotateCcwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimeGridSkeleton } from "@/components/anime/anime-grid";
import { PaginationBar } from "@/components/common/pagination-bar";
import { SIDE_ASIDE, SIDE_CARD, SideItem, SideSelect, SideStat, SideToggle } from "@/components/common/side-panel";
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

const VIEW_KEY = "animeshadow.library.view.v1";
const SORT_KEY = "animeshadow.library.sort.v1";

const SORTS = ["recent", "added", "title", "score", "rating", "progress", "year"] as const;
type SortKey = (typeof SORTS)[number];
type ViewMode = "grid" | "list";

const ALL_GENRES = "__all";

/** Titles per page: a grid shows more at once than the list. */
const PER_PAGE = { grid: 42, list: 40 } as const;

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
  const [type, setType] = useState<AnimeType | null>(null);
  const [airingOnly, setAiringOnly] = useState(false);
  const [withNotes, setWithNotes] = useState(false);
  const [scoredOnly, setScoredOnly] = useState(false);
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

  /** The kinds of title in the library (TV, film, OVA…), most common first. */
  const types = useMemo(() => {
    const tally = new Map<AnimeType, number>();
    for (const e of all) tally.set(e.anime.type, (tally.get(e.anime.type) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const filtered = useMemo(() => {
    const match = matcher(query);
    const list = all.filter(
      (e) =>
        (!activeStatus || e.status === activeStatus) &&
        (genre === ALL_GENRES || e.anime.genres.includes(genre)) &&
        (!type || e.anime.type === type) &&
        (!airingOnly || e.anime.airing === "AIRING") &&
        (!withNotes || Boolean(e.notes)) &&
        (!scoredOnly || e.score != null) &&
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
  }, [all, activeStatus, genre, type, airingOnly, withNotes, scoredOnly, query, sortBy, labels]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE[view]));
  const page = Math.min(pageCount, Math.max(1, Number(searchParams.get("page")) || 1));
  const pageItems = filtered.slice((page - 1) * PER_PAGE[view], page * PER_PAGE[view]);

  // Any change to what is shown starts again from page one.
  const signature = JSON.stringify([query, genre, type, airingOnly, withNotes, scoredOnly, sortBy, activeStatus, view]);
  const lastSignature = useRef(signature);
  useEffect(() => {
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    if (searchParams.has("page")) {
      const next = new URLSearchParams(searchParams);
      next.delete("page");
      setSearchParams(next, { replace: true });
    }
  }, [signature, searchParams, setSearchParams]);

  // A new page starts at the top of the list.
  useEffect(() => {
    if (page > 1) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  const pageHref = (n: number) => {
    const next = new URLSearchParams(searchParams);
    if (n <= 1) next.delete("page");
    else next.set("page", String(n));
    const qs = next.toString();
    return qs ? `/library?${qs}` : "/library";
  };

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

  const narrowed = Boolean(genre !== ALL_GENRES || type || airingOnly || withNotes || scoredOnly);
  const filtering = Boolean(query || activeStatus || narrowed);
  const total = all.length;
  const resetFilters = () => {
    setGenre(ALL_GENRES);
    setType(null);
    setAiringOnly(false);
    setWithNotes(false);
    setScoredOnly(false);
    setQuery("");
  };

  /* The chips above the results: every filter in force, each removable. */
  const chips: Array<{ key: string; label: string; clear: () => void }> = [
    ...(activeStatus ? [{ key: "status", label: t(`status.${activeStatus}`), clear: () => setStatus("") }] : []),
    ...(genre !== ALL_GENRES ? [{ key: "genre", label: labels.genreLabel(genre), clear: () => setGenre(ALL_GENRES) }] : []),
    ...(type ? [{ key: "type", label: labels.typeLabel(type), clear: () => setType(null) }] : []),
    ...(airingOnly ? [{ key: "airing", label: t("library.side.airing"), clear: () => setAiringOnly(false) }] : []),
    ...(withNotes ? [{ key: "notes", label: t("library.side.withNotes"), clear: () => setWithNotes(false) }] : []),
    ...(scoredOnly ? [{ key: "scored", label: t("library.side.scored"), clear: () => setScoredOnly(false) }] : []),
    ...(query ? [{ key: "query", label: `«${query}»`, clear: () => setQuery("") }] : []),
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start xl:gap-6">
      {/* ------------------------------------------------------------ */}
      {/* The side panel: what is in the list, and every way to cut it. */}
      {/* ------------------------------------------------------------ */}
      <aside className={SIDE_ASIDE}>
        <div className={SIDE_CARD}>
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="font-display text-xl">{t("library.title")}</h1>
            <span className="text-xs tabular-nums text-muted-foreground">{total}</span>
          </div>
          {total === 0 && !isPending && <p className="text-sm text-muted-foreground">{t("library.nothingTracked")}</p>}
          {total > 0 && (
            <dl className="grid grid-cols-4 gap-1 rounded-xl bg-foreground/[0.03] p-2 text-center lg:grid-cols-2 lg:gap-2">
              <SideStat value={stats.episodes} label={t("library.stats.episodes")} />
              <SideStat value={stats.hours} label={t("library.stats.hours")} />
              <SideStat value={stats.completed} label={t("library.stats.completed")} />
              <SideStat value={stats.avgScore ?? "—"} label={t("library.stats.avgScore")} />
            </dl>
          )}

          <div className="group relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-foreground" />
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
              className="h-9 w-full rounded-lg border border-border/60 bg-background/60 pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-foreground/30"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("common.clear")}
                className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border/70 px-1.5 text-[10px] text-muted-foreground sm:block">
                /
              </kbd>
            )}
          </div>

          {/* The lists. Colour lives only in the marker. */}
          <nav aria-label={t("library.col.status")} className="-mx-1 flex gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] lg:flex-col lg:overflow-visible">
            <SideItem label={t("common.all")} count={total} active={!activeStatus} onClick={() => setStatus("")} />
            {STATUSES.map((s) => (
              <SideItem
                key={s}
                label={t(`status.${s}`)}
                count={counts[s]}
                active={activeStatus === s}
                dot={STATUS_META[s].dot}
                onClick={() => setStatus(activeStatus === s ? "" : s)}
              />
            ))}
          </nav>

          {/* What the list is made of, as one bar. */}
          {total > 0 && (
            <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full" aria-hidden>
              {STATUSES.filter((s) => counts[s] > 0).map((s) => (
                <span key={s} className={cn("h-full rounded-full opacity-80", STATUS_META[s].bar)} style={{ flexGrow: counts[s] }} />
              ))}
            </div>
          )}
        </div>

        {total > 0 && (
          <div className={cn(SIDE_CARD, "lg:flex-1")}>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <SlidersHorizontalIcon className="size-3.5" />
                {t("library.side.filters")}
              </span>
              {narrowed && (
                <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                  <RotateCcwIcon className="size-3" />
                  {t("library.side.reset")}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              <SideSelect
                label={t("library.side.genres")}
                value={genre === ALL_GENRES ? null : genre}
                anyLabel={t("library.allGenres")}
                options={genres.map((g) => ({ value: g.name, label: labels.genreLabel(g.name), count: g.count }))}
                onPick={(v) => setGenre(v ?? ALL_GENRES)}
              />
              <SideSelect
                label={t("library.side.type")}
                value={type}
                anyLabel={t("browse.anyShort")}
                options={types.map(([k, n]) => ({ value: k, label: labels.typeLabel(k), count: n }))}
                onPick={(v) => setType(v as AnimeType | null)}
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <SideToggle icon={RadioIcon} label={t("library.side.airing")} on={airingOnly} onClick={() => setAiringOnly((v) => !v)} />
              <SideToggle icon={StarIcon} label={t("library.side.scored")} on={scoredOnly} onClick={() => setScoredOnly((v) => !v)} />
              <SideToggle icon={NotebookPenIcon} label={t("library.side.withNotes")} on={withNotes} onClick={() => setWithNotes((v) => !v)} />
            </div>
          </div>
        )}
      </aside>

      {/* ------------------------------------------------------------ */}
      {/* The list itself.                                              */}
      {/* ------------------------------------------------------------ */}
      <div className="flex min-w-0 flex-col gap-4">
        {!filtering && <ContinueStrip entries={continuing} edit={edit} />}

        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{filtered.length}</span>
            {filtered.length !== total && <span className="tabular-nums"> / {total}</span>}
          </p>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              className="inline-flex max-w-[12rem] items-center gap-1 rounded-md border border-border/60 bg-card/50 px-2 py-0.5 text-xs transition-colors hover:border-foreground/30"
            >
              <span className="truncate">{c.label}</span>
              <XIcon className="size-3 shrink-0 text-muted-foreground" />
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <Select
              value={sortBy}
              onValueChange={(v) => {
                setSortBy(v as SortKey);
                store(SORT_KEY, v);
              }}
            >
              <SelectTrigger className="h-9! w-[150px] rounded-lg bg-card/50 text-sm" aria-label={t("library.sortBy")}>
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
            <RandomPick planned={planned} shown={filtered} />
            <div role="radiogroup" aria-label={t("library.viewGrid")} className="flex h-9 items-center gap-0.5 rounded-lg border border-border/60 bg-card/50 p-0.5">
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
                    "grid size-7 place-items-center rounded-md transition-colors",
                    view === mode ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : isPending ? (
          <AnimeGridSkeleton count={15} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              query || narrowed
                ? t("library.noSearchResults")
                : activeStatus
                  ? t("library.emptyStatusTitle", { status: t(`status.${activeStatus}`) })
                  : t("library.emptyTitle")
            }
            description={query || narrowed ? undefined : t("library.emptyBody")}
            action={
              query || narrowed ? (
                <Button variant="outline" onClick={resetFilters}>
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
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {pageItems.map((entry, i) => (
              <LibraryTile key={entry.anime.id} entry={entry} edit={edit} index={i} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col rounded-2xl border border-border/60 bg-card/30 p-1.5">
            <LibraryRowHeader />
            {pageItems.map((entry, i) => (
              <LibraryRow key={entry.anime.id} entry={entry} edit={edit} index={i} />
            ))}
          </div>
        )}

        {!isPending && !isError && pageCount > 1 && (
          <PaginationBar page={page} hasNextPage={page < pageCount} totalPages={pageCount} buildHref={pageHref} />
        )}
      </div>
    </div>
  );
}
