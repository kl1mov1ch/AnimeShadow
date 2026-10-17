import type { AnimeSummary, CollectionSummary, UserCard } from "@animeshadow/shared";
import { Loader2Icon, SearchIcon, SparklesIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHeaderOverlay } from "@/hooks/use-header-overlay";
import { useLocation, useNavigate } from "react-router-dom";
import {
  budgetGroups,
  clearRecent,
  CollectionResults,
  PeopleResults,
  GenreResults,
  groupHeading,
  IdleState,
  LoadingRows,
  MAX_DROPDOWN_RESULTS,
  ModeSwitch,
  pushRecent,
  readRecent,
  ResultGroup,
  Sheen,
  type SearchMode,
  shortcutLabel,
  useTitleMatches,
} from "@/components/layout/search-shared";
import {
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useI18n } from "@/i18n";
import { animeHref } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { logSearch, useGenrePreferences, useGenres, useSearchPulse, useSmartSearch } from "@/lib/query";
import { cn } from "@/lib/utils";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";
import { ReactionMedia } from "@/components/common/states";
import { type ProfileModalTarget, UserProfileModal } from "@/components/user-profile-modal";

/**
 * The inline search in the header. ⌘K is deliberately NOT bound here: this
 * component is mounted twice (desktop and mobile), so a window listener in
 * it fired twice per press and focused the hidden copy. The shortcut belongs
 * to SearchCommandDialog, which is mounted exactly once in AppShell.
 */
