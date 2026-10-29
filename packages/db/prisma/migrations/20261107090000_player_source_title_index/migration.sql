-- The studios section looks titles up by their dub studio.
CREATE INDEX IF NOT EXISTS "PlayerSource_title_idx" ON "PlayerSource"("title");
