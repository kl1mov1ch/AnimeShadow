import type {
  EarnedAchievement,
  MyProfile,
  ProfileStats,
  ProgressDetail,
  PublicProfile,
  Rank,
} from "@animeshadow/shared";
import { type CSSProperties, useRef, useState } from "react";
import {
  AwardIcon,
  ClockIcon,
  CrownIcon,
  Loader2Icon,
  LockIcon,
  MedalIcon,
  PencilIcon,
  StarIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AchievementBadge } from "@/components/achievement-badge";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import {
  useAchievements,
  useGenrePreferences,
  useGenres,
  useMyProfile,
  useMyProgress,
  usePublicProfile,
  useSetGenrePreferences,
  useSetUsername,
  useUpdateProfile,
  useUploadAvatar,
} from "@/lib/query";
import { cn } from "@/lib/utils";

const ACCENTS = [
  "#ff4d6d", "#f97316", "#facc15", "#4ade80", "#22d3ee", "#60a5fa",
  "#a78bfa", "#f472b6", "#fb7185", "#34d399", "#818cf8", "#e879f9",
];

export function Component() {
  const t = useT();
  const { username } = useParams();
  const { status } = useAuth();

  if (username) return <PublicView username={username.replace(/^@/, "")} />;

  if (status === "loading") return <ProfileSkeleton />;
  if (status !== "authenticated") {
    return (
      <EmptyState
        title={t("profile.signedOut.title")}
        description={t("profile.signedOut.body")}
        action={
          <Button asChild>
            <Link to="/login">{t("profile.signedOut.cta")}</Link>
          </Button>
        }
      />
    );
  }
  return <OwnView />;
}

function PublicView({ username }: { username: string }) {
  const t = useT();
  const { data, isPending, isError } = usePublicProfile(username);
  if (isPending) return <ProfileSkeleton />;
  if (isError || !data)
    return <ErrorState title={t("errors.notFoundTitle")} message={t("errors.notFoundBody")} />;
  return (
    <div className="flex flex-col gap-8">
      <ProfileHeader profile={data} />
      <StatsStrip stats={data.stats} />
      <AchievementsGrid achievements={data.achievements} />
    </div>
  );
}

const PROFILE_TABS = ["progress", "settings", "achievements"] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

