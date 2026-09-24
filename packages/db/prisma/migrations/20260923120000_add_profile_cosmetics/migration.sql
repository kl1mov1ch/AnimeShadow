-- Earned cosmetics: an avatar frame and a fixed profile title, both keys
-- from the catalogues in @animeshadow/shared. Nullable because "wearing
-- nothing" is a valid, and the default, state.
ALTER TABLE "User" ADD COLUMN "avatarFrame" TEXT;
ALTER TABLE "User" ADD COLUMN "profileTitle" TEXT;
