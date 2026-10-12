-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "likeCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CollectionLike" (
    "collectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionLike_pkey" PRIMARY KEY ("collectionId","userId")
);

-- CreateTable
CREATE TABLE "CollectionFavorite" (
    "collectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionFavorite_pkey" PRIMARY KEY ("collectionId","userId")
);

-- CreateIndex
CREATE INDEX "CollectionLike_userId_idx" ON "CollectionLike"("userId");

-- CreateIndex
CREATE INDEX "CollectionFavorite_userId_createdAt_idx" ON "CollectionFavorite"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CollectionLike" ADD CONSTRAINT "CollectionLike_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionLike" ADD CONSTRAINT "CollectionLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionFavorite" ADD CONSTRAINT "CollectionFavorite_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionFavorite" ADD CONSTRAINT "CollectionFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Ratings move from 1–5 to 1–10: every old vote counts double.
UPDATE "CollectionRating" SET "value" = "value" * 2 WHERE "value" <= 5;
UPDATE "Collection" SET "ratingSum" = "ratingSum" * 2;
