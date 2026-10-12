import type { EarnedAchievement, FollowKind, PublicProfile, Rank } from "@animeshadow/shared";
import { ChevronDownIcon, GitCompareArrowsIcon, Loader2Icon, MessageSquarePlusIcon, PencilIcon, Settings2Icon, ShuffleIcon } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AchievementDetailDialog } from "@/components/achievement-detail-dialog";
import { LogoWatermark } from "@/components/brand/logo-watermark";
import { ProMark } from "@/components/common/pro-mark";
import { AchievementTip, HoloAchievementBadge } from "@/components/holo-achievement-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useScrollDirection } from "@/hooks/use-scroll-direction";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PresenceDot } from "../identity-extras";
import { AvatarFrameRing, ProfileTitleBadge } from "../profile-cosmetics";
import { levelOf } from "../profile-level";
import { BannerEditButtons } from "../profile-media-editor";
import { ProfileBanner } from "../profile-banner";
import { LevelBadge, LevelBar } from "../level-visuals";
import { CountUp } from "../profile-progression";
import { ShareProfileButton } from "../share-profile";
import type { ProfileMedia } from "../use-profile-media";
import { plural } from "./format";
import { ReportProfileButton } from "./report-profile";
import { FollowButton, SocialLine } from "./social";

const RANK_RING: Record<Rank, string> = {
  NOVICE: "ring-muted-foreground/40",
  ADVANCED: "ring-emerald-500/70",
  EXPERT: "ring-sky-500/70",
  LEGEND: "ring-amber-400/80",
};

const PRESENCE_TEXT: Record<PublicProfile["onlineStatus"], string | null> = {
  ONLINE: "в сети",
  DND: "не беспокоить",
  OFFLINE: null,
};

/**
 * The top of the profile: the cover runs the page's full width and fades
 * into it; over its lower edge sit the avatar (in its earned frame, the
 * level medallion on its foot), the name with its PRO mark and title, the
 * nickname, presence and how long they've been here, the bio, and the
 * achievements pinned to the showcase. On the right — or under it all on a
 * phone — share, and "customise" on one's own profile or "compare tastes"
 * on someone else's. The cover and the avatar are edited where they are.
 */
