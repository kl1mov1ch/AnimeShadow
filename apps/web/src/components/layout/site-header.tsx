import {
  BookmarkIcon,
  CompassIcon,
  LanguagesIcon,
  LayoutGridIcon,
  LogInIcon,
  LogOutIcon,
  MenuIcon,
  MoonStarIcon,
  ScanSearchIcon,
  ShieldIcon,
  ShuffleIcon,
  SunIcon,
  UserPlusIcon,
  WandSparklesIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { useTheme } from "next-themes";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { InstallAppButton, InstallAppMenuRow } from "@/components/layout/install-app-button";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { SearchBox } from "@/components/layout/search-box";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LOCALE_LABELS, LOCALES, type Locale } from "@animeshadow/shared";
import { useAuth } from "@/hooks/use-auth";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useI18n } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { useRecommendationsStatus } from "@/lib/query";
import { cn } from "@/lib/utils";

// A plain underlined text link, active state aside, read as the most
// static thing in the header — no motion, no fill, nothing to notice it
// by except colour. Pills instead: a filled, gently lifted primary pill
// for wherever the visitor already is, a quiet hover-fill for the rest —
// the same shape language `navClass` uses everywhere else it was clicked,
// now the header's own nav gets it too.
function navClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "group relative flex items-center gap-1.5 overflow-hidden rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all duration-200",
    isActive
      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
      : "text-muted-foreground hover:-translate-y-0.5 hover:bg-secondary/70 hover:text-foreground",
  );
}

/** The band of light that sweeps across a control on hover — the header's
 * one repeated flourish, shared by the nav pills, the random-anime button
 * and the register call to action so they read as the same idea rather
 * than three unrelated effects. */
function Shimmer() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent via-primary/35 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
    />
  );
}

function Wordmark() {
  return (
    <Link
      to="/"
      className="flex shrink-0 items-center gap-1.5 font-display text-lg tracking-tight"
    >
      <span aria-hidden className="text-primary">
        影
      </span>
      AnimeShadow
    </Link>
  );
}

