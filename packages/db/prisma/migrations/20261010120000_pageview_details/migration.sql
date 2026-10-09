-- Richer, still anonymous page views: the session they belong to, what kind
-- of device and browser, where the session came from, and how long the page
-- was looked at. No IP address, no fingerprint.
ALTER TABLE "PageView"
  ADD COLUMN "clientId" TEXT,
  ADD COLUMN "sessionId" TEXT,
  ADD COLUMN "entry" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sessionRef" TEXT,
  ADD COLUMN "device" TEXT,
  ADD COLUMN "browser" TEXT,
  ADD COLUMN "os" TEXT,
  ADD COLUMN "lang" TEXT,
  ADD COLUMN "screenW" INTEGER,
  ADD COLUMN "utmSource" TEXT,
  ADD COLUMN "utmMedium" TEXT,
  ADD COLUMN "utmCampaign" TEXT,
  ADD COLUMN "durationMs" INTEGER;

CREATE INDEX "PageView_visitorId_createdAt_idx" ON "PageView"("visitorId", "createdAt");
CREATE INDEX "PageView_sessionId_idx" ON "PageView"("sessionId");
CREATE UNIQUE INDEX "PageView_clientId_key" ON "PageView"("clientId");
