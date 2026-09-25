import type {
  FeedEvent,
  ProfileBlock,
  ProfileLayout,
  PublicProfile,
} from "@animeshadow/shared";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookmarkPlusIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  FlameIcon,
  HeartHandshakeIcon,
  HistoryIcon,
  type LucideIcon,
  PencilIcon,
  PlayIcon,
  RadioIcon,
  SparklesIcon,
  StarIcon,
  TrophyIcon,
  XIcon,
} from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MorphIcon } from "@/components/ui/morph-icon";
import { useAuth } from "@/hooks/use-auth";
import { useLocale, useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import {
  useLibrary,
  useTasteCompare,
  useUpdateProfile,
  useUserFeed,
  useUserWatching,
  useUserYear,
} from "@/lib/query";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------------ */

const BLOCK_ICON: Record<ProfileBlock, LucideIcon> = {
  showcase: HeartHandshakeIcon,
  watching: RadioIcon,
  year: CalendarDaysIcon,
  activity: HistoryIcon,
  compare: SparklesIcon,
};

function Block({
  block,
  action,
  children,
  className,
}: {
  block: ProfileBlock;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  const Icon = BLOCK_ICON[block];
  return (
    <section
      className={cn(
        "relative flex animate-in flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 backdrop-blur-sm fade-in-0 slide-in-from-bottom-2 duration-500 sm:p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 font-display text-base tracking-tight sm:text-lg">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary">
            <Icon className="size-4" />
          </span>
          {t(`profile.blocks.${block}` as "profile.blocks.showcase")}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SmallButton({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "btn-sheen inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all active:scale-95",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-primary/30 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-primary/25 bg-primary/5 px-3 py-6 text-center text-xs text-muted-foreground">
      {text}
    </p>
  );
}

function relative(iso: string, locale: string): string {
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 3600) return fmt.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return fmt.format(Math.round(diff / 3600), "hour");
  if (abs < 86_400 * 30) return fmt.format(Math.round(diff / 86_400), "day");
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

/* ------------------------------------------------------------------------ */
/* The arrangement                                                           */
/* ------------------------------------------------------------------------ */

/**
 * The profile's movable middle, in the order its owner chose. A block the
 * owner hid, or one the viewer may not see, simply isn't rendered — there
 * is no "this is private" placeholder taking up a slot. The owner gets a
 * "customise" switch that turns the same column into its own editor.
 */
export function ProfileBlocks({ profile, own }: { profile: PublicProfile; own: boolean }) {
  const { user, status } = useAuth();

  const visible = (block: ProfileBlock) => {
    if (profile.layout.hidden.includes(block)) return false;
    if (block === "watching") return !profile.hidden.watching;
    if (block === "year") return !profile.hidden.stats;
    if (block === "activity") return !profile.hidden.activity;
    if (block === "compare") return !own && status === "authenticated" && user?.id !== profile.id && !profile.hidden.list;
    if (block === "showcase") return own || profile.favorites.length > 0;
    return true;
  };

  return (
    <div className="flex flex-col gap-4">
      {profile.layout.order.filter(visible).map((block) => {
        switch (block) {
          case "showcase":
            return <ShowcaseBlock key={block} profile={profile} own={own} />;
          case "watching":
            return <WatchingBlock key={block} userId={profile.id} own={own} />;
          case "year":
            return <YearBlock key={block} userId={profile.id} />;
          case "activity":
            return <ActivityBlock key={block} userId={profile.id} />;
          case "compare":
            return <CompareBlock key={block} userId={profile.id} name={profile.displayName} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

/** Order and visibility of the blocks, and where the accent comes from. */
export function LayoutEditor({ layout, onClose }: { layout: ProfileLayout; onClose?: () => void }) {
  const t = useT();
  const update = useUpdateProfile();
  const [order, setOrder] = useState(layout.order);
  const [hidden, setHidden] = useState(new Set(layout.hidden));
  const [autoAccent, setAutoAccent] = useState(layout.autoAccent);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
  };

  const save = () =>
    update.mutate(
      { layout: { order, hidden: [...hidden], autoAccent } },
      {
        onSuccess: () => {
          toast.success(t("profile.blocks.saved"));
          onClose?.();
        },
      },
    );

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t("profile.blocks.editorHint")}</p>
      <ol className="flex flex-col gap-1.5">
        {order.map((block, i) => {
          const Icon = BLOCK_ICON[block];
          const off = hidden.has(block);
          return (
            <li
              key={block}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-all duration-300",
                off ? "border-primary/10 bg-card/30 opacity-55" : "border-primary/30 bg-card/60",
              )}
            >
              <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
                <Icon className="size-4" />
              </span>
              <span className="flex-1 text-sm font-medium">
                {t(`profile.blocks.${block}` as "profile.blocks.showcase")}
              </span>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={t("profile.blocks.up")}
                className="grid size-8 place-items-center rounded-lg border border-primary/25 text-muted-foreground transition-all hover:border-primary hover:text-primary active:scale-90 disabled:opacity-30"
              >
                <ArrowUpIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
                aria-label={t("profile.blocks.down")}
                className="grid size-8 place-items-center rounded-lg border border-primary/25 text-muted-foreground transition-all hover:border-primary hover:text-primary active:scale-90 disabled:opacity-30"
              >
                <ArrowDownIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = new Set(hidden);
                  if (off) next.delete(block);
                  else next.add(block);
                  setHidden(next);
                }}
                aria-pressed={!off}
                aria-label={off ? t("profile.blocks.show") : t("profile.blocks.hide")}
                className={cn(
                  "grid size-8 place-items-center rounded-lg border transition-all active:scale-90",
                  off ? "border-primary/20 text-muted-foreground" : "border-primary bg-primary text-primary-foreground",
                )}
              >
                <MorphIcon on={off} off={EyeIcon} onIcon={EyeOffIcon} className="size-4" />
              </button>
            </li>
          );
        })}
      </ol>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-primary/25 bg-card/50 px-3 py-2.5">
        <span className="flex flex-col">
          <span className="text-sm font-medium">{t("profile.blocks.autoAccent")}</span>
          <span className="text-[11px] text-muted-foreground">{t("profile.blocks.autoAccentHint")}</span>
        </span>
        <input
          type="checkbox"
          checked={autoAccent}
          onChange={(e) => setAutoAccent(e.target.checked)}
          className="size-5 accent-[var(--primary)]"
        />
      </label>
      <div className="flex justify-end gap-2">
        {onClose && <SmallButton icon={XIcon} label={t("common.cancel")} onClick={onClose} />}
        <SmallButton icon={CheckCircle2Icon} label={t("common.save")} onClick={save} active />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Showcase — "my five"                                                      */
/* ------------------------------------------------------------------------ */

function ShowcaseBlock({ profile, own }: { profile: PublicProfile; own: boolean }) {
  const t = useT();
  const labels = useLabels();
  const [picking, setPicking] = useState(false);

  return (
    <Block
      block="showcase"
      action={own ? <SmallButton icon={PencilIcon} label={t("common.edit")} onClick={() => setPicking(true)} /> : undefined}
    >
      {profile.favorites.length === 0 ? (
        <Empty text={t("profile.blocks.showcaseEmpty")} />
      ) : (
        <ol className="reveal-group grid grid-cols-3 gap-3 sm:grid-cols-5">
          {profile.favorites.map((anime, i) => (
            <li key={anime.id} className="reveal" style={{ "--i": i } as CSSProperties}>
              <Link to={animeHref(anime)} viewTransition className="group relative block">
                <span className="relative block aspect-[2/3] overflow-hidden rounded-xl border-2 border-primary/30 shadow-lg shadow-primary/10 transition-all duration-500 group-hover:-translate-y-1 group-hover:border-primary">
                  {anime.imageUrl && (
                    <img
                      src={imageSrc(anime.imageLargeUrl ?? anime.imageUrl)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <span className="absolute left-2 top-1 font-display text-4xl text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
                    {i + 1}
                  </span>
                </span>
                <span className="mt-1.5 line-clamp-2 block text-xs font-medium leading-snug transition-colors group-hover:text-primary">
                  {labels.title(anime)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {own && <ShowcasePicker open={picking} onOpenChange={setPicking} current={profile.favorites.map((a) => a.id)} />}
    </Block>
  );
}

function ShowcasePicker({
  open,
  onOpenChange,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: number[];
}) {
  const t = useT();
  const labels = useLabels();
  const { data: entries } = useLibrary(undefined, open);
  const update = useUpdateProfile();
  const [picked, setPicked] = useState<number[]>(current);
  const [query, setQuery] = useState("");

  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(entries ?? [])]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .filter((e) => !q || labels.title(e.anime).toLowerCase().includes(q));
  }, [entries, query, labels]);

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 5 ? p : [...p, id]));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setPicked(current);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("profile.blocks.showcasePick")}</DialogTitle>
          <DialogDescription>{t("profile.blocks.showcasePickHint", { n: picked.length })}</DialogDescription>
        </DialogHeader>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("profile.blocks.search")}
          className="h-9 rounded-lg border border-primary/25 bg-card/60 px-3 text-sm outline-none focus:border-primary"
        />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {pool.map((entry) => {
            const n = picked.indexOf(entry.anime.id);
            return (
              <button
                key={entry.anime.id}
                type="button"
                onClick={() => toggle(entry.anime.id)}
                className={cn(
                  "group relative overflow-hidden rounded-lg border-2 text-left transition-all active:scale-95",
                  n >= 0 ? "border-primary shadow-md shadow-primary/30" : "border-transparent hover:border-primary/40",
                )}
              >
                <span className="block aspect-[2/3] bg-muted">
                  {entry.anime.imageUrl && (
                    <img src={imageSrc(entry.anime.imageUrl)} alt="" loading="lazy" className="size-full object-cover" />
                  )}
                </span>
                {n >= 0 && (
                  <span className="absolute right-1 top-1 grid size-6 animate-in place-items-center rounded-full bg-primary font-display text-xs text-primary-foreground zoom-in-50">
                    {n + 1}
                  </span>
                )}
                <span className="line-clamp-2 p-1 text-[10px] leading-tight">{labels.title(entry.anime)}</span>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2">
          <SmallButton icon={XIcon} label={t("common.clear")} onClick={() => setPicked([])} />
          <SmallButton
            icon={CheckCircle2Icon}
            label={t("common.save")}
            active
            onClick={() =>
              update.mutate(
                { favoriteAnimeIds: picked },
                {
                  onSuccess: () => {
                    toast.success(t("profile.blocks.saved"));
                    onOpenChange(false);
                  },
                },
              )
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
/* Now watching                                                              */
/* ------------------------------------------------------------------------ */

function WatchingBlock({ userId, own }: { userId: string; own: boolean }) {
  const t = useT();
  const labels = useLabels();
  const { locale } = useLocale();
  const { data, isPending } = useUserWatching(userId);

  return (
    <Block block="watching">
      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <span key={i} className="h-28 animate-pulse rounded-xl bg-primary/10" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Empty text={t("profile.blocks.watchingEmpty")} />
      ) : (
        <div className={cn("reveal-group grid gap-3", data.length > 1 && "sm:grid-cols-2")}>
          {data.map((w, i) => {
            const percent = Math.min(100, Math.round((w.positionSeconds / 1440) * 100));
            const art = w.anime.imageLargeUrl ?? w.anime.imageUrl;
            return (
              <Link
                key={w.anime.id}
                to={`${animeHref(w.anime)}#watch`}
                viewTransition
                style={{ "--i": i } as CSSProperties}
                className="reveal group relative flex gap-3 overflow-hidden rounded-xl border border-primary/25 bg-card/60 p-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary"
              >
                {art && (
                  <img
                    aria-hidden
                    src={imageSrc(art)}
                    alt=""
                    className="absolute inset-0 size-full scale-125 object-cover opacity-20 blur-xl"
                  />
                )}
                <span className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg">
                  {art && <img src={imageSrc(art)} alt="" loading="lazy" className="size-full object-cover" />}
                  <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                    <PlayIcon className="size-6 fill-white text-white" />
                  </span>
                </span>
                <span className="relative flex min-w-0 flex-1 flex-col gap-1">
                  <span className="line-clamp-2 text-sm font-medium leading-snug">{labels.title(w.anime)}</span>
                  <span className="text-xs text-primary">
                    {t("detail.episodeNumber", { n: w.episode })}
                    {w.completed && " ✓"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{relative(w.at, locale)}</span>
                  {!w.completed && (
                    <span className="mt-auto h-1 overflow-hidden rounded-full bg-primary/15">
                      <span className="block h-full bg-primary" style={{ width: `${percent}%` }} />
                    </span>
                  )}
                  {own && (
                    <span className="mt-1 text-[11px] font-semibold text-primary">{t("profile.blocks.continue")} →</span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </Block>
  );
}

/* ------------------------------------------------------------------------ */
/* The year                                                                  */
/* ------------------------------------------------------------------------ */

/** Colour steps for the heatmap, by episodes that day. */
function heat(n: number): string {
  if (n === 0) return "bg-primary/[0.07]";
  if (n === 1) return "bg-primary/30";
  if (n <= 3) return "bg-primary/55";
  if (n <= 6) return "bg-primary/80";
  return "bg-primary";
}

function YearBlock({ userId }: { userId: string }) {
  const t = useT();
  const labels = useLabels();
  const { locale } = useLocale();
  const now = new Date().getUTCFullYear();
  const [year, setYear] = useState(now);
  const { data, isPending } = useUserYear(userId, year);

  // Weeks as columns, Monday first — the shape everyone knows from GitHub.
  const weeks = useMemo(() => {
    if (!data) return [];
    const first = new Date(`${data.days[0]!.day}T00:00:00Z`);
    const offset = (first.getUTCDay() + 6) % 7;
    const cells: Array<(typeof data.days)[number] | null> = [...Array(offset).fill(null), ...data.days];
    const cols: Array<typeof cells> = [];
    for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
    return cols;
  }, [data]);

  const tiles = data
    ? [
        { icon: PlayIcon, value: String(data.episodes), label: t("profile.year.episodes") },
        { icon: HistoryIcon, value: String(data.hours), label: t("profile.year.hours") },
        { icon: CheckCircle2Icon, value: String(data.titlesCompleted), label: t("profile.year.titles") },
        { icon: CalendarDaysIcon, value: String(data.activeDays), label: t("profile.year.activeDays") },
        { icon: FlameIcon, value: String(data.longestStreak), label: t("profile.year.streak") },
        { icon: SparklesIcon, value: data.topGenre ? labels.genreLabel(data.topGenre) : "—", label: t("profile.year.genre") },
      ]
    : [];

  return (
    <Block
      block="year"
      action={
        <div className="flex gap-1">
          {[now, now - 1, now - 2].map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors",
                y === year ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-primary/15 hover:text-primary",
              )}
            >
              {y}
            </button>
          ))}
        </div>
      }
    >
      {isPending || !data ? (
        <span className="h-40 animate-pulse rounded-xl bg-primary/10" />
      ) : (
        <>
          <div className="reveal-group grid grid-cols-3 gap-2 sm:grid-cols-6">
            {tiles.map(({ icon: Icon, value, label }, i) => (
              <div
                key={label}
                style={{ "--i": i } as CSSProperties}
                className="reveal flex flex-col gap-0.5 rounded-xl border border-primary/20 bg-card/50 p-2.5"
              >
                <span className="flex items-center gap-1 truncate font-display text-base tabular-nums">
                  <Icon className="size-3.5 shrink-0 text-primary" />
                  {value}
                </span>
                <span className="truncate text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
          {/* Columns share the width, so the year always spans the block
              edge to edge instead of stopping two thirds of the way. */}
          <div className="overflow-x-auto pb-1 [scrollbar-width:thin]">
            <div
              className="grid min-w-[40rem] gap-[3px]"
              style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
            >
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day, di) =>
                    day ? (
                      <span
                        key={day.day}
                        title={`${new Date(`${day.day}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long" })}: ${t("profile.year.cell", { n: day.episodes })}`}
                        className={cn("aspect-square w-full rounded-[3px] transition-transform hover:scale-150", heat(day.episodes))}
                      />
                    ) : (
                      <span key={`x${di}`} className="aspect-square w-full" />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>
              {data.busiestDay && data.busiestDay.episodes > 0
                ? t("profile.year.busiest", {
                    day: new Date(`${data.busiestDay.day}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long" }),
                    n: data.busiestDay.episodes,
                  })
                : t("profile.year.quiet")}
            </span>
            <span className="flex items-center gap-1">
              {[0, 1, 2, 4, 7].map((n) => (
                <span key={n} className={cn("size-[10px] rounded-[3px]", heat(n))} />
              ))}
            </span>
          </div>
        </>
      )}
    </Block>
  );
}

/* ------------------------------------------------------------------------ */
/* Activity                                                                  */
/* ------------------------------------------------------------------------ */

const FEED_ICON: Record<FeedEvent["kind"], { icon: LucideIcon; tone: string }> = {
  completed: { icon: CheckCircle2Icon, tone: "text-emerald-500" },
  episode: { icon: PlayIcon, tone: "text-primary" },
  rated: { icon: StarIcon, tone: "text-amber-400" },
  added: { icon: BookmarkPlusIcon, tone: "text-sky-500" },
  achievement: { icon: TrophyIcon, tone: "text-amber-400" },
};

function ActivityBlock({ userId }: { userId: string }) {
  const t = useT();
  const labels = useLabels();
  const { locale } = useLocale();
  const { data, isPending } = useUserFeed(userId);
  const [kind, setKind] = useState<FeedEvent["kind"] | "all">("all");
  const [more, setMore] = useState(false);

  const items = (data ?? []).filter((e) => kind === "all" || e.kind === kind);
  const shown = more ? items : items.slice(0, 8);

  return (
    <Block block="activity">
      <div className="flex flex-wrap gap-1">
        {(["all", "episode", "completed", "rated", "added", "achievement"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors",
              k === kind ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20",
            )}
          >
            {t(`profile.feed.filter.${k}` as "profile.feed.filter.all")}
          </button>
        ))}
      </div>
      {isPending ? (
        <span className="h-40 animate-pulse rounded-xl bg-primary/10" />
      ) : shown.length === 0 ? (
        <Empty text={t("profile.overview.activityEmpty")} />
      ) : (
        <ol className="relative flex flex-col gap-1 before:absolute before:bottom-2 before:left-[1.35rem] before:top-2 before:w-px before:bg-primary/20">
          {shown.map((event, i) => {
            const { icon: Icon, tone } = FEED_ICON[event.kind];
            const title = event.anime
              ? labels.title(event.anime)
              : t(`achievements.items.${event.value}.title` as "achievements.items.critic.title");
            return (
              <li key={`${event.kind}-${event.at}-${i}`} className="relative flex animate-in items-center gap-3 rounded-xl p-1.5 fade-in-0 slide-in-from-left-2 duration-300" style={{ animationDelay: `${Math.min(i, 10) * 30}ms`, animationFillMode: "both" }}>
                <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-primary/25 bg-background">
                  <Icon className={cn("size-4", tone, event.kind === "rated" && "fill-current")} />
                </span>
                {event.anime?.imageUrl && (
                  <img src={imageSrc(event.anime.imageUrl)} alt="" loading="lazy" className="h-10 w-7 shrink-0 rounded object-cover" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[11px] text-muted-foreground">
                    {t(`profile.feed.${event.kind}` as "profile.feed.episode", { n: event.value ?? "" })}
                  </span>
                  {event.anime ? (
                    <Link to={animeHref(event.anime)} viewTransition className="truncate text-sm font-medium transition-colors hover:text-primary">
                      {title}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-medium">{title}</span>
                  )}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{relative(event.at, locale)}</span>
              </li>
            );
          })}
        </ol>
      )}
      {items.length > 8 && (
        <button type="button" onClick={() => setMore((m) => !m)} className="self-center text-xs font-semibold text-primary hover:underline">
          {more ? t("profile.feed.less") : t("profile.feed.more", { n: items.length - 8 })}
        </button>
      )}
    </Block>
  );
}

/* ------------------------------------------------------------------------ */
/* Taste comparison                                                          */
/* ------------------------------------------------------------------------ */

function CompareBlock({ userId, name }: { userId: string; name: string }) {
  const t = useT();
  const labels = useLabels();
  const { data, isPending } = useTasteCompare(userId);
  const circumference = 2 * Math.PI * 40;

  return (
    <Block block="compare">
      {isPending || !data ? (
        <span className="h-40 animate-pulse rounded-xl bg-primary/10" />
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex shrink-0 flex-col items-center gap-1">
            <svg viewBox="0 0 100 100" className="size-28 -rotate-90">
              <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="9" className="text-primary/15" />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="9"
                strokeLinecap="round"
                className="text-primary transition-[stroke-dashoffset] duration-1000 ease-out"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - data.percent / 100)}
              />
            </svg>
            <span className="-mt-[4.6rem] mb-10 font-display text-2xl tabular-nums">{data.percent}%</span>
            <span className="text-center text-[11px] text-muted-foreground">{t("profile.compare.with", { name })}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm">{t("profile.compare.shared", { n: data.sharedCount })}</p>
            {data.sharedGenres.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {data.sharedGenres.map((g) => (
                  <span key={g} className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                    {labels.genreLabel(g)}
                  </span>
                ))}
              </div>
            )}
            {data.common.length === 0 ? (
              <Empty text={t("profile.compare.none")} />
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {data.common.map(({ anime, mine, theirs }) => (
                  <Link key={anime.id} to={animeHref(anime)} viewTransition className="group">
                    <span className="relative block aspect-[2/3] overflow-hidden rounded-lg border border-primary/20 group-hover:border-primary">
                      {anime.imageUrl && <img src={imageSrc(anime.imageUrl)} alt="" loading="lazy" className="size-full object-cover" />}
                      <span className="absolute inset-x-0 bottom-0 flex justify-between bg-black/75 px-1 py-0.5 text-[10px] font-bold">
                        <span className="text-primary">{mine ?? "—"}</span>
                        <span className="text-amber-400">{theirs ?? "—"}</span>
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">{t("profile.compare.legend")}</p>
          </div>
        </div>
      )}
    </Block>
  );
}
