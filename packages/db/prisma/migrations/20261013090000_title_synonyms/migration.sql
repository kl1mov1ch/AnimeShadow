-- Other names a title goes by (Shikimori synonyms, abbreviations), for search.
ALTER TABLE "Anime" ADD COLUMN     "namesSyncedAt" TIMESTAMP(3),
ADD COLUMN     "titleSynonyms" TEXT[] DEFAULT ARRAY[]::TEXT[];
