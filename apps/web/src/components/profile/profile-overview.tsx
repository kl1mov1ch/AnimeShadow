import type { EarnedAchievement, LibraryEntry, MyProfile } from "@animeshadow/shared";
import {
  BookmarkPlusIcon,
  CheckCircle2Icon,
  EyeIcon,
  StarIcon,
  TrophyIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { useLocale, useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** "2 hours ago", in the visitor's own language. */
function relativeTime(iso: string, locale: string): string {
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  if (!Number.isFinite(diff)) return "";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, seconds] of steps) {
    if (Math.abs(diff) >= seconds) return rtf.format(Math.round(diff / seconds), unit);
  }
  return rtf.format(0, "minute");
}

interface ActivityEvent {
  key: string;
  at: number;
  icon: ReactNode;
  text: string;
  /** Where the row leads, when it leads anywhere. */
  href?: string;
  /** Square art for the row — a poster, or nothing for an achievement. */
  entry?: LibraryEntry;
  title: string;
}

/**
 * The activity feed, derived rather than logged.
 *
 * There is no event table behind this — nothing on the server records "at
 * 14:02 they watched episode 12". What there *is*: every library entry
 * carries its own `updatedAt` and current state, and every earned
 * achievement carries an `earnedAt`. Read together and sorted by time,
 * those are a real history with real timestamps — one line per thing that
 * actually happened, not a plausible-looking invention.
 *
 * The cost of deriving instead of logging is that an entry only remembers
 * its *latest* state, so re-watching overwrites the line rather than adding
 * one. That is honest about what we know; a fabricated backlog would not be.
 */
function buildActivity(
  entries: LibraryEntry[],
  achievements: EarnedAchievement[],
  t: ReturnType<typeof useT>,
  titleOf: (entry: LibraryEntry) => string,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const entry of entries) {
    const title = titleOf(entry);
    const href = animeHref(entry.anime);
    const at = Date.parse(entry.updatedAt || entry.createdAt);
    if (!Number.isFinite(at)) continue;

    if (entry.status === "COMPLETED") {
      events.push({
        key: `c-${entry.anime.id}`,
        at,
        icon: <CheckCircle2Icon className="size-3.5 text-emerald-500" />,
        text: t("profile.overview.ep.completed"),
        href,
        entry,
        title,
      });
    } else if (entry.progress > 0) {
      events.push({
        key: `w-${entry.anime.id}`,
        at,
        icon: <EyeIcon className="size-3.5 text-sky-500" />,
        text: t("profile.overview.ep.watched", { n: entry.progress }),
        href,
        entry,
        title,
      });
    } else {
      events.push({
        key: `a-${entry.anime.id}`,
        at: Date.parse(entry.createdAt) || at,
        icon: <BookmarkPlusIcon className="size-3.5 text-primary" />,
        text: t("profile.overview.ep.added"),
        href,
        entry,
        title,
      });
    }

    // A score is its own moment, and the only one we can place separately
    // with any honesty: it can only have been given at or before the last
    // touch, so it rides the same timestamp rather than a made-up earlier one.
    if (entry.score != null) {
      events.push({
        key: `s-${entry.anime.id}`,
        at: at - 1,
        icon: <StarIcon className="size-3.5 fill-amber-400 text-amber-400" />,
        text: t("profile.overview.ep.rated", { score: entry.score }),
        href,
        entry,
        title,
      });
    }
  }

  for (const achievement of achievements) {
    if (!achievement.earned || !achievement.earnedAt) continue;
    const at = Date.parse(achievement.earnedAt);
    if (!Number.isFinite(at)) continue;
    events.push({
      key: `t-${achievement.id}`,
      at,
      icon: <TrophyIcon className="size-3.5 text-amber-400" />,
      text: t("profile.overview.ep.achievement"),
      href: "/profile?tab=achievements",
      title: t(`achievements.items.${achievement.id}.title` as "achievements.items.critic.title"),
    });
  }

  return events.sort((a, b) => b.at - a.at);
}

const ACTIVITY_SHOWN = 6;
const RECENT_SHOWN = 3;
const COLLECTION_SHOWN = 6;

/**
 * The profile's front page: what this account has been doing lately, what
 * it has open right now, and what it has collected — the three questions a
 * profile is opened to answer, in that order.
 */
