CREATE TABLE "WatchPartyRoom" (
  "code" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WatchPartyRoom_pkey" PRIMARY KEY ("code")
);
