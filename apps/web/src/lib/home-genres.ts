import type { Genre } from "@animeshadow/shared";
import { useMemo } from "react";
import { DEFAULT_HOME_GENRES } from "@/components/anime/genre-cards";
import { GENRE_ART } from "@/components/anime/genre-art";
import { useAuth } from "@/hooks/use-auth";
import { useGenrePreferences, useGenres, useLibrary } from "@/lib/query";

const HOME_GENRE_SLOTS = 6;

/**
 * The six genres the front page shows, and whether they are personal.
 *
 * Taste in order of how directly it was stated: the genres someone picked
 * as favourites first, then the ones their own library leans toward
 * (weighted by how many tracked titles carry each), then the everyday six
 * to fill whatever is left. Only genres with drawn art on the allow-list
 * qualify, so the adult shelves can never surface here however large a
 * library's share of them.
 */
export function useHomeGenres(): { genres: Genre[]; personal: boolean } {
  const { status } = useAuth();
  const authed = status === "authenticated";
  const { data: all } = useGenres();
  const { data: picked } = useGenrePreferences(authed);
  const { data: library } = useLibrary(undefined, authed);

  return useMemo(() => {
    const byId = new Map((all ?? []).map((g) => [g.id, g]));
    const byName = new Map((all ?? []).map((g) => [g.name, g]));
    const allowed = (id: number) => GENRE_ART[id] != null && byId.has(id);

    const chosen: number[] = [];
    const add = (id: number) => {
      if (chosen.length < HOME_GENRE_SLOTS && allowed(id) && !chosen.includes(id)) {
        chosen.push(id);
      }
    };

    for (const id of picked ?? []) add(id);

    const weight = new Map<number, number>();
    for (const entry of library ?? []) {
      // A dropped show says what someone didn't like; it shouldn't vote.
      if (entry.status === "DROPPED") continue;
      for (const name of entry.anime.genres) {
        const genre = byName.get(name);
        if (genre) weight.set(genre.id, (weight.get(genre.id) ?? 0) + 1);
      }
    }
    for (const [id] of [...weight].sort((a, b) => b[1] - a[1])) add(id);

    const personal = chosen.length > 0;
    for (const id of DEFAULT_HOME_GENRES) add(id);

    return {
      genres: chosen.map((id) => byId.get(id)).filter((g): g is Genre => g != null),
      personal,
    };
  }, [all, picked, library]);
}
