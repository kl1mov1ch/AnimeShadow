-- CreateEnum
CREATE TYPE "LibraryStatus" AS ENUM ('WATCHING', 'PLANNED', 'COMPLETED', 'ON_HOLD', 'DROPPED');

-- CreateEnum
CREATE TYPE "AnimeType" AS ENUM ('TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'MUSIC', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AnimeAiring" AS ENUM ('AIRING', 'FINISHED', 'UPCOMING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AnimeSeason" AS ENUM ('winter', 'spring', 'summer', 'fall');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "animeId" INTEGER NOT NULL,
    "status" "LibraryStatus" NOT NULL,
    "score" INTEGER,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anime" (
    "id" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEnglish" TEXT,
    "titleJapanese" TEXT,
    "synopsis" TEXT,
    "background" TEXT,
    "imageUrl" TEXT,
    "imageLargeUrl" TEXT,
    "type" "AnimeType" NOT NULL DEFAULT 'UNKNOWN',
    "airing" "AnimeAiring" NOT NULL DEFAULT 'UNKNOWN',
    "episodes" INTEGER,
    "duration" TEXT,
    "rating" TEXT,
    "source" TEXT,
    "score" DOUBLE PRECISION,
    "scoredBy" INTEGER,
    "rank" INTEGER,
    "popularity" INTEGER,
    "members" INTEGER,
    "favorites" INTEGER,
    "year" INTEGER,
    "season" "AnimeSeason",
    "airedFrom" TIMESTAMP(3),
    "airedTo" TIMESTAMP(3),
    "trailerEmbedUrl" TEXT,
    "studios" TEXT[],
    "themes" TEXT[],
    "demographics" TEXT[],
    "detailSyncedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Anime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Genre" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "animeCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Genre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenreOnAnime" (
    "animeId" INTEGER NOT NULL,
    "genreId" INTEGER NOT NULL,

    CONSTRAINT "GenreOnAnime_pkey" PRIMARY KEY ("animeId","genreId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "LibraryEntry_userId_status_idx" ON "LibraryEntry"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryEntry_userId_animeId_key" ON "LibraryEntry"("userId", "animeId");

-- CreateIndex
CREATE INDEX "Anime_score_idx" ON "Anime"("score" DESC);

-- CreateIndex
CREATE INDEX "Anime_popularity_idx" ON "Anime"("popularity");

-- CreateIndex
CREATE INDEX "Anime_rank_idx" ON "Anime"("rank");

-- CreateIndex
CREATE INDEX "Anime_members_idx" ON "Anime"("members");

-- CreateIndex
CREATE INDEX "Anime_airing_idx" ON "Anime"("airing");

-- CreateIndex
CREATE INDEX "Anime_year_season_idx" ON "Anime"("year", "season");

-- CreateIndex
CREATE UNIQUE INDEX "Genre_name_key" ON "Genre"("name");

-- CreateIndex
CREATE INDEX "GenreOnAnime_genreId_idx" ON "GenreOnAnime"("genreId");

-- AddForeignKey
ALTER TABLE "LibraryEntry" ADD CONSTRAINT "LibraryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryEntry" ADD CONSTRAINT "LibraryEntry_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenreOnAnime" ADD CONSTRAINT "GenreOnAnime_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenreOnAnime" ADD CONSTRAINT "GenreOnAnime_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
