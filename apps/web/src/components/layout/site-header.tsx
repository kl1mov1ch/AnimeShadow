import {
  BookmarkIcon,
  HouseIcon,
  LanguagesIcon,
  LayoutGridIcon,
  LibraryBigIcon,
  LogInIcon,
  LogOutIcon,
  MenuIcon,
  MoonStarIcon,
  ScanSearchIcon,
  SearchIcon,
  ShieldCheckIcon,
  ShuffleIcon,
  SunIcon,
  UserPlusIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Wordmark } from "@/components/brand/wordmark";
import { InstallAppButton, InstallAppMenuRow } from "@/components/layout/install-app-button";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { RandomRoll } from "@/components/layout/random-roll";
import { SearchBox } from "@/components/layout/search-box";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LOCALE_LABELS, LOCALES, type Locale } from "@animeshadow/shared";
import { useAuth } from "@/hooks/use-auth";
import { useScrollDirection } from "@/hooks/use-scroll-direction";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useI18n } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { useRecommendationsStatus } from "@/lib/query";
import { OPEN_SEARCH_EVENT } from "@/lib/search-events";
import { cn } from "@/lib/utils";
import { FEATURES } from "@/lib/features";
import { HeaderAvatar } from "@/components/layout/header-avatar";

interface NavItem {
  to: string;
  label: string;
  end: boolean;
  Icon: typeof HouseIcon;
}

/**
 * Where the active section's underline sits, measured off the link itself,
 * so it can slide from one section to the next instead of jumping.
 */
function useNavIndicator(navRef: React.RefObject<HTMLElement | null>) {
  const location = useLocation();
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      setBox(active ? { left: active.offsetLeft + 10, width: active.offsetWidth - 20 } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [navRef, location.pathname]);

  return box;
}

/** Whether the page has scrolled away from the top — the header gains a shadow. */
function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

/** A random title, straight to its page. */
function useSurprise(onDone?: () => void) {
  const navigate = useNavigate();
  const [rolling, setRolling] = useState(false);
  const roll = async () => {
    if (rolling) return;
    setRolling(true);
    try {
      const r = await apiRequest<{ slug: string }>("/anime/random");
      onDone?.();
      navigate(`/anime/${r.slug}`);
    } catch {
      /* nothing to open — stay put */
    } finally {
      setRolling(false);
    }
  };
  return { roll, rolling };
}

/**
 * The site header: the mark, the sections, search, and the account.
 *
 * On a computer the sections are plain words with one thin line under the
 * current one, sliding along as you move between them — the header frames
 * the page instead of competing with it. On a phone it is the mark, a
 * search button and the menu, at the right edge where a thumb reaches it;
 * search opens the full search window rather than squeezing an input into
 * a second row under the bar. There it also steps aside while the page is
 * scrolled down and comes back on the way up: on a phone's short screen the
 * list being read gets the whole height.
 */
