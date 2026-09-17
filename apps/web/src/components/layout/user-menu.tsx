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
        <Button
          asChild
          size="sm"
          className="group relative hidden h-8 overflow-hidden bg-gradient-to-r from-primary via-primary/85 to-primary font-semibold shadow-md shadow-primary/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/40 sm:inline-flex"
        >
          <Link to="/register">
            <UserPlusIcon className="relative z-10" />
            <span className="relative z-10">{t("common.createAccount")}</span>
            {/* Same band of light as the random-anime button, so the two
                deliberate flourishes in the header read as one idea. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
            />
          </Link>
        </Button>
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
          <Avatar className="size-9 ring-2 ring-border ring-offset-2 ring-offset-background transition-shadow hover:ring-primary/50">
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
            <Link to="/library">
              <LibraryIcon />
              {t("nav.library")}
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
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {/* Settings and Achievements — one tap each, not buried a level
            deeper inside the profile page's own tabs. */}
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/profile?tab=settings">
              <SettingsIcon />
              {t("profile.tabs.settings")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/profile?tab=achievements">
              <TrophyIcon />
              {t("profile.tabs.achievements")}
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
