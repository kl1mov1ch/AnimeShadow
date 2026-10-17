CREATE TABLE "MobileNavigationPreference" (
    "userId" TEXT NOT NULL,
    "buttons" TEXT[] NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MobileNavigationPreference_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "MobileNavigationPreference"
ADD CONSTRAINT "MobileNavigationPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
