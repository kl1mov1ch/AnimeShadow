-- "Popular new": popularity weighed by age, the catalogue's default order.
ALTER TABLE "Anime" ADD COLUMN "freshness" DOUBLE PRECISION;
CREATE INDEX "Anime_freshness_idx" ON "Anime"("freshness" DESC);
