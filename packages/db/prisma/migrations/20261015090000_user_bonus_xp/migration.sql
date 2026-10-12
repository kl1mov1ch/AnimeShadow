-- Experience granted by an admin on top of what the account earned.
ALTER TABLE "User" ADD COLUMN     "bonusXp" INTEGER NOT NULL DEFAULT 0;
