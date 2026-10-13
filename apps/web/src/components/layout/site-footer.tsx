import { ArrowUpIcon, HeartIcon, UserPlusIcon } from "lucide-react";
import { type ComponentType, type SVGProps, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { LogoWatermark } from "@/components/brand/logo-watermark";
import { Wordmark } from "@/components/brand/wordmark";
import { useI18n } from "@/i18n";
import { TiktokIcon } from "@/components/home/social-icons";
import { shareInvite, TELEGRAM_CHANNEL, TIKTOK_URL } from "@/lib/community";
import { glideTo } from "@/lib/glide";

const SOCIALS: Array<{ label: string; href: string; Icon: ComponentType<{ className?: string }>; hover: string }> = [
  { label: "Telegram", href: TELEGRAM_CHANNEL, Icon: TelegramIcon, hover: "hover:bg-[#26A5E4] hover:border-[#26A5E4]" },
  { label: "TikTok", href: TIKTOK_URL, Icon: TiktokIcon, hover: "hover:bg-[#fe2c55]/75 hover:border-[#fe2c55]/60" },
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
          <div className="flex flex-col items-start gap-3 md:items-end">
            {/* Support stands out on its own; the networks are round icons. */}
            <Link
              to="/support"
              className="group inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:-translate-y-0.5 active:scale-95"
            >
              <HeartIcon className="size-4 fill-current transition-transform group-hover:scale-110" />
              {t("footer.support")}
            </Link>
            <div className="flex items-center gap-2">
              {SOCIALS.map(({ label, href, Icon, hover }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={label}
                  title={label}
                  className={`grid size-10 place-items-center rounded-full border border-border/60 bg-card/60 text-foreground/80 transition-colors duration-200 hover:text-white ${hover}`}
                >
                  <Icon className="size-[18px]" />
                </a>
              ))}
              <InviteButton />
            </div>
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

/** Passes the channel's invite link on — the share sheet on a phone, the
 *  clipboard on a computer. */
function InviteButton() {
  const invite = async () => {
    const result = await shareInvite();
    if (result === "copied") toast.success("Ссылка-приглашение скопирована — отправьте её друзьям");
    if (result === "failed") toast.error("Не получилось скопировать ссылку");
  };
  return (
    <button
      type="button"
      onClick={() => void invite()}
      aria-label="Позвать друзей"
      title="Позвать друзей"
      className="grid size-10 place-items-center rounded-full border border-border/60 bg-card/60 text-foreground/80 transition-colors duration-200 hover:border-primary/50 hover:text-primary active:scale-95"
    >
      <UserPlusIcon className="size-[18px]" />
    </button>
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
