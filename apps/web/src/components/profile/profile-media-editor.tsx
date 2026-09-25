import { ImagePlusIcon, Loader2Icon, PencilIcon, ShuffleIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ProfileMedia } from "./use-profile-media";

/**
 * The cluster that sits in the corner of the real background: change it,
 * roll a random one, or take it off. Small and dark so it reads over any
 * picture without a panel behind it.
 */
export function BannerEditButtons({ media }: { media: ProfileMedia }) {
  const t = useT();
  return (
    <div className="flex items-center gap-1.5">
      <MediaButton
        onClick={media.pickBanner}
        disabled={media.bannerBusy}
        label={t("profile.settings.bannerUpload")}
        icon={ImagePlusIcon}
      />
      <MediaButton
        onClick={media.randomBanner}
        disabled={media.bannerBusy}
        label={t("profile.settings.bannerRandom")}
        icon={media.bannerBusy ? Loader2Icon : ShuffleIcon}
        accent
        iconOnly
      />
      {media.hasBanner && (
        <MediaButton
          onClick={media.removeBanner}
          disabled={media.bannerBusy}
          label={t("profile.settings.bannerRemove")}
          icon={Trash2Icon}
          iconOnly
        />
      )}
    </div>
  );
}

/**
 * The pencil over the real avatar, plus the dice beside it. Wraps whatever
 * the header already draws rather than drawing a second avatar of its own.
 */
export function AvatarEditOverlay({
  media,
  children,
}: {
  media: ProfileMedia;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={media.pickAvatar}
        disabled={media.avatarBusy}
        aria-label={t("profile.settings.avatarUpload")}
        className="group relative block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        {children}
        {/* Always legible on a touch screen, where there is no hover to
            reveal it — only faded out from sm up. */}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          {media.avatarBusy ? (
            <Loader2Icon className="size-5 animate-spin" />
          ) : (
            <PencilIcon className="size-5" />
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={media.randomAvatar}
        disabled={media.avatarBusy}
        aria-label={t("profile.settings.avatarRandom")}
        title={t("profile.settings.avatarRandom")}
        className="absolute -right-0.5 bottom-0.5 flex size-8 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-60"
      >
        <ShuffleIcon className="size-3.5" />
      </button>
    </div>
  );
}

function MediaButton({
  onClick,
  disabled,
  label,
  icon: Icon,
  accent,
  iconOnly,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  icon: typeof ImagePlusIcon;
  accent?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium shadow-md transition-all hover:scale-105 disabled:pointer-events-none disabled:opacity-60",
        accent ? "bg-primary text-primary-foreground" : "bg-black/55 text-white hover:bg-black/70",
        iconOnly && "w-8 justify-center px-0",
      )}
    >
      <Icon className={cn("size-3.5", disabled && Icon === Loader2Icon && "animate-spin")} />
      {!iconOnly && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}
