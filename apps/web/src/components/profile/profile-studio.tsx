import type { EarnedAchievement, MyProfile } from "@animeshadow/shared";
import { MAX_SHOWCASE_ACHIEVEMENTS } from "@animeshadow/shared";
import {
  BellRingIcon,
  CheckIcon,
  DicesIcon,
  ExternalLinkIcon,
  HeartIcon,
  ImageIcon,
  ImageOffIcon,
  LinkIcon,
  LockIcon,
  PaletteIcon,
  PanelBottomIcon,
  PinIcon,
  TrophyIcon,
  UploadIcon,
  UserCogIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { HoloAchievementBadge } from "@/components/holo-achievement-badge";
import { CosmeticsPicker } from "@/components/profile/cosmetics-picker";
import { AccentSection, PortabilitySection, PrivacySection, SettingsSearchProvider } from "@/components/profile/profile-settings-extras";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/i18n";
import { FEATURES } from "@/lib/features";
import { imageSrc } from "@/lib/format";
import { useSetUsername, useUpdateProfile } from "@/lib/query";
import { cn } from "@/lib/utils";
import { LevelBadge, LevelBar } from "./level-visuals";
import { NickTagEditor } from "./nick-tag-editor";
import { NotifySettingsSection } from "./notify-settings";
import { levelOf } from "./profile-level";
import { useProfileMedia } from "./use-profile-media";
import { NavigationSettings } from "./navigation-settings";

export type StudioTab = "profile" | "look" | "showcase" | "taste" | "privacy" | "notify" | "list" | "account" | "navigation";

const SECTIONS: Array<{ id: StudioTab; icon: typeof PaletteIcon; title: string; hint: string }> = [
  { id: "profile", icon: UserRoundIcon, title: "Профиль", hint: "Аватар, обложка, ник, описание, статус" },
  { id: "look", icon: PaletteIcon, title: "Оформление", hint: "Уровень, рамки и приписки" },
  { id: "showcase", icon: TrophyIcon, title: "Витрина", hint: "Достижения под вашим именем" },
  { id: "taste", icon: HeartIcon, title: "Вкусы", hint: "Любимые жанры для рекомендаций" },
  { id: "privacy", icon: LockIcon, title: "Приватность", hint: "Кто что видит в профиле" },
  { id: "notify", icon: BellRingIcon, title: "Telegram и уведомления", hint: "Привязка аккаунта и новые серии" },
  { id: "navigation", icon: PanelBottomIcon, title: "Нижнее меню", hint: "Свои кнопки и интерактивный предпросмотр" },
  { id: "list", icon: UploadIcon, title: "Список", hint: "Импорт из MAL и Shikimori, экспорт" },
  { id: "account", icon: UserCogIcon, title: "Аккаунт", hint: "Почта, возраст, удаление" },
];

/**
 * Everything about one's own profile, in one window: a column on the left
 * with a live card of the profile (avatar, name, level) and the sections,
 * each with what is in it; the section on the right with its own title.
 * On a phone it fills the screen, the sections a row of pills on top.
 *
 * Every change applies the moment it is made, except the description,
 * which has its own save.
 */
export function ProfileStudio({
  profile,
  open,
  onOpenChange,
  account,
  taste,
  initialTab = "profile",
}: {
  profile: MyProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Email, age, theme, deleting — the account form, which lives with the profile page. */
  account: React.ReactNode;
  /** The favourite-genres picker. */
  taste: React.ReactNode;
  /** The section it opens on — a profile task opens it where its setting is. */
  initialTab?: StudioTab;
}) {
  const [tab, setTab] = useState<StudioTab>(initialTab);
  const sectionNav = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const rail = sectionNav.current;
      const active = rail?.querySelector<HTMLElement>('[aria-current="true"]');
      if (rail && active && rail.scrollWidth > rail.clientWidth) rail.scrollTo({ left: active.offsetLeft - rail.clientWidth / 2 + active.offsetWidth / 2 });
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, open]);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setTab(initialTab);
  }
  const level = useMemo(() => levelOf(profile), [profile]);
  const section = SECTIONS.find((s) => s.id === tab) ?? SECTIONS[0]!;
  const initial = (profile.displayName || "?").charAt(0).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // No ring on the first section the moment the window opens.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(90dvh,48rem)] sm:max-w-5xl sm:rounded-3xl sm:border"
      >
        <SettingsSearchProvider>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[17.5rem_minmax(0,1fr)] sm:grid-rows-1">
            {/* The column: the profile as it is now, and the sections. */}
            <aside className="flex min-h-0 flex-col gap-3 border-b border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3 sm:border-b-0 sm:border-r sm:p-4">
              <div className="relative isolate hidden overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] sm:block">
                {profile.bannerUrl ? (
                  <img src={imageSrc(profile.bannerUrl)} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-50" />
                ) : (
                  <span className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/30 to-transparent" />
                )}
                <span className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/70 to-transparent" />
                <div className="flex items-center gap-3 p-3 pt-8">
                  <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-card font-display text-xl ring-2 ring-white/10">
                    {profile.avatarUrl ? <img src={imageSrc(profile.avatarUrl)} alt="" className="size-full object-cover" /> : initial}
                  </span>
                  <div className="min-w-0">
                    <DialogTitle className="truncate text-base font-semibold">{profile.displayName}</DialogTitle>
                    <DialogDescription className="truncate text-xs text-muted-foreground">
                      {profile.username ? `@${profile.username}` : "ник не выбран"}
                    </DialogDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 border-t border-white/5 px-3 py-2.5">
                  <LevelBadge info={level} size={34} />
                  <LevelBar info={level} labels={false} className="flex-1" />
                </div>
              </div>
              <div className="flex items-center justify-between sm:hidden">
                <p className="font-display text-lg">Настройки профиля</p>
              </div>

              <nav ref={sectionNav} aria-label="Разделы настроек" className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {SECTIONS.map(({ id, icon: Icon, title, hint }) => {
                  const on = tab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTab(id)}
                      aria-current={on}
                      className={cn(
                        "group flex min-h-11 min-w-0 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left transition-[background-color,color] duration-200 sm:gap-2.5 sm:py-2.5",
                        on ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-medium leading-tight sm:text-sm">{title}</span>
                        <span className={cn("hidden truncate text-[11px] leading-tight sm:block", on ? "text-primary-foreground/75" : "text-muted-foreground/70")}>
                          {hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </nav>

              {profile.username && (
                <Link
                  to={`/profile/${profile.username}`}
                  onClick={() => onOpenChange(false)}
                  className="mt-auto hidden items-center justify-center gap-1.5 rounded-xl border border-[var(--accent-line-soft)] px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:flex"
                >
                  <ExternalLinkIcon className="size-3.5" />
                  Мой профиль глазами гостей
                </Link>
              )}
            </aside>

            {/* The section. */}
            <div className="flex min-h-0 min-w-0 flex-col">
              <header className="flex items-center gap-3 border-b border-[var(--accent-line-soft)] px-4 py-3 pr-12 sm:px-6 sm:py-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                  <section.icon className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-lg leading-tight">{section.title}</h2>
                  <p className="truncate text-xs text-muted-foreground">{section.hint}</p>
                </div>
              </header>
              <div key={tab} className="min-h-0 flex-1 animate-in overflow-y-auto overscroll-contain px-4 py-5 duration-300 fade-in-0 slide-in-from-right-2 sm:px-6">
                {tab === "profile" && <ProfileBasics profile={profile} />}
                {tab === "look" && (
                  <div className="flex flex-col gap-6">
                    <LevelPreview profile={profile} />
                    <CosmeticsPicker profile={profile} />
                    {FEATURES.profileCustomization && <AccentSection profile={profile} />}
                  </div>
                )}
                {tab === "showcase" && <ShowcaseEditor profile={profile} />}
                {tab === "taste" && taste}
                {tab === "privacy" && <PrivacySection profile={profile} />}
                {tab === "notify" && <NotifySettingsSection />}
                {tab === "navigation" && <NavigationSettings />}
                {tab === "list" && <PortabilitySection />}
                {tab === "account" && account}
              </div>
            </div>
          </div>
        </SettingsSearchProvider>
      </DialogContent>
    </Dialog>
  );
}

function Group({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const SMALL_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--accent-line-soft)] px-3 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:opacity-50";

const STATUSES: Array<{ value: MyProfile["onlineStatus"]; label: string; dot: string; hint: string }> = [
  { value: "ONLINE", label: "В сети", dot: "bg-emerald-400", hint: "Все видят, что вы здесь" },
  { value: "DND", label: "Не беспокоить", dot: "bg-amber-400", hint: "Видно, но лучше не отвлекать" },
  { value: "OFFLINE", label: "Невидимка", dot: "bg-muted-foreground", hint: "Никто не видит, что вы онлайн" },
];

/** Avatar, cover, nickname, description and presence — the profile's face. */
function ProfileBasics({ profile }: { profile: MyProfile }) {
  const t = useT();
  const media = useProfileMedia(profile);
  const update = useUpdateProfile();
  const setUsername = useSetUsername();
  const [bio, setBio] = useState(profile.bio ?? "");
  const [uname, setUname] = useState("");
  const bioDirty = bio !== (profile.bio ?? "");
  const link = profile.username ? `${window.location.origin}/profile/${profile.username}` : null;
  const initial = (profile.displayName || "?").charAt(0).toUpperCase();

  return (
    <div className="flex flex-col gap-7">
      <div className="grid gap-4 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <Group title="Аватар" hint="Квадратная картинка, обрежется кругом">
          <div className="flex items-center gap-3">
            <span className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-card font-display text-2xl ring-2 ring-[var(--accent-line-soft)]">
              {profile.avatarUrl ? <img src={imageSrc(profile.avatarUrl)} alt="" className="size-full object-cover" /> : initial}
              {media.avatarBusy && (
                <span className="absolute inset-0 grid place-items-center bg-black/50">
                  <Spinner />
                </span>
              )}
            </span>
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={media.pickAvatar} disabled={media.avatarBusy} className={SMALL_BUTTON}>
                <UploadIcon className="size-3.5" />
                Загрузить
              </button>
              <button type="button" onClick={media.randomAvatar} disabled={media.avatarBusy} className={SMALL_BUTTON}>
                <DicesIcon className="size-3.5" />
                Случайный
              </button>
            </div>
          </div>
        </Group>
        <Group title="Обложка" hint="Широкая картинка за шапкой, GIF тоже можно">
          <div className="relative aspect-[3/1] overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-gradient-to-br from-primary/25 to-transparent">
            {profile.bannerUrl ? (
              <img src={imageSrc(profile.bannerUrl)} alt="" className="size-full object-cover" />
            ) : (
              <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
                <ImageIcon className="size-6 opacity-50" />
              </span>
            )}
            {media.bannerBusy && (
              <span className="absolute inset-0 grid place-items-center bg-black/50">
                <Spinner />
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={media.pickBanner} disabled={media.bannerBusy} className={SMALL_BUTTON}>
              <UploadIcon className="size-3.5" />
              Загрузить
            </button>
            <button type="button" onClick={media.randomBanner} disabled={media.bannerBusy} className={SMALL_BUTTON}>
              <DicesIcon className="size-3.5" />
              Случайная
            </button>
            {media.hasBanner && (
              <button type="button" onClick={media.removeBanner} disabled={media.bannerBusy} className={SMALL_BUTTON}>
                <ImageOffIcon className="size-3.5" />
                Убрать
              </button>
            )}
          </div>
        </Group>
      </div>

      <Group title="Ник" hint={profile.username ? "Ник выбирается один раз — по нему строится ссылка на профиль." : "3–20 символов: латиница, цифры, «_». Выбирается один раз."}>
        {profile.username && link ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl bg-[var(--accent-surface-strong)] px-3 py-2 text-sm font-medium">@{profile.username}</span>
            <button
              type="button"
              className={SMALL_BUTTON}
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(link)
                  .then(() => toast.success("Ссылка на профиль скопирована"))
                  .catch(() => undefined)
              }
            >
              <LinkIcon className="size-3.5" />
              Скопировать ссылку
            </button>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (uname.length < 3) return;
              setUsername.mutate(uname, {
                onSuccess: () => toast.success(t("profile.settings.usernameSet")),
                onError: (error) => toast.error(error instanceof Error ? error.message : t("errors.genericTitle")),
              });
            }}
          >
            <span className="flex min-w-0 flex-1 items-center rounded-xl border border-[var(--accent-line-soft)] px-3 focus-within:border-primary/50">
              <span className="text-sm text-muted-foreground">@</span>
              <input
                value={uname}
                onChange={(e) => setUname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                maxLength={20}
                placeholder="ваш_ник"
                className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
              />
            </span>
            <button
              type="submit"
              disabled={uname.length < 3 || setUsername.isPending}
              className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Занять
            </button>
          </form>
        )}
      </Group>

      <Group title="О себе" hint="Пара строк под именем — их видят все гости профиля.">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={500}
          rows={4}
          placeholder="Что смотрите, что любите, чем живёте…"
          className="w-full resize-y rounded-2xl border border-[var(--accent-line-soft)] bg-transparent px-3.5 py-3 text-sm leading-relaxed outline-none transition-colors focus:border-primary/50"
        />
        <div className="flex items-center justify-between gap-2">
          <span className={cn("text-[11px] tabular-nums", bio.length > 450 ? "text-amber-400" : "text-muted-foreground")}>{bio.length} / 500</span>
          <div className="flex gap-2">
            {bioDirty && (
              <button type="button" onClick={() => setBio(profile.bio ?? "")} className={SMALL_BUTTON}>
                <XIcon className="size-3.5" />
                Отменить
              </button>
            )}
            <button
              type="button"
              disabled={!bioDirty || update.isPending}
              onClick={() => update.mutate({ bio: bio.trim() || null }, { onSuccess: () => toast.success("Описание сохранено") })}
              className="h-9 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              Сохранить
            </button>
          </div>
        </div>
      </Group>

      <NickTagEditor profile={profile} />

      <Group title="Статус" hint="Как вас видят другие прямо сейчас.">
        <div className="grid gap-2 sm:grid-cols-3">
          {STATUSES.map((s) => {
            const on = profile.onlineStatus === s.value;
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={on}
                onClick={() => !on && update.mutate({ onlineStatus: s.value })}
                className={cn(
                  "flex items-start gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-[border-color,background-color]",
                  on ? "border-primary/50 bg-primary/10" : "border-[var(--accent-line-soft)] hover:border-foreground/25",
                )}
              >
                <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", s.dot)} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">{s.hint}</span>
                </span>
                {on && <CheckIcon className="ml-auto size-4 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      </Group>
      {media.elements}
    </div>
  );
}

/** The level as it is, and what dresses it up. */
function LevelPreview({ profile }: { profile: MyProfile }) {
  const level = useMemo(() => levelOf(profile), [profile]);
  return (
    <Group title="Уровень" hint="Растёт сам — от просмотров, достижений и оформленного профиля. Чем выше звание, тем богаче значок.">
      <div className="flex items-center gap-4 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4">
        <span className="grid shrink-0 place-items-center p-2 pt-3">
          <LevelBadge info={level} size={64} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="mb-2 font-display text-lg" style={{ color: level.tier.colors[0] }}>
            {level.tier.name}
          </p>
          <LevelBar info={level} />
        </div>
      </div>
    </Group>
  );
}

/** The achievements under the name: tap to pin or unpin, three at most. */
function ShowcaseEditor({ profile }: { profile: MyProfile }) {
  const t = useT();
  const update = useUpdateProfile();
  const earned = profile.achievements.filter((a) => a.earned);
  const pinned = profile.showcaseAchievementIds;

  const toggle = (a: EarnedAchievement) => {
    const next = pinned.includes(a.id) ? pinned.filter((id) => id !== a.id) : [...pinned, a.id].slice(-MAX_SHOWCASE_ACHIEVEMENTS);
    update.mutate({ showcaseAchievementIds: next });
  };

  if (earned.length === 0) {
    return <p className="text-sm text-muted-foreground">Пока нечего выставить: первые достижения откроются за просмотр серий и подборки.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">
          На витрине <span className="font-semibold tabular-nums">{pinned.length}</span> из {MAX_SHOWCASE_ACHIEVEMENTS}
        </p>
        {pinned.length > 0 && (
          <button type="button" onClick={() => update.mutate({ showcaseAchievementIds: [] })} className={SMALL_BUTTON}>
            Очистить
          </button>
        )}
      </div>
      <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
        {earned.map((a) => {
          const at = pinned.indexOf(a.id);
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => toggle(a)}
                disabled={update.isPending}
                aria-pressed={at >= 0}
                className={cn(
                  "group relative flex w-full flex-col items-center gap-1.5 rounded-2xl border px-2 pb-2.5 pt-3 text-center transition-[border-color,background-color,transform] hover:-translate-y-0.5",
                  at >= 0 ? "border-primary/60 bg-primary/10" : "border-[var(--accent-line-soft)] hover:border-foreground/25",
                )}
              >
                <span className="achx-tilt">
                  <HoloAchievementBadge id={a.id} rarity={a.rarity} earned earnedAt={a.earnedAt} variant="circle" className="size-14" />
                </span>
                <span className="line-clamp-2 text-[11px] font-medium leading-tight">
                  {t(`achievements.items.${a.id}.title` as "achievements.items.critic.title")}
                </span>
                {at >= 0 ? (
                  <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {at + 1}
                  </span>
                ) : (
                  <PinIcon className="absolute right-2 top-2 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
