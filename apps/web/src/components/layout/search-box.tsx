import type { AnimeSummary } from "@animeshadow/shared";
import { Loader2Icon, SearchIcon, SparklesIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  budgetGroups,
  clearRecent,
  groupHeading,
  IdleState,
  LoadingRows,
  MAX_DROPDOWN_RESULTS,
  MOOD_CHIPS,
  pushRecent,
  readRecent,
  ResultGroup,
  Sheen,
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
import { useGenrePreferences, useGenres, useSmartSearch } from "@/lib/query";
import { cn } from "@/lib/utils";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";

/**
 * The inline search in the header. ⌘K is deliberately NOT bound here: this
 * component is mounted twice (desktop and mobile), so a window listener in
 * it fired twice per press and focused the hidden copy. The shortcut belongs
 * to SearchCommandDialog, which is mounted exactly once in AppShell.
 */
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
  // The full hint ("title, character or a vibe") never fit a header-sized
  // field — it was cut off mid-word. Three short ones taking turns say the
  // same thing and each fits.
  const hints = [t("search.hintTitle"), t("search.hintCharacter"), t("search.hintMood")];
  const [hintIndex, setHintIndex] = useState(0);
  useEffect(() => {
    if (term) return;
    const id = setInterval(() => setHintIndex((i) => (i + 1) % 3), 3_200);
    return () => clearInterval(id);
  }, [term]);
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
            aria-label={t("search.open")}
            className="h-10 w-full rounded-full bg-transparent pl-9 pr-16 text-sm outline-none placeholder:text-muted-foreground/80 [&::-webkit-search-cancel-button]:appearance-none"
          />

          {!term && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-9 right-20 overflow-hidden text-sm text-muted-foreground/80"
            >
              {/* Keyed on the index, so each hint mounts fresh and plays its
                  own entrance — the swap reads as a gentle roll upward. */}
              <span
                key={hintIndex}
                className="animate-in fade-in slide-in-from-bottom-2 block truncate duration-500 motion-reduce:animate-none"
              >
                {hints[hintIndex]}
              </span>
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
                      <SlicedGlyph />
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
