import {
  UsersIcon,
  TrophyIcon,
  CalendarClockIcon,
  BookmarkIcon,
  HeartIcon,
  ChevronRightIcon,
  HouseIcon,
  LanguagesIcon,
  LayoutGridIcon,
  LibraryBigIcon,
  LogInIcon,
  LogOutIcon,
  MenuIcon,
  MicVocalIcon,
  MoonStarIcon,
  SearchIcon,
  ShieldCheckIcon,
  Settings2Icon,
  ShuffleIcon,
  SparklesIcon,
  SunIcon,
  UserPlusIcon,
  WandSparklesIcon,
  XIcon,
  GiftIcon,
} from "lucide-react";
import { TelegramGlyph, useTelegramConnect } from "@/components/telegram-connect";
import { NotificationBell } from "@/components/notification-bell";
import { useCallback, useEffect, useRef, useState } from "react";
import { HeaderOverlayContext } from "@/hooks/use-header-overlay";
import { useTheme } from "next-themes";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Wordmark } from "@/components/brand/wordmark";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import {
  InstallAppButton,
  InstallAppMenuRow,
} from "@/components/layout/install-app-button";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { RandomRoll } from "@/components/layout/random-roll";
import { SearchBox } from "@/components/layout/search-box";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { RewardsWaiting, UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LOCALE_LABELS, LOCALES, type Locale } from "@animeshadow/shared";
import { useAuth } from "@/hooks/use-auth";
import { useScrollDirection } from "@/hooks/use-scroll-direction";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useI18n } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { useMyProfile, useRecommendationsStatus } from "@/lib/query";
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
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlayLocks, setOverlayLocks] = useState(0);
  const acquireOverlay = useCallback(() => {
    setOverlayLocks((count) => count + 1);
    return () => setOverlayLocks((count) => Math.max(0, count - 1));
  }, []);
  const navRef = useRef<HTMLElement | null>(null);
  const scrolled = useScrolled();
  const { down, nearTop } = useScrollDirection(96, menuOpen || overlayLocks > 0);
  const tuckAway = down && !nearTop && !menuOpen && overlayLocks === 0;

  const nav: NavItem[] = [
    { to: "/", label: t("nav.discover"), end: true, Icon: HouseIcon },
    { to: "/browse", label: t("nav.browse"), end: false, Icon: LayoutGridIcon },
    {
      to: "/collections",
      label: t("nav.collections"),
      end: false,
      Icon: LibraryBigIcon,
    },
    { to: "/leaderboards", label: "Топ зрителей", end: false, Icon: TrophyIcon },
    { to: "/schedule", label: "Расписание", end: false, Icon: CalendarClockIcon },
    ...(status === "authenticated"
      ? [{ to: "/library", label: t("nav.library"), end: false, Icon: BookmarkIcon }]
      : []),
    ...(status === "authenticated" && user?.role === "ADMIN"
      ? [{ to: "/admin", label: t("nav.admin"), end: false, Icon: ShieldCheckIcon }]
      : []),
  ];

  const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));

  return (
    <HeaderOverlayContext value={acquireOverlay}>
      <header
        data-site-header
        data-hidden={tuckAway}
        className={cn(
          "sticky top-0 z-40 border-b bg-background pt-[env(safe-area-inset-top)] transition-transform duration-200 ease-out motion-reduce:transition-none",
          scrolled ? "border-border/60 shadow-lg shadow-black/20" : "border-border/40",
          tuckAway && "-translate-y-full shadow-none",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "header-line pointer-events-none absolute inset-x-0 -bottom-px h-px transition-opacity duration-500",
            scrolled ? "opacity-100" : "opacity-0",
          )}
        />
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 lg:gap-5">
          <Wordmark textClassName="max-md:text-[0.79rem]" />

          {/* The sections, as icons: the one you're in shows its name, the
            others open theirs under the pointer — the bar stays short and
            the search gets the room. */}
          <nav
            ref={navRef}
            aria-label={t("common.menu")}
            className="relative hidden items-center gap-0.5 rounded-full border border-border/50 bg-card/40 p-1 lg:flex"
          >
            {nav
              .filter((item) => item.to !== "/library")
              .map(({ to, label, end, Icon }) => (
                <NavLink
                  viewTransition
                  key={to}
                  to={to}
                  end={end}
                  aria-label={label}
                  className={({ isActive }) =>
                    cn(
                      "hnav-item group relative flex h-8 items-center rounded-full px-2.5 text-sm font-medium transition-[background-color,color,transform] duration-150 active:scale-90",
                      isActive
                        ? "hnav-active text-foreground"
                        : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn(
                          "size-[17px] shrink-0",
                          isActive && "text-primary",
                        )}
                      />
                      {isActive ? (
                        <span className="whitespace-nowrap pl-1.5">{label}</span>
                      ) : (
                        // The others' names as a hint under the icon, over the
                        // page: nothing in the bar moves when the pointer passes.
                        <span
                          role="tooltip"
                          className="hnav-tip pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border/60 bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-lg group-hover:opacity-100 group-focus-visible:opacity-100"
                        >
                          {label}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
          </nav>

          {/* Search sits against the icons on the right: as wide as the room
            between them and the sections allows (fewer sections — wider and
            further right; more — narrower), and it grows while in use. */}
          <div className="header-search ml-auto hidden min-w-[11rem] flex-1 basis-0 md:block md:max-w-[26rem] xl:max-w-[30rem] focus-within:md:max-w-[34rem]">
            <SearchBox />
          </div>

          <div className="ml-auto flex shrink-0 items-center justify-end gap-0.5 md:ml-0">
            {/* A guest's phone header has the invite in this spot instead. */}
            {/* Watching together: pick an anime, get a room. */}
            <HeaderIcon
              label="Совместный просмотр"
              to="/party"
              className="hidden md:grid"
            >
              <UsersIcon />
            </HeaderIcon>
            <div className="hidden md:flex">
              <span className="hdr-dice contents">
                <RandomRoll />
              </span>
            </div>
            <div className="hidden items-center md:flex">
              {FEATURES.englishLocale && <LanguageSwitcher />}
              {FEATURES.lightTheme && <ThemeToggle />}
              {(canInstall || isIosSafari) && <InstallAppButton />}
            </div>
            <NotificationBell className="hdr-bell hidden md:grid" />
            <div className="hidden md:block">
              <UserMenu />
            </div>

            {/* A phone: a quiet invite for guests, search and the menu. */}
            {status === "anonymous" && (
              <Link
                to="/register"
                aria-label="Зарегистрироваться"
                title="Зарегистрироваться"
                className="mr-0.5 inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2 text-[12px] font-semibold text-foreground min-[440px]:px-2.5 md:hidden"
              >
                <LogoGlyph className="size-4 text-primary" />
                <span className="hidden min-[440px]:inline">Вступить</span>
              </Link>
            )}
            <NotificationBell className="md:hidden" />
            <HeaderIcon
              label={t("common.search")}
              onClick={openSearch}
              className="hidden min-[380px]:grid md:hidden"
            >
              <SearchIcon />
            </HeaderIcon>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-2 shrink-0 lg:hidden"
                  aria-label={t("common.menu")}
                >
                  <MorphIcon
                    on={menuOpen}
                    off={MenuIcon}
                    onIcon={XIcon}
                    className="size-5"
                  />
                </Button>
              </SheetTrigger>
              <MobileMenu
                active={menuOpen}
                nav={[
                  ...nav,
                  {
                    to: "/studios",
                    label: "Студии озвучки",
                    end: false,
                    Icon: MicVocalIcon,
                  },
                ]}
                onNavigate={() => setMenuOpen(false)}
                onParty={() => {
                  setMenuOpen(false);
                  navigate("/party");
                }}
              />
            </Sheet>
          </div>
        </div>
      </header>
    </HeaderOverlayContext>
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
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={classes}
    >
      {children}
    </button>
  );
}

/* ---------------- mobile menu ---------------- */

/** The phone menu's "Подключить Telegram" (or its state, once tied). */
function MobileTelegramRow({
  row,
  onNavigate,
}: {
  row: string;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const { state, connect } = useTelegramConnect();
  if (state === "unavailable") return null;
  const tied = state === "connected" || state === "off";
  return (
    <button
      type="button"
      onClick={() => {
        if (tied) {
          onNavigate();
          navigate("/profile?studio=notify");
        } else connect();
      }}
      className={cn(row, "text-left")}
    >
      <TelegramGlyph className="size-4 shrink-0 text-sky-400" />
      <span className="flex-1">
        {tied
          ? "Telegram"
          : state === "blocked"
            ? "Снова подключить Telegram"
            : "Подключить Telegram"}
      </span>
      {state === "connected" ? (
        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
          ✓ подключён
        </span>
      ) : state === "off" ? (
        <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          выкл.
        </span>
      ) : (
        <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-300">
          новые серии
        </span>
      )}
    </button>
  );
}

function MobileMenu({
  active,
  nav,
  onNavigate,
  onParty,
}: {
  active: boolean;
  nav: NavItem[];
  onNavigate: () => void;
  onParty: () => void;
}) {
  const { t } = useI18n();
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const authed = status === "authenticated" && user;
  const { data: configured } = useRecommendationsStatus(Boolean(authed) && active);
  const { data: profile } = useMyProfile(Boolean(authed) && active);
  const needsSetup = Boolean(authed) && configured === false;
  const { roll } = useSurprise(onNavigate);

  // The same rows as the account menu in the header.
  const row =
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground/85 outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:bg-foreground/[0.07]";
  const chevron = (
    <ChevronRightIcon className="ml-auto size-3.5 text-muted-foreground/60" />
  );
  const banner = profile?.bannerUrl ? imageSrc(profile.bannerUrl) : undefined;

  return (
    <SheetContent
      side="right"
      className="flex w-[min(20rem,88vw)] flex-col gap-0 overflow-hidden border-l border-[var(--accent-line-soft)] p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <SheetHeader className="sr-only">
        <SheetTitle>AnimeShadow</SheetTitle>
      </SheetHeader>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Who: the cover, the face, the name — the way to the profile. */}
        {authed ? (
          <Link
            to="/profile"
            onClick={onNavigate}
            className="group/card relative block"
          >
            <span className="absolute inset-x-0 top-0 block h-20 overflow-hidden">
              {banner ? (
                <img
                  src={banner}
                  alt=""
                  className="size-full object-cover opacity-70"
                />
              ) : (
                <span className="block size-full bg-[radial-gradient(120%_140%_at_0%_0%,var(--accent-surface-strong),transparent_70%)]" />
              )}
              <span className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
            </span>
            <span className="relative flex items-end gap-3 px-4 pb-3 pt-10">
              <span className="shrink-0 rounded-full bg-background p-1">
                <HeaderAvatar user={user} className="size-12" />
              </span>
              <span className="min-w-0 flex-1 pb-1">
                <span className="block truncate text-sm font-semibold">
                  {user.displayName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {profile?.username ? `@${profile.username}` : user.email}
                </span>
              </span>
              <ChevronRightIcon className="mb-2 size-4 shrink-0 text-muted-foreground" />
            </span>
          </Link>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <Wordmark />
            <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/[0.07] p-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <LogoGlyph className="size-8" />
              </span>
              <p className="text-[13px] leading-snug text-foreground/85">
                <b className="text-foreground">Стань своим на AnimeShadow</b> — список,
                прогресс серий и подборки сохранятся навсегда.
              </p>
            </div>
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
          </div>
        )}

        {needsSetup && (
          <Link
            to="/recommendations"
            onClick={onNavigate}
            className="mx-2 mb-2 flex items-center gap-3 rounded-xl bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary"
          >
            <WandSparklesIcon className="size-4 shrink-0" />
            <span className="flex-1">{t("recommendations.menuNudge")}</span>
            <ChevronRightIcon className="size-4" />
          </Link>
        )}

        {authed && (
          <Link
            to="/profile?tab=invite"
            onClick={onNavigate}
            className="mx-2 mb-2 flex items-center gap-3 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/15 via-fuchsia-500/10 to-transparent px-3 py-2.5 text-sm font-semibold"
          >
            <GiftIcon className="size-4 shrink-0 text-primary" />
            <span className="flex-1">Пригласи друга — получи PRO</span>
            <RewardsWaiting />
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
        )}

        <Separator />
        {/* Where. */}
        <nav className="flex flex-col p-1.5">
          {nav.map(({ to, label, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  row,
                  isActive && "bg-foreground/[0.07] font-semibold text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  {label}
                  {chevron}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <Separator />
        {/* What else. */}
        <div className="flex flex-col p-1.5">
          {authed && <MobileTelegramRow row={row} onNavigate={onNavigate} />}
          {authed && (
            <Link to="/profile?studio=profile" onClick={onNavigate} className={row}>
              <Settings2Icon className="size-4 shrink-0 text-muted-foreground" />
              {t("userMenu.customise")}
              {chevron}
            </Link>
          )}
          <button type="button" onClick={onParty} className={cn(row, "text-left")}>
            <UsersIcon className="size-4 shrink-0 text-muted-foreground" />
            Смотреть вместе
          </button>
          <button
            type="button"
            onClick={() => void roll()}
            className={cn(row, "text-left")}
          >
            <ShuffleIcon className="size-4 shrink-0 text-muted-foreground" />
            {t("footer.randomAnime")}
          </button>
          <InstallAppMenuRow />
          {FEATURES.englishLocale && <MobileLanguage />}
          {FEATURES.lightTheme && <MobileTheme />}
        </div>

        <Separator />
        <div className="p-1.5">
          <Link
            to="/support"
            onClick={onNavigate}
            className="relative mx-1.5 my-1.5 flex items-center gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-primary via-rose-500 to-fuchsia-500 px-3 py-3 text-sm font-bold text-white shadow-lg shadow-primary/30"
          >
            <HeartIcon className="support-beat size-4 shrink-0 fill-current" />
            <span className="flex-1">{t("userMenu.support")}</span>
            <SparklesIcon className="size-4 shrink-0 opacity-80" />
          </Link>
        </div>
      </div>

      {/* Signing out: always at the very bottom of the menu, outside what scrolls. */}
      {authed && (
        <div className="border-t border-[var(--accent-line-soft)] p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              logout();
              onNavigate();
              navigate("/");
            }}
            className={cn(
              row,
              "w-full text-destructive hover:bg-destructive/10 hover:text-destructive",
            )}
          >
            <LogOutIcon className="size-4 shrink-0" />
            {t("common.signOut")}
          </button>
        </div>
      )}
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
      <MorphIcon
        on={isDark}
        off={MoonStarIcon}
        onIcon={SunIcon}
        className="size-[18px]"
        spin="ccw"
      />
      {isDark ? t("theme.toLight") : t("theme.toDark")}
    </button>
  );
}
