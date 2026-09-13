-- CreateTable
CREATE TABLE "UserLikedAnime" (
    "userId" TEXT NOT NULL,
    "animeId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLikedAnime_pkey" PRIMARY KEY ("userId","animeId")
);

-- CreateIndex
CREATE INDEX "UserLikedAnime_animeId_idx" ON "UserLikedAnime"("animeId");

-- AddForeignKey
ALTER TABLE "UserLikedAnime" ADD CONSTRAINT "UserLikedAnime_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLikedAnime" ADD CONSTRAINT "UserLikedAnime_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
