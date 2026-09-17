import { LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/i18n";
import { SITE_URL } from "@/lib/seo";
import { cn } from "@/lib/utils";

interface ShareButtonsProps {
  /** Path to share, e.g. "/anime/naruto". */
  path: string;
  className?: string;
}

/** Just the copy-link action — social network icons were dropped per feedback. */
export function ShareButtons({ path, className }: ShareButtonsProps) {
  const t = useT();
  const url = `${SITE_URL}${path}`;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button
        type="button"
        aria-label={t("seo.copyLink")}
        onClick={() => {
          navigator.clipboard
            ?.writeText(url)
            .then(() => toast.success(t("seo.linkCopied")))
            .catch(() => undefined);
        }}
        // Was a plain grey outline until hover — the one actionable button
        // in the whole title header, and it read as decoration rather than
        // something to click. A quiet primary tint at rest (same idea as
        // the rank chip / PRO badge elsewhere) makes it read as "live" even
        // before a pointer gets near it.
        className="flex size-8 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary/90 transition-colors hover:border-primary/50 hover:bg-primary/15 hover:text-primary"
      >
        <LinkIcon className="size-4" />
      </button>
    </div>
  );
}
