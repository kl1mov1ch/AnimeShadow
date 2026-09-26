-- Replies on collection comments (one level of threads).
ALTER TABLE "CollectionComment" ADD COLUMN "parentId" TEXT;
CREATE INDEX "CollectionComment_parentId_idx" ON "CollectionComment"("parentId");
ALTER TABLE "CollectionComment" ADD CONSTRAINT "CollectionComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CollectionComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
