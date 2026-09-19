import type { MyProfile } from "@animeshadow/shared";
import { ImageIcon, ImagePlusIcon, Loader2Icon, PencilIcon, ShuffleIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { type CropSpec, ImageCropper } from "@/components/common/image-cropper";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import {
  useRemoveBanner,
  useSetRandomAvatar,
  useSetRandomBanner,
  useUploadAvatar,
  useUploadBanner,
} from "@/lib/query";
import { cn } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

const AVATAR_CROP: CropSpec = { aspect: 1, width: 512, height: 512, round: true };
const BANNER_CROP: CropSpec = { aspect: 3, width: 1500, height: 500 };

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

/**
 * Avatar and profile background, edited on a preview laid out like the real
 * profile header: the background across the top, the avatar over its edge.
 * Every picture is cropped here first, then stored on our own server — the
 * previous one is deleted there once the new one is in place.
 */
export function ProfileMediaEditor({ profile }: { profile: MyProfile }) {
  const t = useT();
  const { updateUser } = useAuth();
  const uploadAvatar = useUploadAvatar();
  const randomAvatar = useSetRandomAvatar();
  const uploadBanner = useUploadBanner();
  const randomBanner = useSetRandomBanner();
  const removeBanner = useRemoveBanner();
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const [cropping, setCropping] = useState<{ kind: "avatar" | "banner"; file: File } | null>(null);

  const fail = (error: unknown) =>
    toast.error(error instanceof ApiRequestError ? error.message : t("errors.genericTitle"));

  const avatarBusy = uploadAvatar.isPending || randomAvatar.isPending;
  const bannerBusy = uploadBanner.isPending || randomBanner.isPending || removeBanner.isPending;

  const saveAvatar = (dataUrl: string) =>
    uploadAvatar.mutate(dataUrl, {
      onSuccess: (res) => {
        toast.success(t("common.save"));
        // The header avatar comes from the auth session, not this query.
        updateUser({ avatarUrl: res.avatarUrl });
        setCropping(null);
      },
      onError: fail,
    });

  const saveBanner = (dataUrl: string) =>
    uploadBanner.mutate(dataUrl, {
      onSuccess: () => {
        toast.success(t("common.save"));
        setCropping(null);
      },
      onError: fail,
    });

  const pick = async (kind: "avatar" | "banner", file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error(t("profile.settings.fileTooLarge"));
      return;
    }
    // A GIF would lose its animation on the canvas, so it goes up as it is
    // and the page's object-fit does the framing.
    if (file.type === "image/gif") {
      const dataUrl = await readDataUrl(file);
      if (kind === "avatar") saveAvatar(dataUrl);
      else saveBanner(dataUrl);
      return;
    }
    setCropping({ kind, file });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        {/* Background preview, 3:1 like the real thing. */}
        <div className="group relative aspect-[3/1] w-full overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-primary/25 via-secondary/40 to-background">
          {profile.bannerUrl ? (
            <img
              src={imageSrc(profile.bannerUrl)}
              alt=""
              className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ImageIcon className="size-4" />
                {t("profile.settings.bannerNone")}
              </span>
            </div>
          )}
          {bannerBusy && (
            <div className="absolute inset-0 grid place-items-center bg-black/40">
              <Loader2Icon className="size-6 animate-spin text-white" />
            </div>
          )}
          <div className="absolute right-2 top-2 flex gap-1.5">
            <MediaButton
              onClick={() => bannerInput.current?.click()}
              disabled={bannerBusy}
              label={t("profile.settings.bannerUpload")}
              icon={ImagePlusIcon}
            />
            <MediaButton
              onClick={() =>
                randomBanner.mutate(undefined, {
                  onSuccess: (res) =>
                    toast.success(t("profile.settings.bannerRandomDone", { title: res.anime.title })),
                  onError: fail,
                })
              }
              disabled={bannerBusy}
              label={t("profile.settings.bannerRandom")}
              icon={ShuffleIcon}
              accent
            />
            {profile.bannerUrl && (
              <MediaButton
                onClick={() =>
                  removeBanner.mutate(undefined, {
                    onSuccess: () => toast.success(t("profile.settings.bannerRemoved")),
                    onError: fail,
                  })
                }
                disabled={bannerBusy}
                label={t("profile.settings.bannerRemove")}
                icon={Trash2Icon}
                iconOnly
              />
            )}
          </div>
        </div>

        {/* Avatar over the background's lower edge, as on the profile. */}
        <div className="absolute -bottom-8 left-4">
          <div className="relative">
            <button
              type="button"
              onClick={() => avatarInput.current?.click()}
              disabled={avatarBusy}
              aria-label={t("profile.settings.avatarUpload")}
              className="group relative size-20 overflow-hidden rounded-full bg-muted ring-4 ring-background disabled:opacity-60"
            >
              {profile.avatarUrl ? (
                <img src={imageSrc(profile.avatarUrl)} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center font-display text-2xl">
                  {profile.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                {uploadAvatar.isPending ? (
                  <Loader2Icon className="size-5 animate-spin" />
                ) : (
                  <PencilIcon className="size-5" />
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                randomAvatar.mutate(undefined, {
                  onSuccess: (res) => {
                    toast.success(t("profile.settings.avatarRandomDone"));
                    updateUser({ avatarUrl: res.avatarUrl });
                  },
                  onError: fail,
                })
              }
              disabled={avatarBusy}
              aria-label={t("profile.settings.avatarRandom")}
              title={t("profile.settings.avatarRandom")}
              className="absolute -right-1 top-0 flex size-7 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-60"
            >
              {randomAvatar.isPending ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <ShuffleIcon className="size-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      <p className="pl-28 text-[11px] leading-snug text-muted-foreground">
        {t("profile.settings.bannerHint")} {t("profile.settings.imageTypes")}.
      </p>

      <input
        ref={avatarInput}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          void pick("avatar", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={bannerInput}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          void pick("banner", e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <ImageCropper
        file={cropping?.file ?? null}
        spec={cropping?.kind === "banner" ? BANNER_CROP : AVATAR_CROP}
        title={cropping?.kind === "banner" ? t("profile.crop.bannerTitle") : t("profile.crop.avatarTitle")}
        pending={cropping?.kind === "banner" ? uploadBanner.isPending : uploadAvatar.isPending}
        onCancel={() => setCropping(null)}
        onConfirm={(dataUrl) => (cropping?.kind === "banner" ? saveBanner(dataUrl) : saveAvatar(dataUrl))}
      />
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
  icon: typeof ImageIcon;
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
        "flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium shadow-md backdrop-blur-md transition-all hover:scale-105 disabled:pointer-events-none disabled:opacity-60",
        accent ? "bg-primary text-primary-foreground" : "bg-black/55 text-white hover:bg-black/70",
        iconOnly && "w-8 justify-center px-0",
      )}
    >
      <Icon className="size-3.5" />
      {!iconOnly && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}
