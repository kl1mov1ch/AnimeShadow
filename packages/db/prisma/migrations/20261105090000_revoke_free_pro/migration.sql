-- PRO only from the welcome gift or a purchase. Accounts that were made PRO
-- for good at sign-up (PRO_FOR_ALL — proSince set within two minutes of the
-- account being created, no end date) lose it; their 15-day gift (trialUntil)
-- stays. PRO given by an admin later (a purchase) is left alone.
UPDATE "User"
SET "proSince" = NULL
WHERE "proSince" IS NOT NULL
  AND "proUntil" IS NULL
  AND ABS(EXTRACT(EPOCH FROM ("proSince" - "createdAt"))) < 120;