function OwnView() {
  const t = useT();
  const { data: profile, isPending } = useMyProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: ProfileTab = PROFILE_TABS.includes(requested as ProfileTab)
    ? (requested as ProfileTab)
    : "progress";

  if (isPending || !profile) return <ProfileSkeleton />;

  return (
    <div className="flex flex-col gap-8">
      <ProfileHeader profile={profile} />
      <Tabs
        value={tab}
        onValueChange={(v) =>
          setSearchParams(v === "progress" ? {} : { tab: v }, { replace: true })
        }
      >
        <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsTrigger value="progress">{t("profile.tabs.progress")}</TabsTrigger>
          <TabsTrigger value="settings">{t("profile.tabs.settings")}</TabsTrigger>
          <TabsTrigger value="achievements">{t("profile.tabs.achievements")}</TabsTrigger>
        </TabsList>
        <TabsContent value="progress" className="pt-6">
          <ProgressTab stats={profile.stats} />
        </TabsContent>
        <TabsContent value="settings" className="pt-6">
          <SettingsTab profile={profile} />
        </TabsContent>
        <TabsContent value="achievements" className="pt-6">
          <AchievementsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- header ---------------- */

const RANK_RING: Record<Rank, string> = {
  NOVICE: "ring-muted-foreground/40",
  ADVANCED: "ring-emerald-500/70",
  EXPERT: "ring-sky-500/70",
  LEGEND: "ring-amber-400/80",
};

function ProfileHeader({ profile }: { profile: PublicProfile }) {
  const t = useT();
  const initial = (profile.displayName || "?").charAt(0).toUpperCase();
  const memberSince = new Date(profile.memberSince).toLocaleDateString("ru", {
    month: "long",
    year: "numeric",
  });

  return (
    <header className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <div
        className={cn(
          "flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-2xl font-display ring-2 ring-offset-2 ring-offset-background",
          RANK_RING[profile.rank],
        )}
      >
        {profile.avatarUrl ? (
          <img src={imageSrc(profile.avatarUrl)} alt="" className="size-full object-cover" />
        ) : (
          initial
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl">{profile.displayName}</h1>
          <AchievementBadge id={profile.showcaseAchievementId} />
          {profile.isPro && (
            <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
              PRO
            </span>
          )}
          <span className="rounded-md border border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {t(`profile.rank.${profile.rank.toLowerCase()}` as "profile.rank.novice")}
          </span>
          {profile.stats.hoursWatched > 0 && (
            <span className="flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              <ClockIcon className="size-3" />
              {t("profile.summary.hoursShort", {
                hours: Math.round(profile.stats.hoursWatched * 10) / 10,
              })}
            </span>
          )}
        </div>
        {profile.username && (
          <p className="text-sm text-muted-foreground">
            {t("profile.handle", { username: profile.username })}
          </p>
        )}
        {profile.bio && <p className="max-w-prose text-sm text-foreground/90">{profile.bio}</p>}
        <p className="text-xs text-muted-foreground">
          {t("profile.memberSince", { date: memberSince })}
        </p>
      </div>
    </header>
  );
}

/* ---------------- stats ---------------- */

type TFn = (k: string, p?: Record<string, string | number>) => string;

function fmtDuration(t: TFn, seconds: number) {
  const total = Math.round(seconds);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  return d > 0
    ? t("profile.summary.durationDHM", { d, h, m })
    : t("profile.summary.durationHM", { h, m });
}

function StatsStrip({ stats }: { stats: ProfileStats }) {
  const t = useT();
  const day = stats.mostProductiveDay
    ? new Date(stats.mostProductiveDay).toLocaleDateString("ru", {
        day: "numeric",
        month: "short",
      })
    : "—";
  const cards: Array<[string, string]> = [
    [t("profile.summary.totalEpisodes"), String(stats.episodesWatched)],
    [t("profile.summary.totalTime"), fmtDuration(t, stats.hoursWatched * 3600)],
    [t("profile.summary.mostProductiveDay"), day],
    [
      t("profile.summary.avgPerSession"),
      stats.avgSessionMinutes != null ? `${stats.avgSessionMinutes} мин` : "—",
    ],
  ];
  return (
    <div className="reveal-group grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(([label, value], i) => (
        <div
          key={label}
          className="reveal flex flex-col gap-1 rounded-xl border border-border/60 bg-card/40 p-4"
          style={{ "--i": i } as CSSProperties}
        >
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="font-display text-xl tabular-nums">{value}</span>
        </div>
      ))}
      {stats.topGenres.length > 0 && (
        <div className="col-span-2 flex flex-wrap items-center gap-1.5 sm:col-span-4">
          {stats.topGenres.map((g) => (
            <Link
              key={g.name}
              to={`/browse?q=${encodeURIComponent(g.name)}`}
              className="rounded-md border border-border/60 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {g.name} · {g.count}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- progress tab ---------------- */

function mmss(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function ProgressTab({ stats }: { stats: ProfileStats }) {
  const t = useT();
  const { data, isPending } = useMyProgress();

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {(data ?? []).map((row) => (
          <ProgressRow key={row.animeId} row={row} />
        ))}
        {(data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">{t("library.nothingTracked")}</p>
        )}
      </div>
      <StatsStrip stats={stats} />
    </div>
  );
}

function ProgressRow({ row }: { row: ProgressDetail }) {
  const t = useT();
  const total = row.episodesTotal ?? 0;
  const percent = total > 0 ? Math.round((row.episode / total) * 100) : 0;
  const remaining =
    row.durationSeconds != null
      ? Math.max(0, row.durationSeconds - row.positionSeconds)
      : null;

  return (
    <div className="flex gap-3 rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {row.imageUrl ? (
          <img
            src={imageSrc(row.imageUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <PosterFallback title={row.title} seed={row.animeId} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Link
          to={`/anime/${row.slug}`}
          className="truncate font-medium hover:text-primary"
        >
          {row.title}
        </Link>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("profile.progressCard.episodesOfTotal", {
            done: row.episode,
            total: total || "?",
            percent,
          })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("profile.progressCard.totalTime", {
            time: fmtDuration(t, row.totalSecondsOnTitle),
          })}
        </p>
        {row.positionSeconds > 0 && !row.completed && (
          <p className="text-xs text-muted-foreground">
            {t("profile.progressCard.stoppedAt", {
              time: mmss(row.positionSeconds),
              ep: row.episode,
            })}
            {remaining != null && (
              <>
                {" · "}
                {t("profile.progressCard.untilEnd", { time: mmss(remaining) })}
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------- settings tab ---------------- */

function SettingsTab({ profile }: { profile: MyProfile }) {
  const t = useT();
  const { setTheme, theme } = useTheme();
  const { updateUser } = useAuth();
  const update = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const setUsername = useSetUsername();
  const fileRef = useRef<HTMLInputElement>(null);

  const [bio, setBio] = useState(profile.bio ?? "");
  const [statusValue, setStatusValue] = useState(profile.onlineStatus);
  const [accent, setAccent] = useState(profile.accentColor ?? "");
  const [uname, setUname] = useState(profile.username ?? "");

  const onFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Файл больше 5 МБ");
      return;
    }
    const dataUrl = await cropToSquareDataUrl(file);
    uploadAvatar.mutate(dataUrl, {
      onSuccess: (res) => {
        toast.success(t("common.save"));
        // The header's avatar comes from the lightweight auth session, not
        // the profile query — patch it directly so it updates immediately.
        updateUser({ avatarUrl: res.avatarUrl });
      },
    });
  };

  const applyAccent = (hex: string) => {
    setAccent(hex);
    try {
      if (hex) document.documentElement.style.setProperty("--primary", hex);
      else document.documentElement.style.removeProperty("--primary");
      localStorage.setItem("animeshadow.accent", hex);
    } catch {
      /* ignore */
    }
    update.mutate({ accentColor: hex || null });
  };

  return (
    <div className="flex max-w-xl flex-col gap-8">
      {/* username */}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg">{t("profile.settings.username")}</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">@</span>
          <input
            value={uname}
            onChange={(e) =>
              setUname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
            }
            maxLength={20}
            disabled={Boolean(profile.username)}
            placeholder={t("profile.settings.usernamePlaceholder")}
            className="flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          {profile.username ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(
                    `${window.location.origin}/profile/@${profile.username}`,
                  )
                  .then(() => toast.success(t("seo.linkCopied")))
                  .catch(() => undefined);
              }}
            >
              {t("profile.settings.copyProfileLink")}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={setUsername.isPending || uname.length < 3}
              onClick={() =>
                setUsername.mutate(uname, {
                  onSuccess: () => toast.success(t("profile.settings.usernameSet")),
                  onError: (e) =>
                    toast.error(
                      e instanceof Error ? e.message : t("errors.genericTitle"),
                    ),
                })
              }
            >
              {t("profile.settings.save")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("profile.settings.usernameHint")}
        </p>
      </section>

      {/* avatar */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg">{t("profile.settings.avatar")}</h2>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploadAvatar.isPending}
          aria-label={t("profile.settings.avatarUpload")}
          className="group relative size-20 shrink-0 self-start overflow-hidden rounded-full bg-muted disabled:opacity-60"
        >
          {profile.avatarUrl ? (
            <img src={imageSrc(profile.avatarUrl)} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center font-display text-2xl">
              {profile.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Pencil overlay — always visible on touch, fades in on hover for mouse users. */}
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/60 py-1.5 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
            {uploadAvatar.isPending ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <PencilIcon className="size-3.5" />
            )}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </section>

      {/* bio */}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg">{t("profile.settings.bio")}</h2>
        <textarea
          value={bio}
          maxLength={500}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="w-full resize-y rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="🔥 …"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {bio.length}/500 · {t("profile.settings.bioHint")}
          </span>
          <Button
            size="sm"
            disabled={update.isPending || bio === (profile.bio ?? "")}
            onClick={() => update.mutate({ bio: bio || null })}
          >
            {t("profile.settings.save")}
          </Button>
        </div>
      </section>

      {/* status + theme */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-lg">{t("profile.settings.status")}</h2>
          <Select
            value={statusValue}
            onValueChange={(v) => {
              setStatusValue(v as MyProfile["onlineStatus"]);
              update.mutate({ onlineStatus: v as MyProfile["onlineStatus"] });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ONLINE">{t("profile.presence.online")}</SelectItem>
              <SelectItem value="OFFLINE">{t("profile.presence.offline")}</SelectItem>
              <SelectItem value="DND">{t("profile.presence.dnd")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-lg">{t("profile.settings.theme")}</h2>
          <Select value={theme ?? "system"} onValueChange={setTheme}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t("profile.settings.themeLight")}</SelectItem>
              <SelectItem value="dark">{t("profile.settings.themeDark")}</SelectItem>
              <SelectItem value="system">{t("profile.settings.themeAuto")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* accent */}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg">{t("profile.settings.accentColor")}</h2>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => applyAccent(hex)}
              aria-label={hex}
              className={cn(
                "size-8 rounded-full ring-offset-2 ring-offset-background transition",
                accent === hex ? "ring-2 ring-foreground" : "hover:scale-110",
              )}
              style={{ backgroundColor: hex }}
            />
          ))}
          {accent && (
            <button
              type="button"
              onClick={() => applyAccent("")}
              className="rounded-md border border-border/60 px-2 text-xs text-muted-foreground"
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
      </section>

      <ShowcaseSection profile={profile} update={update} />

      <GenrePreferencesSection />
    </div>
  );
}

/** Pick one earned achievement to display as a badge next to your name. */
function ShowcaseSection({
  profile,
  update,
}: {
  profile: MyProfile;
  update: ReturnType<typeof useUpdateProfile>;
}) {
  const t = useT();
  const { data: achievements } = useAchievements();
  const earned = (achievements ?? []).filter((a) => a.earned);

  if (earned.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg">{t("profile.settings.showcase")}</h2>
      <p className="text-xs text-muted-foreground">
        {t("profile.settings.showcaseHint")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => update.mutate({ showcaseAchievementId: null })}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs transition-colors",
            profile.showcaseAchievementId == null
              ? "border-primary/50 bg-primary/15 text-primary"
              : "border-border/60 text-muted-foreground hover:text-foreground",
          )}
        >
          {t("common.none")}
        </button>
        {earned.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => update.mutate({ showcaseAchievementId: a.id })}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              profile.showcaseAchievementId === a.id
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`achievements.items.${a.id}.title` as "achievements.items.critic.title")}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Favourite-genre picker — feeds the home rail and every title's "similar to". */
function GenrePreferencesSection() {
  const t = useT();
  const labels = useLabels();
  const { data: allGenres } = useGenres();
  const { data: selected } = useGenrePreferences();
  const setPrefs = useSetGenrePreferences();
  const [pending, setPending] = useState<number[] | null>(null);

  const active = pending ?? selected ?? [];

  const toggle = (id: number) => {
    const next = active.includes(id)
      ? active.filter((g) => g !== id)
      : [...active, id];
    setPending(next);
    setPrefs.mutate(next, {
      onSettled: () => setPending(null),
    });
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg">{t("profile.settings.genres")}</h2>
      <p className="text-xs text-muted-foreground">
        {t("profile.settings.genresHint")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {(allGenres ?? []).map((g) => {
          const on = active.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(g.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                on
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {labels.genreLabel(g.name)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Center-crop a picked image to a 512px square PNG data URL — no crop lib. */
function cropToSquareDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no ctx"));
        ctx.drawImage(
          img,
          (img.width - size) / 2,
          (img.height - size) / 2,
          size,
          size,
          0,
          0,
          512,
          512,
        );
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------- achievements ---------------- */

const RARITY_RING: Record<string, string> = {
  common: "",
  rare: "ring-1 ring-sky-500/40",
  epic: "ring-1 ring-violet-500/50 shadow-[0_0_20px_-6px] shadow-violet-500/40",
  legendary: "ring-1 ring-amber-400/60 shadow-[0_0_24px_-6px] shadow-amber-400/50",
};

const RARITY_ICON: Record<string, typeof AwardIcon> = {
  common: AwardIcon,
  rare: MedalIcon,
  epic: StarIcon,
  legendary: CrownIcon,
};

/** Medallion face per rarity — a real gradient disc rather than a flat glyph chip. */
const RARITY_MEDAL: Record<string, string> = {
  common:
    "bg-[radial-gradient(circle_at_30%_25%,oklch(0.78_0.02_250),oklch(0.55_0.02_250))] text-white/90",
  rare: "bg-[radial-gradient(circle_at_30%_25%,oklch(0.82_0.13_230),oklch(0.52_0.16_245))] text-white",
  epic: "bg-[radial-gradient(circle_at_30%_25%,oklch(0.80_0.16_305),oklch(0.48_0.20_295))] text-white",
  legendary:
    "bg-[radial-gradient(circle_at_30%_25%,oklch(0.90_0.15_95),oklch(0.62_0.17_65))] text-black/80",
};

function AchievementsTab() {
  const { data } = useAchievements();
  return <AchievementsGrid achievements={data ?? []} />;
}

type AchFilter = "all" | "earned" | "progress";

function AchievementsGrid({ achievements }: { achievements: EarnedAchievement[] }) {
  const t = useT();
  const [filter, setFilter] = useState<AchFilter>("all");

  const order = { legendary: 0, epic: 1, rare: 2, common: 3 };
  const sorted = [...achievements].sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    return order[a.rarity] - order[b.rarity];
  });
  const earned = achievements.filter((a) => a.earned).length;
  const total = achievements.length || 1;
  const pct = Math.round((earned / total) * 100);

  const shown = sorted.filter((a) =>
    filter === "all"
      ? true
      : filter === "earned"
        ? a.earned
        : !a.earned && a.progress != null,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg">{t("achievements.heading")}</h2>
          <span className="text-sm tabular-nums text-muted-foreground">
            {t("achievements.earnedOfTotal", { earned, total: achievements.length })}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex gap-1.5">
        {(["all", "earned", "progress"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              filter === f
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {t(
              f === "all"
                ? "achievements.filterAll"
                : f === "earned"
                  ? "achievements.filterEarned"
                  : "achievements.filterInProgress",
            )}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("achievements.noneInFilter")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((a) => (
            <AchievementCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AchievementCard({ a }: { a: EarnedAchievement }) {
  const t = useT();
  const labels = useLabels();
  const Icon = a.earned ? (RARITY_ICON[a.rarity] ?? AwardIcon) : LockIcon;
  const ratio = a.progress
    ? Math.min(1, a.progress.current / a.progress.target)
    : 0;

  return (
    <div
      className={cn(
        "group relative flex flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-card/40 p-3 text-center transition-transform duration-200 hover:-translate-y-0.5",
        a.earned ? RARITY_RING[a.rarity] : "opacity-70",
      )}
    >
      <span
        className={cn(
          "relative flex size-12 items-center justify-center rounded-full ring-1 transition-transform duration-200 group-hover:scale-105",
          a.earned
            ? cn(RARITY_MEDAL[a.rarity], "ring-white/25 shadow-md")
            : "bg-secondary text-muted-foreground/70 ring-border/60",
        )}
      >
        {/* glossy highlight so the disc reads as a medal, not a flat circle */}
        {a.earned && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-gradient-to-b from-white/35 via-transparent to-black/15"
          />
        )}
        <Icon className="relative size-5.5" />
      </span>
      <span className="text-sm font-medium leading-tight">
        {t(`achievements.items.${a.id}.title` as "achievements.items.critic.title")}
      </span>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
        {t(`achievements.rarity.${a.rarity}` as "achievements.rarity.common")}
      </span>
      <span className="text-[11px] leading-tight text-muted-foreground">
        {t(`achievements.items.${a.id}.desc` as "achievements.items.critic.desc")}
      </span>

      {a.earned ? (
        a.earnedAt && (
          <span className="mt-0.5 text-[11px] text-primary/80">
            {t("achievements.earnedOn", {
              date: labels.formatDate(a.earnedAt) ?? "",
            })}
          </span>
        )
      ) : a.progress ? (
        <div className="mt-1 flex w-full flex-col gap-1">
          <div className="h-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {a.progress.current}/{a.progress.target}
          </span>
        </div>
      ) : (
        <span className="mt-0.5 text-[11px] text-muted-foreground/70">
          {a.manual ? t("achievements.manualNote") : t("achievements.locked")}
        </span>
      )}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-4">
        <Skeleton className="size-20 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
