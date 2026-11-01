-- Exact season: MAL 57658 = AniList 172463. Replace the old landscape
-- announcement card and red logo backdrop; do not touch other catalogue data.
UPDATE "Anime" SET
  "imageUrl" = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx172463-LnXqHzt74SJL.jpg',
  "imageLargeUrl" = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx172463-LnXqHzt74SJL.jpg',
  "bannerImage" = 'https://shikimori.io/system/screenshots/original/21515f67c97aee9d9c8d413967d30813809069b5.jpg'
WHERE "id" = 57658;
