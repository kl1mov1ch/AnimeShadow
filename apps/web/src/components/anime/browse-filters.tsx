import type { Genre } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  BookmarkIcon,
  BookmarkPlusIcon,
  BuildingIcon,
  CheckIcon,
  ChevronUpIcon,
  EyeOffIcon,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { activeFilterCount, AIRING_VALUES, TYPE_VALUES } from "@/lib/browse-params";
import { useLabels } from "@/lib/labels";
import type { BrowseParams } from "@/lib/query";
import { cn } from "@/lib/utils";

export type FilterPatch = Record<string, string | null>;

const THIS_YEAR = new Date().getFullYear();

/** Age ratings as people read them in Russia, from the catalogue's MPAA-style ones. */
export const AGE_RATINGS = [
  { value: "g", label: "0+" },
  { value: "pg", label: "6+" },
  { value: "pg13", label: "12+" },
  { value: "r17", label: "16+" },
  { value: "rplus", label: "18+" },
];

/**
 * A section of the filters that folds: its title, a dot when something in
 * it is set, and the chips under it. The most used are open at first.
 */
function Fold({ title, defaultOpen = false, active, children }: { title: string; defaultOpen?: boolean; active: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen || active);
  return (
    <div className="flex flex-col gap-2 border-b border-border/40 pb-3 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-between gap-2 text-left text-[13px] font-semibold text-foreground/90 transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          {title}
          {active && <span className="size-1.5 rounded-full bg-primary" />}
        </span>
        <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && <div className="flex animate-in flex-col gap-3 duration-200 fade-in-0">{children}</div>}
    </div>
  );
}

/** "At least" scores people actually pick. */
export const SCORE_STEPS = [6, 7, 7.5, 8, 8.5, 9] as const;

/** Release periods, as one select instead of a two-thumb slider. */
export const PERIODS: Array<{ key: string; label: string; from: number | null; to: number | null }> = [
  { key: "this", label: String(THIS_YEAR), from: THIS_YEAR, to: THIS_YEAR },
  { key: "last", label: String(THIS_YEAR - 1), from: THIS_YEAR - 1, to: THIS_YEAR - 1 },
  { key: "2020s", label: "2020-е", from: 2020, to: null },
  { key: "2010s", label: "2010-е", from: 2010, to: 2019 },
  { key: "2000s", label: "2000-е", from: 2000, to: 2009 },
  { key: "1990s", label: "1990-е", from: 1990, to: 1999 },
  { key: "old", label: "До 1990", from: null, to: 1989 },
];

/** Episode counts as people ask for them: a film, a season, two, a long one. */
export const EPISODE_PRESETS = [
  { key: "one", min: 1, max: 1 },
  { key: "short", min: 2, max: 13 },
  { key: "cour2", min: 14, max: 26 },
  { key: "long", min: 27, max: 100 },
  { key: "huge", min: 101, max: null },
] as const;

/**
 * The catalogue search box, at the top of the page; the term reaches the
 * URL after a short pause.
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
      <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-foreground" />
      <input
        id="browse-search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={t("browse.searchPlaceholder")}
        type="search"
        aria-label={t("browse.search")}
        className="h-11 w-full rounded-xl border border-border/70 bg-card/60 pl-11 pr-10 text-sm outline-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-foreground/30 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/20 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {term && (
        <button
          type="button"
          onClick={() => setTerm("")}
          aria-label={t("common.clear")}
          className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Every filter, out in the open: each one a row of chips you tap — no
 * dropdown to open first, and what is on is lit. Tapping a lit chip turns
 * it off. The best-known genres are always on show (the rest a tap away),
 * with "нужны" and "исключить" as two clear modes. Beside the results on a
 * computer, in a sheet from the bottom on a phone; everything applies the
 * moment it is tapped.
 */
