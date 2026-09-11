import type {
  AnimeAiring,
  AnimeSummary,
  AnimeType,
} from "@animeshadow/shared";
import { useMemo } from "react";
import { localizeGenre } from "@/i18n/genres";
import { useI18n } from "@/i18n";

type TitleLike = Pick<AnimeSummary, "title" | "titleEnglish"> & {
  titleLocalized?: string | null;
};

/**
 * All display labels, bound to the active locale. Pure number/date helpers stay
 * in `format.ts`; anything that needs translated words lives here.
 */
export function useLabels() {
  const { locale, t } = useI18n();

  return useMemo(() => {
    const compact = new Intl.NumberFormat(locale, { notation: "compact" });
    const plain = new Intl.NumberFormat(locale);

    const typeLabel = (type: AnimeType) => t(`type.${type}`);
    const airingLabel = (airing: AnimeAiring) => t(`airing.${airing}`);
    const statusLabel = (status: string) => t(`status.${status}`);
    const genreLabel = (name: string) => localizeGenre(name, locale);

    const seasonYearLabel = (
      anime: Pick<AnimeSummary, "season" | "year">,
    ): string | null => {
      if (anime.season && anime.year) {
        return `${t(`season.${anime.season}`)} ${anime.year}`;
      }
      return anime.year ? String(anime.year) : null;
    };

    const episodeLabel = (
      episodes: number | null,
      type: AnimeType,
    ): string | null => {
      if (type === "MOVIE") return t("common.feature");
      if (!episodes) return null;
      const word = locale === "ru" ? "эп." : episodes === 1 ? "episode" : "episodes";
      return `${episodes} ${word}`;
    };

    const title = (anime: TitleLike): string =>
      locale === "ru"
        ? anime.titleLocalized?.trim() || anime.titleEnglish?.trim() || anime.title
        : anime.titleEnglish?.trim() || anime.titleLocalized?.trim() || anime.title;

    return {
      locale,
      compact: (value: number | null | undefined) =>
        value == null ? "—" : compact.format(value),
      plain: (value: number | null | undefined) =>
        value == null ? "—" : plain.format(value),
      formatDate: (iso: string | null): string | null => {
        if (!iso) return null;
        const date = new Date(iso);
        return Number.isNaN(date.getTime())
          ? null
          : date.toLocaleDateString(locale, {
              year: "numeric",
              month: "short",
              day: "numeric",
            });
      },
      typeLabel,
      airingLabel,
      statusLabel,
      genreLabel,
      seasonYearLabel,
      episodeLabel,
      title,
    };
  }, [locale, t]);
}
