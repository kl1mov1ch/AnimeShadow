-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "accent" TEXT,
ADD COLUMN     "allowComments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "layout" TEXT NOT NULL DEFAULT 'list';