export function ProfileStage({
  profile,
  own,
  media,
  onCustomise,
  onCompare,
  onNeedUsername,
  onPeople,
  onWrite,
}: {
  profile: PublicProfile;
  own: boolean;
  media: ProfileMedia;
  onCustomise?: () => void;
  onCompare?: () => void;
  onNeedUsername?: () => void;
  /** Opens the followers / following / friends list. */
  onPeople: (kind: FollowKind) => void;
  /** Takes one to the wall, cursor in the field. */
  onWrite?: () => void;
}) {
  const t = useT();
  const level = useMemo(() => levelOf(profile), [profile]);
  const [opened, setOpened] = useState<EarnedAchievement | null>(null);
  const initial = (profile.displayName || "?").charAt(0).toUpperCase();
  const since = new Date(profile.memberSince).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const presence = PRESENCE_TEXT[profile.onlineStatus];
  const pinned = profile.showcaseAchievementIds
    .map((id) => profile.achievements.find((a) => a.id === id && a.earned))
    .filter((a): a is EarnedAchievement => a != null);

  // The picture itself — on one's own profile a button that changes it,
  // with the shade and the pencil on the picture only: the frame, the
  // level medallion and the presence dot stay on top, untouched.
  const face = (
    <div className="relative grid size-28 place-items-center overflow-hidden rounded-full bg-card font-display text-4xl sm:size-36">
      {profile.avatarUrl ? <img src={imageSrc(profile.avatarUrl)} alt="" className="size-full object-cover" /> : initial}
      {own && (
        <span className="pointer-events-none absolute inset-0 hidden place-items-center bg-black/45 text-white opacity-0 transition-opacity duration-200 group-hover/face:opacity-100 sm:grid">
          {media.avatarBusy ? <Loader2Icon className="size-6 animate-spin" /> : <PencilIcon className="size-6" />}
        </span>
      )}
    </div>
  );
  const avatar = (
    <div className="relative shrink-0">
      <AvatarFrameRing frame={profile.avatarFrame} fallback={RANK_RING[profile.rank]}>
        {own ? (
          <button
            type="button"
            onClick={media.pickAvatar}
            disabled={media.avatarBusy}
            aria-label="Сменить аватар"
            className="group/face block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {face}
          </button>
        ) : (
          face
        )}
      </AvatarFrameRing>
      <PresenceDot status={profile.onlineStatus} className="right-2 top-2 z-20 sm:right-3 sm:top-3" />
      <span className="absolute -bottom-1 -left-1 z-20 rounded-full bg-background p-0.5 shadow-lg shadow-black/40" title={`${level.level} уровень · ${level.tier.name}`}>
        <LevelBadge info={level} size={44} />
      </span>
      {own && (
        <>
          <button
            type="button"
            onClick={media.randomAvatar}
            disabled={media.avatarBusy}
            aria-label="Случайный аватар"
            title="Случайный аватар"
            className="absolute -bottom-0.5 -right-0.5 z-20 grid size-8 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-60"
          >
            <ShuffleIcon className="size-3.5" />
          </button>
        </>
      )}
    </div>
  );

  return (
    <section className="relative -mt-6 sm:-mt-10">
      {/* The cover, edge to edge, fading into the page. */}
      <div className="full-bleed relative h-44 overflow-hidden sm:h-60 lg:h-72">
        <ProfileBanner url={profile.bannerUrl} accent={profile.accentColor} className="absolute inset-0 h-full" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-background via-background/35 to-background/10" />
        {!profile.bannerUrl && <LogoWatermark className="-right-10 top-1/2 size-80 -translate-y-1/2 rotate-6 text-foreground/[0.05]" />}
        {own && (
          <div className="absolute inset-x-0 top-3 mx-auto flex max-w-[1400px] justify-end px-4 sm:top-4 sm:px-6">
            <BannerEditButtons media={media} />
          </div>
        )}
      </div>

      <div className="relative z-10 -mt-16 flex flex-col gap-4 sm:-mt-20 xl:flex-row xl:items-end xl:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <div className="w-fit shrink-0 self-start sm:self-auto">
          {avatar}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:pt-10">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="min-w-0 font-display text-[1.9rem] leading-none tracking-tight [overflow-wrap:anywhere] sm:text-4xl">
              {profile.displayName}
            </h1>
            {profile.isPro && <ProMark />}
            <ProfileTitleBadge title={profile.profileTitle} />
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {profile.username && <span>@{profile.username}</span>}
            {presence && (
              <span className={cn("inline-flex items-center gap-1.5", profile.onlineStatus === "ONLINE" ? "text-emerald-400" : "text-amber-400")}>
                <span className="size-1.5 rounded-full bg-current" />
                {presence}
              </span>
            )}
            <span className="text-muted-foreground/70">· на сайте с {since}</span>
          </p>
          {profile.bio && <Bio text={profile.bio} />}
          {pinned.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {pinned.map((a) => (
                <Tooltip key={a.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setOpened(a)}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-line-soft)] bg-card/60 py-0.5 pl-0.5 pr-3 text-xs transition-[border-color,transform] hover:-translate-y-0.5 hover:border-primary/40"
                    >
                      <span className="achx-tilt">
                        <HoloAchievementBadge id={a.id} rarity={a.rarity} earned earnedAt={a.earnedAt} variant="circle" tip={false} className="size-7" />
                      </span>
                      <span className="max-w-36 truncate">{t(`achievements.items.${a.id}.title` as "achievements.items.critic.title")}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-64 p-0">
                    <AchievementTip id={a.id} rarity={a.rarity} earned earnedAt={a.earnedAt} />
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </div>

        </div>

        <div className="flex shrink-0 flex-col gap-3 xl:items-end xl:pb-1">
        <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
          <ShareProfileButton
            profile={profile}
            own={own}
            onNeedUsername={onNeedUsername}
            className="order-3 h-11 min-w-0 flex-1 justify-center gap-1.5 rounded-xl px-2 sm:order-none sm:gap-2 sm:px-4 lg:flex-none"
          />
          {own ? (
            <button
              type="button"
              onClick={onCustomise}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:-translate-y-0.5 active:scale-95 lg:flex-none"
            >
              <Settings2Icon className="size-4" />
              {t("profile.studio.open")}
            </button>
          ) : (
            <>
              <FollowButton userId={profile.id} className="order-1 grow basis-[calc(100%-3.25rem)] sm:order-none sm:basis-auto sm:flex-1 lg:flex-none" />
              {onWrite && (
                <button
                  type="button"
                  onClick={onWrite}
                  title="Написать на стене"
                  className="order-3 inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-black/35 px-2 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:border-white/30 hover:bg-black/50 sm:order-none sm:gap-2 sm:px-4 lg:flex-none"
                >
                  <MessageSquarePlusIcon className="size-4 shrink-0" />
                  <span className="truncate">Написать</span>
                </button>
              )}
              {onCompare && (
                <button
                  type="button"
                  onClick={onCompare}
                  title="Сравнить вкусы"
                  className="order-3 inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-black/35 px-2 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:border-white/30 hover:bg-black/50 sm:order-none sm:gap-2 sm:px-4 lg:flex-none"
                >
                  <GitCompareArrowsIcon className="size-4 shrink-0" />
                  <span className="truncate">Сравнить</span>
                </button>
              )}
              <ReportProfileButton userId={profile.id} name={profile.displayName} className="order-2 sm:order-none" />
            </>
          )}
        </div>
        {/* Friends, followers, following — under the buttons, on the right. */}
        <SocialLine userId={profile.id} onOpen={onPeople} className="xl:justify-end" />
        </div>
      </div>
      <AchievementDetailDialog achievement={opened} onOpenChange={(open) => !open && setOpened(null)} />
    </section>
  );
}

/**
 * The description: two lines, and the rest opens smoothly — the height
 * runs from two lines to the whole text and back, the last line fading
 * while it's closed.
 */
function Bio({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState({ full: 0, line: 22 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ full: el.scrollHeight, line: parseFloat(getComputedStyle(el).lineHeight) || 22 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);
  const closed = Math.round(size.line * 2);
  const long = size.full > closed + 1;
  const fade = long && !open ? "linear-gradient(to bottom, #000 45%, transparent)" : undefined;
  return (
    <div className="max-w-2xl">
      <div
        className="overflow-hidden transition-[max-height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ maxHeight: long ? (open ? size.full : closed) : undefined, maskImage: fade, WebkitMaskImage: fade }}
      >
        <p ref={ref} className="whitespace-pre-line text-sm leading-relaxed text-foreground/85 [overflow-wrap:anywhere]">
          {text}
        </p>
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
        >
          {open ? "Свернуть" : "Читать полностью"}
          <ChevronDownIcon className={cn("size-3.5 transition-transform duration-300", open && "rotate-180")} />
        </button>
      )}
    </div>
  );
}

/**
 * The player strip: the level — its medallion, its name and the bar to the
 * next one, drawn in the style the owner picked — beside the four numbers a
 * visitor scans for. They count up as they come into view.
 */
export function PlayerStrip({ profile }: { profile: PublicProfile }) {
  const level = useMemo(() => levelOf(profile), [profile]);
  const s = profile.stats;
  const hours = Math.floor(s.hoursWatched);
  const minutes = Math.round(s.hoursWatched * 60);
  const cells = [
    { label: plural(s.episodesWatched, "серия", "серии", "серий"), value: <CountUp value={s.episodesWatched} /> },
    {
      label: hours > 0 ? plural(hours, "час", "часа", "часов") : plural(minutes, "минута", "минуты", "минут"),
      value: <CountUp value={hours > 0 ? hours : minutes} />,
    },
    { label: "досмотрено", value: <CountUp value={s.titlesCompleted} /> },
    { label: "средняя оценка", value: s.meanScore != null ? <CountUp value={s.meanScore} decimals={1} /> : "—" },
  ];
  return (
    <div
      className={cn(
        "grid gap-3 rounded-3xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3 sm:p-4 lg:items-center",
        !profile.hidden.stats && "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
      )}
    >
      <div className="flex items-center gap-4 px-1 py-1">
        {/* Room around the medallion for its rays and crown. */}
        <span className="grid shrink-0 place-items-center p-2.5 pt-4">
          <LevelBadge info={level} size={64} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="mb-2 flex items-baseline gap-2 truncate">
            <span className="font-display text-lg leading-none sm:text-xl" style={{ color: level.tier.colors[0] }}>
              {level.tier.name}
            </span>
            {level.nextTier && (
              <span className="truncate text-[11px] text-muted-foreground">
                → «{level.nextTier.name}» с {level.nextTier.from} ур.
              </span>
            )}
          </p>
          <LevelBar info={level} />
        </div>
      </div>
      {!profile.hidden.stats && (
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {cells.map((c) => (
            <div key={c.label} className="flex min-w-0 flex-col items-center justify-center rounded-2xl bg-background/40 px-1 py-2.5 text-center sm:py-3">
              <span className="font-display text-lg leading-none tabular-nums sm:text-2xl">{c.value}</span>
              <span className="mt-1 truncate text-[10px] text-muted-foreground sm:text-[11px]">{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface TabDef<T extends string> {
  id: T;
  label: string;
  count?: string | number;
}

/**
 * The profile's tabs: a row that sticks under the site header (taking its
 * place on a phone while it is tucked away), a line under the open tab that
 * slides to the next one.
 */
export function ProfileTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<TabDef<T>>;
  value: T;
  onChange: (id: T) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<{ left: number; width: number } | null>(null);
  const { down, nearTop } = useScrollDirection();
  const tucked = down && !nearTop;

  useLayoutEffect(() => {
    const row = rowRef.current;
    const el = row?.querySelector<HTMLElement>(`[data-tab="${value}"]`);
    if (!row || !el) return;
    setLine({ left: el.offsetLeft, width: el.offsetWidth });
    const left = el.offsetLeft - row.clientWidth / 2 + el.clientWidth / 2;
    row.scrollTo({ left, behavior: "smooth" });
  }, [value, tabs]);

  return (
    <nav
      aria-label="Разделы профиля"
      className={cn(
        "sticky z-20 -mx-4 border-b border-[var(--accent-line-soft)] bg-background px-4 transition-[top] duration-300 ease-out sm:mx-0 sm:px-0 md:top-16",
        tucked ? "max-md:top-0" : "max-md:top-14",
      )}
    >
      <div ref={rowRef} role="tablist" className="relative flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const on = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              data-tab={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                "inline-flex h-12 shrink-0 items-center gap-1.5 px-3 text-sm font-medium transition-colors duration-200",
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count != null && tab.count !== "" && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
                    on ? "bg-primary/20 text-primary" : "bg-foreground/[0.07] text-muted-foreground",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
        {line && (
          <span
            aria-hidden
            className="absolute bottom-0 h-0.5 rounded-full bg-primary transition-[left,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ left: line.left, width: line.width }}
          />
        )}
      </div>
    </nav>
  );
}
