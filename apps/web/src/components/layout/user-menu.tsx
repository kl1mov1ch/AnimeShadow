import {
  ChevronRightIcon,
  FolderHeartIcon,
  LibraryIcon,
  LogInIcon,
  LogOutIcon,
  PaletteIcon,
  Settings2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  TrophyIcon,
  UserIcon,
  UserPlusIcon,
  UsersIcon,
  WandSparklesIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ProMark } from "@/components/common/pro-mark";
import { HeaderAvatar } from "@/components/layout/header-avatar";
import { LevelBadge, LevelBar } from "@/components/profile/level-visuals";
import { ProfileTitleBadge } from "@/components/profile/profile-cosmetics";
import { levelOf } from "@/components/profile/profile-level";
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
  const level = useMemo(() => (profile ? levelOf(profile) : null), [profile]);

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
        <Button asChild size="sm" className="h-9 px-3.5 font-semibold">
          <Link to="/register">
            <UserPlusIcon />
            {t("common.createAccount")}
          </Link>
        </Button>
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
      <DropdownMenuContent align="end" sideOffset={10} className="w-[19.5rem] overflow-hidden rounded-2xl border-[var(--accent-line-soft)] p-0">
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
              <span className="relative mt-2 block px-4">
                <ProfileTitleBadge title={profile.profileTitle} tip={false} />
              </span>
            )}
            <span className="relative mx-4 mb-3 mt-3 flex items-center gap-3 rounded-xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] px-3 py-2.5">
              {level ? (
                <>
                  <LevelBadge info={level} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="truncate font-semibold" style={{ color: level.tier.colors[0] }}>
                        {level.tier.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {t("userMenu.toNext", { n: level.level + 1, xp: (level.ceiling - level.xp).toLocaleString("ru-RU") })}
                      </span>
                    </span>
                    <LevelBar info={level} labels={false} className="mt-1.5" />
                  </span>
                </>
              ) : (
                <span className="h-[30px] w-full animate-pulse rounded-lg bg-foreground/[0.06]" />
              )}
            </span>
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

        {/* Where to go, as tiles: one look, one tap. */}
        <div className="grid grid-cols-3 gap-1.5 px-2 pb-2">
          <Tile to="/profile" icon={UserIcon} label={t("userMenu.profile")} />
          <Tile to="/library" icon={LibraryIcon} label={t("userMenu.list")} />
          <Tile to="/profile?tab=people" icon={UsersIcon} label={t("userMenu.friends")} />
          <Tile to="/profile?tab=trophies" icon={TrophyIcon} label={t("userMenu.trophies")} />
          <Tile to="/profile?tab=collections" icon={FolderHeartIcon} label={t("userMenu.collections")} />
          <Tile to="/recommendations" icon={WandSparklesIcon} label={t("userMenu.forYou")} />
        </div>

        <DropdownMenuSeparator className="mx-0 my-0" />
        <div className="flex flex-col p-1.5">
          <Row to="/profile?studio=profile" icon={Settings2Icon}>
            {t("userMenu.customise")}
          </Row>
          <Row to="/profile?studio=look" icon={PaletteIcon}>
            {t("userMenu.look")}
          </Row>
          {user.role === "ADMIN" && (
            <Row to="/admin" icon={ShieldCheckIcon}>
              {t("userMenu.admin")}
            </Row>
          )}
        </div>

        {/* Support, as a card of its own rather than one more line. */}
        <DropdownMenuItem asChild className="mx-2 mb-1.5 rounded-xl border border-amber-400/25 bg-gradient-to-r from-amber-400/10 via-rose-500/10 to-violet-500/10 px-3 py-2.5 focus:bg-amber-400/15">
          <Link to="/support">
            <SparklesIcon className="text-amber-300" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold">{t("userMenu.support")}</span>
              <span className="truncate text-[11px] text-muted-foreground">{t("userMenu.supportHint")}</span>
            </span>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
        </DropdownMenuItem>

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

function Tile({ to, icon: Icon, label }: { to: string; icon: ComponentType<{ className?: string }>; label: string }) {
  return (
    <DropdownMenuItem asChild className="group/tile flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--accent-line-soft)] bg-foreground/[0.02] px-1 py-3 text-center focus:border-primary/40 focus:bg-primary/10">
      <Link to={to}>
        <Icon className="size-5 text-primary transition-transform duration-200 group-hover/tile:-translate-y-0.5 group-focus/tile:-translate-y-0.5" />
        <span className="w-full truncate text-[11px] font-medium">{label}</span>
      </Link>
    </DropdownMenuItem>
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
