-- Last time a signed-in user opened a page, for the admin panel.
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

-- Per-user pageview lookups (the admin user view).
CREATE INDEX "PageView_userId_createdAt_idx" ON "PageView"("userId", "createdAt");

-- Backfill from the pageviews already recorded.
UPDATE "User" u
SET "lastSeenAt" = pv.last
FROM (SELECT "userId", MAX("createdAt") AS last FROM "PageView" WHERE "userId" IS NOT NULL GROUP BY "userId") pv
WHERE pv."userId" = u."id";
