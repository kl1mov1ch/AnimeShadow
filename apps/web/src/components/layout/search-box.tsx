import type { AnimeSummary, SearchGroup } from "@animeshadow/shared";
import Fuse from "fuse.js";
import { ClockIcon, Loader2Icon, SearchIcon, SparklesIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useGenrePreferences, useGenres, useSmartSearch } from "@/lib/query";
import { cn } from "@/lib/utils";

type MatchMap = Map<number, ReadonlyArray<readonly [number, number]>>;

const RECENT_KEY = "animeshadow.recent.v1";
const RECENT_MAX = 6;
// Total rows across every result group combined, so the panel never needs
// its own scrollbar — "see all results" is the way to the rest.
const MAX_DROPDOWN_RESULTS = 6;

const MOOD_CHIPS: Array<{ ru: string; en: string }> = [
  { ru: "грустное", en: "sad" },
  { ru: "весёлое", en: "funny" },
  { ru: "экшен", en: "action" },
  { ru: "романтика", en: "romance" },
  { ru: "исекай", en: "isekai" },
  { ru: "про космос", en: "space" },
  { ru: "уютное", en: "cozy" },
  { ru: "детектив", en: "detective" },
];

function readRecent(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}
function pushRecent(term: string): string[] {
  const next = [term, ...readRecent().filter((x) => x !== term)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
function clearRecent(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}

/** The shortcut badge only ever claims what the platform actually uses. */
function shortcutLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl K";
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘ K" : "Ctrl K";
}

/** The same band of light the header's buttons sweep on hover — repeated
 * here (rather than imported from site-header, which imports this file)
 * so the search panel's own actions read as the same family of control. */
function Sheen({ tone = "primary" }: { tone?: "primary" | "light" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]",
        tone === "light" ? "via-white/45" : "via-primary/30",
      )}
    />
  );
}

