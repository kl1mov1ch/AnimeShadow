-- CreateTable
CREATE TABLE "FavoriteMoment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "animeId" INTEGER NOT NULL,
    "episode" INTEGER NOT NULL,
    "seconds" INTEGER NOT NULL,
    "dub" TEXT,
    "note" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteMoment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FavoriteMoment_userId_position_idx" ON "FavoriteMoment"("userId", "position");

-- AddForeignKey
ALTER TABLE "FavoriteMoment" ADD CONSTRAINT "FavoriteMoment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

