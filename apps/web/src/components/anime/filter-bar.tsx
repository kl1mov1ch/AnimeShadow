import type { Genre } from "@animeshadow/shared";
import { ChevronDownIcon, EyeOffIcon, MonitorPlayIcon, PlayCircleIcon, RotateCcwIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { activeFilterCount, AIRING_VALUES, TYPE_VALUES } from "@/lib/browse-params";
import { useLabels } from "@/lib/labels";
import type { BrowseParams } from "@/lib/query";
import { cn } from "@/lib/utils";
import {
  AGE_RATINGS,
  ChipGroup,
  EPISODE_PRESETS,
  Field,
  type FilterPatch,
  GenrePicker,
  PERIODS,
  SavedSets,
  SCORE_STEPS,
  StudioPicker,
  Switch,
} from "./browse-filters";

/**
 * One filter as a button in a row above the results: its name, and once
 * set, what it is set to, with a cross to clear it; a tap opens just that
 * filter's choices. No column beside the results, no long sheet.
 */
function FilterPill({
  label,
  value,
  onClear,
  width = "w-72",
  children,
}: {
  label: string;
  value: string | null;
  onClear: () => void;
  width?: string;
  children: ReactNode;
}) {
  const on = value != null;
  return (
    <Popover>
      <div
        className={cn(
          "inline-flex h-9 shrink-0 items-center rounded-full border text-[13px] transition-colors",
          on ? "border-primary/50 bg-primary/10 text-foreground" : "border-border/60 bg-card/50 text-foreground/85 hover:border-foreground/25",
        )}
      >
        <PopoverTrigger asChild>
          <button type="button" className={cn("inline-flex h-full items-center gap-1.5 rounded-full pl-3.5", on ? "pr-1.5" : "pr-3")}>
            <span className={cn(on && "text-muted-foreground")}>{label}</span>
            {on ? <span className="max-w-[10rem] truncate font-semibold">{value}</span> : <ChevronDownIcon className="size-3.5 text-muted-foreground" />}
          </button>
        </PopoverTrigger>
        {on && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Сбросить: ${label}`}
            className="mr-1 grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
      <PopoverContent align="start" className={cn("flex max-h-[70dvh] flex-col gap-3 overflow-y-auto p-3", width)}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** The catalog's filters, as a row of buttons — it wraps on a computer, scrolls on a phone. */
export function FilterBar({
  params,
  genres,
  onChange,
  onReset,
}: {
  params: BrowseParams;
  genres: Genre[];
  onChange: (patch: FilterPatch) => void;
  onReset: () => void;
}) {
  const t = useT();
  const labels = useLabels();
  const { status } = useAuth();
  const authed = status === "authenticated";
  const count = activeFilterCount(params);
  const period = PERIODS.find((p) => (params.yearFrom ?? null) === p.from && (params.yearTo ?? null) === p.to);
  const episodes = EPISODE_PRESETS.find((p) => (params.episodesMin ?? null) === p.min && (params.episodesMax ?? null) === p.max);
  const picked = (params.genres?.length ?? 0) + (params.excludeGenres?.length ?? 0);
  const firstGenre = params.genres?.[0] != null ? genres.find((g) => g.id === params.genres![0]) : undefined;
  const more = [params.hasCustomPlayer, params.hasPlayer, params.hideListed].filter(Boolean).length;
  const episodeLabel = (key: string) => t(`browse.episodePreset.${key}` as "browse.episodePreset.one");

  return (
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
      <FilterPill label="Тип" value={params.type ? labels.typeLabel(params.type as (typeof TYPE_VALUES)[number]) : null} onClear={() => onChange({ type: null })} width="w-64">
        <ChipGroup label="Тип" value={params.type ?? null} options={TYPE_VALUES.map((v) => ({ value: v, label: labels.typeLabel(v) }))} onPick={(type) => onChange({ type })} />
      </FilterPill>
      <FilterPill label="Выход" value={params.airing ? labels.airingLabel(params.airing as (typeof AIRING_VALUES)[number]) : null} onClear={() => onChange({ airing: null })} width="w-64">
        <ChipGroup
          label="Статус выхода"
          value={params.airing ?? null}
          options={AIRING_VALUES.map((v) => ({ value: v, label: labels.airingLabel(v) }))}
          onPick={(airing) => onChange({ airing })}
        />
      </FilterPill>
      <FilterPill
        label="Жанры"
        value={picked === 0 ? null : picked === 1 && firstGenre ? labels.genreLabel(firstGenre.name) : String(picked)}
        onClear={() => onChange({ genres: null, excludeGenres: null })}
        width="w-80"
      >
        <GenrePicker params={params} genres={genres} onChange={onChange} />
      </FilterPill>
      <FilterPill
        label="Год"
        value={period?.label ?? (params.year ? String(params.year) : null)}
        onClear={() => onChange({ year: null, yearFrom: null, yearTo: null })}
        width="w-64"
      >
        <ChipGroup
          label="Период"
          value={period?.key ?? null}
          options={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
          onPick={(key) => {
            const p = PERIODS.find((x) => x.key === key);
            onChange({ year: null, yearFrom: p?.from != null ? String(p.from) : null, yearTo: p?.to != null ? String(p.to) : null });
          }}
        />
      </FilterPill>
      <FilterPill label="Возраст" value={AGE_RATINGS.find((r) => r.value === params.rating)?.label ?? null} onClear={() => onChange({ rating: null })} width="w-60">
        <ChipGroup label="Возрастной рейтинг" value={params.rating ?? null} options={AGE_RATINGS} onPick={(rating) => onChange({ rating })} />
      </FilterPill>
      <FilterPill label="Оценка" value={params.minScore ? `★ ${params.minScore}+` : null} onClear={() => onChange({ minScore: null, maxScore: null })} width="w-64">
        <ChipGroup
          label="Не ниже"
          value={params.minScore ? String(params.minScore) : null}
          options={SCORE_STEPS.map((v) => ({ value: String(v), label: `★ ${v}+` }))}
          onPick={(v) => onChange({ minScore: v, maxScore: null })}
        />
      </FilterPill>
      <FilterPill label="Серии" value={episodes ? episodeLabel(episodes.key) : null} onClear={() => onChange({ episodesMin: null, episodesMax: null })} width="w-64">
        <ChipGroup
          label="Длина"
          value={episodes?.key ?? null}
          options={EPISODE_PRESETS.map((p) => ({ value: p.key, label: episodeLabel(p.key) }))}
          onPick={(key) => {
            const p = EPISODE_PRESETS.find((x) => x.key === key);
            onChange(p ? { episodesMin: String(p.min), episodesMax: p.max != null ? String(p.max) : null } : { episodesMin: null, episodesMax: null });
          }}
        />
      </FilterPill>
      <FilterPill label="Студия" value={params.studio ?? null} onClear={() => onChange({ studio: null })}>
        <StudioPicker value={params.studio ?? null} onPick={(name) => onChange({ studio: name })} />
      </FilterPill>
      <FilterPill label="Ещё" value={more > 0 ? String(more) : null} onClear={() => onChange({ hasCustomPlayer: null, hasPlayer: null, hideListed: null })}>
        <div className="flex flex-col gap-0.5">
          <Switch
            icon={MonitorPlayIcon}
            label="Свой плеер, без рекламы"
            on={params.hasCustomPlayer === true}
            onClick={() => onChange({ hasCustomPlayer: params.hasCustomPlayer ? null : "1" })}
          />
          <Switch icon={PlayCircleIcon} label={t("browse.withPlayerShort")} on={params.hasPlayer === true} onClick={() => onChange({ hasPlayer: params.hasPlayer ? null : "1" })} />
          {authed && (
            <Switch icon={EyeOffIcon} label={t("browse.hideListedShort")} on={params.hideListed === true} onClick={() => onChange({ hideListed: params.hideListed ? null : "1" })} />
          )}
        </div>
        {authed && (
          <Field label={t("browse.saved")}>
            <SavedSets />
          </Field>
        )}
      </FilterPill>
      {count > 0 && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCcwIcon className="size-3.5" />
          Сбросить всё
        </button>
      )}
    </div>
  );
}
