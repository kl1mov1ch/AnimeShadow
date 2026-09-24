import type { Cosmetic, EarnedAchievement, MyProfile } from "@animeshadow/shared";
import {
  AVATAR_FRAMES,
  PROFILE_TITLES,
  cosmeticUnlocked,
} from "@animeshadow/shared";
import { LockIcon, PaletteIcon, SparklesIcon, TrophyIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { AchievementDetailDialog } from "@/components/achievement-detail-dialog";
import { HoloAchievementBadge } from "@/components/holo-achievement-badge";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import { Link } from "react-router-dom";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { useUpdateProfile } from "@/lib/query";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FramePreview } from "./profile-cosmetics";

const RAIL_ACHIEVEMENTS = 6;

/**
 * The column beside the profile: what this account has won, what it likes,
 * and the two things it might want to change or buy. Everything here is a
 * summary that links somewhere fuller — the rail answers "what is there",
 * the page it points at answers "all of it".
 */
export function ProfileRail({
  profile,
  onOpenSettings,
}: {
  profile: MyProfile;
  /** Opens the settings dialog — the rail links to it, it never owns a
   *  second copy of the controls. */
  onOpenSettings: () => void;
}) {
  const t = useT();
  const labels = useLabels();
  const update = useUpdateProfile();
  const [opened, setOpened] = useState<EarnedAchievement | null>(null);

  const earned = profile.achievements.filter((a) => a.earned);
  const earnedIds = earned.map((a) => a.id);
  const shown = earned.slice(0, RAIL_ACHIEVEMENTS);
  const genres = profile.stats.topGenres.slice(0, 8);

  return (
    <aside className="flex flex-col gap-4">
      {/* Customisation is a shortcut, never a second set of controls — the
          avatar and the background are edited in exactly one place (their
          own hover-pencil on the header, and the settings tab behind this
          link), because having two of everything is what this page had
          before. */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-4">
        <h2 className="flex items-center gap-2 font-display text-sm">
          <PaletteIcon className="size-4 text-primary" />
          {t("profile.overview.customize")}
        </h2>

        {/* Frames. Locked ones stay visible on purpose — seeing what is
            still to come is the point of earning them. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            {t("profile.cosmetics.frames")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {AVATAR_FRAMES.map((frame) => (
              <CosmeticChoice
                key={frame.id}
                cosmetic={frame}
                earnedIds={earnedIds}
                selected={(profile.avatarFrame ?? "none") === frame.id}
                label={t(
                  `profile.cosmetics.frameNames.${frame.id}` as "profile.cosmetics.frameNames.none",
                )}
                pending={update.isPending}
                onPick={() =>
                  update.mutate({ avatarFrame: frame.id === "none" ? null : frame.id })
                }
              >
                <FramePreview frame={frame.id} className="size-7" />
              </CosmeticChoice>
            ))}
          </div>
        </div>

        {/* Titles. Fixed, earned, and "none" is one of the options rather
            than a separate switch to hide them. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            {t("profile.cosmetics.titles")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => update.mutate({ profileTitle: null })}
              className={cn(
                "rounded-lg border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-60",
                profile.profileTitle == null
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
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
                label={t(
                  `profile.cosmetics.titleNames.${title.id}` as "profile.cosmetics.titleNames.newcomer",
                )}
                pending={update.isPending}
                onPick={() => update.mutate({ profileTitle: title.id })}
                chip
              >
                {t(
                  `profile.cosmetics.titleNames.${title.id}` as "profile.cosmetics.titleNames.newcomer",
                )}
              </CosmeticChoice>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border/70 text-xs font-medium transition-colors hover:border-primary/50 hover:text-primary"
        >
          {t("profile.overview.customizeCta")}
        </button>
      </section>

      {shown.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-sm">
              <TrophyIcon className="size-4 text-amber-400" />
              {t("profile.tabs.achievements")}
              <span className="text-xs font-normal tabular-nums text-muted-foreground">
                {earned.length}
              </span>
            </h2>
            <Link
              to="/profile?tab=achievements"
              className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              {t("common.seeAll")} →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {shown.map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setOpened(a)}
                style={{ "--i": i } as CSSProperties}
                className="reveal flex flex-col items-center gap-1 rounded-xl p-1.5 text-center outline-none transition-colors hover:bg-secondary/50"
              >
                <HoloAchievementBadge
                  id={a.id}
                  rarity={a.rarity}
                  earned
                  earnedAt={a.earnedAt}
                  variant="circle"
                  className="size-10"
                />
                <span className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                  {t(`achievements.items.${a.id}.title` as "achievements.items.critic.title")}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {genres.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-4">
          <h2 className="flex items-center gap-2 font-display text-sm">
            <SparklesIcon className="size-4 text-primary" />
            {t("profile.overview.favGenres")}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {genres.map((g, i) => (
              <Link
                key={g.name}
                to={`/browse?q=${encodeURIComponent(g.name)}`}
                viewTransition
                className={
                  i === 0
                    ? "rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                    : "rounded-lg border border-border/60 bg-secondary/30 px-2.5 py-1 text-[11px] text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary"
                }
              >
                {labels.genreLabel(g.name)}
              </Link>
            ))}
          </div>
        </section>
      )}

      {!profile.isPro && (
        <section className="relative isolate flex flex-col gap-2 overflow-hidden rounded-2xl border border-primary/40 bg-card/60 p-4">
          <LogoGlyph
            aria-hidden
            className="pointer-events-none absolute -bottom-6 -right-4 -z-10 size-28 text-primary/[0.07]"
          />
          <span
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 70%)",
            }}
          />
          <h2 className="font-display text-sm leading-snug">
            {t("profile.overview.premiumTitle")}
          </h2>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t("profile.overview.premiumBody")}
          </p>
          <Link
            to="/support"
            viewTransition
            className="mt-1 inline-flex h-9 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground transition-shadow hover:shadow-lg hover:shadow-primary/30"
          >
            {t("profile.overview.premiumCta")}
          </Link>
        </section>
      )}

      <AchievementDetailDialog
        achievement={opened}
        onOpenChange={(open) => !open && setOpened(null)}
      />
    </aside>
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
  const unlocked = cosmeticUnlocked([cosmetic], cosmetic.id, earnedIds);
  const hint = unlocked
    ? label
    : t("profile.cosmetics.locked", {
        achievement: t(
          `achievements.items.${cosmetic.requires}.title` as "achievements.items.critic.title",
        ),
      });

  const button = (
    <button
      type="button"
      disabled={!unlocked || pending}
      onClick={onPick}
      aria-label={label}
      className={cn(
        "relative transition-all disabled:cursor-not-allowed",
        chip
          ? "rounded-lg border px-2 py-0.5 text-[11px]"
          : "grid size-9 place-items-center rounded-full",
        chip && selected
          ? "border-primary/50 bg-primary/10 text-primary"
          : chip && "border-border/60 text-muted-foreground",
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
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
