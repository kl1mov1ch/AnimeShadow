-- AlterTable
ALTER TABLE "PendingRegistration" ADD COLUMN     "failed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sends" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "ticketHash" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

