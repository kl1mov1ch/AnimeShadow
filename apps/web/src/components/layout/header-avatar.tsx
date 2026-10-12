import type { MyProfile, PublicUser } from "@animeshadow/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarFrameRing } from "@/components/profile/profile-cosmetics";
import { imageSrc } from "@/lib/format";
import { useMyProfile } from "@/lib/query";
import { cn } from "@/lib/utils";

/**
 * The account's avatar in the header, in the frame it wears on its profile —
 * the same turning rim and the same motion, at header size. The frame comes
 * from the signed-in account, or from the profile already loaded (so a frame
 * picked in the studio shows here at once); nothing is fetched for it.
 */
export function HeaderAvatar({ user, className }: { user: PublicUser; className?: string }) {
  // Never fetched from here — only read when already loaded; the hook
  // carries the query function, so a refetch elsewhere has one.
  const { data: profile } = useMyProfile(false);
  const frame = profile?.avatarFrame ?? user.avatarFrame ?? null;
  const avatarUrl = profile?.avatarUrl ?? user.avatarUrl;
  const initials = user.displayName
    .split(/\s+/)
    .map((p) => p.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <AvatarFrameRing frame={frame as MyProfile["avatarFrame"]} fallback="ring-1 ring-border/70 ring-offset-0" cap={false}>
      <Avatar className={cn("size-9", className)}>
        {avatarUrl && <AvatarImage src={imageSrc(avatarUrl)} alt="" />}
        <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
      </Avatar>
    </AvatarFrameRing>
  );
}
