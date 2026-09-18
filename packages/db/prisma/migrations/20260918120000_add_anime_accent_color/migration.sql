-- AniList reports the dominant colour of every cover it holds. Storing it
-- alongside the artwork means a title page can be tinted with its own key
-- visual without the browser having to sample the poster's pixels first.
-- AlterTable
ALTER TABLE "Anime" ADD COLUMN "accentColor" TEXT;
