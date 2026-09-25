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
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
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

const YEAR_MIN = 1960;
const YEAR_MAX = new Date().getFullYear() + 1;

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
      {children}
    </p>
  );
}

function Pill({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "btn-sheen inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25"
          : "border-primary/20 bg-primary/5 text-muted-foreground hover:border-primary/50 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ClearLink({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] font-medium text-primary/80 transition-colors hover:text-primary"
    >
      {t("common.clear")}
    </button>
  );
}

/**
 * The catalogue's filters: a sticky sidebar card as tall as the screen (and
 * a sheet on a phone).
 *
 * It used to be a tall column of pill rows that scrolled inside itself — the
 * page scrolled, the sidebar scrolled, and half the filters were always out
 * of sight. Now the single-choice filters are selects, two to a row, the
 * ranges are one line each, and genres take whatever height is left, with
 * the full searchable list one click away. Nothing inside scrolls.
 *
 * Genres are still a three-way switch — tap once to require it, again to
 * rule it out, again to forget it — because "no ecchi" is as common a wish
 * as "romance".
 */
export function BrowseFilters({
  params,
  genres,
  onChange,
  onReset,
  showReset,
  fill = false,
}: BrowseFiltersProps & {
  /** Fill the height it is given (the sticky sidebar) instead of growing. */
  fill?: boolean;
}) {
  const t = useT();
  const labels = useLabels();
  const { status } = useAuth();
  const authed = status === "authenticated";

  const [term, setTerm] = useState(params.q ?? "");
  const debounced = useDebouncedValue(term.trim(), 250);
  useEffect(() => {
    if (debounced !== (params.q ?? "")) onChange({ q: debounced || null });
  }, [debounced, params.q, onChange]);
  useEffect(() => setTerm(params.q ?? ""), [params.q]);

  // Sliders move locally and commit on release, so dragging doesn't fire a
  // request (and a history entry) per pixel.
  const [score, setScore] = useState<[number, number]>([params.minScore ?? 0, params.maxScore ?? 10]);
  useEffect(() => setScore([params.minScore ?? 0, params.maxScore ?? 10]), [params.minScore, params.maxScore]);
  const [years, setYears] = useState<[number, number]>([
    params.yearFrom ?? YEAR_MIN,
    params.yearTo ?? YEAR_MAX,
  ]);
  useEffect(
    () => setYears([params.yearFrom ?? YEAR_MIN, params.yearTo ?? YEAR_MAX]),
    [params.yearFrom, params.yearTo],
  );

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

  const episodePreset = EPISODE_PRESETS.find(
    (p) => (params.episodesMin ?? null) === p.min && (params.episodesMax ?? null) === p.max,
  );
  const picked = included.size + excluded.size;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3.5",
        fill && "h-full min-h-0",
      )}
    >
      <div className="group relative flex shrink-0 items-center rounded-lg border border-primary/25 bg-card/70 transition-all duration-200 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
        <SearchIcon className="pointer-events-none absolute left-3 size-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <input
          id="browse-search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t("browse.searchPlaceholder")}
          type="search"
          aria-label={t("browse.search")}
          className="h-9 w-full bg-transparent pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground/80 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {term && (
          <button
            type="button"
            onClick={() => setTerm("")}
            aria-label={t("common.clear")}
            className="absolute right-2 grid size-6 animate-in place-items-center rounded-md text-muted-foreground zoom-in-75 hover:bg-primary/15 hover:text-primary"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>

      {authed && <SavedSets />}

      <div className="grid shrink-0 grid-cols-2 gap-x-2 gap-y-2.5">
        <Field label={t("browse.format")}>
          <PickSelect
            value={params.type ?? null}
            anyLabel={t("browse.anyShort")}
            options={TYPE_VALUES.map((value) => ({ value, label: labels.typeLabel(value) }))}
            onPick={(type) => onChange({ type })}
          />
        </Field>
        <Field label={t("browse.status")}>
          <PickSelect
            value={params.airing ?? null}
            anyLabel={t("browse.anyShort")}
            options={AIRING_VALUES.map((value) => ({ value, label: labels.airingLabel(value) }))}
            onPick={(airing) => onChange({ airing })}
          />
        </Field>
        <Field label={t("browse.episodes")}>
          <PickSelect
            value={episodePreset?.key ?? null}
            anyLabel={t("browse.anyLength")}
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
        </Field>
        <Field label={t("browse.studio")}>
          <StudioPicker value={params.studio ?? null} onPick={(name) => onChange({ studio: name })} />
        </Field>
      </div>

      <Range label={t("browse.scoreRange")} value={`${score[0].toFixed(1)} – ${score[1].toFixed(1)}`}>
        <Slider
          value={score}
          min={0}
          max={10}
          step={0.5}
          minStepsBetweenThumbs={1}
          onValueChange={(v) => setScore([v[0] ?? 0, v[1] ?? 10])}
          onValueCommit={(v) =>
            onChange({
              minScore: v[0] && v[0] > 0 ? String(v[0]) : null,
              maxScore: v[1] != null && v[1] < 10 ? String(v[1]) : null,
            })
          }
          aria-label={t("browse.scoreRange")}
        />
      </Range>

      <Range label={t("browse.yearRange")} value={`${years[0]} – ${years[1]}`}>
        <Slider
          value={years}
          min={YEAR_MIN}
          max={YEAR_MAX}
          step={1}
          onValueChange={(v) => setYears([v[0] ?? YEAR_MIN, v[1] ?? YEAR_MAX])}
          onValueCommit={(v) =>
            onChange({
              year: null,
              yearFrom: v[0] != null && v[0] > YEAR_MIN ? String(v[0]) : null,
              yearTo: v[1] != null && v[1] < YEAR_MAX ? String(v[1]) : null,
            })
          }
          aria-label={t("browse.yearRange")}
        />
      </Range>

      <div className={cn("grid shrink-0 gap-1.5", authed ? "grid-cols-2" : "grid-cols-1")}>
        <Pill active={params.hasPlayer === true} onClick={() => onChange({ hasPlayer: params.hasPlayer ? null : "1" })}>
          <PlayCircleIcon className="size-3.5 shrink-0" />
          <span className="truncate">{t("browse.withPlayerShort")}</span>
        </Pill>
        {authed && (
          <Pill active={params.hideListed === true} onClick={() => onChange({ hideListed: params.hideListed ? null : "1" })}>
            <EyeOffIcon className="size-3.5 shrink-0" />
            <span className="truncate">{t("browse.hideListedShort")}</span>
          </Pill>
        )}
      </div>

      {/* Genres take the rest of the card. What doesn't fit fades out under
          the "all genres" button rather than scrolling inside the sidebar. */}
      <div className={cn("flex flex-col gap-2", fill && "min-h-0 flex-1")}>
        <div className="flex min-h-5 items-center justify-between gap-2">
          <SectionLabel>
            {t("browse.genres")}
            {picked > 0 && <span className="ml-1.5 text-primary">· {picked}</span>}
          </SectionLabel>
          {picked > 0 && <ClearLink onClick={() => onChange({ genres: null, excludeGenres: null })} />}
        </div>
        <div
          className={cn(
            "flex flex-wrap content-start gap-1.5",
            fill && "min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_80%,transparent)]",
          )}
        >
          {(fill ? sortedGenres : sortedGenres.slice(0, 18)).map((genre) => (
            <GenreChip
              key={genre.id}
              genre={genre}
              state={included.has(genre.id) ? "in" : excluded.has(genre.id) ? "out" : "off"}
              onClick={() => cycleGenre(genre.id)}
            />
          ))}
        </div>
        <AllGenres genres={sortedGenres} included={included} excluded={excluded} onCycle={cycleGenre} />
      </div>

      {showReset && (
        <button
          type="button"
          onClick={onReset}
          className="group flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/5 py-2 text-xs font-medium text-rose-500 transition-all duration-200 hover:bg-rose-500/15 active:scale-[0.98]"
        >
          <RotateCcwIcon className="size-3.5 transition-transform duration-500 group-hover:-rotate-180" />
          {t("browse.clearAll")}
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}

function Range({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>{label}</SectionLabel>
        <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
          {value}
        </span>
      </div>
      {children}
    </div>
  );
}

const ANY = "__any";

/** One choice or none, as a select — a row of pills took four lines for it. */
function PickSelect({
  value,
  anyLabel,
  options,
  onPick,
}: {
  value: string | null;
  anyLabel: string;
  options: Array<{ value: string; label: string }>;
  onPick: (value: string | null) => void;
}) {
  return (
    <Select value={value ?? ANY} onValueChange={(v) => onPick(v === ANY ? null : v)}>
      <SelectTrigger
        size="sm"
        className={cn("w-full min-w-0 text-xs", value && "border-primary bg-primary/15 text-primary")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{anyLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
        "inline-flex items-center gap-1 rounded-lg border py-1 pl-1.5 pr-2 text-xs transition-colors duration-200 active:scale-95",
        state === "in" && "border-primary bg-primary/20 text-primary",
        state === "out" && "border-rose-500/60 bg-rose-500/10 text-rose-500 line-through decoration-rose-500/60",
        state === "off" && "border-primary/15 bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "grid size-4 place-items-center rounded",
          state === "in" && "bg-primary text-primary-foreground",
          state === "out" && "bg-rose-500 text-white",
          state === "off" && "bg-primary/10",
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
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-primary/25 bg-primary/5 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/15"
        >
          <ListFilterIcon className="size-3.5" />
          {t("browse.allGenres", { count: genres.length })}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2 p-3">
        <p className="text-[11px] leading-snug text-muted-foreground">{t("browse.genresHint")}</p>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("browse.genreSearch")}
          className="h-8 rounded-lg border border-primary/20 bg-card/60 px-2.5 text-xs outline-none transition-colors focus:border-primary"
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
      <BuildingIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-primary" />
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
          "h-8 w-full min-w-0 rounded-lg border border-primary/25 bg-primary/5 pl-7 pr-2 text-xs font-medium outline-none transition-colors placeholder:text-muted-foreground hover:border-primary/60 focus:border-primary",
          value && "border-primary bg-primary/15 text-primary",
        )}
      />
      {open && data && data.length > 0 && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 animate-in overflow-hidden rounded-lg border border-primary/35 bg-popover bg-gradient-to-b from-primary/[0.1] to-transparent shadow-xl shadow-primary/15 fade-in-0 slide-in-from-top-1">
          {data.map((studio) => (
            <button
              key={studio.name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(studio.name);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-primary/15"
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
    "grid size-8 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/5 text-primary transition-colors hover:border-primary hover:bg-primary/15 disabled:pointer-events-none disabled:opacity-40";

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
          <SelectTrigger size="sm" className="min-w-0 flex-1 text-xs" disabled={sets.length === 0}>
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
            className="h-8 min-w-0 flex-1 rounded-lg border border-primary/30 bg-card px-2 text-xs outline-none focus:border-primary"
          />
          <button type="submit" className="btn-sheen rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground">
            OK
          </button>
        </form>
      )}
    </div>
  );
}
