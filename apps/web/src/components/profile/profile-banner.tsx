import { ImagePlusIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The wide picture across the top of a profile, fading into the card below
 * it. Without one, a soft gradient in the account's own accent colour
 * stands in, so an empty profile still has a top.
 */
export function ProfileBanner({
  url,
  accent,
  editable = false,
  className,
}: {
  url: string | null;
  accent?: string | null;
  editable?: boolean;
  className?: string;
}) {
  const t = useT();
  const tint = accent ?? "var(--primary)";
  return (
    <div className={cn("relative w-full overflow-hidden", className)}>
      {url ? (
        <img src={imageSrc(url)} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(120% 140% at 15% 0%, color-mix(in srgb, ${tint} 45%, transparent), transparent 60%), radial-gradient(90% 120% at 100% 20%, color-mix(in srgb, ${tint} 25%, transparent), transparent 65%)`,
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
      {editable && (
        <Link
          to="/profile?tab=settings"
          className="absolute right-3 top-3 flex h-8 items-center gap-1.5 rounded-full bg-black/50 px-3 text-xs font-medium text-white opacity-90 backdrop-blur-md transition-all hover:scale-105 hover:bg-black/70 hover:opacity-100"
        >
          <ImagePlusIcon className="size-3.5" />
          <span className="hidden sm:inline">{t("profile.editBanner")}</span>
        </Link>
      )}
    </div>
  );
}
