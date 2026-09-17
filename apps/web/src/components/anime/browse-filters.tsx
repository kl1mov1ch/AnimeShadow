import type { Genre } from "@animeshadow/shared";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  MonitorSmartphoneIcon,
  PlayCircleIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  TrophyIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useT } from "@/i18n";
import { AIRING_VALUES, SORT_VALUES, TYPE_VALUES } from "@/lib/browse-params";
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

/** The band of light every control in this app sweeps on hover. */
function Sheen({ tone = "primary" }: { tone?: "primary" | "light" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]",
        tone === "light" ? "via-white/40" : "via-primary/30",
      )}
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>{label}</SectionLabel>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * One option in a segmented row. A short, known set of choices (five
 * formats, three airing states) is faster to read and to hit as a row of
 * pills than as a dropdown that hides four of its five options until
 * opened — and it matches every other control on the site.
 */
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
        "group relative overflow-hidden rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200",
        active
          ? "border-transparent bg-gradient-to-r from-primary via-primary/85 to-primary text-primary-foreground shadow-md shadow-primary/25"
          : "border-border/60 bg-card/40 text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
        className,
      )}
    >
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
      <Sheen tone={active ? "light" : "primary"} />
    </button>
  );
}

export function BrowseFilters({
  params,
  genres,
  onChange,
  onReset,
  showReset,
}: BrowseFiltersProps) {
  const t = useT();
  const labels = useLabels();
  const [term, setTerm] = useState(params.q ?? "");
  const debounced = useDebouncedValue(term.trim(), 250);

  useEffect(() => {
    if (debounced !== (params.q ?? "")) {
      onChange({ q: debounced || null });
    }
  }, [debounced, params.q, onChange]);

  useEffect(() => {
    setTerm(params.q ?? "");
  }, [params.q]);

  const selectedGenres = new Set(params.genres ?? []);

  const toggleGenre = (id: number) => {
    const next = new Set(selectedGenres);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ genres: next.size > 0 ? [...next].join(",") : null });
  };

  const minScore = params.minScore ?? 0;

  // Four presets covering what people actually come here to ask for, each
  // a plain toggle over params the catalogue already understands — no new
  // backend concepts, just the combinations worth one tap instead of four.
  const quickFilters = [
    {
      key: "customPlayer",
      label: t("browse.quick.customPlayer"),
      Icon: MonitorSmartphoneIcon,
      active: params.hasCustomPlayer === true,
      patch: (on: boolean): FilterPatch => ({ hasCustomPlayer: on ? "1" : null }),
    },
    {
      key: "airingNow",
      label: t("browse.quick.airingNow"),
      Icon: PlayCircleIcon,
      active: params.airing === "AIRING",
      patch: (on: boolean): FilterPatch => ({ airing: on ? "AIRING" : null }),
    },
    {
      key: "topRated",
      label: t("browse.quick.topRated"),
      Icon: TrophyIcon,
      active: params.orderBy === "score",
      patch: (on: boolean): FilterPatch => ({ orderBy: on ? "score" : null }),
    },
    {
      key: "newest",
      label: t("browse.quick.newest"),
      Icon: SparklesIcon,
      active: params.orderBy === "start_date",
      patch: (on: boolean): FilterPatch => ({ orderBy: on ? "start_date" : null }),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Presets first: the whole point is skipping everything below. */}
      <div className="grid grid-cols-2 gap-2">
        {quickFilters.map(({ key, label, Icon, active, patch }, i) => (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(patch(!active))}
            style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
            className={cn(
              "group animate-in fade-in zoom-in-95 relative flex items-center justify-center gap-1.5 overflow-hidden rounded-full border px-3 py-2 text-xs font-medium duration-300 transition-all",
              active
                ? "border-transparent bg-gradient-to-r from-primary via-primary/85 to-primary text-primary-foreground shadow-md shadow-primary/25"
                : "border-border/60 bg-card/40 text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
            )}
          >
            <Icon className="relative z-10 size-3.5 shrink-0" />
            <span className="relative z-10 truncate">{label}</span>
            <Sheen tone={active ? "light" : "primary"} />
          </button>
        ))}
      </div>

      {/* The same pill field as the header's search, minus the dropdown —
          this one filters the grid in place rather than navigating. */}
      <div
        className={cn(
          "group relative flex items-center rounded-full border bg-card/70 transition-all duration-200",
          "focus-within:border-primary/50 focus-within:bg-card focus-within:shadow-lg focus-within:shadow-primary/10 focus-within:ring-4 focus-within:ring-primary/15",
          "border-border/60 hover:border-border",
        )}
      >
        <SearchIcon className="pointer-events-none absolute left-3 size-4 text-muted-foreground transition-all duration-200 group-focus-within:scale-110 group-focus-within:text-primary" />
        <input
          id="browse-search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t("browse.searchPlaceholder")}
          type="search"
          aria-label={t("browse.search")}
          className="h-10 w-full rounded-full bg-transparent pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground/80 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {term && (
          <button
            type="button"
            onClick={() => setTerm("")}
            aria-label={t("common.clear")}
            className="animate-in zoom-in-75 absolute right-2 flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>

      <Section label={t("browse.sortBy")}>
        {/* Still a select: six options with labels long enough that a pill
            row would wrap into an unreadable block at sidebar width. */}
        <Select
          value={params.orderBy ?? "popularity"}
          onValueChange={(value) => onChange({ orderBy: value })}
        >
          <SelectTrigger id="browse-sort" className="h-10 w-full rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`sort.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      <Section label={t("browse.format")}>
        <div className="flex flex-wrap gap-1.5">
          <Pill active={!params.type} onClick={() => onChange({ type: null })}>
            {t("browse.anyFormat")}
          </Pill>
          {TYPE_VALUES.map((value) => (
            <Pill
              key={value}
              active={params.type === value}
              onClick={() => onChange({ type: params.type === value ? null : value })}
            >
              {labels.typeLabel(value)}
            </Pill>
          ))}
        </div>
      </Section>

      <Section label={t("browse.status")}>
        <div className="flex flex-wrap gap-1.5">
          <Pill active={!params.airing} onClick={() => onChange({ airing: null })}>
            {t("browse.anyStatus")}
          </Pill>
          {AIRING_VALUES.map((value) => (
            <Pill
              key={value}
              active={params.airing === value}
              onClick={() => onChange({ airing: params.airing === value ? null : value })}
            >
              {labels.airingLabel(value)}
            </Pill>
          ))}
        </div>
      </Section>

      <Section
        label={t("browse.minScore")}
        action={
          minScore > 0 ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
              {t("browse.minScoreValue", { value: minScore })}
            </span>
          ) : undefined
        }
      >
        <Slider
          value={[minScore]}
          min={0}
          max={9}
          step={1}
          onValueChange={([value]) =>
            onChange({ minScore: value && value > 0 ? String(value) : null })
          }
          aria-label={t("browse.minScore")}
          className="mt-1"
        />
        <div className="flex justify-between text-[11px] text-muted-foreground/70">
          <span>{t("browse.anyScore")}</span>
          <span>9+</span>
        </div>
      </Section>

      <Section label={t("browse.year")}>
        <input
          id="browse-year"
          type="number"
          inputMode="numeric"
          min={1917}
          max={new Date().getFullYear() + 2}
          value={params.year ?? ""}
          onChange={(event) => onChange({ year: event.target.value || null })}
          placeholder={t("browse.anyYear")}
          className="h-10 w-full rounded-full border border-border/60 bg-card/70 px-4 text-sm outline-none transition-all duration-200 placeholder:text-muted-foreground/80 focus:border-primary/50 focus:bg-card focus:ring-4 focus:ring-primary/15"
        />
      </Section>

      <Section
        label={t("browse.genres")}
        action={
          selectedGenres.size > 0 ? (
            <button
              type="button"
              onClick={() => onChange({ genres: null })}
              className="text-[11px] text-muted-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {t("common.clear")}
            </button>
          ) : undefined
        }
      >
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-10 w-full justify-between rounded-full border-border/60 bg-card/70 font-normal hover:border-primary/40"
            >
              {selectedGenres.size > 0
                ? t("browse.genresSelected", { count: selectedGenres.size })
                : t("browse.anyGenre")}
              <ChevronsUpDownIcon className="text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[--radix-popover-trigger-width] min-w-64 overflow-hidden rounded-2xl p-0"
            align="start"
          >
            <Command>
              <CommandInput placeholder={t("browse.genres")} />
              <CommandList>
                <CommandEmpty>{t("browse.noGenre")}</CommandEmpty>
                <CommandGroup>
                  {genres.map((genre) => (
                    <CommandItem
                      key={genre.id}
                      value={labels.genreLabel(genre.name)}
                      onSelect={() => toggleGenre(genre.id)}
                      className="rounded-lg data-[selected=true]:bg-primary/10"
                    >
                      <CheckIcon
                        className={cn(
                          selectedGenres.has(genre.id)
                            ? "text-primary! opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {labels.genreLabel(genre.name)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Picked genres stay visible as removable pills — otherwise the
            only evidence of a three-genre filter was a "3 selected" count
            that told you nothing about which three. */}
        {selectedGenres.size > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[...selectedGenres].map((id) => {
              const genre = genres.find((g) => g.id === id);
              if (!genre) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleGenre(id)}
                  className="group inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-1 pl-2.5 pr-1.5 text-xs text-primary transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                >
                  {labels.genreLabel(genre.name)}
                  <XIcon className="size-3" />
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {/* "Any player at all" is a far weaker filter than the custom-player
          preset above (Kodik/Alloha iframes satisfy it almost everywhere),
          so it sits down here as a single toggle rather than competing for
          attention with the presets. */}
      <Section label={t("browse.onlyWithPlayer")}>
        <Pill
          active={params.hasPlayer === true}
          onClick={() => onChange({ hasPlayer: params.hasPlayer ? null : "1" })}
          className="w-full justify-center py-2"
        >
          <PlayCircleIcon className="size-3.5" />
          {t("browse.onlyWithPlayer")}
        </Pill>
      </Section>

      {showReset && (
        <button
          type="button"
          onClick={onReset}
          className="group relative flex items-center justify-center gap-1.5 overflow-hidden rounded-full border border-border/60 py-2 text-xs font-medium text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-destructive/40 hover:text-destructive"
        >
          <RotateCcwIcon className="relative z-10 size-3.5" />
          <span className="relative z-10">{t("browse.clearAll")}</span>
        </button>
      )}
    </div>
  );
}
