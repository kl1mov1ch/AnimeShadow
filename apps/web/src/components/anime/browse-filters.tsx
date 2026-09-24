import type { Genre } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import {
  BookmarkPlusIcon,
  BuildingIcon,
  EyeOffIcon,
  MinusIcon,
  PlayCircleIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-[var(--accent-line-soft)] pb-4 last:border-b-0 last:pb-0">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <SectionLabel>{label}</SectionLabel>
        {action}
      </div>
      {children}
    </div>
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
        "btn-sheen inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95",
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
 * The catalogue's filters, in the sidebar (and a sheet on a phone).
 *
 * Every range is a range: score from–to, years from–to, episode counts as
 * the handful of lengths people actually ask for. Genres are a three-way
 * switch — tap once to require it, again to rule it out, again to forget
 * it — because "no ecchi" is as common a wish as "romance". Counts on each
 * genre say how big a shelf is before you commit to it.
 */
export function BrowseFilters({ params, genres, onChange, onReset, showReset }: BrowseFiltersProps) {
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

  const included = new Set(params.genres ?? []);
  const excluded = new Set(params.excludeGenres ?? []);
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

  const [genreQuery, setGenreQuery] = useState("");
  const shownGenres = useMemo(() => {
    const q = genreQuery.trim().toLowerCase();
    return [...genres]
      .filter((g) => !q || labels.genreLabel(g.name).toLowerCase().includes(q))
      .sort((a, b) => {
        const rank = (g: Genre) => (included.has(g.id) || excluded.has(g.id) ? 0 : 1);
        return rank(a) - rank(b) || (b.count ?? 0) - (a.count ?? 0);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genres, genreQuery, params.genres, params.excludeGenres]);

  const episodePreset = EPISODE_PRESETS.find(
    (p) => (params.episodesMin ?? null) === p.min && (params.episodesMax ?? null) === p.max,
  );

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 backdrop-blur-sm">
      <div className="group relative flex items-center rounded-lg border border-primary/25 bg-card/70 transition-all duration-200 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
        <SearchIcon className="pointer-events-none absolute left-3 size-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <input
          id="browse-search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t("browse.searchPlaceholder")}
          type="search"
          aria-label={t("browse.search")}
          className="h-10 w-full bg-transparent pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground/80 [&::-webkit-search-cancel-button]:appearance-none"
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

      <Section label={t("browse.format")} action={params.type ? <ClearLink onClick={() => onChange({ type: null })} /> : undefined}>
        <div className="flex flex-wrap gap-1.5">
          {TYPE_VALUES.map((value) => (
            <Pill key={value} active={params.type === value} onClick={() => onChange({ type: params.type === value ? null : value })}>
              {labels.typeLabel(value)}
            </Pill>
          ))}
        </div>
      </Section>

      <Section label={t("browse.status")} action={params.airing ? <ClearLink onClick={() => onChange({ airing: null })} /> : undefined}>
        <div className="flex flex-wrap gap-1.5">
          {AIRING_VALUES.map((value) => (
            <Pill key={value} active={params.airing === value} onClick={() => onChange({ airing: params.airing === value ? null : value })}>
              {labels.airingLabel(value)}
            </Pill>
          ))}
        </div>
      </Section>

      <Section
        label={t("browse.scoreRange")}
        action={
          <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
            {score[0].toFixed(1)} – {score[1].toFixed(1)}
          </span>
        }
      >
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
          className="mt-1"
        />
      </Section>

      <Section
        label={t("browse.yearRange")}
        action={
          <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
            {years[0]} – {years[1]}
          </span>
        }
      >
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
          className="mt-1"
        />
      </Section>

      <Section
        label={t("browse.episodes")}
        action={episodePreset ? <ClearLink onClick={() => onChange({ episodesMin: null, episodesMax: null })} /> : undefined}
      >
        <div className="flex flex-wrap gap-1.5">
          {EPISODE_PRESETS.map((preset) => (
            <Pill
              key={preset.key}
              active={episodePreset?.key === preset.key}
              onClick={() =>
                onChange(
                  episodePreset?.key === preset.key
                    ? { episodesMin: null, episodesMax: null }
                    : {
                        episodesMin: String(preset.min),
                        episodesMax: preset.max != null ? String(preset.max) : null,
                      },
                )
              }
            >
              {t(`browse.episodePreset.${preset.key}` as "browse.episodePreset.one")}
            </Pill>
          ))}
        </div>
      </Section>

      <Section
        label={t("browse.genres")}
        action={
          included.size + excluded.size > 0 ? (
            <ClearLink onClick={() => onChange({ genres: null, excludeGenres: null })} />
          ) : undefined
        }
      >
        <p className="text-[11px] leading-snug text-muted-foreground">{t("browse.genresHint")}</p>
        <input
          value={genreQuery}
          onChange={(e) => setGenreQuery(e.target.value)}
          placeholder={t("browse.genreSearch")}
          className="h-8 rounded-lg border border-primary/20 bg-card/60 px-2.5 text-xs outline-none transition-colors focus:border-primary"
        />
        <div className="flex max-h-60 flex-wrap gap-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {shownGenres.map((genre) => {
            const state = included.has(genre.id) ? "in" : excluded.has(genre.id) ? "out" : "off";
            return (
              <button
                key={genre.id}
                type="button"
                onClick={() => cycleGenre(genre.id)}
                aria-pressed={state !== "off"}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border py-1 pl-1.5 pr-2 text-xs transition-all duration-200 active:scale-95",
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
                  {state === "off" ? null : (
                    <MorphIcon on={state === "out"} off={PlusIcon} onIcon={MinusIcon} className="size-3" />
                  )}
                </span>
                {labels.genreLabel(genre.name)}
                {genre.count != null && genre.count > 0 && (
                  <span className="tabular-nums opacity-60">{genre.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </Section>

      <Section label={t("browse.studio")} action={params.studio ? <ClearLink onClick={() => onChange({ studio: null })} /> : undefined}>
        <StudioPicker value={params.studio ?? null} onPick={(name) => onChange({ studio: name })} />
      </Section>

      <Section label={t("browse.more")}>
        <div className="flex flex-col gap-1.5">
          <Pill
            active={params.hasPlayer === true}
            onClick={() => onChange({ hasPlayer: params.hasPlayer ? null : "1" })}
            className="w-full justify-center py-2"
          >
            <PlayCircleIcon className="size-3.5" />
            {t("browse.onlyWithPlayer")}
          </Pill>
          {authed && (
            <Pill
              active={params.hideListed === true}
              onClick={() => onChange({ hideListed: params.hideListed ? null : "1" })}
              className="w-full justify-center py-2"
            >
              <EyeOffIcon className="size-3.5" />
              {t("browse.hideListed")}
            </Pill>
          )}
        </div>
      </Section>

      {showReset && (
        <button
          type="button"
          onClick={onReset}
          className="group flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/5 py-2 text-xs font-medium text-rose-500 transition-all duration-200 hover:bg-rose-500/15 active:scale-[0.98]"
        >
          <RotateCcwIcon className="size-3.5 transition-transform duration-500 group-hover:-rotate-180" />
          {t("browse.clearAll")}
        </button>
      )}
    </div>
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
      <BuildingIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={t("browse.studioPlaceholder")}
        className="h-9 w-full rounded-lg border border-primary/20 bg-card/60 pl-8 pr-3 text-xs outline-none transition-colors focus:border-primary"
      />
      {open && data && data.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 animate-in overflow-hidden rounded-lg border border-primary/35 bg-popover bg-gradient-to-b from-primary/[0.1] to-transparent shadow-xl shadow-primary/15 fade-in-0 slide-in-from-top-1">
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
 * Filter combinations the viewer comes back to, one tap each. Kept in the
 * browser, per account: they are a convenience for this person on this
 * device, not something worth a table.
 */
function SavedSets() {
  const t = useT();
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

  const save = () => {
    const label = name.trim();
    if (!label || !current) return;
    write([{ name: label, query: current }, ...sets.filter((s) => s.name !== label)].slice(0, 12));
    setName("");
    setNaming(false);
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>{t("browse.saved")}</SectionLabel>
        {current && !naming && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setNaming(true)}
                aria-label={t("browse.saveSet")}
                className="grid size-6 place-items-center rounded-md text-primary transition-colors hover:bg-primary/15"
              >
                <BookmarkPlusIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("browse.saveSet")}</TooltipContent>
          </Tooltip>
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
            className="h-8 min-w-0 flex-1 rounded-md border border-primary/30 bg-card px-2 text-xs outline-none focus:border-primary"
          />
          <button type="submit" className="btn-sheen rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground">
            OK
          </button>
        </form>
      )}
      {sets.length === 0 && !naming ? (
        <p className="text-[11px] text-muted-foreground">{t("browse.savedEmpty")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {sets.map((set) => (
            <span
              key={set.name}
              className={cn(
                "group inline-flex items-center overflow-hidden rounded-md border text-xs transition-colors",
                set.query === current ? "border-primary bg-primary text-primary-foreground" : "border-primary/30 bg-card/60 hover:border-primary",
              )}
            >
              <Link to={`/browse?${set.query}`} viewTransition className="px-2 py-1 font-medium">
                {set.name}
              </Link>
              <button
                type="button"
                onClick={() => write(sets.filter((s) => s.name !== set.name))}
                aria-label={t("common.delete")}
                className="grid h-full place-items-center px-1 opacity-50 transition-opacity hover:opacity-100"
              >
                <Trash2Icon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
