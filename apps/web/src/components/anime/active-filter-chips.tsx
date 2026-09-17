import type { AnimeAiring, AnimeType, Genre } from "@animeshadow/shared";
import { RotateCcwIcon, XIcon } from "lucide-react";
import type { FilterPatch } from "@/components/anime/browse-filters";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import type { BrowseParams } from "@/lib/query";

/**
 * Every active filter as a removable pill, right above the results — so
 * seeing (and undoing) what's applied doesn't mean reopening the sidebar or
 * the mobile sheet. Doesn't include the search term itself; the page title
 * already shows that.
 */
export function ActiveFilterChips({
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

  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (params.orderBy && params.orderBy !== "popularity") {
    chips.push({
      key: "orderBy",
      label: t(`sort.${params.orderBy}`),
      onRemove: () => onChange({ orderBy: null }),
    });
  }
  if (params.type) {
    chips.push({
      key: "type",
      label: labels.typeLabel(params.type as AnimeType),
      onRemove: () => onChange({ type: null }),
    });
  }
  if (params.airing) {
    chips.push({
      key: "airing",
      label: labels.airingLabel(params.airing as AnimeAiring),
      onRemove: () => onChange({ airing: null }),
    });
  }
  if (params.year) {
    chips.push({
      key: "year",
      label: String(params.year),
      onRemove: () => onChange({ year: null }),
    });
  }
  if (params.minScore) {
    chips.push({
      key: "minScore",
      label: t("browse.minScoreValue", { value: params.minScore }),
      onRemove: () => onChange({ minScore: null }),
    });
  }
  if (params.hasPlayer) {
    chips.push({
      key: "hasPlayer",
      label: t("browse.onlyWithPlayer"),
      onRemove: () => onChange({ hasPlayer: null }),
    });
  }
  if (params.hasCustomPlayer) {
    chips.push({
      key: "hasCustomPlayer",
      label: t("browse.onlyOwnPlayer"),
      onRemove: () => onChange({ hasCustomPlayer: null }),
    });
  }
  if (params.studio) {
    chips.push({
      key: "studio",
      label: params.studio,
      onRemove: () => onChange({ studio: null }),
    });
  }
  for (const id of params.genres ?? []) {
    const genre = genres.find((g) => g.id === id);
    if (!genre) continue;
    chips.push({
      key: `genre-${id}`,
      label: labels.genreLabel(genre.name),
      onRemove: () => {
        const rest = (params.genres ?? []).filter((g) => g !== id);
        onChange({ genres: rest.length > 0 ? rest.join(",") : null });
      },
    });
  }

  if (chips.length === 0) return null;

  // Every filter key this row can show, so "clear all" really clears all of
  // it in one patch rather than leaving whatever it didn't know about.
  const clearAll = () =>
    onChange({
      orderBy: null,
      type: null,
      airing: null,
      year: null,
      minScore: null,
      hasPlayer: null,
      hasCustomPlayer: null,
      studio: null,
      genres: null,
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip, i) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          style={{ animationDelay: `${i * 30}ms`, animationFillMode: "backwards" }}
          className="group animate-in fade-in zoom-in-95 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 py-1 pl-3 pr-2 text-xs text-foreground duration-300 transition-all hover:-translate-y-0.5 hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
        >
          {chip.label}
          <XIcon className="size-3 text-muted-foreground transition-colors group-hover:text-destructive" />
        </button>
      ))}

      {/* Only once there's more than one thing to undo — with a single chip,
          removing it *is* clearing everything. */}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
        >
          <RotateCcwIcon className="size-3" />
          {t("browse.clearAll")}
        </button>
      )}
    </div>
  );
}
