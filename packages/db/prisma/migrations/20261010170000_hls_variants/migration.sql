-- Every quality a direct stream is published in, per episode.
ALTER TABLE "PlayerSource" ADD COLUMN "hlsVariants" JSONB;
