import { LogoGlyph } from "@/components/brand/logo-glyph";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Premium as a mark on the name, the way Telegram marks a verified account:
 * the site's 影 on a small glowing seal right after the nickname, instead of
 * a "PRO" pill that read like one more title. The seal's scalloped edge
 * turns slowly; the glyph stays still and legible. The tip comes from the
 * `title`, which the site-wide tooltips pick up.
 */
export function ProMark({ className }: { className?: string }) {
  const t = useT();
  return (
    <span
      role="img"
      aria-label={t("profile.proMark")}
      title={t("profile.proMark")}
      className={cn("relative inline-flex size-[1.1em] shrink-0 items-center justify-center align-middle", className)}
    >
      <svg viewBox="0 0 24 24" aria-hidden className="pro-seal absolute inset-0 size-full text-primary drop-shadow-[0_0_6px_color-mix(in_srgb,var(--primary)_70%,transparent)]">
        <path
          fill="currentColor"
          d="M12 1.5l2.2 1.9 2.9-.4 1.1 2.7 2.7 1.1-.4 2.9 1.9 2.2-1.9 2.2.4 2.9-2.7 1.1-1.1 2.7-2.9-.4L12 22.5l-2.2-1.9-2.9.4-1.1-2.7-2.7-1.1.4-2.9L1.5 12l1.9-2.2-.4-2.9 2.7-1.1 1.1-2.7 2.9.4z"
        />
      </svg>
      <LogoGlyph className="relative size-[0.62em] text-primary-foreground" />
    </span>
  );
}
