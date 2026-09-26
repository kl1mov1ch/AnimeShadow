import type { Genre } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import {
  BookmarkIcon,
  BookmarkPlusIcon,
  BuildingIcon,
  EyeOffIcon,
  ListFilterIcon,
  MinusIcon,
  PlayCircleIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SideCollapse, SideLabel, SideSelect, SideToggle } from "@/components/common/side-panel";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { AIRING_VALUES, TYPE_VALUES } from "@/lib/browse-params";
import { useLabels } from "@/lib/labels";
import type { BrowseParams } from "@/lib/query";
import { cn } from "@/lib/utils";

export type FilterPatch = Record<string, string | null>;

interface BrowseFiltersProps {
  params: BrowseParams;
  genres: Genre[];
  onChange: (patch: FilterPatch) => void;
  onReset: () => void;
  showReset: boolean;
}

const THIS_YEAR = new Date().getFullYear();

/** "At least" scores people actually pick. */
const SCORE_STEPS = [6, 7, 7.5, 8, 8.5, 9] as const;

/** Release periods, as one select instead of a two-thumb slider. */
const PERIODS: Array<{ key: string; label: string; from: number | null; to: number | null }> = [
  { key: "this", label: String(THIS_YEAR), from: THIS_YEAR, to: THIS_YEAR },
  { key: "last", label: String(THIS_YEAR - 1), from: THIS_YEAR - 1, to: THIS_YEAR - 1 },
  { key: "2020s", label: "2020-е", from: 2020, to: null },
  { key: "2010s", label: "2010-е", from: 2010, to: 2019 },
  { key: "2000s", label: "2000-е", from: 2000, to: 2009 },
  { key: "1990s", label: "1990-е", from: 1990, to: 1999 },
  { key: "old", label: "До 1990", from: null, to: 1989 },
];

/**
 * Episode-count presets. A range slider over 1–2000 is unusable at this
 * width — what people actually ask is "a film", "one season", "two", "a
 * long one", so those are the buttons.
 */
const EPISODE_PRESETS = [
  { key: "one", min: 1, max: 1 },
  { key: "short", min: 2, max: 13 },
  { key: "cour2", min: 14, max: 26 },
  { key: "long", min: 27, max: 100 },
  { key: "huge", min: 101, max: null },
] as const;

/**
 * The catalogue search box. It lives at the top of the side panel, above
 * the quick lists; the term reaches the URL after a short pause.
 */
