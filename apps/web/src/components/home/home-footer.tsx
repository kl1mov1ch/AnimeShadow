import { Link } from "react-router-dom";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import { DiscordIcon, TelegramIcon, VkIcon, YoutubeIcon } from "./social-icons";
import { HOME_NAV } from "./home-nav";
import { GlyphWatermark, HomeContainer } from "./home-ui";

const SOCIALS = [
  { Icon: DiscordIcon, label: "Discord", href: "https://discord.com", hover: "hover:text-[#5865F2]" },
  { Icon: TelegramIcon, label: "Telegram", href: "https://telegram.org", hover: "hover:text-[#26A5E4]" },
  { Icon: VkIcon, label: "VK", href: "https://vk.com", hover: "hover:text-[#0077FF]" },
  { Icon: YoutubeIcon, label: "YouTube", href: "https://youtube.com", hover: "hover:text-[#FF0000]" },
];

export function HomeFooter() {
  return (
    <footer className="relative overflow-hidden bg-[var(--hm-bg)] py-8">
      <GlyphWatermark className="-bottom-8 left-1/2 -translate-x-1/2 text-[12rem] leading-none" />
      <HomeContainer className="relative">
        <div className="flex flex-col items-center gap-6 lg:flex-row lg:justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label="AnimeShadow">
            <LogoGlyph className="size-6 text-[var(--hm-accent)]" />
            <span className="home-display text-sm uppercase tracking-[0.14em] text-[var(--hm-text)]">
              AnimeShadow
            </span>
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2">
            {HOME_NAV.map((item) => (
              <Link key={item.label} to={item.to} className="text-sm text-[var(--hm-muted)] transition-colors hover:text-[var(--hm-text)]">
                {item.label}
              </Link>
            ))}
          </nav>

          <ul className="flex items-center gap-2">
            {SOCIALS.map(({ Icon, label, href, hover }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  title={label}
                  className={`grid size-9 place-items-center rounded-lg border border-[var(--hm-border)] bg-[var(--hm-card)] text-[var(--hm-muted)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--hm-accent)]/50 ${hover}`}
                >
                  <Icon className="size-4" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-[var(--hm-border)] pt-5 text-xs text-[var(--hm-muted)] sm:flex-row">
          <p>© {new Date().getFullYear()} AnimeShadow. Все права защищены.</p>
          <p className="flex items-center gap-5">
            <Link to="/about" className="transition-colors hover:text-[var(--hm-text)]">
              Пользовательское соглашение
            </Link>
            <Link to="/about" className="transition-colors hover:text-[var(--hm-text)]">
              Политика конфиденциальности
            </Link>
          </p>
        </div>
      </HomeContainer>
    </footer>
  );
}
