import type { ComponentType, SVGProps } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/* Edit these to your real handles. */
const SOCIALS: Array<{
  label: string;
  href: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}> = [
  { label: "Telegram", href: "https://t.me/animeshadow", Icon: TelegramIcon },
  { label: "Discord", href: "https://discord.gg/animeshadow", Icon: DiscordIcon },
  { label: "VK", href: "https://vk.com/animeshadow", Icon: VkIcon },
  { label: "GitHub", href: "https://github.com/animeshadow", Icon: GithubIcon },
];

export function SiteFooter() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-16 border-t border-border/60 bg-card/30">
      {/* thin accent line */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
      />

      {/* Two columns from the smallest phone up — Nav and Project are each
          short enough to sit side by side instead of stacking into one long
          column; only Brand and Legal (a real paragraph) get the full row.
          Desktop switches to its own explicit four-column layout. */}
      <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-x-6 gap-y-9 px-4 py-12 lg:grid-cols-[1.6fr_1fr_1fr_1.4fr] lg:gap-x-10">
        {/* Brand */}
        <div className="col-span-2 flex flex-col gap-4 lg:col-span-1">
          <Link to="/" className="flex items-center gap-2 font-display text-lg">
            <span aria-hidden className="text-2xl text-primary">
              影
            </span>
            AnimeShadow
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">
            {t("footer.tagline")}
          </p>
          <p className="max-w-xs text-xs text-muted-foreground/80">
            {t("footer.description")}
          </p>

          <div className="mt-1 flex items-center gap-2">
            {SOCIALS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={label}
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border transition-colors",
                  // Telegram is the actual community home for this
                  // audience — worth its own brand colour instead of
                  // reading as one interchangeable grey circle among four.
                  // Discord/VK/GitHub stay quiet on purpose.
                  label === "Telegram"
                    ? "border-transparent bg-[#26A5E4] text-white shadow-sm shadow-[#26A5E4]/30 hover:brightness-110"
                    : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-primary",
                )}
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <FooterColumn title={t("footer.nav")}>
          <FooterLink to="/">{t("nav.discover")}</FooterLink>
          <FooterLink to="/browse">{t("nav.browse")}</FooterLink>
          <FooterLink to="/library">{t("nav.library")}</FooterLink>
        </FooterColumn>

        {/* Project */}
        <FooterColumn title={t("footer.project")}>
          <FooterLink to="/about">{t("footer.about")}</FooterLink>
          <FooterLink to="/profile">{t("footer.profile")}</FooterLink>
          <FooterLink to="/support">{t("footer.pro")}</FooterLink>
        </FooterColumn>

        {/* Legal — a real paragraph, always reads better at full width than
            squeezed into half a phone screen. */}
        <div className="col-span-2 flex flex-col gap-3 lg:col-span-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            {t("footer.legal")}
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground/80">
            {t("footer.disclaimer")}
          </p>
        </div>
      </div>

      <div className="border-t border-border/50">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-1 px-4 py-5 text-xs text-muted-foreground/70 sm:flex-row sm:items-center sm:justify-between">
          <span>{t("footer.rights", { year })}</span>
          <span>{t("footer.madeWith")}</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
        {title}
      </h3>
      <nav className="flex flex-col gap-2 text-sm">{children}</nav>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      // Deliberately quieter than the header's nav pills: the same nudge on
      // hover, but no fill, no lift and no sweep. The footer is where you
      // look when you already know what you want — it should never pull
      // harder than the navigation at the top of the page.
      className="group inline-flex w-fit items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
    >
      <span
        aria-hidden
        className="h-px w-0 bg-primary/70 transition-all duration-300 group-hover:w-3"
      />
      {children}
    </Link>
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

function VkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M13.1 17.2c-5.4 0-8.9-3.8-9-10.1h2.8c.1 4.7 2.3 6.7 4 7.1V7.1h2.6v3.9c1.7-.2 3.4-2 4-3.9h2.6a7.6 7.6 0 0 1-3.5 4.9c1.8.8 3 2.4 3.8 4.9h-2.9c-.5-1.7-1.6-3-3.6-3.3v3.3h-.3Z" />
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
