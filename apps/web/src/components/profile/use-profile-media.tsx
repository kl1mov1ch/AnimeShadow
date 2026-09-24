import type { PublicProfile } from "@animeshadow/shared";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { type CropSpec, ImageCropper } from "@/components/common/image-cropper";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import {
  useRemoveBanner,
  useSetRandomAvatar,
  useSetRandomBanner,
  useUploadAvatar,
  useUploadBanner,
} from "@/lib/query";

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

export interface ProfileMedia {
  avatarBusy: boolean;
  bannerBusy: boolean;
  /** Opens the file picker; the crop dialog follows on its own. */
  pickAvatar: () => void;
  pickBanner: () => void;
  randomAvatar: () => void;
  randomBanner: () => void;
  removeBanner: () => void;
  hasBanner: boolean;
  /**
   * The two hidden file inputs and the crop dialog. They belong to no
   * particular button, so the caller drops this once anywhere in its tree
   * rather than every control carrying its own copy.
   */
  elements: ReactNode;
}

/**
 * Everything needed to change the avatar and the profile background, with
 * no opinion about where the buttons live.
 *
 * They used to live on a miniature mock-up of the header inside the
 * settings tab — a second, smaller profile you edited instead of the real
 * one. The controls sit on the real avatar and the real background now, so
 * this is a hook: the header owns the layout, this owns the uploading,
 * cropping and the toasts.
 */
export function useProfileMedia(profile: Pick<PublicProfile, "bannerUrl">): ProfileMedia {
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
      onError: (error) => {
        fail(error);
        setCropping(null);
      },
    });

  const saveBanner = (dataUrl: string) =>
    uploadBanner.mutate(dataUrl, {
      onSuccess: () => {
        toast.success(t("common.save"));
        setCropping(null);
      },
      onError: (error) => {
        fail(error);
        setCropping(null);
      },
    });

  const pick = async (kind: "avatar" | "banner", file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error(t("profile.settings.imageTooBig"));
      return;
    }
    // Read once here so a file that cannot be read fails before a dialog
    // opens on top of it.
    await readDataUrl(file).catch(() => undefined);
    setCropping({ kind, file });
  };

  return {
    avatarBusy,
    bannerBusy,
    hasBanner: Boolean(profile.bannerUrl),
    pickAvatar: () => avatarInput.current?.click(),
    pickBanner: () => bannerInput.current?.click(),
    randomAvatar: () =>
      randomAvatar.mutate(undefined, {
        onSuccess: (res) => {
          toast.success(t("profile.settings.avatarRandomDone"));
          updateUser({ avatarUrl: res.avatarUrl });
        },
        onError: fail,
      }),
    randomBanner: () =>
      randomBanner.mutate(undefined, {
        onSuccess: (res) =>
          toast.success(t("profile.settings.bannerRandomDone", { title: res.anime.title })),
        onError: fail,
      }),
    removeBanner: () =>
      removeBanner.mutate(undefined, {
        onSuccess: () => toast.success(t("profile.settings.bannerRemoved")),
        onError: fail,
      }),
    elements: (
      <>
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
          title={
            cropping?.kind === "banner"
              ? t("profile.crop.bannerTitle")
              : t("profile.crop.avatarTitle")
          }
          pending={cropping?.kind === "banner" ? uploadBanner.isPending : uploadAvatar.isPending}
          onCancel={() => setCropping(null)}
          onConfirm={(dataUrl) =>
            cropping?.kind === "banner" ? saveBanner(dataUrl) : saveAvatar(dataUrl)
          }
        />
      </>
    ),
  };
}
