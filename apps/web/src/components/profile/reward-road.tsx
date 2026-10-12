import type { Cosmetic, LevelTier, PublicProfile } from "@animeshadow/shared";
import { AVATAR_FRAMES, LEVEL_TIERS, PROFILE_TITLES, levelOf, xpForLevel } from "@animeshadow/shared";
import { CheckIcon, GemIcon, LockIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { useUpdateProfile } from "@/lib/query";
import { cn } from "@/lib/utils";
import { FrameFx, FrameRing, hasFrame } from "./frame-fx";
import { LevelBadge } from "./level-visuals";
import { ProfileTitleBadge, TitleMark } from "./profile-cosmetics";

type Reward = { kind: "tier"; tier: LevelTier } | { kind: "frame"; id: string } | { kind: "title"; id: string };

const NODE = 112;

/** Every reward on the road of levels, by the level it comes at. */
function roadNodes(): Array<{ level: number; rewards: Reward[] }> {
  const byLevel = new Map<number, Reward[]>();
  const add = (level: number, reward: Reward) => byLevel.set(level, [...(byLevel.get(level) ?? []), reward]);
  for (const tier of LEVEL_TIERS) if (tier.from > 1) add(tier.from, { kind: "tier", tier });
  for (const f of AVATAR_FRAMES as readonly Cosmetic[]) if (f.level != null) add(f.level, { kind: "frame", id: f.id });
  for (const t of PROFILE_TITLES as readonly Cosmetic[]) if (t.level != null) add(t.level, { kind: "title", id: t.id });
  return [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, rewards]) => ({ level, rewards }));
}

/**
 * The road of rewards — each account's own pass: every level that brings
 * something (a new title of rank and its badge, a frame, a title under the
 * name) as a stop on one line, the line filled up to where the account is.
 * Stops passed are lit (and what they gave can be worn from here on one's
 * own profile), the next one pulses with how many levels are left, the
 * rest wait dimmed. Under it, what supporting the site brings.
 */
