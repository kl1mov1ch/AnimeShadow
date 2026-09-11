import type { ComponentType, SVGProps } from "react";
import { LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/i18n";
import { SITE_URL } from "@/lib/seo";
import { cn } from "@/lib/utils";

interface ShareButtonsProps {
  /** Path to share, e.g. "/anime/naruto". */
  path: string;
  title: string;
  className?: string;
}

export function ShareButtons({ path, title, className }: ShareButtonsProps) {
  const t = useT();
  const url = `${SITE_URL}${path}`;
  const u = encodeURIComponent(url);
  const txt = encodeURIComponent(title);

  const targets: Array<{
    label: string;
    href: string;
    Icon: ComponentType<SVGProps<SVGSVGElement>>;
  }> = [
    { label: t("seo.shareVk"), href: `https://vk.com/share.php?url=${u}&title=${txt}`, Icon: VkIcon },
    { label: t("seo.shareTelegram"), href: `https://t.me/share/url?url=${u}&text=${txt}`, Icon: TgIcon },
    { label: t("seo.shareTwitter"), href: `https://twitter.com/intent/tweet?url=${u}&text=${txt}`, Icon: XIcon },
  ];

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      aria-label={t("seo.share")}
    >
      {targets.map(({ label, href, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={label}
          className="flex size-8 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Icon className="size-4" />
        </a>
      ))}
      <button
        type="button"
        aria-label={t("seo.copyLink")}
        onClick={() => {
          navigator.clipboard
            ?.writeText(url)
            .then(() => toast.success(t("seo.linkCopied")))
            .catch(() => undefined);
        }}
        className="flex size-8 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
      >
        <LinkIcon className="size-4" />
      </button>
    </div>
  );
}

function VkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M13.1 17.2c-5.4 0-8.9-3.8-9-10.1h2.8c.1 4.7 2.3 6.7 4 7.1V7.1h2.6v3.9c1.7-.2 3.4-2 4-3.9h2.6a7.6 7.6 0 0 1-3.5 4.9c1.8.8 3 2.4 3.8 4.9h-2.9c-.5-1.7-1.6-3-3.6-3.3v3.3h-.3Z" />
    </svg>
  );
}
function TgIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M21.94 4.57a1.5 1.5 0 0 0-2-1.35L3.2 9.86c-1.36.53-1.35 2.47.02 2.98l3.98 1.49 1.54 4.95a1.2 1.2 0 0 0 1.97.5l2.2-2.06 4.13 3.04a1.5 1.5 0 0 0 2.36-.94l2.54-15.2ZM9.4 13.66l7.9-4.98-6.53 6.06c-.23.22-.38.5-.44.82l-.28 1.53-.65-3.45Z" />
    </svg>
  );
}
function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M18.9 2h3.3l-7.2 8.2L23.5 22h-6.6l-5.2-6.8L5.7 22H2.4l7.7-8.8L1.5 2h6.8l4.7 6.2L18.9 2Zm-1.2 18h1.8L7.4 3.9H5.5L17.7 20Z" />
    </svg>
  );
}
