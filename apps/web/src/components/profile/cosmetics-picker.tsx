import type { Cosmetic, MyProfile } from "@animeshadow/shared";
import {
  AVATAR_FRAMES,
  PROFILE_TITLES,
  cosmeticUnlocked,
} from "@animeshadow/shared";
import { LockIcon, } from "lucide-react";
import { useT } from "@/i18n";
import { useAchievements, useUpdateProfile } from "@/lib/query";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FramePreview, ProfileTitleBadge } from "./profile-cosmetics";

/**
 * Frames and titles — what the account has earned, and what it hasn't yet.
 * Locked ones stay visible on purpose: seeing what is still to come, and
 * how far off it is, is the point of earning them.
 */
export function CosmeticsPicker({ profile }: { profile: MyProfile }) {
  const t = useT();
  const update = useUpdateProfile();
  const earnedIds = profile.achievements.filter((a) => a.earned).map((a) => a.id);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("profile.cosmetics.frames")}
        </span>
        <div className="flex flex-wrap gap-3">
          {AVATAR_FRAMES.map((frame) => (
            <CosmeticChoice
              key={frame.id}
              cosmetic={frame}
              earnedIds={earnedIds}
              selected={(profile.avatarFrame ?? "none") === frame.id}
              label={t(`profile.cosmetics.frameNames.${frame.id}` as "profile.cosmetics.frameNames.none")}
              pending={update.isPending}
              onPick={() => update.mutate({ avatarFrame: frame.id === "none" ? null : frame.id })}
            >
              <FramePreview frame={frame.id} className="size-10" />
            </CosmeticChoice>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("profile.cosmetics.titles")}
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={update.isPending}
            onClick={() => update.mutate({ profileTitle: null })}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs transition-colors disabled:opacity-60",
              profile.profileTitle == null
                ? "border-primary bg-primary/15 text-primary"
                : "border-primary/20 text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {t("profile.cosmetics.noneTitle")}
          </button>
          {PROFILE_TITLES.map((title) => (
            <CosmeticChoice
              key={title.id}
              cosmetic={title}
              earnedIds={earnedIds}
              selected={profile.profileTitle === title.id}
              label={t(`profile.cosmetics.titleNames.${title.id}` as "profile.cosmetics.titleNames.newcomer")}
              pending={update.isPending}
              onPick={() => update.mutate({ profileTitle: title.id })}
              chip
            >
              <ProfileTitleBadge title={title.id} />
            </CosmeticChoice>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One frame or one title in the picker. A locked entry is still drawn —
 * dimmed, with a lock and a tooltip naming what earns it — because a grid
 * that only shows what you already have never tells you there is more.
 */
function CosmeticChoice({
  cosmetic,
  earnedIds,
  selected,
  label,
  pending,
  onPick,
  chip = false,
  children,
}: {
  cosmetic: Cosmetic;
  earnedIds: string[];
  selected: boolean;
  label: string;
  pending: boolean;
  onPick: () => void;
  /** Titles are text chips; frames are round swatches. */
  chip?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  const { data: achievements } = useAchievements();
  const unlocked = cosmeticUnlocked([cosmetic], cosmetic.id, earnedIds);
  // How far the viewer is toward the achievement that opens this one — an
  // inventory should say what's missing, not only that something is.
  const goal = !unlocked ? achievements?.find((a) => a.id === cosmetic.requires)?.progress ?? null : null;
  const percent = goal && goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : null;
  const hint = unlocked
    ? label
    : `${t("profile.cosmetics.locked", {
        achievement: t(
          `achievements.items.${cosmetic.requires}.title` as "achievements.items.critic.title",
        ),
      })}${goal ? ` · ${goal.current}/${goal.target}` : ""}`;

  const button = (
    <button
      type="button"
      disabled={!unlocked || pending}
      onClick={onPick}
      aria-label={label}
      className={cn(
        "relative transition-all disabled:cursor-not-allowed",
        chip
          ? "rounded-full p-0.5"
          : "grid size-12 place-items-center rounded-full",
        chip && selected && "ring-2 ring-primary ring-offset-2 ring-offset-card",
        !chip && selected && "ring-2 ring-primary ring-offset-2 ring-offset-card",
        unlocked ? "hover:scale-105" : "opacity-40",
      )}
    >
      {children}
      {!unlocked && (
        <span className="absolute -right-0.5 -top-0.5 grid size-3.5 place-items-center rounded-full bg-card text-muted-foreground">
          <LockIcon className="size-2.5" />
        </span>
      )}
      {percent != null && (
        <span aria-hidden className="absolute inset-x-0.5 -bottom-1.5 h-0.5 overflow-hidden rounded-full bg-primary/15">
          <span className="block h-full bg-primary" style={{ width: `${percent}%` }} />
        </span>
      )}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
