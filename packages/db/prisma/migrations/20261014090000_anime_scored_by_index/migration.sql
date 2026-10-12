-- The catalogue orders by popularity on this column (every row has it).
CREATE INDEX "Anime_scoredBy_idx" ON "Anime"("scoredBy" DESC);
