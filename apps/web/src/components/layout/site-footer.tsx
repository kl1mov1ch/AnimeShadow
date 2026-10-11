import { ArrowUpIcon, HeartIcon } from "lucide-react";
import { type ComponentType, type SVGProps, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LogoWatermark } from "@/components/brand/logo-watermark";
import { Wordmark } from "@/components/brand/wordmark";
import { useI18n } from "@/i18n";
import { glideTo } from "@/lib/glide";

/* Edit these to your real handles. */
const SOCIALS: Array<{ label: string; href: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = [
  { label: "Telegram", href: "https://t.me/animeshadow", Icon: TelegramIcon },
  { label: "Discord", href: "https://discord.gg/animeshadow", Icon: DiscordIcon },
];

/**
 * The footer: a friendly word, the handful of places people actually go,
 * where to find us, and the small print — nothing else.
 *
 * It used to be three columns of links and a cloud of two dozen genres, a
 * second site map under every page. Now it is one row of links that wraps
 * on a phone, and the community links named, not as bare logos.
 */
export function SiteFooter() {
  const { t } = useI18n();
  const year = new Date().getFullYear();
  const links = [
    { to: "/browse", label: t("nav.browse") },
    { to: "/ongoing", label: "Онгоинги" },
    { to: "/top", label: "Топ аниме" },
    { to: "/collections", label: t("nav.collections") },
    { to: "/library", label: t("nav.library") },
    { to: "/about", label: t("footer.about") },
  ];

  return (
    <footer className="cv-auto relative isolate mt-12 overflow-hidden border-t border-border/50 bg-card/30 sm:mt-16">
      {/* The site's mark, large and faint, on the footer's right. */}
      <LogoWatermark className="-bottom-24 -right-16 size-80 -rotate-6 sm:-bottom-32 sm:right-[4%] sm:size-[26rem]" />
      <div className="mx-auto flex max-w-[1400px] flex-col gap-7 px-4 py-9 sm:py-11">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex max-w-md flex-col gap-2.5">
            <Wordmark size="lg" className="self-start" />
            <p className="text-sm leading-relaxed text-muted-foreground">{t("footer.welcome")}</p>
          </div>

          {/* Where to find us, by name — and how to help the site along. */}
          <div className="flex flex-wrap gap-2">
            {SOCIALS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/60 px-3 text-sm text-foreground/85 transition-colors duration-200 hover:border-foreground/25 hover:bg-foreground/[0.04] hover:text-foreground"
              >
                <Icon className="size-4 text-muted-foreground" />
                {label}
              </a>
            ))}
            <Link
              to="/support"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-foreground transition-colors duration-200 hover:border-primary/50 hover:bg-primary/15"
            >
              <HeartIcon className="size-4 text-primary" />
              {t("footer.support")}
            </Link>
          </div>
        </div>

        <nav aria-label={t("footer.nav")} className="flex flex-wrap gap-x-5 gap-y-2.5 text-sm">
          {links.map(({ to, label }) => (
            <Link key={to} to={to} className="text-muted-foreground transition-colors duration-200 hover:text-foreground">
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-3 border-t border-border/50 pt-5 text-xs text-muted-foreground/80 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
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
      onClick={() => glideTo(document.body, 0)}
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
