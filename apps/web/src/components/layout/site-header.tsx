import {
  BellRingIcon,
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
  MoonStarIcon,
  ScanSearchIcon,
  SearchIcon,
  ShieldCheckIcon,
  Settings2Icon,
  ShuffleIcon,
  SparklesIcon,
  SunIcon,
  UserPlusIcon,
  WandSparklesIcon,
  XIcon, GiftIcon } from "lucide-react";
import { TelegramGlyph, useTelegramConnect } from "@/components/telegram-connect";
import { currentSubscription, disablePushHere, enablePushHere, pushSupport } from "@/lib/push";
import { toast } from "sonner";
import { NotificationBell } from "@/components/notification-bell";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Wordmark } from "@/components/brand/wordmark";
import { ReactionGif } from "@/components/common/reaction-gif";
import { InstallAppButton, InstallAppMenuRow } from "@/components/layout/install-app-button";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { RandomRoll } from "@/components/layout/random-roll";
import { SearchBox } from "@/components/layout/search-box";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { RewardsWaiting, UserMenu } from "@/components/layout/user-menu";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const scrolled = useScrolled();
  const { down, nearTop } = useScrollDirection();
  const tuckAway = down && !nearTop && !menuOpen;

  const nav: NavItem[] = [
    { to: "/", label: t("nav.discover"), end: true, Icon: HouseIcon },
    { to: "/browse", label: t("nav.browse"), end: false, Icon: LayoutGridIcon },
    { to: "/collections", label: t("nav.collections"), end: false, Icon: LibraryBigIcon },
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
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-background/95 transition-[transform,box-shadow,border-color] duration-300 ease-out",
        scrolled ? "border-border/60 shadow-lg shadow-black/20" : "border-border/40",
        tuckAway && "max-md:-translate-y-full max-md:shadow-none",
      )}
    >
      <span aria-hidden className={cn("header-line pointer-events-none absolute inset-x-0 -bottom-px h-px transition-opacity duration-500", scrolled ? "opacity-100" : "opacity-0")} />
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 lg:gap-5">
        <Wordmark textClassName="max-md:text-[0.79rem]" />

        {/* The sections, as icons: the one you're in shows its name, the
            others open theirs under the pointer — the bar stays short and
            the search gets the room. */}
        <nav ref={navRef} aria-label={t("common.menu")} className="relative hidden items-center gap-0.5 rounded-full border border-border/50 bg-card/40 p-1 lg:flex">
          {nav.map(({ to, label, end, Icon }) => (
            <NavLink
              viewTransition
              key={to}
              to={to}
              end={end}
              aria-label={label}
              className={({ isActive }) =>
                cn(
                  "hnav-item group relative flex h-8 items-center rounded-full px-2.5 text-sm font-medium transition-[background-color,color,transform] duration-150 active:scale-90",
                  isActive ? "hnav-active text-foreground" : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn("size-[17px] shrink-0", isActive && "text-primary")} />
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
          <div className={cn("flex", status === "anonymous" && "max-md:hidden")}>
            <span className="hdr-dice contents">
              <RandomRoll />
            </span>
          </div>
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
          <NotificationBell className="hdr-bell hidden md:grid" />
          <div className="hidden md:block">
            <UserMenu />
          </div>

          {/* A phone: a quiet invite for guests, search and the menu. */}
          {status === "anonymous" && (
            <Link
              to="/register"
              className="mr-0.5 inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2.5 text-[12px] font-semibold text-foreground md:hidden"
            >
              <SparklesIcon className="size-3.5 text-primary" />
              Вступить
            </Link>
          )}
          <NotificationBell className="md:hidden" />
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

/** A guest's "Уведомления": browser push about what they watch, in one tap. */
function GuestPushTile({ tile }: { tile: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    void currentSubscription().then((sub) => setOn(Boolean(sub)));
  }, []);
  if (pushSupport() !== "ok" || on == null) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (on) {
          void disablePushHere().then(() => {
            setOn(false);
            toast("Уведомления выключены");
          });
          return;
        }
        enablePushHere(false)
          .then(() => {
            setOn(true);
            toast.success("Уведомления включены", { description: "Новые серии того, что вы смотрите, придут сюда" });
          })
          .catch((error: Error) => {
            if (error.message === "denied") toast.error("Браузер запретил уведомления", { description: "Разрешите их в настройках сайта" });
          });
      }}
      className={cn(tile, "text-left")}
    >
      <BellRingIcon className="size-4 shrink-0 text-amber-400" />
      <span className="min-w-0 flex-1 truncate">Уведомления</span>
      {on ? <span className="size-2 shrink-0 rounded-full bg-emerald-400" /> : <span className="rounded-full bg-amber-500/15 px-1.5 text-[11px] font-bold text-amber-500">+</span>}
    </button>
  );
}