export function RewardRoad({ profile, own }: { profile: PublicProfile; own: boolean }) {
  const t = useT();
  const update = useUpdateProfile();
  const info = useMemo(() => levelOf(profile), [profile]);
  const nodes = useMemo(roadNodes, []);
  const scroller = useRef<HTMLDivElement>(null);
  const level = info.level;

  const passed = nodes.filter((n) => n.level <= level).length;
  const next = nodes[passed];
  const prevLevel = passed > 0 ? nodes[passed - 1]!.level : 1;
  // How far between the last stop passed and the next one, by experience.
  const frac = next
    ? Math.min(1, Math.max(0, (info.xp - xpForLevel(prevLevel)) / Math.max(1, xpForLevel(next.level) - xpForLevel(prevLevel))))
    : 0;
  const fill = passed === 0 ? frac * NODE * 0.5 : (passed - 0.5 + (next ? frac : 0)) * NODE;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, fill - el.clientWidth / 2);
  }, [fill]);

  const wear = (reward: Reward) => {
    if (reward.kind === "frame") update.mutate({ avatarFrame: reward.id });
    if (reward.kind === "title") update.mutate({ profileTitle: reward.id });
  };

  return (
    <div className="flex flex-col gap-4">
      <div ref={scroller} className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:-mx-5 sm:px-5">
        <ol className="relative flex" style={{ width: nodes.length * NODE }}>
          {/* The road, and how far along it the account is. */}
          <span aria-hidden className="absolute top-[30px] h-1.5 rounded-full bg-foreground/10" style={{ left: NODE / 2, width: (nodes.length - 1) * NODE }} />
          <span
            aria-hidden
            className="absolute top-[30px] h-1.5 rounded-full transition-[width] duration-1000 ease-out"
            style={{
              left: NODE / 2,
              width: Math.max(0, Math.min((nodes.length - 1) * NODE, fill - NODE / 2)),
              background: `linear-gradient(90deg, ${info.tier.colors[2]}, ${info.tier.colors[1]}, ${info.tier.colors[0]})`,
              boxShadow: `0 0 10px ${info.tier.glow}`,
            }}
          />
          {nodes.map((node, i) => {
            const reached = node.level <= level;
            const isNext = i === passed;
            return (
              <li key={node.level} className="relative flex flex-col items-center gap-2 px-1 text-center" style={{ width: NODE }}>
                <span
                  className={cn(
                    "relative z-10 grid size-[66px] place-items-center rounded-full border-2 bg-background transition-[border-color,box-shadow]",
                    reached ? "border-primary/70 shadow-[0_0_16px_-4px_var(--primary)]" : isNext ? "border-primary/50" : "border-[var(--accent-line-soft)]",
                    isNext && "lvl-pulse",
                  )}
                >
                  <span className={cn("transition-[filter,opacity]", !reached && !isNext && "opacity-40 grayscale")}>
                    <RewardPreview reward={node.rewards[0]!} profile={profile} />
                  </span>
                  {reached && (
                    <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <CheckIcon className="size-3" />
                    </span>
                  )}
                  {!reached && !isNext && (
                    <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
                      <LockIcon className="size-2.5" />
                    </span>
                  )}
                </span>
                <span className={cn("text-[11px] font-bold tabular-nums", reached ? "text-primary" : "text-muted-foreground")}>{node.level} ур.</span>
                <span className="flex min-h-[2.4em] flex-col items-center gap-0.5">
                  {node.rewards.map((reward, k) => (
                    <span key={k} className="line-clamp-1 text-[10.5px] leading-tight text-foreground/85">
                      {rewardName(reward, t)}
                    </span>
                  ))}
                </span>
                {isNext && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    через {node.level - level} ур.
                  </span>
                )}
                {own && reached && node.rewards.some((r) => r.kind !== "tier") && (
                  <span className="flex flex-col gap-1">
                    {node.rewards
                      .filter((r) => r.kind !== "tier")
                      .map((reward, k) => {
                        const worn =
                          (reward.kind === "frame" && profile.avatarFrame === reward.id) ||
                          (reward.kind === "title" && profile.profileTitle === reward.id);
                        return (
                          <button
                            key={k}
                            type="button"
                            disabled={worn || update.isPending}
                            onClick={() => wear(reward)}
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                              worn ? "bg-emerald-500/15 text-emerald-400" : "bg-foreground/[0.07] text-foreground hover:bg-primary hover:text-primary-foreground",
                            )}
                          >
                            {worn ? "Надето" : reward.kind === "frame" ? "Надеть рамку" : "Взять приписку"}
                          </button>
                        );
                      })}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <SupporterRow profile={profile} own={own} />
    </div>
  );
}

function rewardName(reward: Reward, t: ReturnType<typeof useT>): string {
  if (reward.kind === "tier") return `Звание «${reward.tier.name}»`;
  if (reward.kind === "frame") return `Рамка «${t(`profile.cosmetics.frameNames.${reward.id}` as "profile.cosmetics.frameNames.none")}»`;
  return `Приписка «${t(`profile.cosmetics.titleNames.${reward.id}` as "profile.cosmetics.titleNames.newcomer")}»`;
}

function RewardPreview({ reward, profile }: { reward: Reward; profile: PublicProfile }) {
  if (reward.kind === "tier") {
    return (
      <LevelBadge
        info={{ level: reward.tier.from, xp: 0, floor: 0, ceiling: 1, progress: 1, tier: reward.tier, nextTier: null, sources: [] }}
        size={46}
        animated={false}
      />
    );
  }
  if (reward.kind === "frame") return <FrameThumb frame={reward.id} profile={profile} />;
  return <TitleMark title={reward.id} />;
}

function FrameThumb({ frame, profile }: { frame: string; profile: PublicProfile }) {
  const initial = (profile.displayName || "?").charAt(0).toUpperCase();
  return (
    <span className="relative isolate block size-11 rounded-full">
      {hasFrame(frame) && <FrameRing frame={frame} />}
      <span className="relative grid size-full place-items-center overflow-hidden rounded-full bg-card text-sm font-semibold">
        {profile.avatarUrl ? <img src={imageSrc(profile.avatarUrl)} alt="" className="size-full object-cover" /> : initial}
      </span>
      {hasFrame(frame) && <FrameFx frame={frame} small />}
    </span>
  );
}

/** What supporting the site brings, beside the road. */
function SupporterRow({ profile, own }: { profile: PublicProfile; own: boolean }) {
  const t = useT();
  const update = useUpdateProfile();
  const frames = (AVATAR_FRAMES as readonly Cosmetic[]).filter((f) => f.pro);
  const titles = (PROFILE_TITLES as readonly Cosmetic[]).filter((f) => f.pro);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/25 bg-gradient-to-r from-amber-400/10 via-pink-500/5 to-transparent px-3 py-2.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300">
        <GemIcon className="size-4" />
        За поддержку проекта
      </span>
      {frames.map((f) => (
        <span key={f.id} className="inline-flex items-center gap-2">
          <FrameThumb frame={f.id} profile={profile} />
          <span className="text-[11px]">{t(`profile.cosmetics.frameNames.${f.id}` as "profile.cosmetics.frameNames.none")}</span>
        </span>
      ))}
      {titles.map((f) => (
        <ProfileTitleBadge key={f.id} title={f.id} />
      ))}
      {own &&
        (profile.isPro ? (
          <button
            type="button"
            disabled={update.isPending || profile.avatarFrame === frames[0]?.id}
            onClick={() => frames[0] && update.mutate({ avatarFrame: frames[0].id })}
            className="ml-auto rounded-full bg-amber-400/20 px-3 py-1 text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-400/30 disabled:opacity-60"
          >
            {profile.avatarFrame === frames[0]?.id ? "Надето" : "Надеть"}
          </button>
        ) : (
          <a href="/support" className="ml-auto rounded-full bg-amber-400/20 px-3 py-1 text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-400/30">
            Поддержать
          </a>
        ))}
    </div>
  );
}
