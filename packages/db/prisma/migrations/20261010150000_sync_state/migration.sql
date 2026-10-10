-- When each background job last finished (catalogue sync from Kodik, …).
CREATE TABLE "SyncState" (
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("key")
);
