import {
  BookmarkIcon,
  CompassIcon,
  LanguagesIcon,
  LayoutGridIcon,
  LogOutIcon,
  MenuIcon,
  MoonStarIcon,
  ShuffleIcon,
  SunIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { useTheme } from "next-themes";
import { Link, NavLink, useNavigate } from "react-router-dom";
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
import { useI18n } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

function navClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "text-sm font-medium transition-colors",
    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
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
  const { status } = useAuth();
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
              aria-label={t("nav.browse")}
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

        <nav className="hidden items-center gap-5 md:flex lg:gap-6">
          {nav.map((item, i) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={navClass}
            >
              <span
                className="reveal inline-block whitespace-nowrap"
                style={{ "--i": i + 1 } as CSSProperties}
              >
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <div className="hidden min-w-0 md:block">
            <SearchBox />
          </div>
          <div className="hidden md:flex">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={surprise}
                  aria-label={t("footer.randomAnime")}
                >
                  <ShuffleIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("footer.randomAnime")}</TooltipContent>
            </Tooltip>
            <LanguageSwitcher />
            <ThemeToggle />
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
        ) : (
          <div className="flex gap-2">
            <Button asChild variant="outline" className="flex-1" onClick={onNavigate}>
              <Link to="/login">{t("common.signIn")}</Link>
            </Button>
            <Button asChild className="flex-1" onClick={onNavigate}>
              <Link to="/register">{t("common.createAccount")}</Link>
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
      <div className="p-3">
        <button
          type="button"
          onClick={surprise}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <ShuffleIcon className="size-4 shrink-0 text-primary" />
          {t("footer.randomAnime")}
        </button>
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

function MobileLanguage() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5 rounded-lg px-3 py-2">
      <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <LanguagesIcon className="size-3.5" />
        {t("locale.label")}
      </span>
      <div className="flex gap-1.5">
        {LOCALES.map((code: Locale) => (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={code === locale}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs transition-colors",
              code === locale
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {LOCALE_LABELS[code]}
          </button>
        ))}
      </div>
    </div>
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