export function SiteHeader() {
  const { t } = useI18n();
  const { status, user } = useAuth();
  const { canInstall, isIosSafari } = usePwaInstall();
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const indicator = useNavIndicator(navRef);
  const scrolled = useScrolled();
  const { down, nearTop } = useScrollDirection();
  const tuckAway = down && !nearTop && !menuOpen;

  const nav: NavItem[] = [
    { to: "/", label: t("nav.discover"), end: true, Icon: HouseIcon },
    { to: "/browse", label: t("nav.browse"), end: false, Icon: LayoutGridIcon },
    { to: "/collections", label: t("nav.collections"), end: false, Icon: LibraryBigIcon },
    ...(status === "authenticated"
      ? [{ to: "/library", label: t("nav.library"), end: false, Icon: BookmarkIcon }]
      : []),
    ...(status === "authenticated" && user?.role === "ADMIN"
      ? [{ to: "/admin", label: t("nav.admin"), end: false, Icon: ShieldCheckIcon }]
      : []),
  ];

  const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-background/95 transition-[transform,box-shadow,border-color] duration-300 ease-out",
        scrolled ? "border-border/60 shadow-lg shadow-black/20" : "border-border/40",
        tuckAway && "max-md:-translate-y-full max-md:shadow-none",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 lg:gap-8">
        <Wordmark effect="slice" className="max-[374px]:text-base" />

        <nav ref={navRef} aria-label={t("common.menu")} className="relative hidden h-16 items-center lg:flex">
          {nav.map((item) => (
            <NavLink
              viewTransition
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex h-16 items-center whitespace-nowrap px-2.5 text-sm font-medium transition-colors duration-200",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
          {indicator && (
            <span
              aria-hidden
              className="absolute -bottom-px h-0.5 rounded-full bg-primary transition-[left,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ left: indicator.left, width: indicator.width }}
            />
          )}
        </nav>

        <div className="ml-auto flex min-w-0 items-center justify-end gap-1">
          <div className="hidden min-w-0 md:block">
            <SearchBox />
          </div>
          <RandomRoll />
          <div className="hidden items-center md:flex">
            {FEATURES.frameSearch && (
              <HeaderIcon label={t("frameSearch.navLabel")} to="/frame-search">
                <ScanSearchIcon />
              </HeaderIcon>
            )}
            {FEATURES.englishLocale && <LanguageSwitcher />}
            {FEATURES.lightTheme && <ThemeToggle />}
            {(canInstall || isIosSafari) && <InstallAppButton />}
          </div>
          <div className="hidden md:block">
            <UserMenu />
          </div>

          {/* A phone: search and the menu, on the right. */}
          <HeaderIcon label={t("common.search")} onClick={openSearch} className="md:hidden">
            <SearchIcon />
          </HeaderIcon>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-mr-2 shrink-0 lg:hidden" aria-label={t("common.menu")}>
                <MorphIcon on={menuOpen} off={MenuIcon} onIcon={XIcon} className="size-5" />
              </Button>
            </SheetTrigger>
            <MobileMenu nav={nav} onNavigate={() => setMenuOpen(false)} />
          </Sheet>
        </div>
      </div>
    </header>
  );
}

/** A square icon button in the bar: a link or an action, with its name as a hint. */
function HeaderIcon({
  label,
  to,
  onClick,
  className,
  children,
}: {
  label: string;
  to?: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const classes = cn(
    "grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-foreground/[0.06] hover:text-foreground [&_svg]:size-[18px]",
    className,
  );
  return to ? (
    <Link to={to} aria-label={label} title={label} className={classes}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={classes}>
      {children}
    </button>
  );
}

/* ---------------- mobile menu ---------------- */

function MobileMenu({ nav, onNavigate }: { nav: NavItem[]; onNavigate: () => void }) {
  const { t } = useI18n();
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const authed = status === "authenticated" && user;
  const { data: configured } = useRecommendationsStatus(Boolean(authed));
  const needsSetup = Boolean(authed) && configured === false;
  const { roll } = useSurprise(onNavigate);

  const row =
    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:bg-foreground/[0.07] focus-visible:text-foreground";

  return (
    <SheetContent side="right" className="flex w-[min(20rem,88vw)] flex-col gap-0 p-0">
      <SheetHeader className="border-b border-border/60 px-5 py-4">
        <SheetTitle>
          <Wordmark />
        </SheetTitle>
      </SheetHeader>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* who */}
        <div className="p-3">
          {authed ? (
            <Link
              to="/profile"
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-3 transition-colors hover:bg-card"
            >
              <HeaderAvatar user={user} className="size-10" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{user.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
            </Link>
          ) : (
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
          {needsSetup && (
            <Link
              to="/recommendations"
              onClick={onNavigate}
              className="mt-2 flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.05]"
            >
              <WandSparklesIcon className="size-4 shrink-0 text-primary" />
              {t("recommendations.menuNudge")}
            </Link>
          )}
        </div>

        {/* where */}
        <nav className="flex flex-col gap-0.5 px-3">
          {nav.map(({ to, label, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) => cn(row, isActive && "bg-foreground/[0.07] text-foreground")}
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn("size-[18px] shrink-0", isActive && "text-primary")} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <Separator className="my-3" />

        {/* what else */}
        <div className="flex flex-col gap-0.5 px-3">
          {FEATURES.frameSearch && (
            <Link to="/frame-search" onClick={onNavigate} className={row}>
              <ScanSearchIcon className="size-[18px] shrink-0" />
              {t("frameSearch.navLabel")}
            </Link>
          )}
          <button type="button" onClick={() => void roll()} className={cn(row, "text-left")}>
            <ShuffleIcon className="size-[18px] shrink-0" />
            {t("footer.randomAnime")}
          </button>
          <InstallAppMenuRow />
          {FEATURES.englishLocale && <MobileLanguage />}
          {FEATURES.lightTheme && <MobileTheme />}
        </div>

        {authed && (
          <div className="mt-auto p-3">
            <button
              type="button"
              onClick={() => {
                logout();
                onNavigate();
                navigate("/");
              }}
              className={cn(row, "w-full text-destructive hover:bg-destructive/10 hover:text-destructive")}
            >
              <LogOutIcon className="size-[18px] shrink-0" />
              {t("common.signOut")}
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-border/60 px-5 py-3 text-xs text-muted-foreground/70">
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
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
    >
      <LanguagesIcon className="size-[18px]" />
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
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
    >
      <MorphIcon on={isDark} off={MoonStarIcon} onIcon={SunIcon} className="size-[18px]" spin="ccw" />
      {isDark ? t("theme.toLight") : t("theme.toDark")}
    </button>
  );
}
