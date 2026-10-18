import type { PartySnapshot } from "@animeshadow/shared";

export const PARTY_ANIME_SELECT = { id: true, slug: true, title: true, titleLocalized: true, imageUrl: true, imageLargeUrl: true, bannerImage: true, screenshots: true, episodes: true } as const;
export function partyAnime(record: { id: number; slug: string; title: string; titleLocalized: string | null; imageUrl: string | null; imageLargeUrl?: string | null; bannerImage?: string | null; screenshots?: string[]; episodes: number | null }): PartySnapshot["anime"] {
  return { id: record.id, slug: record.slug, title: record.title, titleLocalized: record.titleLocalized, imageUrl: record.imageLargeUrl || record.imageUrl, episodes: record.episodes,
    coverUrl: record.bannerImage || record.screenshots?.[0] || record.imageLargeUrl || record.imageUrl };
}
