-- Guess game: more frames per title, and a per-player deck position.
ALTER TABLE "Anime" ADD COLUMN "gameFrames" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "GuessScore" ADD COLUMN "deckSeed" INTEGER;
ALTER TABLE "GuessScore" ADD COLUMN "deckPos" INTEGER NOT NULL DEFAULT 0;
