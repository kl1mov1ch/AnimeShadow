-- Card images were being stored at AniList's full "extraLarge" size.
--
-- The artwork heal wrote AniList's extraLarge cover into both imageUrl and
-- imageLargeUrl. That variant is 460x651 and, for many titles, a PNG of around
-- 500KB — and imageUrl is what every card on a phone loads, so a single grid of
-- popular titles came to roughly ten megabytes of images. The heal ran most
-- popular first, which put the damage on exactly the titles visited most.
--
-- AniList serves the same file under /cover/medium/ at 230x326 (~35KB as JPG,
-- ~110-155KB as PNG), which is card-sized. Verified before writing this
-- migration: the rewritten URL resolved 200 for sampled rows across both the
-- bx-/nx- filename prefixes and both .jpg and .png. The original, lighter
-- Shikimori/MAL URLs these overwrote cannot be recovered, so this is the
-- closest correct replacement rather than a true restore.
UPDATE "Anime"
SET "imageUrl" = REPLACE("imageUrl", '/media/anime/cover/large/', '/media/anime/cover/medium/')
WHERE "imageUrl" LIKE '%anilist.co/file/anilistcdn/media/anime/cover/large/%';

UPDATE "Anime"
SET "imageLargeUrl" = REPLACE("imageLargeUrl", '/media/anime/cover/large/', '/media/anime/cover/medium/')
WHERE "imageLargeUrl" LIKE '%anilist.co/file/anilistcdn/media/anime/cover/large/%';