export function SearchBox() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { status } = useAuth();
  const labels = useLabels();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAuthed = status === "authenticated";
  const { data: genres = [] } = useGenres();
  const { data: favoriteGenreIds = [] } = useGenrePreferences(isAuthed);
  const favoriteGenres = favoriteGenreIds
    .map((id) => genres.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => g != null)
    .slice(0, 4)
    .map((g) => ({ id: g.id, label: labels.genreLabel(g.name) }));

  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const debounced = useDebouncedValue(term.trim(), 220);

  useEffect(() => setRecent(readRecent()), []);
  useEffect(() => setOpen(false), [location.pathname]);

  // ⌘K / Ctrl+K focuses the field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const showResults = debounced.length >= 2;
  const { data, isFetching } = useSmartSearch(debounced, open && showResults);
  const matches = useTitleMatches(data?.flat ?? [], debounced);

  const submit = useCallback(
    (value: string) => {
      const q = value.trim();
      if (!q) return;
      setRecent(pushRecent(q));
      setOpen(false);
      inputRef.current?.blur();
      navigate(`/browse?q=${encodeURIComponent(q)}`);
    },
    [navigate],
  );

  const goToAnime = useCallback(
    (anime: AnimeSummary) => {
      if (term.trim()) setRecent(pushRecent(term.trim()));
      setOpen(false);
      inputRef.current?.blur();
      navigate(animeHref(anime));
    },
    [navigate, term],
  );

  const pick = (value: string) => {
    setTerm(value);
    inputRef.current?.focus();
    setOpen(true);
  };

  const pickGenre = (id: number) => {
    setOpen(false);
    inputRef.current?.blur();
    navigate(`/browse?genres=${id}`);
  };

  return (
    <div ref={rootRef} className="relative w-full min-w-0 sm:w-[min(360px,42vw)]">
      <Command
        shouldFilter={false}
        loop
        className="overflow-visible bg-transparent"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      >
        {/* A pill, like every other control in the header — and it earns the
            focus state rather than just outlining: the ring blooms, the
            glyph picks up the site colour, the shortcut badge steps aside
            for the clear button once there's something to clear. */}
        <div
          className={cn(
            "group relative flex items-center rounded-full border bg-card/70 transition-all duration-200",
            "focus-within:border-primary/50 focus-within:bg-card focus-within:shadow-lg focus-within:shadow-primary/10 focus-within:ring-4 focus-within:ring-primary/15",
            open ? "border-primary/30" : "border-border/60 hover:border-border",
          )}
        >
          <SearchIcon
            className={cn(
              "pointer-events-none absolute left-3 size-4 transition-all duration-200",
              "text-muted-foreground group-focus-within:scale-110 group-focus-within:text-primary",
            )}
          />
          <input
            ref={inputRef}
            type="search"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={t("search.placeholder")}
            aria-label={t("search.open")}
            className="h-10 w-full rounded-full bg-transparent pl-9 pr-16 text-sm outline-none placeholder:text-muted-foreground/80 [&::-webkit-search-cancel-button]:appearance-none"
          />

          <div className="absolute right-2 flex items-center gap-1">
            {isFetching && showResults && (
              <Loader2Icon className="size-3.5 animate-spin text-primary" />
            )}
            {term ? (
              <button
                type="button"
                onClick={() => {
                  setTerm("");
                  inputRef.current?.focus();
                }}
                aria-label={t("common.clear")}
                className="animate-in zoom-in-75 flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            ) : (
              // Only advertised while there's nothing typed — once you're
              // mid-query the shortcut is noise, not help.
              <kbd className="pointer-events-none hidden select-none rounded-md border border-border/70 bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/80 sm:inline-block">
                {shortcutLabel()}
              </kbd>
            )}
          </div>
        </div>

        {open && (
          // Same width as the input right above it, not a fixed size of its
          // own — a dropdown wider than what it hangs off of read as
          // visually disconnected from the search box.
          <div className="animate-in fade-in-0 slide-in-from-top-1 zoom-in-95 absolute left-0 right-0 top-full z-50 mt-2 w-full overflow-hidden rounded-2xl border border-border/60 bg-popover/95 text-popover-foreground shadow-xl shadow-black/20 backdrop-blur-md duration-200">
            {/* The header's own hairline, repeated — it's what marks a
                surface as belonging to the site rather than to the browser. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
            />
            {/* Tall enough that the now-capped result list (6 items) and the
                idle suggestions never actually need to scroll — the ceiling
                is a safety net, not the normal path. */}
            <CommandList className="max-h-[min(80vh,32rem)]">
              {!showResults ? (
                <IdleState
                  recent={recent}
                  onClearRecent={() => {
                    clearRecent();
                    setRecent([]);
                  }}
                  moods={MOOD_CHIPS.map((m) => (locale === "ru" ? m.ru : m.en))}
                  onPick={pick}
                  recentLabel={t("search.recent")}
                  clearLabel={t("common.clear")}
                  moodLabel={t("search.tryMood")}
                  favoriteGenres={favoriteGenres}
                  favoriteGenresLabel={t("search.forYou")}
                  onPickGenre={pickGenre}
                />
              ) : isFetching && !data ? (
                <LoadingRows />
              ) : data && data.flat.length > 0 ? (
                <>
                  {data.detectedGenres.length > 0 && (
                    <p className="flex items-center gap-1.5 px-3 pb-1 pt-3 text-xs text-muted-foreground">
                      <SparklesIcon className="size-3 text-primary" />
                      {t("search.detectedAs", {
                        genres: data.detectedGenres.join(", "),
                      })}
                    </p>
                  )}
                  {/* Capped across every group combined, not 6 per group —
                      a title match plus a character match plus a mood match
                      could otherwise add up to more rows than fit without
                      scrolling. The "see all" action below the list is the
                      way to the rest, on /browse. */}
                  {(() => {
                    const budgeted = budgetGroups(data.groups, MAX_DROPDOWN_RESULTS);
                    const shown = budgeted.reduce((n, g) => n + g.items.length, 0);
                    const hasMore = shown < data.flat.length;
                    return (
                      <>
                        {budgeted.map(({ group, items }, index) => (
                          <ResultGroup
                            key={`${group.reason}-${index}`}
                            group={group}
                            items={items}
                            heading={groupHeading(group, t)}
                            matches={matches}
                            onSelect={goToAnime}
                          />
                        ))}
                        <div className="p-2 pt-1">
                          <CommandItem
                            value="see-all"
                            onSelect={() => submit(term)}
                            className="group relative justify-center overflow-hidden rounded-full bg-gradient-to-r from-primary via-primary/85 to-primary py-2 text-center text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all duration-200 data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:shadow-lg data-[selected=true]:shadow-primary/40"
                          >
                            <SearchIcon className="relative z-10 text-primary-foreground!" />
                            <span className="relative z-10 truncate">
                              {hasMore
                                ? t("search.seeMore", { query: term.trim() })
                                : t("search.seeAll", { query: term.trim() })}
                            </span>
                            <Sheen tone="light" />
                          </CommandItem>
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : (
                <CommandEmpty>
                  <span className="flex flex-col items-center gap-1.5 py-2">
                    <span aria-hidden className="font-display text-2xl text-primary/30">
                      影
                    </span>
                    {isFetching ? `${t("search.searching")}…` : t("search.noMatches")}
                  </span>
                </CommandEmpty>
              )}
            </CommandList>
          </div>
        )}
      </Command>
    </div>
  );
}

/* ---------- pieces ---------- */

function LoadingRows() {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="animate-in fade-in slide-in-from-left-2 flex gap-2.5 duration-300"
          style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
        >
          <Skeleton className="h-12 w-[34px] rounded-md" />
          <div className="flex flex-1 flex-col gap-1.5 pt-1">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
      {children}
    </p>
  );
}

function IdleState({
  recent,
  onClearRecent,
  moods,
  onPick,
  recentLabel,
  clearLabel,
  moodLabel,
  favoriteGenres,
  favoriteGenresLabel,
  onPickGenre,
}: {
  recent: string[];
  onClearRecent: () => void;
  moods: string[];
  onPick: (value: string) => void;
  recentLabel: string;
  clearLabel: string;
  moodLabel: string;
  favoriteGenres: Array<{ id: number; label: string }>;
  favoriteGenresLabel: string;
  onPickGenre: (id: number) => void;
}) {
  // One running counter across all three sections, so the chips cascade in
  // as a single wave instead of three simultaneous ones.
  let order = 0;
  return (
    <div className="flex flex-col gap-3.5 p-3">
      {/* Three distinct sections, not one shared bucket — history is
          something you did, favourite genres and mood are things you might
          want, and mixing all three together made it unclear which chip
          would search for a phrase and which would jump straight to a
          genre. */}
      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>{recentLabel}</SectionLabel>
            <button
              type="button"
              onClick={onClearRecent}
              className="text-[11px] text-muted-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {clearLabel}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((value) => (
              <Chip key={value} index={order++} onClick={() => onPick(value)}>
                <ClockIcon className="size-3 shrink-0 opacity-70" />
                {value}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {favoriteGenres.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>{favoriteGenresLabel}</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {favoriteGenres.map((genre) => (
              <Chip
                key={genre.id}
                index={order++}
                accent
                onClick={() => onPickGenre(genre.id)}
              >
                <SparklesIcon className="size-3 shrink-0" />
                {genre.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <SectionLabel>{moodLabel}</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {moods.map((value) => (
            <Chip key={value} index={order++} onClick={() => onPick(value)}>
              {value}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

function Chip({
  children,
  onClick,
  index,
  accent = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  /** Position in the cascade — drives the entry delay, nothing else. */
  index: number;
  /** The "for you" chips, which jump straight to a genre rather than
   * filling the field, get the site colour so the difference is visible
   * before clicking rather than after. */
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${index * 25}ms`, animationFillMode: "backwards" }}
      className={cn(
        "group animate-in fade-in zoom-in-95 relative inline-flex items-center gap-1 overflow-hidden rounded-full border px-2.5 py-1 text-xs transition-all duration-200 hover:-translate-y-0.5",
        accent
          ? "border-primary/30 bg-primary/10 text-primary hover:border-primary/50 hover:bg-primary/15"
          : "border-border/60 bg-secondary/50 text-secondary-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      <span className="relative z-10 inline-flex items-center gap-1">{children}</span>
      <Sheen />
    </button>
  );
}

function ResultGroup({
  group,
  items,
  heading,
  matches,
  onSelect,
}: {
  group: SearchGroup;
  items: AnimeSummary[];
  heading: string;
  matches: MatchMap;
  onSelect: (anime: AnimeSummary) => void;
}) {
  const labels = useLabels();
  if (items.length === 0) return null;
  return (
    <CommandGroup heading={heading} className="[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide">
      {items.map((anime, i) => (
        <CommandItem
          key={anime.id}
          value={`${group.reason}-${anime.id}`}
          onSelect={() => onSelect(anime)}
          className="group animate-in fade-in slide-in-from-top-1 gap-2.5 rounded-xl py-1.5 duration-200 data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground data-[selected=true]:ring-1 data-[selected=true]:ring-primary/20"
          style={{ animationDelay: `${i * 30}ms`, animationFillMode: "backwards" }}
        >
          <span className="h-12 w-[34px] shrink-0 overflow-hidden rounded-md bg-muted">
            {anime.imageUrl && (
              <img
                src={imageSrc(anime.imageUrl)}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-110 group-data-[selected=true]:scale-110"
              />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Highlighted
              text={labels.title(anime)}
              ranges={matches.get(anime.id)}
              className="text-sm font-medium leading-snug"
            />
            <span className="truncate text-xs text-muted-foreground">
              {[labels.typeLabel(anime.type), labels.seasonYearLabel(anime)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/** Caps the TOTAL item count across every group combined (title, character,
 * mood, synopsis reasons can each contribute a group) so the dropdown always
 * shows a fixed, no-scroll handful — the rest lives behind "see all results". */
function budgetGroups(
  groups: SearchGroup[],
  max: number,
): Array<{ group: SearchGroup; items: AnimeSummary[] }> {
  let remaining = max;
  const out: Array<{ group: SearchGroup; items: AnimeSummary[] }> = [];
  for (const group of groups) {
    if (remaining <= 0) break;
    const items = group.items.slice(0, remaining);
    remaining -= items.length;
    out.push({ group, items });
  }
  return out;
}

function Highlighted({
  text,
  ranges,
  className,
}: {
  text: string;
  ranges: ReadonlyArray<readonly [number, number]> | undefined;
  className?: string;
}) {
  if (!ranges || ranges.length === 0) {
    return <span className={cn("truncate", className)}>{text}</span>;
  }
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={start}
        className="rounded-[3px] bg-primary/25 px-0.5 font-semibold text-foreground"
      >
        {text.slice(start, end + 1)}
      </mark>,
    );
    cursor = end + 1;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <span className={cn("truncate", className)}>{parts}</span>;
}

/* ---------- helpers ---------- */

function useTitleMatches(flat: AnimeSummary[], query: string): MatchMap {
  return useMemo(() => {
    const map: MatchMap = new Map();
    if (flat.length === 0 || query.length < 2) return map;
    const fuse = new Fuse(flat, {
      keys: ["title", "titleEnglish", "titleJapanese"],
      includeMatches: true,
      threshold: 0.45,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
    for (const result of fuse.search(query)) {
      const match = result.matches?.find((m) =>
        ["title", "titleEnglish", "titleJapanese"].includes(m.key ?? ""),
      );
      if (match?.indices?.length) {
        map.set(result.item.id, match.indices as ReadonlyArray<readonly [number, number]>);
      }
    }
    return map;
  }, [flat, query]);
}

function groupHeading(group: SearchGroup, t: ReturnType<typeof useI18n>["t"]): string {
  switch (group.reason) {
    case "title":
      return t("search.groupTitle");
    case "character":
      return t("search.groupCharacter", { name: group.label ?? "" });
    case "studio":
      return t("search.groupStudio", { name: group.label ?? "" });
    case "mood":
      return t("search.groupMood");
    case "synopsis":
      return t("search.groupSynopsis");
    default:
      return "";
  }
}
