-- The exact comment a reply answers (may be a reply inside its thread).
ALTER TABLE "CollectionComment" ADD COLUMN "replyToId" TEXT;
