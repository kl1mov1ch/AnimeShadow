-- CreateTable
CREATE TABLE "VisitorUser" (
    "visitorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitorUser_pkey" PRIMARY KEY ("visitorId")
);

-- CreateIndex
CREATE INDEX "VisitorUser_userId_idx" ON "VisitorUser"("userId");


-- Tie every browser that was ever signed in to its (latest) account.
INSERT INTO "VisitorUser" ("visitorId", "userId", "updatedAt")
SELECT DISTINCT ON ("visitorId") "visitorId", "userId", now()
FROM "PageView" WHERE "userId" IS NOT NULL
ORDER BY "visitorId", "createdAt" DESC
ON CONFLICT DO NOTHING;

-- Days still backed by raw page views are counted again, as people: the
-- next rollup redoes everything after the last day left here.
DELETE FROM "StatDayKey" WHERE day > (SELECT (MIN("createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')::date FROM "PageView");
DELETE FROM "StatDay" WHERE day > (SELECT (MIN("createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')::date FROM "PageView");
