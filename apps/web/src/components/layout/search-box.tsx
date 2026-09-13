import type { AnimeSummary, SearchGroup } from "@animeshadow/shared";
import Fuse from "fuse.js";
import { ClockIcon, SearchIcon, XIcon } from "lucide-react";
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
import {animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useGenrePreferences, useGenres, useSmartSearch } from "@/lib/query";
import { cn } from "@/lib/utils";

type MatchMap = Map<number, ReadonlyArray<readonly [number, number]>>;

const RECENT_KEY = "animeshadow.recent.v1";
const RECENT_MAX = 6;
// Total rows across every result group combined, so the panel never needs
// its own scrollbar — "see all results" is the way to the rest.
const MAX_DROPDOWN_RESULTS = 8;

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
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
            className="h-9 w-full rounded-md border bg-card pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {term && (
            <button
              type="button"
              onClick={() => {
                setTerm("");
                inputRef.current?.focus();
              }}
              aria-label="Clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>

        {open && (
          // Same width as the input right above it, not a fixed size of its
          // own — a dropdown wider than what it hangs off of read as
          // visually disconnected from the search box.
          <div className="animate-in fade-in-0 zoom-in-95 absolute left-0 right-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg duration-150">
            <CommandList className="max-h-[min(70vh,26rem)]">
              {!showResults ? (
                <IdleState
                  recent={recent}
                  moods={MOOD_CHIPS.map((m) => (locale === "ru" ? m.ru : m.en))}
                  onPick={pick}
                  recentLabel={t("search.recent")}
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
                    <p className="px-3 pb-1 pt-2.5 text-xs text-muted-foreground">
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
                        <CommandGroup>
                          <CommandItem
                            value="see-all"
                            onSelect={() => submit(term)}
                            className="justify-center text-center font-medium text-primary"
                          >
                            <SearchIcon />
                            {hasMore
                              ? t("search.seeMore", { query: term.trim() })
                              : t("search.seeAll", { query: term.trim() })}
                          </CommandItem>
                        </CommandGroup>
                      </>
                    );
                  })()}
                </>
              ) : (
                <CommandEmpty>
                  {isFetching ? `${t("search.searching")}…` : t("search.noMatches")}
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
        <div key={i} className="flex gap-2.5">
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

function IdleState({
  recent,
  moods,
  onPick,
  recentLabel,
  moodLabel,
  favoriteGenres,
  favoriteGenresLabel,
  onPickGenre,
}: {
  recent: string[];
  moods: string[];
  onPick: (value: string) => void;
  recentLabel: string;
  moodLabel: string;
  favoriteGenres: Array<{ id: number; label: string }>;
  favoriteGenresLabel: string;
  onPickGenre: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {recent.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">{recentLabel}</p>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((value) => (
              <Chip key={value} onClick={() => onPick(value)}>
                <ClockIcon className="size-3" />
                {value}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {favoriteGenres.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">{favoriteGenresLabel}</p>
          <div className="flex flex-wrap gap-1.5">
            {favoriteGenres.map((genre) => (
              <Chip key={genre.id} onClick={() => onPickGenre(genre.id)}>
                {genre.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">{moodLabel}</p>
        <div className="flex flex-wrap gap-1.5">
          {moods.map((value) => (
            <Chip key={value} onClick={() => onPick(value)}>
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
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border bg-secondary/60 px-2.5 py-1 text-xs text-secondary-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      {children}
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
    <CommandGroup heading={heading}>
      {items.map((anime, i) => (
        <CommandItem
          key={anime.id}
          value={`${group.reason}-${anime.id}`}
          onSelect={() => onSelect(anime)}
          className="animate-in fade-in slide-in-from-top-1 gap-2.5 py-1.5 duration-200"
          style={{ animationDelay: `${i * 22}ms` }}
        >
          <span className="h-12 w-[34px] shrink-0 overflow-hidden rounded-md bg-muted">
            {anime.imageUrl && (
              <img
                src={imageSrc(anime.imageUrl)}
                alt=""
                loading="lazy"
                className="size-full object-cover"
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
      <mark key={start} className="rounded-[2px] bg-primary/25 text-foreground">
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
    case "mood":
      return t("search.groupMood");
    case "synopsis":
      return t("search.groupSynopsis");
    default:
      return "";
  }
}
