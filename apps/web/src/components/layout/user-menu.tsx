import {
  LibraryIcon,
  LogInIcon,
  LogOutIcon,
  SettingsIcon,
  SparklesIcon,
  TrophyIcon,
  UserIcon,
  UserPlusIcon,
  WandSparklesIcon,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { useRecommendationsStatus } from "@/lib/query";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserMenu() {
  const t = useT();
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const authed = status === "authenticated" && Boolean(user);
  // Unobtrusive by design: a small dot on the avatar, and one extra menu
  // item — never a modal or a toast forced on login. Disappears for good
  // once genres or liked titles exist (see recommendation.service.ts).
  const { data: configured } = useRecommendationsStatus(authed);
  const needsSetup = authed && configured === false;

  if (!authed || !user) {
    return (
      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">
                <LogInIcon />
                {t("common.signIn")}
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("common.signIn")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link to="/register">
                <UserPlusIcon />
                {t("common.createAccount")}
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("common.createAccount")}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t("common.account")}
        >
          <Avatar className="size-8">
            {user.avatarUrl && <AvatarImage src={imageSrc(user.avatarUrl)} alt="" />}
            <AvatarFallback className="text-xs font-semibold">
              {initials(user.displayName)}
            </AvatarFallback>
          </Avatar>
          {needsSetup && (
            <span
              aria-hidden
              className="absolute right-0 top-0 size-2.5 rounded-full bg-primary ring-2 ring-background"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{user.displayName}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        {needsSetup && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/recommendations" className="text-primary focus:text-primary">
                <WandSparklesIcon />
                {t("recommendations.menuNudge")}
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/profile">
              <UserIcon />
              {t("profile.title")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/profile?tab=achievements">
              <TrophyIcon />
              {t("profile.tabs.achievements")}
            </Link>
          </DropdownMenuItem>
          {!needsSetup && (
            <DropdownMenuItem asChild>
              <Link to="/recommendations">
                <WandSparklesIcon />
                {t("recommendations.eyebrow")}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link to="/profile?tab=settings">
              <SettingsIcon />
              {t("profile.tabs.settings")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/library">
              <LibraryIcon />
              {t("nav.library")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/support">
            <SparklesIcon />
            {t("footer.pro")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            logout();
            navigate("/");
          }}
        >
          <LogOutIcon />
          {t("common.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
