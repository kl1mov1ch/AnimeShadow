import type { AnimeSummary } from "@animeshadow/shared";
import { Loader2Icon, SearchIcon, SparklesIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  budgetGroups,
  clearRecent,
  groupHeading,
  IdleState,
  LoadingRows,
  MOOD_CHIPS,
  pushRecent,
  readRecent,
  ResultGroup,
  Sheen,
  useTitleMatches,
} from "@/components/layout/search-shared";
import {
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useI18n } from "@/i18n";
import { animeHref } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useGenrePreferences, useGenres, useSmartSearch } from "@/lib/query";

/** Room for eight in the palette — it's a full surface, not a dropdown
 *  hanging off a 360px field, so it can afford more than the header's six. */
const MAX_PALETTE_RESULTS = 8;

/**
 * ⌘K / Ctrl+K search, mounted exactly once in AppShell.
 *
 * The shortcut used to live in SearchBox, which the header renders twice
 * (desktop and mobile) — two window listeners for one keypress, one of them
 * focusing a field that was display:none at the time. Owning the shortcut
 * here means one listener, and a surface with room to actually show results
 * rather than a dropdown squeezed under a header field.
 */
export function SearchCommandDialog() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const labels = useLabels();
  const { status } = useAuth();

  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const debounced = useDebouncedValue(term.trim(), 220);

  const isAuthed = status === "authenticated";
  const { data: genres = [] } = useGenres();
  const { data: favoriteGenreIds = [] } = useGenrePreferences(isAuthed);
  const favoriteGenres = favoriteGenreIds
    .map((id) => genres.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => g != null)
    .slice(0, 4)
    .map((g) => ({ id: g.id, label: labels.genreLabel(g.name) }));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((wasOpen) => !wasOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A fresh query each time it opens — a palette that reopens holding the
  // last search reads as stale, and the history chips are right there.
  useEffect(() => {
    if (open) {
      setTerm("");
      setRecent(readRecent());
    }
  }, [open]);

  const showResults = debounced.length >= 2;
  const { data, isFetching } = useSmartSearch(debounced, open && showResults);
  const matches = useTitleMatches(data?.flat ?? [], debounced);

  const close = useCallback(() => setOpen(false), []);

  const submit = useCallback(
    (value: string) => {
      const q = value.trim();
      if (!q) return;
      setRecent(pushRecent(q));
      close();
      navigate(`/browse?q=${encodeURIComponent(q)}`);
    },
    [close, navigate],
  );

  const goToAnime = useCallback(
    (anime: AnimeSummary) => {
      if (term.trim()) setRecent(pushRecent(term.trim()));
      close();
      navigate(animeHref(anime));
    },
    [close, navigate, term],
  );

  const pickGenre = (id: number) => {
    close();
    navigate(`/browse?genres=${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        // `sm:` on the width deliberately: DialogContent's own base class is
        // `sm:max-w-lg`, and tailwind-merge treats a prefixed and an
        // unprefixed utility as different groups — an unprefixed `max-w-2xl`
        // here would simply lose to it from 640px up.
        className="top-[12%] translate-y-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogTitle className="sr-only">{t("search.open")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("search.placeholder")}
        </DialogDescription>

        <Command shouldFilter={false} loop className="bg-transparent">
          {/* The field is the top of the panel itself — no border-box within
              a border-box. Same glyph-and-bloom behaviour as the header's
              pill, scaled up for a surface you opened on purpose. */}
          <div className="group relative flex items-center border-b border-border/60 px-4">
            <SearchIcon className="pointer-events-none size-5 shrink-0 text-muted-foreground transition-colors duration-200 group-focus-within:text-primary" />
            <input
              autoFocus
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={t("search.placeholder")}
              aria-label={t("search.open")}
              className="h-14 w-full bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground/70"
            />
            <div className="flex shrink-0 items-center gap-1.5">
              {isFetching && showResults && (
                <Loader2Icon className="size-4 animate-spin text-primary" />
              )}
              {term && (
                <button
                  type="button"
                  onClick={() => setTerm("")}
                  aria-label={t("common.clear")}
                  className="animate-in zoom-in-75 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <XIcon className="size-4" />
                </button>
              )}
              <kbd className="pointer-events-none hidden select-none rounded-md border border-border/70 bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/80 sm:inline-block">
                ESC
              </kbd>
            </div>
          </div>

          <CommandList className="max-h-[min(68vh,34rem)]">
            {!showResults ? (
              <IdleState
                recent={recent}
                onClearRecent={() => {
                  clearRecent();
                  setRecent([]);
                }}
                moods={MOOD_CHIPS.map((m) => (locale === "ru" ? m.ru : m.en))}
                onPick={setTerm}
                recentLabel={t("search.recent")}
                clearLabel={t("common.clear")}
                moodLabel={t("search.tryMood")}
                favoriteGenres={favoriteGenres}
                favoriteGenresLabel={t("search.forYou")}
                onPickGenre={pickGenre}
              />
            ) : isFetching && !data ? (
              <LoadingRows count={5} />
            ) : data && data.flat.length > 0 ? (
              <>
                {data.detectedGenres.length > 0 && (
                  <p className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-xs text-muted-foreground">
                    <SparklesIcon className="size-3 text-primary" />
                    {t("search.detectedAs", {
                      genres: data.detectedGenres.join(", "),
                    })}
                  </p>
                )}
                {(() => {
                  const budgeted = budgetGroups(data.groups, MAX_PALETTE_RESULTS);
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
                          size="roomy"
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
                <span className="flex flex-col items-center gap-1.5 py-6">
                  <span aria-hidden className="font-display text-3xl text-primary/30">
                    影
                  </span>
                  {isFetching ? `${t("search.searching")}…` : t("search.noMatches")}
                </span>
              </CommandEmpty>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