export function BrowseFilters({
  params,
  genres,
  onChange,
  onReset,
  heading = true,
}: {
  params: BrowseParams;
  genres: Genre[];
  onChange: (patch: FilterPatch) => void;
  onReset: () => void;
  /** Off inside the filter sheet, which has its own title and reset. */
  heading?: boolean;
  /** Kept for the sheet's call; the chips wrap to any width. */
  compact?: boolean;
}) {
  const t = useT();
  const labels = useLabels();
  const { status } = useAuth();
  const authed = status === "authenticated";
  const count = activeFilterCount(params);

  const periodKey =
    PERIODS.find((p) => (params.yearFrom ?? null) === p.from && (params.yearTo ?? null) === p.to)?.key ?? null;
  const episodePreset = EPISODE_PRESETS.find(
    (p) => (params.episodesMin ?? null) === p.min && (params.episodesMax ?? null) === p.max,
  );

  return (
    <div className="flex flex-col gap-3.5">
      <div className={cn("flex items-center justify-between gap-2", !heading && "hidden")}>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontalIcon className="size-4 text-primary" />
          {t("browse.filters")}
        </h2>
        {count > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex animate-in items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors fade-in-0 hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <RotateCcwIcon className="size-3.5" />
            {t("browse.resetCount", { count })}
          </button>
        )}
      </div>

      <Fold title="Тип и выход" defaultOpen active={Boolean(params.type || params.airing)}>
        <ChipGroup
          label="Тип"
          value={params.type ?? null}
          options={TYPE_VALUES.map((value) => ({ value, label: labels.typeLabel(value) }))}
          onPick={(type) => onChange({ type })}
        />
        <ChipGroup
          label="Выход"
          value={params.airing ?? null}
          options={AIRING_VALUES.map((value) => ({ value, label: labels.airingLabel(value) }))}
          onPick={(airing) => onChange({ airing })}
        />
      </Fold>
      <Fold title="Жанры" defaultOpen active={(params.genres?.length ?? 0) + (params.excludeGenres?.length ?? 0) > 0}>
        <GenrePicker params={params} genres={genres} onChange={onChange} />
      </Fold>
      <Fold title="Возраст и оценка" active={Boolean(params.rating || params.minScore)}>
        <ChipGroup
          label="Возрастной рейтинг"
          value={params.rating ?? null}
          options={AGE_RATINGS}
          onPick={(rating) => onChange({ rating })}
        />
        <ChipGroup
          label={t("browse.scoreRange")}
          value={params.minScore ? String(params.minScore) : null}
          options={SCORE_STEPS.map((v) => ({ value: String(v), label: `от ${v}` }))}
          onPick={(v) => onChange({ minScore: v, maxScore: null })}
        />
      </Fold>
      <Fold title="Год, длина, студия" active={Boolean(periodKey || episodePreset || params.studio)}>
      <ChipGroup
        label={t("browse.yearRange")}
        value={periodKey}
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
      <ChipGroup
        label={t("browse.episodes")}
        value={episodePreset?.key ?? null}
        options={EPISODE_PRESETS.map((p) => ({
          value: p.key,
          label: t(`browse.episodePreset.${p.key}` as "browse.episodePreset.one"),
        }))}
        onPick={(key) => {
          const preset = EPISODE_PRESETS.find((p) => p.key === key);
          onChange(
            preset
              ? { episodesMin: String(preset.min), episodesMax: preset.max != null ? String(preset.max) : null }
              : { episodesMin: null, episodesMax: null },
          );
        }}
      />
      <Field label={t("browse.studio")}>
        <StudioPicker value={params.studio ?? null} onPick={(name) => onChange({ studio: name })} />
      </Field>
      </Fold>

      <div className="flex flex-col gap-0.5 rounded-xl border border-border/50 bg-foreground/[0.02] px-2 py-1">
        <Switch
          icon={PlayCircleIcon}
          label="Показать и без плеера"
          on={params.allTitles === true}
          onClick={() => onChange({ all: params.allTitles ? null : "1", hasPlayer: null })}
        />
        {authed && (
          <Switch
            icon={EyeOffIcon}
            label={t("browse.hideListedShort")}
            on={params.hideListed === true}
            onClick={() => onChange({ hideListed: params.hideListed ? null : "1" })}
          />
        )}
      </div>

      {authed && (
        <Field label={t("browse.saved")}>
          <SavedSets />
        </Field>
      )}
    </div>
  );
}

