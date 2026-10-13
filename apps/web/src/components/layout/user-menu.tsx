import {
  ChevronRightIcon,
  HeartIcon,
  FolderHeartIcon,
  LibraryIcon,
  LogInIcon,
  LogOutIcon,
  Settings2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  UserPlusIcon,
  WandSparklesIcon, GiftIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ProMark } from "@/components/common/pro-mark";
import { HeaderAvatar } from "@/components/layout/header-avatar";
import { ProfileTitleBadge } from "@/components/profile/profile-cosmetics";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { useMyProfile, useRecommendationsStatus } from "@/lib/query";
import { cn } from "@/lib/utils";

export function UserMenu() {
  const t = useT();
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const authed = status === "authenticated" && Boolean(user);
  // Unobtrusive by design: a small dot on the avatar, and one extra menu
  // item — never a modal or a toast forced on login. Disappears for good
  // once genres or liked titles exist (see recommendation.service.ts).
  const { data: configured } = useRecommendationsStatus(authed);
  const needsSetup = authed && configured === false;
  // The card on top needs the profile — asked for only once the menu opens
  // (and already there if the profile page was visited).
  const { data: profile } = useMyProfile(authed && open);

  if (!authed || !user) {
    return (
      <div className="flex items-center gap-1.5">
        {/* Signing in is for people who already decided — it doesn't need to
            compete for attention, so it's down to a bare icon with its
            label in a tooltip. Registering is the one thing worth selling
            here, so it keeps the only loud button in the header. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon" aria-label={t("common.signIn")}>
              <Link to="/login">
                <LogInIcon />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("common.signIn")}</TooltipContent>
        </Tooltip>
        {/* A quiet invite: gradient text in a soft pill, not a loud button. */}
        <Link
          to="/register"
          title={t("common.createAccount")}
          className="group inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.08] px-3.5 text-[13px] font-semibold transition-colors hover:border-primary/60 hover:bg-primary/15"
        >
          <UserPlusIcon className="size-4 text-primary" />
          <span className="bg-gradient-to-r from-primary via-rose-400 to-fuchsia-400 bg-clip-text text-transparent">Стать участником</span>
        </Link>
      </div>
    );
  }

  const banner = profile?.bannerUrl ? imageSrc(profile.bannerUrl) : undefined;
  const handle = profile?.username ?? null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("common.account")}>
          <HeaderAvatar user={user} />
          {needsSetup && <span aria-hidden className="absolute right-0 top-0 size-2.5 rounded-full bg-primary ring-2 ring-background" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-[min(15.5rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border-[var(--accent-line-soft)] p-0">
        {/* Who you are: the cover, the face in its frame, the name with its
            marks, and how far the next level is. The whole card is the way
            to the profile. */}
        <DropdownMenuItem asChild className="block rounded-none p-0 focus:bg-transparent">
          <Link to="/profile" className="group/card relative block">
            <span className="absolute inset-x-0 top-0 block h-16 overflow-hidden">
              {banner ? (
                <img src={banner} alt="" className="size-full object-cover opacity-70 transition-transform duration-500 group-hover/card:scale-105" />
              ) : (
                <span className="block size-full bg-[radial-gradient(120%_140%_at_0%_0%,var(--accent-surface-strong),transparent_70%)]" />
              )}
              <span className="absolute inset-0 bg-gradient-to-b from-transparent to-popover" />
            </span>
            <span className="relative flex items-end gap-3 px-4 pt-7">
              <span className="shrink-0 rounded-full bg-popover p-1">
                <HeaderAvatar user={user} className="size-12" />
              </span>
              <span className="min-w-0 flex-1 pb-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold transition-colors group-hover/card:text-primary">{user.displayName}</span>
                  {profile?.isPro && <ProMark className="text-xs" />}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{handle ? `@${handle}` : user.email}</span>
              </span>
              <ChevronRightIcon className="mb-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover/card:translate-x-0.5" />
            </span>
            {profile?.profileTitle && (
              <span className="relative mt-2 block px-4 pb-3">
                <ProfileTitleBadge title={profile.profileTitle} tip={false} />
              </span>
            )}
          </Link>
        </DropdownMenuItem>

        {needsSetup && (
          <DropdownMenuItem asChild className="mx-2 mb-2 rounded-xl bg-primary/10 px-3 py-2.5 text-primary focus:bg-primary/15 focus:text-primary">
            <Link to="/recommendations">
              <WandSparklesIcon />
              <span className="flex-1">{t("recommendations.menuNudge")}</span>
              <ChevronRightIcon className="size-4" />
            </Link>
          </DropdownMenuItem>
        )}

        {/* The card above is the way to the profile; below, only places
            that are not the profile, and settings. */}
        <DropdownMenuSeparator className="mx-0 my-0" />
        <div className="flex flex-col p-1.5">
          <Row to="/library" icon={LibraryIcon}>{t("userMenu.list")}</Row>
          <Row to="/collections" icon={FolderHeartIcon}>{t("userMenu.collections")}</Row>
          <Row to="/recommendations" icon={WandSparklesIcon}>{t("userMenu.forYou")}</Row>
          <Row to="/profile?tab=invite" icon={GiftIcon}>Пригласить друга</Row>
          <Row to="/profile?studio=profile" icon={Settings2Icon}>{t("userMenu.customise")}</Row>
          {user.role === "ADMIN" && <Row to="/admin" icon={ShieldCheckIcon}>{t("userMenu.admin")}</Row>}
        </div>
        <div className="px-1.5 pb-1.5">
          <DropdownMenuItem asChild className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-primary via-rose-500 to-fuchsia-500 px-3 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/30 focus:bg-primary focus:text-white">
            <Link to="/support">
              <HeartIcon className="support-beat size-4 fill-current text-white" />
              <span className="flex-1">{t("userMenu.support")}</span>
              <SparklesIcon className="size-4 text-white/80" />
            </Link>
          </DropdownMenuItem>
        </div>
        <DropdownMenuSeparator className="mx-0 my-0" />
        <div className="p-1.5">
          <DropdownMenuItem
            variant="destructive"
            className="rounded-lg px-3 py-2"
            onSelect={() => {
              logout();
              navigate("/");
            }}
          >
            <LogOutIcon />
            {t("common.signOut")}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Row({ to, icon: Icon, children }: { to: string; icon: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <DropdownMenuItem asChild className={cn("rounded-lg px-3 py-2")}>
      <Link to={to}>
        <Icon className="text-muted-foreground" />
        <span className="flex-1">{children}</span>
        <ChevronRightIcon className="size-3.5 text-muted-foreground/60" />
      </Link>
    </DropdownMenuItem>
  );
}
