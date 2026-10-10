import { landingPath, seasonNameRu, seasonOf } from "@animeshadow/shared";
import { ArrowUpIcon, HeartIcon } from "lucide-react";
import { type ComponentType, type SVGProps, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "@/components/brand/wordmark";
import { useI18n } from "@/i18n";
import { genreHref } from "@/lib/format";
import { useGenres } from "@/lib/query";

/* Edit these to your real handles. */
const SOCIALS: Array<{ label: string; href: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = [
  { label: "Telegram", href: "https://t.me/animeshadow", Icon: TelegramIcon },
  { label: "Discord", href: "https://discord.gg/animeshadow", Icon: DiscordIcon },
  // Where support for the project goes: a plain heart, not their logo.
  { label: "Boosty", href: "https://boosty.to/animeshadow", Icon: HeartIcon },
  { label: "GitHub", href: "https://github.com/animeshadow", Icon: GithubIcon },
];

/**
 * The footer: what the site is, where everything lives, the lists people
 * search for by name, and the small print.
 *
 * Plain links in quiet columns — no icon in front of every line, no glow on
 * hover. A footer is where someone looks when they already know what they
 * want; it should read like a table of contents, not a second header.
 */
export function SiteFooter() {
  const { t } = useI18n();
  const year = new Date().getFullYear();
  const season = seasonOf(new Date());
  const { data: genres } = useGenres();

  return (
    <footer className="cv-auto mt-16 border-t border-border/50 bg-card/30">
      <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 sm:grid-cols-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-x-12">
        <div className="col-span-2 flex flex-col gap-4 sm:col-span-3 lg:col-span-1">
          <Wordmark size="lg" className="self-start" />
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{t("footer.tagline")}</p>
          <div className="flex items-center gap-1.5">
            {SOCIALS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={label}
                title={label}
                className="grid size-9 place-items-center rounded-lg border border-border/60 text-muted-foreground transition-colors duration-200 hover:border-foreground/25 hover:bg-foreground/[0.04] hover:text-foreground"
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>

        <FooterColumn title={t("footer.nav")}>
          <FooterLink to="/">{t("nav.discover")}</FooterLink>
          <FooterLink to="/browse">{t("nav.browse")}</FooterLink>
          <FooterLink to="/collections">{t("nav.collections")}</FooterLink>
          <FooterLink to="/library">{t("nav.library")}</FooterLink>
          <FooterLink to="/frame-search">{t("frameSearch.navLabel")}</FooterLink>
        </FooterColumn>

        {/* The lists people come looking for, by name. */}
        <FooterColumn title="Аниме">
          <FooterLink to="/top">Топ аниме</FooterLink>
          <FooterLink to="/ongoing">Онгоинги</FooterLink>
          <FooterLink to="/popular">Популярные</FooterLink>
          <FooterLink to="/movies">Аниме-фильмы</FooterLink>
          <FooterLink to="/announced">Анонсы</FooterLink>
          <FooterLink to={landingPath({ kind: "season", ...season })}>
            Аниме {seasonNameRu(season.season, "gen")} {season.year}
          </FooterLink>
        </FooterColumn>

        <FooterColumn title={t("footer.project")}>
          <FooterLink to="/about">{t("footer.about")}</FooterLink>
          <FooterLink to="/support">{t("footer.pro")}</FooterLink>
          <FooterLink to="/profile">{t("footer.profile")}</FooterLink>
        </FooterColumn>
      </div>

      {genres && genres.length > 0 && (
        <nav
          aria-label="Жанры"
          className="mx-auto flex max-w-[1400px] flex-wrap items-baseline gap-x-3 gap-y-1.5 px-4 pb-10 text-xs text-muted-foreground"
        >
          <span className="mr-1 font-medium text-foreground/70">Жанры</span>
          {[...genres]
            .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
            .slice(0, 24)
            .map((g) => (
              <Link key={g.id} to={genreHref(g.name)} className="transition-colors hover:text-foreground">
                {g.name}
              </Link>
            ))}
        </nav>
      )}

      <div className="border-t border-border/50">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-5 text-xs text-muted-foreground/80 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="flex flex-col gap-1">
            <span>{t("footer.rights", { year })}</span>
            <span className="max-w-3xl leading-relaxed text-muted-foreground/60">{t("footer.disclaimer")}</span>
          </div>
          <BackToTop label={t("footer.toTop")} />
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/70">{title}</h3>
      <nav className="flex flex-col gap-2 text-sm">{children}</nav>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="w-fit text-muted-foreground transition-colors duration-200 hover:text-foreground">
      {children}
    </Link>
  );
}

/**
 * Back to the top of the page. Only offered once there is a page's worth
 * of scrolling behind the visitor — at the top of a short page it would be
 * a button that does nothing.
 */
function BackToTop({ label }: { label: string }) {
  const [far, setFar] = useState(false);
  useEffect(() => {
    const onScroll = () => setFar(window.scrollY > window.innerHeight);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!far) return null;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="inline-flex shrink-0 animate-in items-center gap-1.5 self-start rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-200 fade-in-0 hover:border-foreground/25 hover:text-foreground"
    >
      <ArrowUpIcon className="size-3.5" />
      {label}
    </button>
  );
}

/* ---- brand glyphs (inline, no external requests) ---- */

function TelegramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M21.94 4.57a1.5 1.5 0 0 0-2-1.35L3.2 9.86c-1.36.53-1.35 2.47.02 2.98l3.98 1.49 1.54 4.95a1.2 1.2 0 0 0 1.97.5l2.2-2.06 4.13 3.04a1.5 1.5 0 0 0 2.36-.94l2.54-15.2ZM9.4 13.66l7.9-4.98-6.53 6.06c-.23.22-.38.5-.44.82l-.28 1.53-.65-3.45Z" />
    </svg>
  );
}

function DiscordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M19.3 5.34A17 17 0 0 0 15 4l-.2.42a13 13 0 0 1 3.7 1.9 15.6 15.6 0 0 0-12.98 0A13 13 0 0 1 9.2 4.42L9 4a17 17 0 0 0-4.3 1.34C2 9.4 1.24 13.35 1.6 17.24a17.2 17.2 0 0 0 5.24 2.66l.66-1.6a11 11 0 0 1-2.03-.98l.5-.37a12.3 12.3 0 0 0 10.55 0l.5.37c-.64.38-1.32.71-2.03.98l.66 1.6a17.2 17.2 0 0 0 5.24-2.66c.42-4.4-.72-8.32-3.7-11.9ZM8.5 14.9c-1 0-1.83-.94-1.83-2.1 0-1.14.8-2.08 1.83-2.08s1.85.95 1.83 2.09c0 1.15-.8 2.09-1.83 2.09Zm7 0c-1 0-1.83-.94-1.83-2.1 0-1.14.8-2.08 1.83-2.08s1.85.95 1.83 2.09c0 1.15-.8 2.09-1.83 2.09Z" />
    </svg>
  );
}

function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}