export function BrowseSearch({ params, onChange }: { params: BrowseParams; onChange: (patch: FilterPatch) => void }) {
  const t = useT();
  const [term, setTerm] = useState(params.q ?? "");
  const debounced = useDebouncedValue(term.trim(), 250);
  useEffect(() => {
    if (debounced !== (params.q ?? "")) onChange({ q: debounced || null });
  }, [debounced, params.q, onChange]);
  useEffect(() => setTerm(params.q ?? ""), [params.q]);
  return (
    <div className="group relative">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-foreground" />
      <input
        id="browse-search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={t("browse.searchPlaceholder")}
        type="search"
        aria-label={t("browse.search")}
        className="h-9 w-full rounded-lg border border-border/60 bg-background/60 pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-foreground/30 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {term && (
        <button
          type="button"
          onClick={() => setTerm("")}
          aria-label={t("common.clear")}
          className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * The catalogue's filters, in the side panel (and a sheet on a phone):
 * selects two to a row, the two ranges, two switches, and genres as the
 * few you picked plus the most common — the full, searchable list opens
 * beside the panel. Genres are a three-way switch: tap once to require one,
 * again to rule it out, again to forget it.
 */
export function BrowseFilters({
  params,
  genres,
  onChange,
  onReset,
  showReset,
}: BrowseFiltersProps & { fill?: boolean }) {
  const t = useT();
  const labels = useLabels();
  const { status } = useAuth();
  const authed = status === "authenticated";

  const included = useMemo(() => new Set(params.genres ?? []), [params.genres]);
  const excluded = useMemo(() => new Set(params.excludeGenres ?? []), [params.excludeGenres]);
  const cycleGenre = (id: number) => {
    const inc = new Set(included);
    const exc = new Set(excluded);
    if (inc.has(id)) {
      inc.delete(id);
      exc.add(id);
    } else if (exc.has(id)) {
      exc.delete(id);
    } else {
      inc.add(id);
    }
    onChange({
      genres: inc.size > 0 ? [...inc].join(",") : null,
      excludeGenres: exc.size > 0 ? [...exc].join(",") : null,
    });
  };

  // Picked genres first, then the biggest shelves.
  const sortedGenres = useMemo(
    () =>
      [...genres].sort((a, b) => {
        const rank = (g: Genre) => (included.has(g.id) || excluded.has(g.id) ? 0 : 1);
        return rank(a) - rank(b) || (b.count ?? 0) - (a.count ?? 0);
      }),
    [genres, included, excluded],
  );
  const picked = included.size + excluded.size;
  // Filters that live under "Ещё": how many are on, for the badge.
  const secondary = [
    params.episodesMin != null || params.episodesMax != null,
    Boolean(params.studio),
    Boolean(params.minScore || params.maxScore != null),
    params.yearFrom != null || params.yearTo != null || Boolean(params.year),
    params.hasPlayer === true,
    params.hideListed === true,
  ].filter(Boolean).length;
  const periodKey =
    PERIODS.find((p) => (params.yearFrom ?? null) === p.from && (params.yearTo ?? null) === p.to)?.key ?? null;

  const episodePreset = EPISODE_PRESETS.find(
    (p) => (params.episodesMin ?? null) === p.min && (params.episodesMax ?? null) === p.max,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <SlidersHorizontalIcon className="size-3.5" />
          {t("browse.filters")}
        </span>
        {showReset && (
          <button type="button" onClick={onReset} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <RotateCcwIcon className="size-3" />
            {t("library.side.reset")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SideSelect
          label={t("browse.format")}
          value={params.type ?? null}
          anyLabel={t("browse.anyShort")}
          options={TYPE_VALUES.map((value) => ({ value, label: labels.typeLabel(value) }))}
          onPick={(type) => onChange({ type })}
        />
        <SideSelect
          label={t("browse.status")}
          value={params.airing ?? null}
          anyLabel={t("browse.anyShort")}
          options={AIRING_VALUES.map((value) => ({ value, label: labels.airingLabel(value) }))}
          onPick={(airing) => onChange({ airing })}
        />
        <div className="col-span-2 flex min-w-0 flex-col gap-1">
          <SideLabel
            aside={
              picked > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({ genres: null, excludeGenres: null })}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {t("common.clear")}
                </button>
              )
            }
          >
            {t("browse.genres")}
          </SideLabel>
          <AllGenres genres={sortedGenres} included={included} excluded={excluded} onCycle={cycleGenre} />
        </div>
      </div>

      <SideCollapse label={t("browse.moreFilters")} summary={null} badge={secondary} defaultOpen={secondary > 0}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
          <SideSelect
            label={t("browse.episodes")}
            value={episodePreset?.key ?? null}
            anyLabel={t("browse.anyLength")}
            options={EPISODE_PRESETS.map((p) => ({ value: p.key, label: t(`browse.episodePreset.${p.key}` as "browse.episodePreset.one") }))}
            onPick={(key) => {
              const preset = EPISODE_PRESETS.find((p) => p.key === key);
              onChange(
                preset
                  ? { episodesMin: String(preset.min), episodesMax: preset.max != null ? String(preset.max) : null }
                  : { episodesMin: null, episodesMax: null },
              );
            }}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <SideLabel>{t("browse.studio")}</SideLabel>
            <StudioPicker value={params.studio ?? null} onPick={(name) => onChange({ studio: name })} />
          </div>
          <SideSelect
            label={t("browse.scoreRange")}
            value={params.minScore ? String(params.minScore) : null}
            anyLabel={t("browse.anyScore")}
            options={SCORE_STEPS.map((v) => ({ value: String(v), label: t("browse.minScoreValue", { value: v }) }))}
            onPick={(v) => onChange({ minScore: v, maxScore: null })}
          />
          <SideSelect
            label={t("browse.yearRange")}
            value={periodKey}
            anyLabel={t("browse.anyYear")}
            options={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
            onPick={(key) => {
              const period = PERIODS.find((p) => p.key === key);
              onChange({
                year: null,
                yearFrom: period?.from != null ? String(period.from) : null,
                yearTo: period?.to != null ? String(period.to) : null,
              });
            }}
          />
          </div>
        <div className="flex flex-col gap-0.5">
          <SideToggle
            icon={PlayCircleIcon}
            label={t("browse.withPlayerShort")}
            on={params.hasPlayer === true}
            onClick={() => onChange({ hasPlayer: params.hasPlayer ? null : "1" })}
          />
          {authed && (
            <SideToggle
              icon={EyeOffIcon}
              label={t("browse.hideListedShort")}
              on={params.hideListed === true}
              onClick={() => onChange({ hideListed: params.hideListed ? null : "1" })}
            />
          )}
        </div>
          {authed && <SavedSets />}
        </div>
      </SideCollapse>
    </div>
  );
}

type GenreState = "in" | "out" | "off";

function GenreChip({ genre, state, onClick }: { genre: Genre; state: GenreState; onClick: () => void }) {
  const labels = useLabels();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={state !== "off"}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border py-0.5 pl-1 pr-1.5 text-[11px] transition-colors duration-200 active:scale-95",
        state === "in" && "border-foreground/40 bg-foreground/10 text-foreground",
        state === "out" && "border-rose-500/40 text-muted-foreground line-through decoration-rose-500/70",
        state === "off" && "border-border/60 text-foreground/80 hover:border-foreground/25",
      )}
    >
      <span
        className={cn(
          "grid size-3.5 place-items-center rounded-sm",
          state === "in" && "bg-primary text-primary-foreground",
          state === "out" && "bg-rose-500 text-white",
          state === "off" && "bg-foreground/10",
        )}
      >
        {state === "in" && <PlusIcon className="size-3" />}
        {state === "out" && <MinusIcon className="size-3" />}
      </span>
      {labels.genreLabel(genre.name)}
      {genre.count != null && genre.count > 0 && <span className="tabular-nums opacity-60">{genre.count}</span>}
    </button>
  );
}

/** Every genre, searchable, in a popover — the sidebar shows only what fits. */
function AllGenres({
  genres,
  included,
  excluded,
  onCycle,
}: {
  genres: Genre[];
  included: Set<number>;
  excluded: Set<number>;
  onCycle: (id: number) => void;
}) {
  const t = useT();
  const labels = useLabels();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? genres.filter((g) => labels.genreLabel(g.name).toLowerCase().includes(q)) : genres;
  const pickedNames = genres
    .filter((g) => included.has(g.id) || excluded.has(g.id))
    .map((g) => (excluded.has(g.id) ? "−" : "") + labels.genreLabel(g.name));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md border border-input bg-background/50 px-2.5 text-left text-xs transition-colors hover:border-foreground/25",
            pickedNames.length > 0 && "border-foreground/35",
          )}
        >
          <ListFilterIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {pickedNames.length > 0 ? pickedNames.join(", ") : t("browse.anyGenre")}
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{genres.length}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={16} className="flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2 p-3">
        <p className="text-[11px] leading-snug text-muted-foreground">{t("browse.genresHint")}</p>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("browse.genreSearch")}
          className="h-8 rounded-lg border border-border/60 bg-background/60 px-2.5 text-xs outline-none transition-colors focus:border-foreground/30"
        />
        <div className="flex max-h-[min(22rem,60dvh)] flex-wrap content-start gap-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {shown.map((genre) => (
            <GenreChip
              key={genre.id}
              genre={genre}
              state={included.has(genre.id) ? "in" : excluded.has(genre.id) ? "out" : "off"}
              onClick={() => onCycle(genre.id)}
            />
          ))}
          {shown.length === 0 && <p className="text-xs text-muted-foreground">{t("browse.noGenre")}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Studio names as you type, from the local catalogue. */
function StudioPicker({ value, onPick }: { value: string | null; onPick: (name: string | null) => void }) {
  const t = useT();
  const [text, setText] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  const q = useDebouncedValue(text.trim(), 200);
  useEffect(() => setText(value ?? ""), [value]);
  const { data } = useQuery({
    queryKey: ["studios", q],
    enabled: open && q.length >= 2,
    queryFn: ({ signal }) =>
      apiRequest<{ items: Array<{ name: string; count: number }> }>("/studios", {
        signal,
        query: { q },
      }).then((r) => r.items),
    staleTime: 10 * 60_000,
  });

  return (
    <div className="relative">
      <BuildingIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={t("browse.studioShort")}
        className={cn(
          "h-8 w-full min-w-0 rounded-md border border-input bg-background/50 pl-7 pr-2 text-xs outline-none transition-colors placeholder:text-muted-foreground hover:border-foreground/25 focus:border-foreground/40",
          value && "border-foreground/35",
        )}
      />
      {open && data && data.length > 0 && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 animate-in overflow-hidden rounded-lg border border-border bg-popover shadow-xl fade-in-0 slide-in-from-top-1">
          {data.map((studio) => (
            <button
              key={studio.name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(studio.name);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-foreground/[0.07]"
            >
              <span className="truncate">{studio.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{studio.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- saved filter sets ---------------- */

interface SavedSet {
  name: string;
  query: string;
}

function storageKey(userId: string) {
  return `as:browse-sets:${userId}`;
}

function readSets(userId: string): SavedSet[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed = raw ? (JSON.parse(raw) as SavedSet[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
  } catch {
    return [];
  }
}

/**
 * Filter combinations the viewer comes back to, picked from a select. Kept
 * in the browser, per account: they are a convenience for this person on
 * this device, not something worth a table.
 */
function SavedSets() {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? "anon";
  const [sets, setSets] = useState<SavedSet[]>(() => readSets(userId));
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const write = (next: SavedSet[]) => {
    setSets(next);
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch {
      // Storage blocked — the sets simply won't persist.
    }
  };

  const current = (() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("page");
    return params.toString();
  })();
  const active = sets.find((s) => s.query === current);

  const save = () => {
    const label = name.trim();
    if (!label || !current) return;
    write([{ name: label, query: current }, ...sets.filter((s) => s.name !== label)].slice(0, 12));
    setName("");
    setNaming(false);
  };

  const iconButton =
    "grid size-8 shrink-0 place-items-center rounded-md border border-input bg-background/50 text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Select
          value={active?.name ?? ""}
          onValueChange={(picked) => {
            const set = sets.find((s) => s.name === picked);
            if (set) navigate(`/browse?${set.query}`, { replace: true });
          }}
        >
          <SelectTrigger size="sm" className="min-w-0 flex-1 bg-background/50 text-xs" disabled={sets.length === 0}>
            <BookmarkIcon className="size-3.5" />
            <SelectValue placeholder={sets.length === 0 ? t("browse.savedNone") : t("browse.saved")} />
          </SelectTrigger>
          <SelectContent>
            {sets.map((set) => (
              <SelectItem key={set.name} value={set.name}>
                {set.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => setNaming((v) => !v)}
          disabled={!current}
          aria-label={t("browse.saveSet")}
          title={t("browse.saveSet")}
          className={iconButton}
        >
          <BookmarkPlusIcon className="size-3.5" />
        </button>
        {active && (
          <button
            type="button"
            onClick={() => write(sets.filter((s) => s !== active))}
            aria-label={t("common.delete")}
            title={t("common.delete")}
            className={iconButton}
          >
            <Trash2Icon className="size-3.5" />
          </button>
        )}
      </div>
      {naming && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex animate-in gap-1.5 fade-in-0 slide-in-from-top-1"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder={t("browse.setName")}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background/60 px-2 text-xs outline-none focus:border-foreground/40"
          />
          <button type="submit" className="btn-sheen rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground">
            OK
          </button>
        </form>
      )}
    </div>
  );
}
