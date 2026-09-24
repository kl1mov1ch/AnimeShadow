import { CheckIcon, LinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  // The icon answers the click itself — the link turns into a tick for a
  // moment — so the confirmation is where the eye already is, not only in
  // a toast in the corner.
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Tooltip>
      <TooltipTrigger asChild>
      <button
        type="button"
        aria-label={t("seo.copyLink")}
        onClick={() => {
          navigator.clipboard
            ?.writeText(url)
            .then(() => {
              setCopied(true);
              toast.success(t("seo.linkCopied"));
            })
            .catch(() => undefined);
        }}
        // Was a plain grey outline until hover — the one actionable button
        // in the whole title header, and it read as decoration rather than
        // something to click. A quiet primary tint at rest (same idea as
        // the rank chip / PRO badge elsewhere) makes it read as "live" even
        // before a pointer gets near it.
        className={cn(
          "flex size-10 items-center justify-center rounded-lg border transition-all duration-200 active:scale-90",
          copied
            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-500"
            : "border-primary/25 bg-primary/10 text-primary/90 hover:border-primary/50 hover:bg-primary/15 hover:text-primary",
        )}
      >
        <MorphIcon on={copied} off={LinkIcon} onIcon={CheckIcon} className="size-4" />
      </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {copied ? t("seo.linkCopied") : t("seo.copyLink")}
      </TooltipContent>
      </Tooltip>
    </div>
  );
}
