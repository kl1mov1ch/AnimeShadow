-- AlterTable
ALTER TABLE "PlayerSource" ADD COLUMN     "format" TEXT NOT NULL DEFAULT 'iframe',
ADD COLUMN     "hlsEpisodes" JSONB;
