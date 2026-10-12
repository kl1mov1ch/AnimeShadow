import type { Cosmetic, MyProfile } from "@animeshadow/shared";
import { AVATAR_FRAMES, PROFILE_TITLES, cosmeticUnlocked, levelOf } from "@animeshadow/shared";
import { CheckIcon, LockIcon } from "lucide-react";
import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/i18n";
import { requirementProgress, requirementTag, requirementText } from "@/lib/cosmetics";
import { FEATURES } from "@/lib/features";
import { imageSrc } from "@/lib/format";
import { useAchievements, useUpdateProfile } from "@/lib/query";
import { cn } from "@/lib/utils";
import { FrameFx, FrameRing, hasFrame } from "./frame-fx";
import { ProfileTitleBadge } from "./profile-cosmetics";

/**
 * Frames and titles — earned with achievements, with levels and by
 * supporting the site. Each frame is shown on the account's own avatar;
 * locked ones stay visible, dimmed, with what opens them and how far off
 * that is — seeing what is still to come is the point of earning it.
 */
export function CosmeticsPicker({ profile }: { profile: MyProfile }) {
  const t = useT();
  const update = useUpdateProfile();
  const { data: achievements } = useAchievements();
  const level = useMemo(() => levelOf(profile).level, [profile]);
  const has = {
    earnedIds: profile.achievements.filter((a) => a.earned).map((a) => a.id),
    level,
    pro: profile.isPro,
  };
  const initial = (profile.displayName || "?").charAt(0).toUpperCase();

  const frames = [...(AVATAR_FRAMES as readonly Cosmetic[])].sort(
    (a, b) => Number(cosmeticUnlocked([b], b.id, has)) - Number(cosmeticUnlocked([a], a.id, has)),
  );
  const titles = [...(PROFILE_TITLES as readonly Cosmetic[])].sort(
    (a, b) => Number(cosmeticUnlocked([b], b.id, has)) - Number(cosmeticUnlocked([a], a.id, has)),
  );
  const openFrames = frames.filter((f) => cosmeticUnlocked([f], f.id, has)).length;
  const openTitles = titles.filter((f) => cosmeticUnlocked([f], f.id, has)).length;

  return (
    <div className="flex flex-col gap-7">
      {FEATURES.avatarFrames && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("profile.cosmetics.frames")}</h3>
            <span className="text-xs tabular-nums text-muted-foreground">
              открыто {openFrames} из {frames.length}
            </span>
          </div>
          <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
            {frames.map((frame) => {
              const unlocked = cosmeticUnlocked([frame], frame.id, has);
              const selected = (profile.avatarFrame ?? "none") === frame.id;
              const progress = unlocked ? null : requirementProgress(frame, level, achievements);
              const percent = progress && progress.target > 0 ? Math.min(100, (progress.current / progress.target) * 100) : null;
              const name = t(`profile.cosmetics.frameNames.${frame.id}` as "profile.cosmetics.frameNames.none");
              return (
                <li key={frame.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={!unlocked || update.isPending}
                        onClick={() => update.mutate({ avatarFrame: frame.id === "none" ? null : frame.id })}
                        aria-pressed={selected}
                        className={cn(
                          "group relative flex w-full flex-col items-center gap-2 rounded-2xl border px-2 pb-2.5 pt-3.5 text-center transition-[border-color,background-color,transform] duration-200",
                          selected
                            ? "border-primary/60 bg-primary/10"
                            : unlocked
                              ? "border-[var(--accent-line-soft)] hover:-translate-y-0.5 hover:border-foreground/25"
                              : "cursor-not-allowed border-[var(--accent-line-soft)] opacity-70",
                        )}
                      >
                        <span className={cn("relative isolate block size-14 rounded-full", !unlocked && "grayscale-[0.6]")}>
                          {hasFrame(frame.id) && <FrameRing frame={frame.id} />}
                          <span className="relative grid size-full place-items-center overflow-hidden rounded-full bg-card font-display text-lg ring-1 ring-black/30">
                            {profile.avatarUrl ? <img src={imageSrc(profile.avatarUrl)} alt="" className="size-full object-cover" /> : initial}
                          </span>
                          {hasFrame(frame.id) && <FrameFx frame={frame.id} small />}
                        </span>
                        <span className="line-clamp-1 text-[11px] font-medium">{name}</span>
                        {selected ? (
                          <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                            <CheckIcon className="size-3" />
                          </span>
                        ) : (
                          !unlocked && (
                            <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                              <LockIcon className="size-2.5" />
                              {requirementTag(frame)}
                            </span>
                          )
                        )}
                        {percent != null && (
                          <span aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, percent)}%` }} />
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-56">
                      <span className="flex flex-col gap-0.5">
                        <span className="font-semibold">Рамка «{name}»</span>
                        <span className="text-xs opacity-80">{requirementText(frame, t as never)}</span>
                        {progress && !unlocked && (
                          <span className="text-[11px] tabular-nums opacity-70">
                            {progress.current} из {progress.target}
                          </span>
                        )}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("profile.cosmetics.titles")}</h3>
          <span className="text-xs tabular-nums text-muted-foreground">
            открыто {openTitles} из {titles.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={update.isPending}
            onClick={() => update.mutate({ profileTitle: null })}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60",
              profile.profileTitle == null
                ? "border-primary bg-primary/15 text-primary"
                : "border-[var(--accent-line-soft)] text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {t("profile.cosmetics.noneTitle")}
          </button>
          {titles.map((title) => {
            const unlocked = cosmeticUnlocked([title], title.id, has);
            const selected = profile.profileTitle === title.id;
            const progress = unlocked ? null : requirementProgress(title, level, achievements);
            return (
              <Tooltip key={title.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={!unlocked || update.isPending}
                    onClick={() => update.mutate({ profileTitle: title.id })}
                    aria-pressed={selected}
                    className={cn(
                      "relative rounded-full p-0.5 transition-opacity",
                      selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                      !unlocked && "cursor-not-allowed opacity-45",
                    )}
                  >
                    <ProfileTitleBadge title={title.id} tip={false} />
                    {!unlocked && (
                      <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
                        <LockIcon className="size-2.5" />
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-56">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-xs opacity-80">{requirementText(title, t as never)}</span>
                    {progress && !unlocked && (
                      <span className="text-[11px] tabular-nums opacity-70">
                        {progress.current} из {progress.target}
                      </span>
                    )}
                  </span>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </section>
    </div>
  );
}
