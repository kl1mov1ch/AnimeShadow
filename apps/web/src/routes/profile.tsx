import type {
  EarnedAchievement,
  MyProfile,
  ProfileStats,
  PublicProfile,
  Rank,
} from "@animeshadow/shared";
import { MAX_SHOWCASE_ACHIEVEMENTS } from "@animeshadow/shared";
import { type CSSProperties, useState } from "react";
import {
  Settings2Icon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  FilmIcon,
  FootprintsIcon,
  LinkIcon,
  type LucideIcon,
  MailIcon,
  MonitorSmartphoneIcon,
  MoonStarIcon,
  StarIcon,
  SunIcon,
  PaletteIcon,
  ShieldCheckIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  TrophyIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Link, useNavigate, useParams, } from "react-router-dom";
import { toast } from "sonner";
import { AchievementDetailDialog } from "@/components/achievement-detail-dialog";
import { AchievementBadge } from "@/components/achievement-badge";
import { HoloAchievementBadge } from "@/components/holo-achievement-badge";
import { EmptyState, ErrorState } from "@/components/common/states";
import {
  fmtDuration,
  } from "@/components/anime/progress-row";
import { UserTitleBadge } from "@/components/user-title-badge";
import { PasswordInput, TextInput } from "@/components/auth/auth-card";
import { CodeInput } from "@/components/auth/code-input";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { useLocale, useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import {
  useAchievements,
  useDeleteAccount,
  useGenrePreferencesStatus,
  useGenres,
  useMyProfile,
  usePublicProfile,
  useReactionGif,
  useResendVerification,
  useSetGenrePreferences,
  useSetUsername,
  useUpdateProfile,
  useVerifyEmail,
} from "@/lib/query";
import { cn } from "@/lib/utils";
import { ProfileBanner } from "@/components/profile/profile-banner";
import { ProMark } from "@/components/common/pro-mark";
import { PresenceDot } from "@/components/profile/identity-extras";
import {
  AvatarEditOverlay,
  BannerEditButtons,
} from "@/components/profile/profile-media-editor";
import { useProfileMedia } from "@/components/profile/use-profile-media";
import {
  AvatarFrameRing,
  ProfileTitleBadge,
} from "@/components/profile/profile-cosmetics";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";
import { ProfileBlocks } from "@/components/profile/profile-blocks";
import { useSettingsMatch } from "@/components/profile/profile-settings-extras";
import { ProfileStudio } from "@/components/profile/profile-studio";
import { ProfileProgress } from "@/components/profile/profile-progress";
import { useProfileAccentStyle } from "@/components/profile/profile-accent";
import { FEATURES } from "@/lib/features";
import { CollectionsShelf, TasteDna, TrophyHall } from "@/components/profile/profile-collection";

export function Component() {
  const t = useT();
  const { username } = useParams();
  const { status } = useAuth();

  if (username) return <PublicView username={username.replace(/^@/, "")} />;

  if (status === "loading") return <ProfileSkeleton />;
  if (status !== "authenticated") {
    return (
      <ProfileShell>
        <EmptyState
          title={t("profile.signedOut.title")}
          description={t("profile.signedOut.body")}
          action={
            <Button asChild>
              <Link to="/login">{t("profile.signedOut.cta")}</Link>
            </Button>
          }
        />
      </ProfileShell>
    );
  }
  return <OwnView />;
}

/**
 * One page container for every profile view — public and own alike — so both
 * read as the same surface at the same width and vertical rhythm.
 */
function ProfileShell({
  children,
  profile,
}: {
  children: React.ReactNode;
  profile?: { accentColor: string | null; avatarUrl: string | null; layout: { autoAccent: boolean } };
}) {
  const style = useProfileAccentStyle(profile);
  return (
    <div style={style} className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 sm:gap-6">
      {children}
    </div>
  );
}

function PublicView({ username }: { username: string }) {
  const t = useT();
  const { data, isPending, isError } = usePublicProfile(username);
  if (isPending) return <ProfileSkeleton />;
  if (isError || !data)
    return <ErrorState title={t("errors.notFoundTitle")} message={t("errors.notFoundBody")} />;
  return <ProfilePage profile={data} own={false} />;
}

function OwnView() {
  const { data: profile, isPending } = useMyProfile();
  const [studioOpen, setStudioOpen] = useState(false);
  if (isPending || !profile) return <ProfileSkeleton />;
  return (
    <>
      <ProfilePage profile={profile} own onCustomise={() => setStudioOpen(true)} />
      <ProfileStudio
        profile={profile}
        open={studioOpen}
        onOpenChange={setStudioOpen}
        account={<SettingsTab profile={profile} />}
      />
    </>
  );
}

/**
 * The whole profile, one page: who it is, the numbers, then what they've
 * been watching on the left and what they like and have won on the right.
 * There are no tabs — every part is a block the owner can move or hide —
 * and exactly one button changes anything: "customise", in the header.
 */
function ProfilePage({
  profile,
  own,
  onCustomise,
}: {
  profile: PublicProfile;
  own: boolean;
  onCustomise?: () => void;
}) {
  return (
    <ProfileShell profile={profile}>
      <ProfileHero profile={profile} stats={profile.stats} editable={own} onOpenSettings={onCustomise} />
      {!profile.hidden.stats && (
        <StatsBar
          stats={profile.stats}
          achievementsEarned={profile.achievements.filter((a) => a.earned).length}
        />
      )}
      {/* Trophies and taste, side by side under the numbers — full blocks of
          their own rather than a narrow column that stuck to the screen and
          slid along beside everything else. */}
      {/* Two independent columns, masonry-style: each block is as tall as
          its own content and the next one follows right under it. A grid of
          pairs stretched every block to its neighbour's height and left the
          shorter one with an empty bottom. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <TrophyHall profile={profile} own={own} />
          <ProfileBlocks profile={profile} own={own} only={["showcase", "year"]} />
          <CollectionsShelf profile={profile} own={own} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <TasteDna profile={profile} own={own} />
          {/* The comparison only exists on someone else's profile — which
              is also where this column tends to run short. */}
          <ProfileBlocks profile={profile} own={own} only={["watching", "activity", "compare"]} />
        </div>
      </div>
    </ProfileShell>
  );
}

/**
 * Everything the profile counts, on one line: the five numbers a visitor
 * actually scans for, hairline-separated rather than five separate floating
 * cards. Every one of them is a number the server really keeps — there is
 * no "followers" here because there is no following.
 */
function StatsBar({
  stats,
  achievementsEarned,
}: {
  stats: ProfileStats;
  achievementsEarned: number;
}) {
  const t = useT();
  const cells: Array<{ icon: LucideIcon; value: string; label: string }> = [
    { icon: FilmIcon, value: String(stats.episodesWatched), label: t("profile.summary.totalEpisodes") },
    {
      icon: CheckCircle2Icon,
      value: String(stats.titlesCompleted),
      label: t("profile.summary.completedTitles"),
    },
    { icon: TrophyIcon, value: String(achievementsEarned), label: t("profile.tabs.achievements") },
    {
      icon: ClockIcon,
      value: fmtDuration(t, stats.hoursWatched * 3600),
      label: t("profile.summary.totalTime"),
    },
    {
      icon: StarIcon,
      value: stats.meanScore != null ? stats.meanScore.toFixed(1) : "—",
      label: t("profile.summary.meanScore"),
    },
  ];

  return (
    // gap-px over the border colour draws the hairlines between cells at
    // every breakpoint on its own — no per-cell border rules that have to
    // know which column they landed in.
    <div className="reveal-group grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 sm:grid-cols-3 lg:grid-cols-5">
      {cells.map(({ icon: Icon, value, label }, i) => (
        <div
          key={label}
          style={{ "--i": i } as CSSProperties}
          className="reveal group flex items-center gap-3 bg-card/60 px-4 py-3.5 transition-colors hover:bg-card"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
            <Icon className="size-4" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-display text-lg leading-none tabular-nums">{value}</span>
            <span className="truncate text-[11px] text-muted-foreground">{label}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

const RANK_RING: Record<Rank, string> = {
  NOVICE: "ring-muted-foreground/40",
  ADVANCED: "ring-emerald-500/70",
  EXPERT: "ring-sky-500/70",
  LEGEND: "ring-amber-400/80",
};

const RANK_DOT: Record<Rank, string> = {
  NOVICE: "bg-muted-foreground/60",
  ADVANCED: "bg-emerald-500",
  EXPERT: "bg-sky-500",
  LEGEND: "bg-amber-400",
};

/** A tinted chip per rank instead of a plain grey box with a coloured dot —
 * the rank badge is the one thing in the hero that's actually earned, so it
 * gets to look like it. */
const RANK_CHIP: Record<Rank, string> = {
  NOVICE: "border-border/60 bg-secondary/40",
  ADVANCED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  EXPERT: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  LEGEND: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

/**
 * Avatar anchors the block, the name is the loudest thing on the page, and
 * rank/PRO live in their own labelled rail on the right instead of trailing
 * the name as a row of look-alike badges.
 */
/**
 * Identity and stats used to be two separate blocks (a hero card, then a
 * stat-cards row below it) — one surface now: a small square of "who this
 * is" on the left (avatar, name, pinned achievements with their actual
 * names underneath instead of bare unlabelled circles), and the numbers
 * plus the list charts filling the rest of the row, so it reads as one
 * finished card instead of a tall square next to a short one with empty
 * space trailing it.
 */
function ProfileHero({
  profile,
  stats,
  editable = false,
  onOpenSettings,
}: {
  profile: PublicProfile;
  stats: ProfileStats;
  /** Only the account's own page gets the hover-to-edit affordance — a
   * visitor on someone else's profile has nothing to edit here. */
  editable?: boolean;
  /** Opens the settings dialog. Absent on someone else's profile. */
  onOpenSettings?: () => void;
}) {
  const t = useT();
  // Unconditional, as hooks must be: on a profile that is not yours it
  // simply never gets a button wired to it.
  const media = useProfileMedia(profile);
  const { locale } = useLocale();
  const initial = (profile.displayName || "?").charAt(0).toUpperCase();
  const memberSince = new Date(profile.memberSince).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  // Order preserved server-side (first = leftmost); only ever contains ids
  // the user has actually earned (re-checked on every profile read).
  const pinned = profile.showcaseAchievementIds
    .map((id) => profile.achievements.find((a) => a.id === id && a.earned))
    .filter((a): a is EarnedAchievement => a != null);
  const [opened, setOpened] = useState<EarnedAchievement | null>(null);

  const avatar = (
    <div className="relative shrink-0">
      {/* The rank ring is the fallback, so an account that never opens the
          picker looks exactly as it did before frames existed. The badge on
          the ring's foot is the real episode count — the same number the
          stats bar below shows, not a decoration. */}
      <AvatarFrameRing
        frame={profile.avatarFrame}
        fallback={RANK_RING[profile.rank]}
        badge={{
          icon: FootprintsIcon,
          value: stats.episodesWatched,
          label: t("profile.summary.totalEpisodes"),
        }}
      >
        <div className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-card font-display text-3xl sm:size-28">
          {profile.avatarUrl ? (
            <img src={imageSrc(profile.avatarUrl)} alt="" className="size-full object-cover" />
          ) : (
            initial
          )}
        </div>
      </AvatarFrameRing>
      <PresenceDot status={profile.onlineStatus} className="bottom-1.5 right-1.5" />
    </div>
  );

  return (
    <>
      <header className="reveal-group relative overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)]">
        {/* The picture fills the whole header, top to bottom and edge to
            edge — the identity sits on it, not under a strip cut out of it.
            A GIF plays here as uploaded. */}
        <ProfileBanner
          url={profile.bannerUrl}
          accent={profile.accentColor}
          editable={false}
          className="absolute inset-0 h-full"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent"
        />
        <div className="relative h-28 sm:h-40">
          {/* Sized to the band, not to the band it used to be: at 13rem
              over an 7rem strip the mark was twice the height of the thing
              it sat on, so all anyone saw was a cropped blob. */}
          <SlicedGlyph className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none text-[3.5rem] leading-none text-white/[0.06] sm:text-[4.5rem]" />
          {/* On the real background, not on a preview of it inside a
              settings form — change it, roll one, or take it off. */}
          {editable && (
            <div className="absolute right-2 top-2 sm:right-3 sm:top-3">
              <BannerEditButtons media={media} />
            </div>
          )}
        </div>

        {/* The identity rides up over the banner's lower edge, the way the
            reference has it — one row, not a card parked in a column. */}
        <div className="relative -mt-14 flex flex-col gap-4 px-4 pb-5 sm:-mt-16 sm:px-8 sm:pb-6">
          <div className="flex flex-wrap items-end gap-4">
            {editable ? <AvatarEditOverlay media={media}>{avatar}</AvatarEditOverlay> : avatar}

            {/* basis-60 rather than a bare flex-1: when the row runs out of
                width it is the actions that drop to their own line, instead
                of the name being squeezed to a few characters. */}
            <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                {/* The body face, not the wide display one: a nickname set
                    in it ran half across the header. */}
                <h1 className="flex min-w-0 items-center gap-1.5 text-2xl font-bold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-[1.75rem]">
                  <span className="min-w-0">{profile.displayName}</span>
                  {profile.isPro && <ProMark />}
                </h1>
                <ProfileTitleBadge title={profile.profileTitle} />
              </div>
              {profile.username && (
                <p className="truncate text-sm text-muted-foreground">
                  {t("profile.handle", { username: profile.username })}
                </p>
              )}
              {profile.bio && (
                <p className="line-clamp-2 max-w-2xl text-sm leading-relaxed text-foreground/85">
                  {profile.bio}
                </p>
              )}
            </div>

            {/* In the flow, not pinned over the banner — on a wide screen
                they sit at the right end of the identity row, on a narrow
                one they wrap under it on their own line. */}
            {/* The one control on the page that changes the profile. */}
            {editable && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="btn-sheen mb-1 inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:-translate-y-0.5 active:scale-95"
              >
                <Settings2Icon className="size-4" />
                {t("profile.studio.open")}
              </button>
            )}
          </div>

          {/* Rank, as a real position between two real numbers. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1",
                RANK_CHIP[profile.rank],
              )}
            >
              <span aria-hidden className={cn("size-1.5 rounded-full", RANK_DOT[profile.rank])} />
              <span className="text-[11px] font-medium">
                {t(`profile.rank.${profile.rank.toLowerCase()}` as "profile.rank.novice")}
              </span>
              <InfoTooltip side="bottom" className="size-3.5 opacity-70 hover:opacity-100">
                {t("profile.rank.hint")}
              </InfoTooltip>
            </div>

            {/* The bar under the name — styled and measured the way the
                owner chose in the studio. */}
            <ProfileProgress profile={profile} />

            <p className="shrink-0 text-[11px] text-muted-foreground/70">
              {t("profile.memberSince", { date: memberSince })}
            </p>
          </div>

          {pinned.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {pinned.map((a) => (
                <Tooltip key={a.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setOpened(a)}
                      className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 py-1 pl-1 pr-3 text-xs transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <HoloAchievementBadge
                        id={a.id}
                        rarity={a.rarity}
                        earned
                        earnedAt={a.earnedAt}
                        variant="circle"
                        className="size-6"
                      />
                      <span className="max-w-32 truncate">
                        {t(`achievements.items.${a.id}.title` as "achievements.items.critic.title")}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t(`achievements.items.${a.id}.title` as "achievements.items.critic.title")}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </div>
      </header>
      <AchievementDetailDialog
        achievement={opened}
        onOpenChange={(open) => !open && setOpened(null)}
      />
      {editable && media.elements}
    </>
  );
}





/** A small sub-field label, for the rare expanded row with more than one
 * input inside it (identity's username + bio, the PRO title's icon +
 * text) — most rows need no label of their own since the row header
 * already names the setting. */
function SettingsLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground">{children}</span>;
}

/** One rounded list, hairline dividers between rows — the Telegram settings-
 * screen shape: a single continuous surface instead of a stack of separate
 * bordered cards each with their own heading and padding. */
function SettingsList({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/40">
      {children}
    </div>
  );
}

/**
 * One row. Two shapes, matching how Telegram itself splits its own settings:
 * - `control` — a value that's already a single-tap picker (a two/three-way
 *   Select) sits inline as the row's trailing content, no extra tap needed.
 * - `children` — anything bigger (text fields, a picker grid, a form) stays
 *   collapsed behind the row and only takes up space once it's opened; the
 *   summary value (if any) is what's visible either way.
 */
function SettingsRow({
  icon: Icon,
  label,
  value,
  info,
  control,
  expanded,
  onToggle,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value?: React.ReactNode;
  info?: React.ReactNode;
  control?: React.ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}) {
  const matches = useSettingsMatch(label);
  if (!matches) return null;
  const header = (
    <div
      className={cn(
        "group/row flex min-h-14 items-center gap-3 px-4 py-2.5",
        onToggle && "cursor-pointer transition-colors hover:bg-secondary/40 active:bg-secondary/60",
      )}
      onClick={onToggle}
      role={onToggle ? "button" : undefined}
      tabIndex={onToggle ? 0 : undefined}
      onKeyDown={onToggle ? (e) => e.key === "Enter" && onToggle() : undefined}
    >
      {/* One treatment for every row, not a hue per row. Eight different
          colours down a single list made the list itself the loudest thing
          on the page, and implied a grouping that does not exist — these
          rows are siblings, not categories. The chip stays neutral and only
          takes the site colour once its row is open or hovered, so colour
          means state here rather than decoration. */}
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl border border-border/60 bg-secondary/40 text-muted-foreground transition-colors duration-200",
          onToggle && "group-hover/row:border-primary/30 group-hover/row:text-foreground",
          expanded && "border-primary/40 bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium">
        {label}
        {info}
      </span>
      {control ?? (
        <>
          {value && (
            <span className="min-w-0 max-w-[45%] truncate text-xs text-muted-foreground">
              {value}
            </span>
          )}
          {onToggle && (
            <ChevronRightIcon
              className={cn(
                "size-4 shrink-0 text-muted-foreground/50 transition-transform",
                expanded && "rotate-90",
              )}
            />
          )}
        </>
      )}
    </div>
  );

  return (
    <div>
      {header}
      {/* Opens with a fade and a small rise rather than appearing outright.
          Still conditionally mounted: keeping a collapsed form in the DOM
          just to animate its height would leave its inputs reachable by
          keyboard while invisible, which is a worse bug than an instant
          close. */}
      {expanded && children && (
        <div className="animate-in fade-in slide-in-from-top-1 flex flex-col gap-3 px-4 pb-4 pt-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

function SettingsTab({ profile }: { profile: MyProfile }) {
  const t = useT();
  const { setTheme, theme } = useTheme();
  const update = useUpdateProfile();
  const setUsername = useSetUsername();
  const { data: achievements } = useAchievements();

  const [bio, setBio] = useState(profile.bio ?? "");
  const [statusValue, setStatusValue] = useState(profile.onlineStatus);
  const [uname, setUname] = useState(profile.username ?? "");
  // One row open at a time, accordion-style — the Telegram settings screen
  // this is modeled on never shows two expanded sub-forms at once either.
  const [openRow, setOpenRow] = useState<string | null>(null);
  const toggle = (key: string) => setOpenRow((cur) => (cur === key ? null : key));

  const { data: genreStatus } = useGenrePreferencesStatus();

  const earned = (achievements ?? []).filter((a) => a.earned);

  // One card, one save — claiming a username (only possible once) and
  // editing the bio used to each need their own button; a viewer editing
  // both had to click twice for two changes that live in the same place.
  const usernameClaimable = !profile.username && uname.trim().length >= 3;
  const bioDirty = bio !== (profile.bio ?? "");
  const identityDirty = usernameClaimable || bioDirty;
  const identitySaving = setUsername.isPending || update.isPending;

  const saveIdentity = () => {
    if (usernameClaimable) {
      setUsername.mutate(uname, {
        onSuccess: () => {
          toast.success(t("profile.settings.usernameSet"));
          if (bioDirty) update.mutate({ bio: bio || null });
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : t("errors.genericTitle")),
      });
    } else if (bioDirty) {
      update.mutate({ bio: bio || null }, { onSuccess: () => toast.success(t("common.save")) });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsList>
        <SettingsRow
          icon={UserIcon}
          label={t("profile.title")}
          value={profile.username ? t("profile.handle", { username: profile.username }) : bio || undefined}
          expanded={openRow === "identity"}
          onToggle={() => toggle("identity")}
        >
          {/* The avatar and the background are edited on the real ones,
              in the header — this form used to carry a second, smaller
              copy of the profile to edit instead. */}
          <div className="flex items-start gap-4">

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <SettingsLabel>{t("profile.settings.username")}</SettingsLabel>
              {/* flex-wrap so a long "copy link" label never fights the
                  input for space on a narrow phone — it just drops to its
                  own line instead of forcing the row wider than the screen. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">@</span>
                <input
                  value={uname}
                  onChange={(e) =>
                    setUname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                  }
                  maxLength={20}
                  disabled={Boolean(profile.username)}
                  placeholder={t("profile.settings.usernamePlaceholder")}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
                {profile.username && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      navigator.clipboard
                        ?.writeText(
                          `${window.location.origin}/profile/@${profile.username}`,
                        )
                        .then(() => toast.success(t("seo.linkCopied")))
                        .catch(() => undefined);
                    }}
                  >
                    <LinkIcon />
                    <span className="hidden sm:inline">
                      {t("profile.settings.copyProfileLink")}
                    </span>
                  </Button>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                {profile.username
                  ? t("profile.settings.usernameHint")
                  : t("profile.settings.usernameClaimHint")}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <SettingsLabel>{t("profile.settings.bio")}</SettingsLabel>
            <textarea
              value={bio}
              maxLength={500}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="🔥 …"
            />
            <span className="text-[11px] text-muted-foreground/80">
              {bio.length}/500 · {t("profile.settings.bioHint")}
            </span>
          </div>

          {/* One button for both fields above — a username claim and a bio
              edit used to each demand their own "Save", which meant two
              clicks for one visit here. Whichever changed (or both) goes out
              together. */}
          <div className="flex justify-end">
            <Button size="sm" disabled={!identityDirty || identitySaving} onClick={saveIdentity}>
              {t("profile.settings.save")}
            </Button>
          </div>
        </SettingsRow>

        {/* Theme and status both save the instant you pick them — a
            two/three-way choice doesn't need a confirmation step, so the
            picker sits right in the row instead of behind a tap. */}
        {/* Three choices hidden inside a 32px dropdown, where you could not
            see the options without opening it and could not tell which was
            active without reading. They are all on screen now, wide enough
            to hit, each showing what it actually means. */}
        {FEATURES.lightTheme && (
        <SettingsRow
          icon={PaletteIcon}
          label={t("profile.settings.theme")}
          value={t(
            theme === "light"
              ? "profile.settings.themeLight"
              : theme === "dark"
                ? "profile.settings.themeDark"
                : "profile.settings.themeAuto",
          )}
          expanded={openRow === "theme"}
          onToggle={() => toggle("theme")}
        >
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { key: "light", Icon: SunIcon, label: t("profile.settings.themeLight") },
                { key: "dark", Icon: MoonStarIcon, label: t("profile.settings.themeDark") },
                {
                  key: "system",
                  Icon: MonitorSmartphoneIcon,
                  label: t("profile.settings.themeAuto"),
                },
              ] as const
            ).map(({ key, Icon, label }) => {
              const active = (theme ?? "system") === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setTheme(key);
                    // Saved to the account, not just this browser — so it
                    // follows the user to a new device (see ThemeSync).
                    update.mutate({ theme: key });
                  }}
                  className={cn(
                    "group relative flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl border px-2 py-3 text-xs font-medium transition-all duration-200",
                    active
                      ? "border-transparent bg-gradient-to-br from-primary via-primary/85 to-primary text-primary-foreground shadow-md shadow-primary/25"
                      : "border-border/60 bg-card/40 text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <Icon className="relative z-10 size-5" />
                  <span className="relative z-10 truncate">{label}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]",
                      active ? "via-white/30" : "via-primary/25",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </SettingsRow>
        )}

        <SettingsRow
          icon={MoonStarIcon}
          label={t("profile.settings.status")}
          info={<InfoTooltip>{t("profile.settings.statusHint")}</InfoTooltip>}
          control={
            <Select
              value={statusValue}
              onValueChange={(v) => {
                setStatusValue(v as MyProfile["onlineStatus"]);
                update.mutate({ onlineStatus: v as MyProfile["onlineStatus"] });
              }}
            >
              {/* Narrower on a phone: at 320px the fixed 8rem trigger plus
                  the icon chip and the label left the label nothing to
                  truncate into. */}
              <SelectTrigger className="h-8 w-28 text-xs sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ONLINE">{t("profile.presence.online")}</SelectItem>
                <SelectItem value="OFFLINE">{t("profile.presence.offline")}</SelectItem>
                <SelectItem value="DND">{t("profile.presence.dnd")}</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        <SettingsRow
          icon={ShieldCheckIcon}
          label={t("profile.settings.age.title")}
          value={
            profile.birthDate
              ? profile.isAdult
                ? t("profile.settings.age.verifiedAdult")
                : t("profile.settings.age.verifiedMinor")
              : t("profile.settings.age.notSet")
          }
          expanded={openRow === "age"}
          onToggle={profile.birthDate ? undefined : () => toggle("age")}
        >
          <AgeVerificationContent profile={profile} update={update} />
        </SettingsRow>
        {earned.length > 0 && (
          <SettingsRow
            icon={TrophyIcon}
            label={t("profile.settings.showcase")}
            value={t("profile.settings.showcaseCount", {
              count: profile.showcaseAchievementIds.length,
              max: MAX_SHOWCASE_ACHIEVEMENTS,
            })}
            expanded={openRow === "showcase"}
            onToggle={() => toggle("showcase")}
          >
            <p className="text-[11px] leading-relaxed text-muted-foreground/80">
              {t("profile.settings.showcaseHint")}
            </p>
            <ShowcaseChips profile={profile} update={update} earned={earned} />
          </SettingsRow>
        )}

        <SettingsRow
          icon={SparklesIcon}
          label={t("profile.settings.genres")}
          value={
            genreStatus?.genreIds.length
              ? t("profile.settings.genresCount", { count: genreStatus.genreIds.length })
              : undefined
          }
          expanded={openRow === "genres"}
          onToggle={() => toggle("genres")}
        >
          <p className="text-[11px] leading-relaxed text-muted-foreground/80">
            {t("profile.settings.genresHint")}
          </p>
          <GenrePreferencesSection />
        </SettingsRow>

        <EmailVerificationRow
          expanded={openRow === "email"}
          onToggle={() => toggle("email")}
        />
      </SettingsList>

      <DeleteAccountSection profile={profile} />
    </div>
  );
}

/**
 * Only for accounts created before signup itself required a code — every
 * newer account is verified the moment it exists. Telegram accounts have no
 * inbox behind them, so they never see this.
 */
function EmailVerificationRow({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const { user, updateUser } = useAuth();
  const resend = useResendVerification();
  const verify = useVerifyEmail();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();

  if (!user || user.emailVerified || user.isTelegramLinked) return null;

  const sendCode = () => {
    resend.mutate(undefined, {
      onSuccess: () => setSent(true),
      onError: (err) =>
        toast.error(err instanceof ApiRequestError ? err.message : t("auth.genericError")),
    });
  };

  const submit = (value: string) => {
    setError(undefined);
    verify.mutate(value, {
      onSuccess: (res) => {
        updateUser({ emailVerified: res.user.emailVerified });
        toast.success(t("auth.verifyEmail.success"));
      },
      onError: (err) => {
        setError(
          err instanceof ApiRequestError && err.code === "INVALID_CODE"
            ? t("auth.verifyEmail.invalidCode")
            : t("auth.genericError"),
        );
        setCode("");
      },
    });
  };

  return (
    <SettingsRow
      icon={MailIcon}
      label={t("profile.settings.emailVerification.title")}
      value={t("profile.settings.emailVerification.unverified")}
      expanded={expanded}
      onToggle={onToggle}
    >
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {t("profile.settings.emailVerification.hint", { email: user.email })}
      </p>
      {sent ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-xs text-muted-foreground">
            {t("profile.settings.emailVerification.sent")}
          </p>
          <CodeInput
            value={code}
            onChange={setCode}
            onComplete={submit}
            disabled={verify.isPending}
            {...(error ? { error } : {})}
          />
          <button
            type="button"
            onClick={sendCode}
            disabled={resend.isPending}
            className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-primary disabled:opacity-60"
          >
            {t("auth.verifyEmail.resend")}
          </button>
        </div>
      ) : (
        <Button onClick={sendCode} disabled={resend.isPending} className="self-start">
          {resend.isPending && <Spinner data-icon="inline-start" />}
          {t("profile.settings.emailVerification.send")}
        </Button>
      )}
    </SettingsRow>
  );
}

/** Words a confirmation phrase is drawn from — proper nouns, not sentences,
 * so they read the same regardless of site language rather than needing
 * their own i18n. Regenerated (word + 4 random digits) every time the
 * dialog opens, so it can't be muscle-memorised across attempts. */
const CONFIRM_WORDS = [
  "shadow",
  "sakura",
  "katana",
  "kitsune",
  "ronin",
  "yokai",
  "senpai",
  "tanuki",
];

function generateConfirmPhrase(): string {
  const word = CONFIRM_WORDS[Math.floor(Math.random() * CONFIRM_WORDS.length)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${digits}`;
}

/**
 * The very last thing in Settings, deliberately: a destructive action with
 * two independent guards — a freshly-generated phrase that has to be typed
 * exactly (so a reflexive double-click can't trigger it) and the actual
 * account password (so a merely-valid bearer token isn't enough on its
 * own). A Telegram-only account has no password to ask for — see
 * `isTelegramLinked` — so that field is skipped for it entirely rather than
 * shown disabled or asking for something that doesn't exist.
 */
function DeleteAccountSection({ profile }: { profile: MyProfile }) {
  const t = useT();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const deleteAccount = useDeleteAccount();

  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();

  const isTelegram = user?.isTelegramLinked ?? false;
  const phraseOk = typed.length > 0 && typed === phrase;
  const canSubmit = phraseOk && (isTelegram || password.length > 0);

  const openDialog = () => {
    setPhrase(generateConfirmPhrase());
    setTyped("");
    setPassword("");
    setError(undefined);
    setOpen(true);
  };

  const onConfirm = () => {
    setError(undefined);
    deleteAccount.mutate(
      { password },
      {
        onSuccess: () => {
          toast.success(t("profile.settings.dangerZone.success"));
          logout();
          navigate("/", { replace: true });
        },
        onError: (err) => {
          setError(
            err instanceof ApiRequestError && err.status === 401
              ? t("profile.settings.dangerZone.wrongPassword")
              : t("errors.genericTitle"),
          );
        },
      },
    );
  };

  const gif = useReactionGif("cry", open);

  return (
    <>
      {/* Deliberately not a card — a boxed "danger zone" with its own
          heading and border draws the eye exactly as much as every other
          setting on the page, which is backwards for the one thing here
          nobody should click by accident. Just a quiet link, easy to find
          if you're looking for it and easy to scroll past if you're not. */}
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground/70 transition-colors hover:text-destructive"
      >
        <Trash2Icon className="size-3.5" />
        {t("profile.settings.dangerZone.deleteAccount")}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!deleteAccount.isPending) setOpen(next);
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-md">
          {/* The one dialog on the site that's allowed to be a little
              theatrical — everywhere else, a confirm dialog is neutral by
              design; here, the whole point is making the visitor pause. */}
          <div className="relative flex flex-col items-center gap-2 border-b border-border/60 bg-gradient-to-b from-destructive/10 to-transparent px-6 pb-4 pt-6 text-center">
            <div className="size-28 overflow-hidden rounded-2xl bg-muted">
              {gif.data?.url && (
                <img src={gif.data.url} alt="" className="size-full object-cover" />
              )}
            </div>
            <DialogHeader className="items-center gap-1">
              <DialogTitle className="text-lg">
                {t("profile.settings.dangerZone.dialogTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("profile.settings.dangerZone.dialogBody", { name: profile.displayName })}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex flex-col gap-4 px-6 pb-6">
            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="delete-account-phrase" className="text-xs font-medium text-muted-foreground">
                {t("profile.settings.dangerZone.typePhrase")}
              </label>
              <code className="select-all rounded-md border border-border/60 bg-secondary/40 px-3 py-2 text-center font-mono text-sm tracking-wide">
                {phrase}
              </code>
              <TextInput
                id="delete-account-phrase"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={typed.length > 0 && !phraseOk ? true : undefined}
              />
              {typed.length > 0 && !phraseOk && (
                <p className="text-xs text-destructive">
                  {t("profile.settings.dangerZone.phraseMismatch")}
                </p>
              )}
            </div>

            {isTelegram ? (
              <p className="text-xs text-muted-foreground">
                {t("profile.settings.dangerZone.passwordHintTelegram")}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="delete-account-password" className="text-xs font-medium text-muted-foreground">
                  {t("profile.settings.dangerZone.password")}
                </label>
                <PasswordInput
                  id="delete-account-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            )}
          </div>

          <DialogFooter className="px-6 pb-6">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("profile.settings.dangerZone.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!canSubmit || deleteAccount.isPending}
              onClick={onConfirm}
            >
              {deleteAccount.isPending && <Spinner data-icon="inline-start" />}
              {t("profile.settings.dangerZone.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * A one-time birth date confirmation — the only thing that unlocks R+-rated
 * titles anywhere on the site. Hentai stays excluded no matter what's set
 * here; there is no version of this control that shows it. Locked once
 * saved (mirrors the username field above) — it's meant to be a real fact
 * about the account, not a toggle.
 */
/** Bare content for the age-verification row — only ever shown expanded
 * while unset (see the row's onToggle above: once verified, there's a
 * status to show but nothing left to do, so it collapses for good). */
function AgeVerificationContent({
  profile,
  update,
}: {
  profile: MyProfile;
  update: ReturnType<typeof useUpdateProfile>;
}) {
  const t = useT();
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? "");
  const maxDate = new Date().toISOString().slice(0, 10);

  return (
    <>
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {t("profile.settings.age.hint")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={birthDate}
          max={maxDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          size="sm"
          className="shrink-0"
          disabled={update.isPending || !birthDate}
          onClick={() =>
            update.mutate(
              { birthDate },
              {
                onSuccess: () => toast.success(t("profile.settings.age.saved")),
                onError: (e) =>
                  toast.error(e instanceof Error ? e.message : t("errors.genericTitle")),
              },
            )
          }
        >
          {t("profile.settings.save")}
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {t("profile.settings.age.neverHentai")}
      </p>
    </>
  );
}

/** Pick up to MAX_SHOWCASE_ACHIEVEMENTS earned achievements to pin under your name. */
function ShowcaseChips({
  profile,
  update,
  earned,
}: {
  profile: MyProfile;
  update: ReturnType<typeof useUpdateProfile>;
  earned: EarnedAchievement[];
}) {
  const t = useT();
  const selected = profile.showcaseAchievementIds;

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    update.mutate({ showcaseAchievementIds: next });
  };

  const pinnedInOrder = selected
    .map((id) => earned.find((a) => a.id === id))
    .filter((a): a is EarnedAchievement => a != null);

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs tabular-nums text-muted-foreground">
        {t("profile.settings.showcaseCount", {
          count: selected.length,
          max: MAX_SHOWCASE_ACHIEVEMENTS,
        })}
      </span>

      {/* Exactly the row a comment or the profile header actually renders —
          picking a badge below updates this immediately, so there's no
          guessing what "pinned" will look like next to your name until you
          go find a comment of yours to check. */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-border/60 bg-secondary/20 px-3 py-2 text-xs">
        <span className="shrink-0 text-muted-foreground/70">{t("common.preview")}:</span>
        <span className="font-medium">{profile.displayName}</span>
        <UserTitleBadge prefix={profile.titlePrefix} icon={profile.titleIcon} compact />
        {pinnedInOrder.length === 0 ? (
          <span className="text-muted-foreground/60">{t("profile.settings.showcaseEmpty")}</span>
        ) : (
          pinnedInOrder.map((a) => <AchievementBadge key={a.id} id={a.id} compact />)
        )}
      </div>

      <div className="flex flex-wrap gap-2.5">
        {earned.map((a) => {
          const isSelected = selected.includes(a.id);
          const atLimit = !isSelected && selected.length >= MAX_SHOWCASE_ACHIEVEMENTS;
          return (
            <div key={a.id} className="relative">
              <HoloAchievementBadge
                id={a.id}
                rarity={a.rarity}
                earned
                earnedAt={a.earnedAt}
                variant="circle"
                // A picker can show every earned badge at once — the full
                // tilt/foil-loop treatment on all of them simultaneously is
                // the exact "system load" this is meant to avoid.
                animated={false}
                onClick={atLimit ? undefined : () => toggle(a.id)}
                className={cn(atLimit && "opacity-40", !atLimit && "ring-2 ring-offset-2 ring-offset-card", isSelected ? "ring-primary" : "ring-transparent")}
              />
              {isSelected && (
                <span className="pointer-events-none absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <CheckIcon className="size-2.5" strokeWidth={3} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MAX_FAVOURITE_GENRES = 30;

/** How much of the full list is shown before "show all". Rendering every
 *  genre at once was the densest thing on the page by a wide margin. */
const GENRE_PREVIEW_COUNT = 18;

/**
 * The favourite-genre picker.
 *
 * Previously: every genre the site knows, rendered as one flat wrap of
 * identical pills, with no search, no count, and a save whose failure was
 * invisible. Two things were actually broken by that. The list was a wall
 * you had to read linearly to find anything in, and picking more than the
 * thirty the API accepts produced a rejected request that nothing on screen
 * acknowledged — the button simply returned to idle, so the feature read as
 * dead.
 *
 * Now the picks are lifted out above the list (so the list below is only
 * ever "what you could add"), the rest is searchable and folded to a
 * preview, the cap is enforced and stated, and a failed save says so.
 */
function GenrePreferencesSection() {
  const t = useT();
  const labels = useLabels();
  const { data: allGenres } = useGenres();
  const { data: status } = useGenrePreferencesStatus();
  const setPrefs = useSetGenrePreferences();
  const [draft, setDraft] = useState<number[] | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const saved = status?.genreIds ?? [];
  const active = draft ?? saved;
  const remainingEdits = status?.remainingEdits ?? 1; // optimistic default pre-load
  const locked = remainingEdits <= 0;
  const dirty = draft != null && !arraysMatchAsSets(draft, saved);

  const genres = allGenres ?? [];
  const term = query.trim().toLowerCase();
  const picked = genres.filter((g) => active.includes(g.id));
  const pickable = genres
    .filter((g) => !active.includes(g.id))
    .filter((g) => !term || labels.genreLabel(g.name).toLowerCase().includes(term));
  // A search is already a narrowing, so it overrides the fold — hiding
  // matches behind "show all" would defeat the point of having typed.
  const visible = showAll || term ? pickable : pickable.slice(0, GENRE_PREVIEW_COUNT);
  const atCap = active.length >= MAX_FAVOURITE_GENRES;

  const toggle = (id: number) => {
    if (locked) return;
    const base = draft ?? saved;
    if (!base.includes(id) && base.length >= MAX_FAVOURITE_GENRES) {
      toast.error(t("profile.settings.genresMax", { max: MAX_FAVOURITE_GENRES }));
      return;
    }
    setDraft(base.includes(id) ? base.filter((g) => g !== id) : [...base, id]);
  };

  const save = () => {
    if (!draft) return;
    setPrefs.mutate(draft, {
      onSuccess: () => {
        setDraft(null);
        toast.success(t("common.save"));
      },
      // Without this branch a rejected save did nothing observable at all.
      onError: (err) =>
        toast.error(
          err instanceof ApiRequestError
            ? err.message
            : t("profile.settings.genresSaveError"),
        ),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* What you've picked, first and on its own — the answer to "what did
          I choose?" should never require scanning the whole catalogue for
          highlighted pills. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            {t("profile.settings.genresPicked", {
              count: active.length,
              max: MAX_FAVOURITE_GENRES,
            })}
          </span>
          {!locked && picked.length > 0 && (
            <button
              type="button"
              onClick={() => setDraft([])}
              className="text-[11px] text-muted-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {t("profile.settings.genresClear")}
            </button>
          )}
        </div>
        {picked.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 px-3 py-2.5 text-[11px] text-muted-foreground">
            {t("profile.settings.genresNonePicked")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={locked}
                onClick={() => toggle(g.id)}
                aria-label={t("profile.settings.genresRemove", {
                  genre: labels.genreLabel(g.name),
                })}
                className={cn(
                  "group inline-flex items-center gap-1 rounded-lg border border-transparent bg-gradient-to-r from-primary via-primary/85 to-primary px-2.5 py-1 text-xs text-primary-foreground shadow-sm shadow-primary/25 transition-all duration-200",
                  locked ? "cursor-not-allowed opacity-60" : "hover:-translate-y-0.5",
                )}
              >
                {labels.genreLabel(g.name)}
                {!locked && <XIcon className="size-3 opacity-70 group-hover:opacity-100" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {!locked && (
        <>
          {/* Search instead of scanning. Same pill and focus bloom as every
              other field on the site. */}
          <div className="group relative flex items-center rounded-full border border-border/60 bg-background/60 transition-all duration-200 focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/15">
            <SearchIcon className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("profile.settings.genresSearch")}
              className="h-9 w-full rounded-full bg-transparent pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground/80"
            />
          </div>

          {visible.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">
              {t("search.noMatches")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {visible.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={false}
                  disabled={atCap}
                  onClick={() => toggle(g.id)}
                  className={cn(
                    "rounded-lg border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-all duration-200",
                    atCap
                      ? "cursor-not-allowed opacity-40"
                      : "hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {labels.genreLabel(g.name)}
                </button>
              ))}
            </div>
          )}

          {!term && pickable.length > GENRE_PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="self-start text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
            >
              {showAll
                ? t("common.showLess")
                : t("profile.settings.genresShowAll", {
                    count: pickable.length - GENRE_PREVIEW_COUNT,
                  })}
            </button>
          )}
        </>
      )}

      {locked ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/80">
          {t("profile.settings.genresLocked")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button size="sm" disabled={!dirty || setPrefs.isPending} onClick={save}>
            {setPrefs.isPending && <Spinner data-icon="inline-start" />}
            {t("profile.settings.save")}
          </Button>
          <span className="text-[11px] text-muted-foreground/80">
            {t("profile.settings.genresRemaining", { count: remainingEdits })}
          </span>
        </div>
      )}
    </div>
  );
}

function arraysMatchAsSets(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((v) => set.has(v));
}


function ProfileSkeleton() {
  return (
    <ProfileShell>
      {/* Shapes match what actually loads — rounded to the same radius as
          the real hero and stat cards, so the page does not visibly change
          geometry the moment data arrives. */}
      {/* Hero: banner, then the identity row riding up over it, then the
          rank bar — the same three bands the real header has, at the same
          heights, so nothing shifts when the data lands. */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
        <Skeleton className="h-40 w-full rounded-none sm:h-56" />
        <div className="-mt-14 flex flex-col gap-4 px-4 pb-4 sm:-mt-16 sm:px-6 sm:pb-6">
          <div className="flex flex-wrap items-end gap-4">
            <Skeleton className="size-24 shrink-0 rounded-full sm:size-28" />
            <div className="flex flex-1 basis-60 flex-col gap-2 pb-1">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-9 w-44 shrink-0 rounded-full" />
          </div>
          <Skeleton className="h-8 w-full rounded-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[4.25rem] rounded-none" />
        ))}
      </div>

      <Skeleton className="h-14 rounded-2xl" />

      <div className="gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <div className="mt-4 flex flex-col gap-4 lg:mt-0">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    </ProfileShell>
  );
}
