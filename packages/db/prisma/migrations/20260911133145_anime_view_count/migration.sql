-- AlterTable
ALTER TABLE "Anime" ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Anime_viewCount_idx" ON "Anime"("viewCount" DESC);
