/** Verified editorial corrections, keyed by MAL id so seasons cannot be mixed.
 * Provider refreshes must not bring back an announcement card as a poster.
 * 57658: AniList 172463 (exact idMal match), checked 2026-11-01.
 * The backdrop is a full-HD frame from this season's Shikimori screenshots.
 */
const ARTWORK: Readonly<
  Record<number, { imageUrl: string; imageLargeUrl: string; bannerImage: string }>
> = {
  57658: {
    imageUrl:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx172463-LnXqHzt74SJL.jpg",
    imageLargeUrl:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx172463-LnXqHzt74SJL.jpg",
    bannerImage:
      "https://shikimori.io/system/screenshots/original/21515f67c97aee9d9c8d413967d30813809069b5.jpg",
  },
};

export function animeArtwork(id: number) {
  return ARTWORK[id];
}
