import type { Genre } from "@animeshadow/shared";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
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
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { Switch } from "@/components/ui/switch";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useT } from "@/i18n";
import { AIRING_VALUES, SORT_VALUES, TYPE_VALUES } from "@/lib/browse-params";
import { useLabels } from "@/lib/labels";
import type { BrowseParams } from "@/lib/query";
import { cn } from "@/lib/utils";

const ANY = "__any";

export type FilterPatch = Record<string, string | null>;

interface BrowseFiltersProps {
  params: BrowseParams;
  genres: Genre[];
  onChange: (patch: FilterPatch) => void;
  onReset: () => void;
  showReset: boolean;
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

  return (
    <FieldGroup className="gap-4">
      <Field>
        <FieldLabel htmlFor="browse-search" className="text-xs">
          {t("browse.search")}
        </FieldLabel>
        <Input
          id="browse-search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t("browse.searchPlaceholder")}
          type="search"
          className="h-10"
        />
      </Field>

      <FieldSeparator />

      {/* One column, full width — a 2-up grid inside a ~260-320px sidebar
          left each select too narrow for its own text, truncating options
          like "По популярности" into "По популя…". Full width is the fix
          that actually holds regardless of how long a locale's labels get. */}
      <Field>
        <FieldLabel htmlFor="browse-sort" className="text-xs">
          {t("browse.sortBy")}
        </FieldLabel>
        <Select
          value={params.orderBy ?? "popularity"}
          onValueChange={(value) => onChange({ orderBy: value })}
        >
          <SelectTrigger id="browse-sort" className="h-10 w-full">
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
      </Field>

      <Field>
        <FieldLabel htmlFor="browse-format" className="text-xs">
          {t("browse.format")}
        </FieldLabel>
        <Select
          value={params.type ?? ANY}
          onValueChange={(value) => onChange({ type: value === ANY ? null : value })}
        >
          <SelectTrigger id="browse-format" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("browse.anyFormat")}</SelectItem>
            {TYPE_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {labels.typeLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="browse-status" className="text-xs">
          {t("browse.status")}
        </FieldLabel>
        <Select
          value={params.airing ?? ANY}
          onValueChange={(value) => onChange({ airing: value === ANY ? null : value })}
        >
          <SelectTrigger id="browse-status" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("browse.anyStatus")}</SelectItem>
            {AIRING_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {labels.airingLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="browse-year" className="text-xs">
          {t("browse.year")}
        </FieldLabel>
        <Input
          id="browse-year"
          type="number"
          inputMode="numeric"
          min={1917}
          max={new Date().getFullYear() + 2}
          value={params.year ?? ""}
          onChange={(event) => onChange({ year: event.target.value || null })}
          placeholder={t("browse.anyYear")}
          className="h-10"
        />
      </Field>

      <FieldSeparator />

      <Field>
        <div className="flex items-baseline justify-between gap-2">
          <FieldLabel className="text-xs">{t("browse.minScore")}</FieldLabel>
          {minScore > 0 && (
            <span className="text-xs font-medium tabular-nums text-primary">
              {t("browse.minScoreValue", { value: minScore })}
            </span>
          )}
        </div>
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
      </Field>

      <Field>
        <FieldLabel className="text-xs">{t("browse.genres")}</FieldLabel>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-10 w-full justify-between font-normal"
            >
              {selectedGenres.size > 0
                ? t("browse.genresSelected", { count: selectedGenres.size })
                : t("browse.anyGenre")}
              <ChevronsUpDownIcon className="text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
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
                    >
                      <CheckIcon
                        className={cn(
                          selectedGenres.has(genre.id) ? "opacity-100" : "opacity-0",
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
      </Field>

      <FieldSeparator />

      <Field orientation="horizontal" className="justify-between">
        <FieldLabel htmlFor="browse-has-player" className="text-xs font-normal">
          {t("browse.onlyWithPlayer")}
        </FieldLabel>
        <Switch
          id="browse-has-player"
          checked={params.hasPlayer === true}
          onCheckedChange={(checked) =>
            onChange({ hasPlayer: checked ? "1" : null })
          }
        />
      </Field>

      {/* AniLibria's direct HLS stream — no third-party iframe UI, so it's
          worth its own filter rather than folding into "has a player at
          all" above (which Kodik/Alloha iframes already satisfy). */}
      <Field orientation="horizontal" className="justify-between">
        <FieldLabel htmlFor="browse-has-custom-player" className="text-xs font-normal">
          {t("browse.onlyOwnPlayer")}
        </FieldLabel>
        <Switch
          id="browse-has-custom-player"
          checked={params.hasCustomPlayer === true}
          onCheckedChange={(checked) =>
            onChange({ hasCustomPlayer: checked ? "1" : null })
          }
        />
      </Field>

      {showReset && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="justify-start px-2 text-muted-foreground"
        >
          {t("browse.clearAll")}
        </Button>
      )}
    </FieldGroup>
  );
}
