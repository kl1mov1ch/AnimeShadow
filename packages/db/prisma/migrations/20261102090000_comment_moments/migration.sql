-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "atSeconds" INTEGER,
ADD COLUMN     "episode" INTEGER;

-- CreateIndex
CREATE INDEX "Comment_animeId_episode_idx" ON "Comment"("animeId", "episode");

