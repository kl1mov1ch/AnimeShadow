-- AlterTable
ALTER TABLE "Anime" ADD COLUMN     "kinopoiskId" INTEGER;

-- CreateTable
CREATE TABLE "PlayerSource" (
    "animeId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "embedUrl" TEXT NOT NULL,
    "quality" TEXT,
    "episodesCount" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerSource_pkey" PRIMARY KEY ("animeId","provider","sourceKey")
);

-- CreateIndex
CREATE INDEX "PlayerSource_animeId_idx" ON "PlayerSource"("animeId");

-- AddForeignKey
ALTER TABLE "PlayerSource" ADD CONSTRAINT "PlayerSource_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