export function Field({ label, aside, children }: { label: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

const CHIP =
  "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[12px] font-medium transition-[border-color,background-color,color] duration-200 active:scale-95";

function chipClass(state: "on" | "out" | "off"): string {
  return cn(
    CHIP,
    state === "on" && "border-primary/55 bg-primary/15 text-foreground shadow-sm shadow-primary/10",
    state === "out" && "border-rose-500/45 bg-rose-500/10 text-rose-200 line-through decoration-rose-400/70",
    state === "off" && "border-border/60 bg-card/40 text-foreground/80 hover:border-foreground/25 hover:text-foreground",
  );
}

/** One choice of a few, as chips; the lit one tapped again turns it off. */
export function ChipGroup({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string | null;
  options: Array<{ value: string; label: string }>;
  onPick: (value: string | null) => void;
}) {
  return (
    <Field
      label={label}
      aside={
        value && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="animate-in text-[11px] text-muted-foreground transition-colors fade-in-0 hover:text-foreground"
          >
            Любой
          </button>
        )
      }
    >
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(on ? null : o.value)}
              className={chipClass(on ? "on" : "off")}
            >
              {on && <CheckIcon className="size-3 animate-in zoom-in-50 text-primary duration-200" />}
              {o.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

export function Switch({
  icon: Icon,
  label,
  on,
  onClick,
}: {
  icon: typeof PlayCircleIcon;
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className="flex h-8 items-center gap-2.5 rounded-lg px-1 text-left text-[13px] text-foreground/85 transition-colors hover:text-foreground"
    >
      <Icon className={cn("size-4 shrink-0 transition-colors", on ? "text-primary" : "text-muted-foreground")} />
      <span className="flex-1 truncate">{label}</span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200", on ? "bg-primary" : "bg-foreground/15")}>
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform duration-200",
            on ? "translate-x-[1.125rem]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** Genres never offered as a filter: hentai is not on the site at all. */
const HIDDEN_GENRES = new Set(["Хентай", "Hentai", "Эротика", "Erotica"]);
/** How many of the best-known genres are always on show. */
const GENRES_SHOWN = 12;

/**
 * Genres as chips: the sixteen best-known always on show (Этти among them),
 * the rest a tap away with a search. "Нужны" and "Исключить" are two clear
 * modes — a tap adds the genre to whichever is on; a lit genre tapped again
 * comes off. Every chosen genre has to be there, not any one of them.
 */
export function GenrePicker({
  params,
  genres,
  onChange,
}: {
  params: BrowseParams;
  genres: Genre[];
  onChange: (patch: FilterPatch) => void;
}) {
  const t = useT();
  const labels = useLabels();
  const [all, setAll] = useState(false);
  const [mode, setMode] = useState<"in" | "out">("in");
  const [query, setQuery] = useState("");
  const included = useMemo(() => new Set(params.genres ?? []), [params.genres]);
  const excluded = useMemo(() => new Set(params.excludeGenres ?? []), [params.excludeGenres]);
  const picked = included.size + excluded.size;

  const offered = useMemo(
    () => genres.filter((g) => (g.count ?? 0) > 0 && !HIDDEN_GENRES.has(g.name)).sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
    [genres],
  );

  const write = (inc: Set<number>, exc: Set<number>) =>
    onChange({
      genres: inc.size > 0 ? [...inc].join(",") : null,
      excludeGenres: exc.size > 0 ? [...exc].join(",") : null,
    });
  const toggle = (id: number) => {
    const inc = new Set(included);
    const exc = new Set(excluded);
    if (inc.has(id) || exc.has(id)) {
      inc.delete(id);
      exc.delete(id);
    } else if (mode === "in") inc.add(id);
    else exc.add(id);
    write(inc, exc);
  };

  const q = query.trim().toLowerCase();
  const shown = all
    ? offered.filter((g) => !q || labels.genreLabel(g.name).toLowerCase().includes(q))
    : [
        ...offered.slice(0, GENRES_SHOWN),
        // A picked genre stays in view even when it is not a top one.
        ...offered.slice(GENRES_SHOWN).filter((g) => included.has(g.id) || excluded.has(g.id)),
      ];
  const more = offered.length - GENRES_SHOWN;

  return (
    <Field
      label={picked > 0 ? `Выбрано: ${picked}` : "Выберите один или несколько"}
      aside={
        picked > 0 && (
          <button
            type="button"
            onClick={() => onChange({ genres: null, excludeGenres: null })}
            className="animate-in text-[11px] text-muted-foreground transition-colors fade-in-0 hover:text-foreground"
          >
            {t("common.clear")}
          </button>
        )
      }
    >
      <div role="radiogroup" aria-label="Что делать с жанром" className="grid grid-cols-2 rounded-lg bg-foreground/[0.06] p-0.5">
        {(["in", "out"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "h-7 rounded-md px-2 text-xs font-medium transition-colors",
              mode === value
                ? value === "in"
                  ? "bg-card text-foreground shadow-sm"
                  : "bg-rose-500/20 text-rose-200 shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "in" ? "Нужны" : "Исключить"}
          </button>
        ))}
      </div>
      {all && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("browse.genreSearch")}
          className="h-9 animate-in rounded-lg border border-border/70 bg-background/60 px-3 text-sm outline-none transition-colors fade-in-0 focus:border-foreground/30"
        />
      )}
      <div className={cn("flex flex-wrap content-start gap-1", all && "max-h-64 overflow-y-auto pr-0.5 [scrollbar-width:thin]")}>
        {shown.map((genre) => {
          const state = included.has(genre.id) ? "on" : excluded.has(genre.id) ? "out" : "off";
          return (
            <button
              key={genre.id}
              type="button"
              onClick={() => toggle(genre.id)}
              aria-pressed={state !== "off"}
              title={state === "off" ? (mode === "in" ? "Добавить" : "Исключить") : t("browse.genreRemove")}
              className={chipClass(state)}
            >
              {state === "on" && <CheckIcon className="size-3 animate-in zoom-in-50 text-primary duration-200" />}
              {state === "out" && <MinusIcon className="size-3 animate-in zoom-in-50 duration-200" />}
              {labels.genreLabel(genre.name)}
            </button>
          );
        })}
        {shown.length === 0 && <p className="text-xs text-muted-foreground">{t("browse.noGenre")}</p>}
        {more > 0 && (
          <button
            type="button"
            onClick={() => {
              setAll((v) => !v);
              setQuery("");
            }}
            className={cn(CHIP, "border-dashed border-border/70 text-muted-foreground hover:border-foreground/30 hover:text-foreground")}
          >
            {all ? (
              <>
                <ChevronUpIcon className="size-3.5" />
                Свернуть
              </>
            ) : (
              <>
                <PlusIcon className="size-3.5" />
                Ещё {more}
              </>
            )}
          </button>
        )}
      </div>
    </Field>
  );
}

/** Studio names as you type, from the local catalogue. */
export function StudioPicker({ value, onPick }: { value: string | null; onPick: (name: string | null) => void }) {
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
      <BuildingIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
          "h-10 w-full min-w-0 rounded-lg border border-border/70 bg-card/60 pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-foreground/20 focus:border-foreground/30",
          value && "text-foreground",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onPick(null)}
          aria-label={t("common.clear")}
          className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
      {open && data && data.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 animate-in overflow-hidden rounded-lg border border-border/70 bg-popover shadow-lg shadow-black/30 fade-in-0 slide-in-from-top-1">
          {data.map((studio) => (
            <button
              key={studio.name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(studio.name);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-foreground/[0.07]"
            >
              <span className="truncate">{studio.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{studio.count}</span>
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
export function SavedSets() {
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
    "grid size-10 shrink-0 place-items-center rounded-lg border border-border/70 bg-card/60 text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Select
          value={active?.name ?? ""}
          onValueChange={(picked) => {
            const set = sets.find((s) => s.name === picked);
            if (set) navigate(`/browse?${set.query}`, { replace: true });
          }}
        >
          <SelectTrigger className="h-10 min-w-0 flex-1" disabled={sets.length === 0}>
            <BookmarkIcon className="size-4" />
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
          <BookmarkPlusIcon className="size-4" />
        </button>
        {active && (
          <button
            type="button"
            onClick={() => write(sets.filter((s) => s !== active))}
            aria-label={t("common.delete")}
            title={t("common.delete")}
            className={iconButton}
          >
            <Trash2Icon className="size-4" />
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
            className="h-10 min-w-0 flex-1 rounded-lg border border-border/70 bg-card/60 px-3 text-sm outline-none focus:border-foreground/30"
          />
          <button type="submit" className="rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">
            OK
          </button>
        </form>
      )}
    </div>
  );
}