export function ProfileOverview({
  profile,
  entries,
}: {
  profile: MyProfile;
  entries: LibraryEntry[];
}) {
  const t = useT();
  const labels = useLabels();
  const { locale } = useLocale();

  const titleOf = (entry: LibraryEntry) => labels.title(entry.anime);
  const activity = buildActivity(entries, profile.achievements, t, titleOf).slice(0, ACTIVITY_SHOWN);

  // In progress, most recently touched first — the same definition the
  // library page's own "continue" strip uses.
  const recent = entries
    .filter((e) => e.status === "WATCHING" && (!e.anime.episodes || e.progress < e.anime.episodes))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, RECENT_SHOWN);

  const collection = entries
    .filter((e) => e.status === "COMPLETED" || e.status === "WATCHING")
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card title={t("profile.overview.activity")} href="/library">
          {activity.length === 0 ? (
            <Empty text={t("profile.overview.activityEmpty")} />
          ) : (
            <ul className="flex flex-col">
              {activity.map((event, i) => (
                <li
                  key={event.key}
                  className="reveal"
                  style={{ "--i": i } as CSSProperties}
                >
                  <Link
                    to={event.href ?? "/library"}
                    viewTransition
                    className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-secondary/50"
                  >
                    <span className="h-12 w-9 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {event.entry ? (
                        event.entry.anime.imageUrl ? (
                          <img
                            src={imageSrc(event.entry.anime.imageUrl)}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : (
                          <PosterFallback
                            title={event.title}
                            seed={event.entry.anime.id}
                            variant="poster"
                          />
                        )
                      ) : (
                        <span className="grid size-full place-items-center bg-amber-400/10">
                          <TrophyIcon className="size-4 text-amber-400" />
                        </span>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-xs text-muted-foreground">{event.text}</span>
                      <span className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                        {event.title}
                      </span>
                      <span className="text-[11px] text-muted-foreground/70">
                        {relativeTime(new Date(event.at).toISOString(), locale)}
                      </span>
                    </span>
                    <span className="shrink-0 text-muted-foreground/60">{event.icon}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t("profile.overview.recent")} href="/library">
          {recent.length === 0 ? (
            <Empty text={t("profile.overview.recentEmpty")} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {recent.map((entry, i) => {
                const total = entry.anime.episodes ?? 0;
                const percent =
                  total > 0 ? Math.min(100, Math.round((entry.progress / total) * 100)) : 0;
                const art = entry.anime.imageLargeUrl ?? entry.anime.imageUrl;
                return (
                  <Link
                    key={entry.anime.id}
                    to={animeHref(entry.anime)}
                    viewTransition
                    style={{ "--i": i } as CSSProperties}
                    className="reveal group flex flex-col gap-2 overflow-hidden rounded-xl border border-border/60 bg-card/50 p-2 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40"
                  >
                    <span className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-muted">
                      {art ? (
                        <img
                          src={imageSrc(art)}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <PosterFallback
                          title={labels.title(entry.anime)}
                          seed={entry.anime.id}
                          variant="poster"
                        />
                      )}
                    </span>
                    <span className="line-clamp-2 text-xs font-medium leading-tight text-foreground">
                      {labels.title(entry.anime)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {t("profile.overview.episodeOf", { n: entry.progress })}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
                        <span
                          className="block h-full rounded-full bg-primary transition-[width] duration-700"
                          style={{ width: `${percent}%` }}
                        />
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {percent}%
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card title={t("profile.overview.collection")} href="/library">
        {collection.length === 0 ? (
          <Empty text={t("profile.overview.collectionEmpty")} />
        ) : (
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {collection.slice(0, COLLECTION_SHOWN).map((entry, i) => {
              const art = entry.anime.imageLargeUrl ?? entry.anime.imageUrl;
              return (
                <Link
                  key={entry.anime.id}
                  to={animeHref(entry.anime)}
                  viewTransition
                  title={labels.title(entry.anime)}
                  style={{ "--i": i } as CSSProperties}
                  className="reveal group aspect-[2/3] w-24 shrink-0 snap-start overflow-hidden rounded-xl border border-border/60 bg-muted transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 sm:w-28"
                >
                  {art ? (
                    <img
                      src={imageSrc(art)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <PosterFallback
                      title={labels.title(entry.anime)}
                      seed={entry.anime.id}
                      variant="poster"
                    />
                  )}
                </Link>
              );
            })}
            {collection.length > COLLECTION_SHOWN && (
              <Link
                to="/library"
                viewTransition
                className="grid aspect-[2/3] w-24 shrink-0 snap-start place-items-center rounded-xl border border-dashed border-border/70 bg-card/40 text-center transition-colors hover:border-primary/50 hover:text-primary sm:w-28"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-display text-lg tabular-nums">
                    +{collection.length - COLLECTION_SHOWN}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("profile.overview.more")}
                  </span>
                </span>
              </Link>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

/** One panel. Every block on this page is one of these, so they all share
 *  a heading, a border and a corner link rather than each inventing its own. */
function Card({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <section className="reveal-group flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base">{title}</h2>
        {href && (
          <Link
            to={href}
            viewTransition
            className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            {t("common.seeAll")} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className={cn("rounded-xl bg-secondary/30 px-3 py-6 text-center text-xs text-muted-foreground")}>
      {text}
    </p>
  );
}
