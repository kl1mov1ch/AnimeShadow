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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
    <FieldGroup className="gap-5">
      <Field>
        <FieldLabel htmlFor="browse-search">{t("browse.search")}</FieldLabel>
        <Input
          id="browse-search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t("browse.searchPlaceholder")}
          type="search"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="browse-sort">{t("browse.sortBy")}</FieldLabel>
        <Select
          value={params.orderBy ?? "popularity"}
          onValueChange={(value) => onChange({ orderBy: value })}
        >
          <SelectTrigger id="browse-sort">
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
        <FieldLabel htmlFor="browse-format">{t("browse.format")}</FieldLabel>
        <Select
          value={params.type ?? ANY}
          onValueChange={(value) => onChange({ type: value === ANY ? null : value })}
        >
          <SelectTrigger id="browse-format">
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
        <FieldLabel htmlFor="browse-status">{t("browse.status")}</FieldLabel>
        <Select
          value={params.airing ?? ANY}
          onValueChange={(value) => onChange({ airing: value === ANY ? null : value })}
        >
          <SelectTrigger id="browse-status">
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
        <FieldLabel>
          {minScore > 0
            ? t("browse.minScoreValue", { value: minScore })
            : t("browse.minScore")}
        </FieldLabel>
        <Slider
          value={[minScore]}
          min={0}
          max={9}
          step={1}
          onValueChange={([value]) =>
            onChange({ minScore: value && value > 0 ? String(value) : null })
          }
          aria-label={t("browse.minScore")}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="browse-year">{t("browse.year")}</FieldLabel>
        <Input
          id="browse-year"
          type="number"
          inputMode="numeric"
          min={1917}
          max={new Date().getFullYear() + 2}
          value={params.year ?? ""}
          onChange={(event) => onChange({ year: event.target.value || null })}
          placeholder={t("browse.anyYear")}
        />
      </Field>

      <Field>
        <FieldLabel>{t("browse.genres")}</FieldLabel>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-between font-normal">
              {selectedGenres.size > 0
                ? t("browse.genresSelected", { count: selectedGenres.size })
                : t("browse.anyGenre")}
              <ChevronsUpDownIcon className="text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-0" align="start">
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

      <Field orientation="horizontal" className="justify-between">
        <FieldLabel htmlFor="browse-has-player" className="font-normal">
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

      {showReset && (
        <Button variant="ghost" onClick={onReset} className="justify-start px-2">
          {t("browse.clearAll")}
        </Button>
      )}
    </FieldGroup>
  );
}