export function SearchBox() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { status } = useAuth();
  const labels = useLabels();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAuthed = status === "authenticated";
  const [open, setOpen] = useState(false);
  useHeaderOverlay(open);
  // Genre chips only exist in the open dropdown — fetched on first open,
  // not on every page load.
  const [wasOpened, setWasOpened] = useState(false);
  if (open && !wasOpened) setWasOpened(true);
  const { data: genres = [] } = useGenres(wasOpened);
  const { data: favoriteGenreIds = [] } = useGenrePreferences(isAuthed && wasOpened);
  const { data: pulse } = useSearchPulse(wasOpened);
  const [mode, setMode] = useState<SearchMode>("anime");
  // A genre picked from the chips: its top titles show in the panel.
  const [genre, setGenre] = useState<{ id: number; label: string } | null>(null);
  const favoriteGenres = favoriteGenreIds
    .map((id) => genres.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => g != null)
    .slice(0, 4)
    .map((g) => ({ id: g.id, label: labels.genreLabel(g.name) }));

  const [term, setTerm] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const debounced = useDebouncedValue(term.trim(), 220);

  useEffect(() => setRecent(readRecent()), []);
  useEffect(() => setOpen(false), [location.pathname]);

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
  const { data, isFetching } = useSmartSearch(debounced, open && showResults && mode === "anime");
  const matches = useTitleMatches(data?.flat ?? [], debounced);

  const submit = useCallback(
    (value: string) => {
      const q = value.trim();
      if (!q || mode === "people") return;
      setRecent(pushRecent(q));
      setOpen(false);
      inputRef.current?.blur();
      if (mode === "collections") {
        navigate(`/collections?q=${encodeURIComponent(q)}`);
        return;
      }
      logSearch(q);
      navigate(`/browse?q=${encodeURIComponent(q)}`);
    },
    [navigate, mode],
  );

  const goToAnime = useCallback(
    (anime: AnimeSummary) => {
      if (term.trim()) {
        setRecent(pushRecent(term.trim()));
        logSearch(term);
      }
      setOpen(false);
      inputRef.current?.blur();
      navigate(animeHref(anime));
    },
    [navigate, term],
  );

  // A person opens as a preview card over the page.
  const [person, setPerson] = useState<ProfileModalTarget | null>(null);
  const goToPerson = (user: UserCard) => {
    setOpen(false);
        inputRef.current?.blur();
    // Always the preview first — the full profile is a button in it.
    setPerson({ id: user.id, username: user.username });
  };

  const goToCollection = (collection: CollectionSummary) => {
    setOpen(false);
    inputRef.current?.blur();
    navigate(`/collections/${collection.id}`);
  };


  const pick = (value: string) => {
    setTerm(value);
    inputRef.current?.focus();
    setOpen(true);
  };


  return (
    <div ref={rootRef} className="relative w-full min-w-0">
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
            "search-pill group relative flex items-center rounded-full border bg-card/60 transition-[border-color,background-color,box-shadow] duration-200",
            "focus-within:border-foreground/30 focus-within:bg-card focus-within:ring-2 focus-within:ring-ring/20",
            open ? "border-foreground/20" : "border-border/60 hover:border-foreground/20",
          )}
        >
          <SearchIcon
            className={cn(
              "pointer-events-none absolute left-3 size-4 transition-all duration-200",
              "text-muted-foreground group-focus-within:text-foreground",
            )}
          />
          <input
            ref={inputRef}
            type="search"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setGenre(null);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              // Enter with nothing picked in the list searches the phrase.
              if (event.key === "Enter" && term.trim().length >= 2 && !document.querySelector("[cmdk-item][data-selected=true]")) submit(term);
            }}
            aria-label={t("search.open")}
            className="h-9 w-full rounded-full bg-transparent pl-9 pr-16 text-sm outline-none placeholder:text-muted-foreground/80 [&::-webkit-search-cancel-button]:appearance-none"
          />

          {!term && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-9 right-20 overflow-hidden text-sm text-muted-foreground/80"
            >
              {mode === "anime" ? (
                <FloatingHint paused={open} />
              ) : (
                <span className="block truncate">{mode === "people" ? "Ник или имя человека" : t("search.hintCollections")}</span>
              )}
            </span>
          )}

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
                className="animate-in zoom-in-75 flex size-6 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            ) : (
              // Only advertised while there's nothing typed — once you're
              // mid-query the shortcut is noise, not help.
              <kbd className="pointer-events-none hidden select-none rounded-md border border-border/70 bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/80 xl:inline-block">
                {shortcutLabel()}
              </kbd>
            )}
          </div>
        </div>

        {open && (
          // Same width as the input right above it, not a fixed size of its
          // own — a dropdown wider than what it hangs off of read as
          // visually disconnected from the search box.
          <div className="animate-in fade-in-0 slide-in-from-top-1 zoom-in-95 absolute right-0 top-full z-50 mt-2 w-[min(32rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border/60 bg-popover/95 text-popover-foreground shadow-xl shadow-black/20 duration-200">
            {/* The header's own hairline, repeated — it's what marks a
                surface as belonging to the site rather than to the browser. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
            />
            {/* Tall enough that the now-capped result list (6 items) and the
                idle suggestions never actually need to scroll — the ceiling
                is a safety net, not the normal path. */}
            <div className="border-b border-border/50 p-2">
              <ModeSwitch mode={mode} onMode={setMode} />
            </div>
            <CommandList className="max-h-[min(80vh,32rem)]">
              {mode === "people" ? (
                <div className="p-1">
                  <PeopleResults term={debounced} onSelect={goToPerson} />
                </div>
              ) : mode === "collections" ? (
                <div className="p-1">
                  <CollectionResults term={debounced} onSelect={goToCollection} onSeeAll={submit} />
                </div>
              ) : !showResults && genre ? (
                <div className="p-1">
                  <GenreResults
                    genre={genre}
                    onSelect={goToAnime}
                    onBack={() => setGenre(null)}
                    onSeeAll={(id) => {
                      setOpen(false);
                      inputRef.current?.blur();
                      navigate(`/browse?genres=${id}`);
                    }}
                  />
                </div>
              ) : !showResults ? (
                <IdleState
                  recent={recent}
                  onClearRecent={() => {
                    clearRecent();
                    setRecent([]);
                  }}
                  onPick={pick}
                  pulse={pulse}
                  favoriteGenres={favoriteGenres}
                  onPickGenre={setGenre}
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
                            className="group relative justify-center overflow-hidden rounded-lg bg-gradient-to-r from-primary via-primary/85 to-primary py-2 text-center text-sm font-semibold text-primary-foreground shadow-md transition-all duration-200 data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:shadow-lg"
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
                  {isFetching ? (
                    <span className="block py-4 text-center text-sm text-muted-foreground">{t("search.searching")}…</span>
                  ) : (
                    <span className="flex items-center gap-3 px-3 py-3 text-left">
                      <ReactionMedia category="shrug" fallback={<span aria-hidden className="font-display text-2xl text-primary/30"><SlicedGlyph /></span>} className="!size-16 sm:!size-16" />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm font-semibold text-foreground">{t("search.noMatches")}</span>
                        <span className="text-xs text-muted-foreground">Проверьте написание или попробуйте другое название — японское, английское или сокращение.</span>
                      </span>
                    </span>
                  )}
                </CommandEmpty>
              )}
            </CommandList>
          </div>
        )}
      </Command>
      <UserProfileModal target={person} onOpenChange={(open) => !open && setPerson(null)} />
    </div>
  );
}

/** What one can type, shown in turn: a title, a genre, a studio, a year, a mood. */
const HINTS = [
  "Поиск аниме…",
  "«Магическая битва»",
  "исекай 2026",
  "студия MAPPA",
  "романтика в школе",
  "«Фрирен»",
  "что-то до 12 серий",
  "сёнэн с боями",
  "«Атака титанов»",
  "уютное повседневное",
];

/**
 * The search field's placeholder, alive: a word floats up, stays a few
 * seconds, floats away, the next comes up. Still while the field is in use
 * (and for anyone who asked their system for less motion).
 */
function FloatingHint({ paused }: { paused: boolean }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (paused || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % HINTS.length), 3200);
    return () => clearInterval(id);
  }, [paused]);
  const hint = HINTS[paused ? 0 : index]!;
  return (
    <span className="relative block h-5 overflow-hidden">
      <span key={hint} className="search-hint block truncate leading-5">
        {index === 0 || paused ? (
          hint
        ) : (
          <>
            <span className="hidden text-muted-foreground/60 xl:inline">Например, </span>
            <span className="text-foreground/75">{hint}</span>
          </>
        )}
      </span>
    </span>
  );
}
