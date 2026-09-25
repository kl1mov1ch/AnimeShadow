import { MenuIcon, ScanSearchIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { SearchBox } from "@/components/layout/search-box";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { HOME_NAV } from "./home-nav";
import { FEATURES } from "@/lib/features";

/**
 * The landing's header: the site's real controls — the full search box with
 * its suggestions, frame search, language, theme and the account menu —
 * wearing the landing's palette, with the section links as the new design's
 * pills. Nothing here is a mock-up that stops working.
 */
export function HomeHeader() {
  const t = useT();
  const { status } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--hm-border)] bg-[var(--hm-bg)]/90">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="group flex shrink-0 items-center gap-2" aria-label="AnimeShadow">
          <LogoGlyph className="size-6 text-[var(--hm-accent)] transition-transform duration-300 group-hover:-rotate-6" />
          <span className="home-display hidden text-sm uppercase tracking-[0.14em] text-[var(--hm-text)] sm:block">
            AnimeShadow
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {HOME_NAV.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-all duration-200",
                  isActive && item.end
                    ? "bg-[var(--hm-accent)] font-medium text-white"
                    : "text-[var(--hm-muted)] hover:bg-[var(--hm-card)] hover:text-[var(--hm-text)]",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* The app's own search: suggestions, ⌘K, the lot. */}
        <div className="ml-auto hidden w-full max-w-xs lg:block">
          <SearchBox />
        </div>

        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          {status === "authenticated" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/frame-search"
                  aria-label={t("frameSearch.navLabel")}
                  className="grid size-9 place-items-center rounded-lg text-[var(--hm-muted)] transition-colors hover:bg-[var(--hm-card)] hover:text-[var(--hm-text)]"
                >
                  <ScanSearchIcon className="size-[18px]" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>{t("frameSearch.navLabel")}</TooltipContent>
            </Tooltip>
          )}
          {FEATURES.englishLocale && <LanguageSwitcher />}
          {FEATURES.lightTheme && <ThemeToggle />}
          <UserMenu />
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={t("common.menu")}
            aria-expanded={menuOpen}
            className="grid size-9 place-items-center rounded-lg text-[var(--hm-muted)] transition-colors hover:text-[var(--hm-text)] md:hidden"
          >
            {menuOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </div>

      {/* Phones: the links drop under the bar, search included. */}
      {menuOpen && (
        <div className="border-t border-[var(--hm-border)] bg-[var(--hm-bg-alt)] md:hidden">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-1 px-4 py-3">
            <div className="mb-2 lg:hidden">
              <SearchBox />
            </div>
            {HOME_NAV.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "rounded-lg px-3 py-2.5 text-sm",
                    isActive && item.end
                      ? "bg-[var(--hm-accent)] font-medium text-white"
                      : "text-[var(--hm-muted)]",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