/** The phone menu's "Подключить Telegram" (or its state, once tied). */
function MobileTelegramRow({ row, onNavigate }: { row: string; onNavigate: () => void }) {
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
      <span className="min-w-0 flex-1 truncate">{tied ? "Telegram" : state === "blocked" ? "Подключить" : "Telegram"}</span>
      {state === "connected" ? (
        <span className="size-2 shrink-0 rounded-full bg-emerald-400" title="Подключён" />
      ) : state === "off" ? (
        <span className="text-[10px] text-muted-foreground">выкл.</span>
      ) : (
        <span className="rounded-full bg-sky-500/15 px-1.5 text-[11px] font-bold text-sky-600 dark:text-sky-300">+</span>
      )}
    </button>
  );
}

function MobileMenu({ nav, onNavigate }: { nav: NavItem[]; onNavigate: () => void }) {
  const { t } = useI18n();
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const authed = status === "authenticated" && user;
  const { data: configured } = useRecommendationsStatus(Boolean(authed));
  const { data: profile } = useMyProfile(Boolean(authed));
  const needsSetup = Boolean(authed) && configured === false;
  const { roll } = useSurprise(onNavigate);

  // The same rows as the account menu in the header.
  const row =
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground/85 outline-none transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:bg-foreground/[0.07]";
  // A quick action: a small tile, two to a row.
  const tile =
    "flex min-w-0 items-center gap-2 rounded-xl border border-[var(--accent-line-soft)] bg-card/50 px-3 py-2.5 text-[13px] font-medium text-foreground/85 outline-none transition-[background-color,border-color,transform] hover:border-foreground/20 hover:text-foreground active:scale-95";
  const banner = profile?.bannerUrl ? imageSrc(profile.bannerUrl) : undefined;

  return (
    <SheetContent side="right" className="flex w-[min(22rem,90vw)] flex-col gap-0 overflow-hidden border-l border-[var(--accent-line-soft)] p-0">
      <SheetHeader className="sr-only">
        <SheetTitle>AnimeShadow</SheetTitle>
      </SheetHeader>

      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Who: the cover, the face, the name — the way to the profile. */}
        {authed ? (
          <Link to="/profile" onClick={onNavigate} className="group/card relative block">
            <span className="absolute inset-x-0 top-0 block h-20 overflow-hidden">
              {banner ? (
                <img src={banner} alt="" className="size-full object-cover opacity-70" />
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
                <span className="block truncate text-sm font-semibold">{user.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">{profile?.username ? `@${profile.username}` : user.email}</span>
              </span>
              <ChevronRightIcon className="mb-2 size-4 shrink-0 text-muted-foreground" />
            </span>
          </Link>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <Wordmark />
            <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/[0.07] p-3">
              <ReactionGif category="wave" className="size-14 shrink-0" />
              <p className="text-[13px] leading-snug text-foreground/85">
                <b className="text-foreground">Стань своим на AnimeShadow</b> — список, прогресс серий и подборки сохранятся навсегда.
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
          <Link to="/profile?tab=invite" onClick={onNavigate} className="mx-2 mb-2 flex items-center gap-3 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/15 via-fuchsia-500/10 to-transparent px-3 py-2.5 text-sm font-semibold">
            <GiftIcon className="size-4 shrink-0 text-primary" />
            <span className="flex-1">Пригласи друга — получи PRO</span>
            <RewardsWaiting />
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
        )}

        {/* Where: the sections as tiles, three to a row — one tap, no hunting down a list. */}
        <nav className="grid grid-cols-3 gap-1.5 px-3 pb-3 pt-1">
          {nav.map(({ to, label, end, Icon }, i) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              style={{ animationDelay: `${i * 35}ms`, animationFillMode: "backwards" }}
              className={({ isActive }) =>
                cn(
                  "menu-tile flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border px-1 py-3 text-center text-[12px] font-medium transition-[background-color,border-color,transform] active:scale-95",
                  isActive
                    ? "border-primary/40 bg-primary/12 text-foreground"
                    : "border-[var(--accent-line-soft)] bg-card/50 text-foreground/80 hover:border-foreground/20 hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn("grid size-9 place-items-center rounded-xl", isActive ? "bg-primary text-primary-foreground" : "bg-foreground/[0.06] text-muted-foreground")}>
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="w-full truncate">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* What else: quick things, two to a row. */}
        <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
          {authed && <MobileTelegramRow row={tile} onNavigate={onNavigate} />}
          {authed && (
            <Link to="/profile?studio=notify" onClick={onNavigate} className={tile}>
              <BellRingIcon className="size-4 shrink-0 text-amber-400" />
              <span className="min-w-0 flex-1 truncate">Уведомления</span>
            </Link>
          )}
          {authed && (
            <Link to="/profile?studio=profile" onClick={onNavigate} className={tile}>
              <Settings2Icon className="size-4 shrink-0 text-violet-400" />
              <span className="min-w-0 flex-1 truncate">Настроить</span>
            </Link>
          )}
          {FEATURES.frameSearch && (
            <Link to="/frame-search" onClick={onNavigate} className={tile}>
              <ScanSearchIcon className="size-4 shrink-0 text-emerald-400" />
              <span className="min-w-0 flex-1 truncate">По кадру</span>
            </Link>
          )}
          {!authed && <GuestPushTile tile={tile} />}
          <button type="button" onClick={() => void roll()} className={cn(tile, "text-left")}>
            <ShuffleIcon className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate">Случайное</span>
          </button>
        </div>
        <div className="flex flex-col px-1.5">
          <InstallAppMenuRow />
          {FEATURES.englishLocale && <MobileLanguage />}
          {FEATURES.lightTheme && <MobileTheme />}
        </div>

        <Separator />
        <div className="p-1.5">
          <Link to="/support" onClick={onNavigate} className="relative mx-1.5 my-1.5 flex items-center gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-primary via-rose-500 to-fuchsia-500 px-3 py-3 text-sm font-bold text-white shadow-lg shadow-primary/30">
            <HeartIcon className="support-beat size-4 shrink-0 fill-current" />
            <span className="flex-1">{t("userMenu.support")}</span>
            <SparklesIcon className="size-4 shrink-0 opacity-80" />
          </Link>
        </div>

      </div>

      {/* Signing out: always at the very bottom, outside what scrolls. */}
      {authed && (
        <div className="border-t border-[var(--accent-line-soft)] bg-background/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              logout();
              onNavigate();
              navigate("/");
            }}
            className={cn(row, "w-full justify-center text-destructive hover:bg-destructive/10 hover:text-destructive")}
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
      <MorphIcon on={isDark} off={MoonStarIcon} onIcon={SunIcon} className="size-[18px]" spin="ccw" />
      {isDark ? t("theme.toLight") : t("theme.toDark")}
    </button>
  );
}