export function SiteHeader() {
  const { t } = useI18n();
  const { status, user } = useAuth();
  const { canInstall, isIosSafari } = usePwaInstall();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const surprise = async () => {
    try {
      const r = await apiRequest<{ slug: string }>("/anime/random");
      navigate(`/anime/${r.slug}`);
    } catch {
      /* ignore */
    }
  };

  const nav = [
    { to: "/", label: t("nav.discover"), end: true, Icon: CompassIcon },
    { to: "/browse", label: t("nav.browse"), end: false, Icon: LayoutGridIcon },
    ...(status === "authenticated"
      ? [{ to: "/library", label: t("nav.library"), end: false, Icon: BookmarkIcon }]
      : []),
    ...(status === "authenticated" && user?.role === "ADMIN"
      ? [{ to: "/admin", label: t("nav.admin"), end: false, Icon: ShieldIcon }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
      />
      <div className="reveal-group mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:gap-5">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 shrink-0 md:hidden"
              aria-label={t("common.menu")}
            >
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <MobileMenu
            nav={nav}
            onNavigate={() => setMenuOpen(false)}
          />
        </Sheet>

        <div className="reveal" style={{ "--i": 0 } as CSSProperties}>
          <Wordmark />
        </div>

        {/* Tighter than it was: with the labels this wide, gap-5/6 pushed the
            search field and the icon row outward on a narrow laptop. */}
        <nav className="hidden items-center gap-3 md:flex lg:gap-4">
          {nav.map((item, i) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={navClass}
            >
              <span
                className="reveal relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap"
                style={{ "--i": i + 1 } as CSSProperties}
              >
                <item.Icon className="size-4" />
                {item.label}
              </span>
              <Shimmer />
            </NavLink>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <div className="hidden min-w-0 md:block">
            <SearchBox />
          </div>
          <div className="hidden md:flex">
            {/* Frame search sits here as an icon rather than as a labelled
                nav item: it was the longest label in the bar and stretched
                the whole header for a feature most visits never use. It
                keeps a tooltip — unlike the theme and language toggles, a
                scan glyph is genuinely unguessable, and this is now its only
                entry point on desktop. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  aria-label={t("frameSearch.navLabel")}
                >
                  <Link to="/frame-search">
                    <ScanSearchIcon />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("frameSearch.navLabel")}</TooltipContent>
            </Tooltip>
            {/* The other icon worth a tooltip — it's an invitation ("just
                pick something for me"), not a utility toggle, so it also
                gets the one bit of flourish here: a soft band of light
                sweeping across it on hover. Language/theme/install below
                lost their tooltips on purpose — icons that self-explain
                once you've seen them once don't need a label reappearing
                every single hover. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={surprise}
                  aria-label={t("footer.randomAnime")}
                  className="group relative overflow-hidden"
                >
                  <ShuffleIcon className="relative z-10" />
                  <Shimmer />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("footer.randomAnime")}</TooltipContent>
            </Tooltip>
            <LanguageSwitcher />
            <ThemeToggle />
            {/* Only rendered once the browser actually has something to
                offer (a native prompt, or Safari on an iPhone/iPad) — no
                dead button on the many browsers/platforms with no install
                path at all. */}
            {(canInstall || isIosSafari) && <InstallAppButton />}
          </div>
          <UserMenu />
        </div>
      </div>

      <div className="border-t px-4 py-2 md:hidden">
        <SearchBox />
      </div>
    </header>
  );
}

/* ---------------- mobile menu ---------------- */

interface NavItem {
  to: string;
  label: string;
  end: boolean;
  Icon: typeof CompassIcon;
}

function MobileMenu({
  nav,
  onNavigate,
}: {
  nav: NavItem[];
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const authed = status === "authenticated" && user;
  const { data: configured } = useRecommendationsStatus(Boolean(authed));
  const needsSetup = Boolean(authed) && configured === false;

  const surprise = async () => {
    try {
      const r = await apiRequest<{ slug: string }>("/anime/random");
      onNavigate();
      navigate(`/anime/${r.slug}`);
    } catch {
      /* ignore */
    }
  };

  return (
    <SheetContent side="left" className="flex w-[19rem] flex-col gap-0 p-0">
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle>
          <Wordmark />
        </SheetTitle>
      </SheetHeader>

      {/* identity */}
      <div className="p-3">
        {authed ? (
          <Link
            to="/profile"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-xl bg-accent/50 p-3 transition-colors hover:bg-accent"
          >
            <Avatar className="size-10">
              {user.avatarUrl && <AvatarImage src={imageSrc(user.avatarUrl)} alt="" />}
              <AvatarFallback className="text-sm font-semibold">
                {user.displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {user.displayName}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
          </Link>
        ) : null}
        {needsSetup && (
          <Link
            to="/recommendations"
            onClick={onNavigate}
            className="mt-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <WandSparklesIcon className="size-4 shrink-0" />
            {t("recommendations.menuNudge")}
          </Link>
        )}
        {!authed && (
          <div className="flex gap-2">
            <Button asChild variant="outline" className="flex-1" onClick={onNavigate}>
              <Link to="/login">
                <LogInIcon />
                {t("common.signIn")}
              </Link>
            </Button>
            <Button asChild className="flex-1" onClick={onNavigate}>
              <Link to="/register">
                <UserPlusIcon />
                {t("common.createAccount")}
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* nav */}
      <nav className="flex flex-col gap-0.5 px-3">
        {nav.map(({ to, label, end, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )
            }
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* quick action */}
      <div className="flex flex-col gap-2 p-3">
        {/* Keeps its label here. It left the desktop bar because the label
            was stretching the header, but a sheet has the room and an
            unexplained glyph in a vertical list would be worse. */}
        <Link
          to="/frame-search"
          onClick={onNavigate}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <ScanSearchIcon className="size-4 shrink-0 text-primary" />
          {t("frameSearch.navLabel")}
        </Link>
        <button
          type="button"
          onClick={surprise}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <ShuffleIcon className="size-4 shrink-0 text-primary" />
          {t("footer.randomAnime")}
        </button>
        <InstallAppMenuRow />
      </div>

      <Separator />

      {/* preferences */}
      <div className="flex flex-col gap-1 p-3">
        <MobileLanguage />
        <MobileTheme />
      </div>

      {authed && (
        <>
          <Separator />
          <div className="p-3">
            <button
              type="button"
              onClick={() => {
                logout();
                onNavigate();
                navigate("/");
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOutIcon className="size-4 shrink-0" />
              {t("common.signOut")}
            </button>
          </div>
        </>
      )}

      <div className="mt-auto border-t px-5 py-3 text-xs text-muted-foreground/70">
        {t("footer.rights", { year: new Date().getFullYear() })}
      </div>
    </SheetContent>
  );
}

/** One button, like MobileTheme below — with exactly two locales, a row of
 * two pills for "pick one of these" was really just a toggle in disguise. */
function MobileLanguage() {
  const { locale, setLocale, t } = useI18n();
  const other: Locale = LOCALES.find((code) => code !== locale) ?? LOCALES[0]!;
  return (
    <button
      type="button"
      onClick={() => setLocale(other)}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
    >
      <LanguagesIcon className="size-4" />
      {t("locale.switchTo", { language: LOCALE_LABELS[other] })}
    </button>
  );
}

function MobileTheme() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
    >
      {isDark ? <SunIcon className="size-4" /> : <MoonStarIcon className="size-4" />}
      {isDark ? t("theme.toLight") : t("theme.toDark")}
    </button>
  );
}
