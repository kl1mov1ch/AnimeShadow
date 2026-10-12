import type { FeedEvent, PublicProfile } from "@animeshadow/shared";
import {
  ActivityIcon,
  ArrowRightIcon,
  BookmarkPlusIcon,
  CheckCheckIcon,
  CrownIcon,
  GitCompareArrowsIcon,
  HeartIcon,
  ListIcon,
  PencilIcon,
  PlayIcon,
  StarIcon,
  TrophyIcon,
  TvIcon,
  type LucideIcon,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useT } from "@/i18n";
import { animeHref, genreHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useTasteCompare, useUserFeed, useUserList, useUserWatching } from "@/lib/query";
import { cn } from "@/lib/utils";
import { QuickFavorites, ShowcasePicker } from "../profile-blocks";
import { LevelCard, type ProfileTaskActions } from "../profile-progression";
import { ago, STATUS_COLOR, STATUS_ORDER, type ListStatus } from "./format";
import { FriendsActivity, WallPanel } from "./social";
import { EmptyNote, Panel, PanelAction } from "./kit";

export type OverviewGo = (tab: "list" | "trophies" | "activity" | "collections", status?: ListStatus) => void;

/**
 * The first tab: the top five large, what they are watching now, the last
 * few things they did — and beside it the level (with the owner's tasks),
 * how well the visitor's taste matches, favourite genres, and what their
 * list is made of. One column on a phone, in the order it is read.
 */
export function OverviewTab({
  profile,
  own,
  actions,
  go,
}: {
  profile: PublicProfile;
  own: boolean;
  actions?: ProfileTaskActions;
  go: OverviewGo;
}) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const shown = (block: string) => !profile.layout.hidden.includes(block as never);

  // A visitor sees no empty showcase, so it takes no room either.
  const top = shown("showcase") && (own || profile.favorites.length > 0) ? (
    <div id="showcase" className="h-full scroll-mt-32">
      <TopFive profile={profile} own={own} />
    </div>
  ) : null;
  // Only what has something in it: on someone else's profile an empty
  // block is just a hole. The owner keeps theirs — empty, they say what
  // will appear there.
  const feedOn = shown("activity") && !profile.hidden.activity;
  const { data: feedItems } = useUserFeed(profile.id, feedOn);
  const { data: listItems } = useUserList(profile.id, !profile.hidden.list);
  const watching = shown("watching") && !profile.hidden.watching ? <WatchingNow profile={profile} own={own} /> : null;
  const feed = feedOn && (own || feedItems === undefined || feedItems.length > 0) ? <RecentFeed profile={profile} onMore={() => go("activity")} /> : null;
  // The level and the owner's tasks are their own business: a visitor sees
  // the level in the strip above, not the progress behind it.
  const level = own ? <LevelCard profile={profile} own actions={actions} compact className="h-full" /> : null;
  const compare = !own && shown("compare") && !profile.hidden.list ? <CompareCard profile={profile} /> : null;
  const genres = !profile.hidden.stats && profile.stats.topGenres.length > 0 ? <GenresCard profile={profile} /> : null;
  const list = !profile.hidden.list && (listItems === undefined || listItems.length > 0) ? <ListBreakdown profile={profile} go={go} /> : null;
  const wall = <WallPanel profile={profile} own={own} />;
  const friends = own ? <FriendsActivity userId={profile.id} /> : null;

  if (!wide) {
    return (
      <div className="flex flex-col gap-4">
        {top}
        {level}
        {compare}
        {watching}
        {friends}
        {wall}
        {genres}
        {list}
        {feed}
      </div>
    );
  }
  // Beside the top five: the owner's progress, or for a visitor how their
  // tastes match. Everything else in even rows that fill the width.
  const side = own ? level : compare;
  return (
    <div className="flex flex-col gap-5">
      {top && (
        <div className="grid grid-cols-12 items-stretch gap-5">
          <div className={cn("min-w-0", side ? "col-span-8" : "col-span-12")}>{top}</div>
          {side && <div className="col-span-4 flex min-w-0 flex-col gap-5">{side}</div>}
        </div>
      )}
      {watching}
      {friends}
      <EvenRows items={[top ? null : side, feed, genres, list]} />
      {wall}
    </div>
  );
}

const LG_SPAN: Record<number, string> = { 6: "lg:col-span-6", 12: "lg:col-span-12" };
const XL_SPAN: Record<number, string> = { 4: "xl:col-span-4", 6: "xl:col-span-6", 12: "xl:col-span-12" };

/** How many go in each row: up to three, and never one left alone under three. */
function rowSizes(n: number): number[] {
  if (n <= 3) return [n];
  if (n === 4) return [2, 2];
  const rows: number[] = [];
  let left = n;
  while (left > 4) {
    rows.push(3);
    left -= 3;
  }
  return [...rows, ...(left === 4 ? [2, 2] : [left])];
}

/**
 * Cards in rows that always fill the width: one alone takes it all, two
 * halve it, three take a third each, four make two pairs, five are three
 * and two. On a narrower screen, pairs — the last one full when they're odd.
 * Every card in a row is as tall as the tallest.
 */
function EvenRows({ items }: { items: ReactNode[] }) {
  const cards = items.filter(Boolean);
  if (cards.length === 0) return null;
  const spans = rowSizes(cards.length).flatMap((size) => Array.from({ length: size }, () => 12 / size));
  return (
    <div className="grid grid-cols-12 items-stretch gap-5">
      {cards.map((card, i) => (
        <div
          key={i}
          className={cn(
            "col-span-12 min-w-0 [&>*]:h-full",
            LG_SPAN[cards.length % 2 === 1 && i === cards.length - 1 ? 12 : 6],
            XL_SPAN[spans[i]!],
          )}
        >
          {card}
        </div>
      ))}
    </div>
  );
}

/* ---------------- the top five ---------------- */

function TopFive({ profile, own }: { profile: PublicProfile; own: boolean }) {
  const labels = useLabels();
  const [picking, setPicking] = useState(false);
  const favorites = profile.favorites;
  if (favorites.length === 0 && !own) return null;

  return (
    <Panel
      className="h-full"
      title="Моя пятёрка"
      icon={CrownIcon}
      action={own ? <PanelAction icon={PencilIcon} onClick={() => setPicking(true)}>Изменить</PanelAction> : undefined}
    >
      {favorites.length === 0 && (
        <div className="mb-4">
          <QuickFavorites profile={profile} onPick={() => setPicking(true)} />
        </div>
      )}
      {(favorites.length > 0 || own) && (
        <ol className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-5 sm:gap-4 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          {favorites.map((anime, i) => (
            <li
              key={anime.id}
              className="w-[34%] shrink-0 snap-start animate-in fade-in-0 slide-in-from-bottom-2 sm:w-auto"
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
            >
              <Link to={animeHref(anime)} viewTransition className="group block">
                <span className="relative block aspect-[2/3] overflow-hidden rounded-2xl bg-muted shadow-lg shadow-black/30 ring-1 ring-white/5 transition-[transform,box-shadow] duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-primary/20">
                  {anime.imageUrl && (
                    <img
                      src={imageSrc(anime.imageLargeUrl ?? anime.imageUrl)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                  {anime.score != null && (
                    <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                      <StarIcon className="size-3 fill-amber-400 text-amber-400" />
                      {anime.score.toFixed(1)}
                    </span>
                  )}
                </span>
                <span className="mt-2 line-clamp-2 block text-xs font-medium leading-snug transition-colors group-hover:text-primary">
                  {labels.title(anime)}
                </span>
              </Link>
            </li>
          ))}
          {own &&
            favorites.length < 5 &&
            Array.from({ length: 5 - favorites.length }, (_, i) => (
              <li key={`empty-${i}`} className="w-[34%] shrink-0 snap-start sm:w-auto">
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="grid aspect-[2/3] w-full place-items-center rounded-2xl border-2 border-dashed border-[var(--accent-line-soft)] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <span className="flex flex-col items-center gap-1 text-xs">
                    <BookmarkPlusIcon className="size-5" />
                    Добавить
                  </span>
                </button>
              </li>
            ))}
        </ol>
      )}
      {own && <ShowcasePicker open={picking} onOpenChange={setPicking} current={favorites.map((a) => a.id)} />}
    </Panel>
  );
}

/* ---------------- watching now ---------------- */

function WatchingNow({ profile, own }: { profile: PublicProfile; own: boolean }) {
  const labels = useLabels();
  const { data, isPending } = useUserWatching(profile.id);
  const items = (data ?? []).slice(0, 6);
  if (!isPending && items.length === 0) return null;

  return (
    <Panel title={own ? "Продолжить" : "Сейчас смотрит"} icon={TvIcon}>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
        {isPending
          ? Array.from({ length: 3 }, (_, i) => <div key={i} className="h-24 w-[78%] shrink-0 animate-pulse rounded-2xl bg-foreground/[0.05] sm:w-auto" />)
          : items.map((item, i) => {
              const episodes = item.anime.episodes ?? null;
              const done = item.completed ? item.episode : Math.max(0, item.episode - 1);
              const percent = episodes ? Math.min(100, (done / episodes) * 100) : null;
              return (
                <Link
                  key={item.anime.id}
                  to={own ? `${animeHref(item.anime)}#watch` : animeHref(item.anime)}
                  viewTransition
                  className="group relative flex w-[78%] shrink-0 snap-start gap-3 overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-background/40 p-2.5 transition-[border-color,transform] duration-300 animate-in fade-in-0 hover:-translate-y-0.5 hover:border-primary/40 sm:w-auto"
                  style={{ animationDelay: `${i * 50}ms`, animationFillMode: "backwards" }}
                >
                  {item.anime.imageUrl && (
                    <img
                      aria-hidden
                      src={imageSrc(item.anime.imageUrl)}
                      alt=""
                      className="pointer-events-none absolute inset-0 -z-10 size-full scale-125 object-cover opacity-[0.12] blur-xl"
                    />
                  )}
                  <span className="relative h-[4.5rem] w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {item.anime.imageUrl && <img src={imageSrc(item.anime.imageUrl)} alt="" loading="lazy" className="size-full object-cover" />}
                    {own && (
                      <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                        <PlayIcon className="size-5 fill-white text-white" />
                      </span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                    <span className="line-clamp-2 text-sm font-semibold leading-snug">{labels.title(item.anime)}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-primary">Серия {item.episode}</span>
                      {item.completed && <CheckCheckIcon className="size-3.5 text-emerald-400" />}
                      <span>· {ago(item.at)}</span>
                    </span>
                    {percent != null && (
                      <span className="h-1 overflow-hidden rounded-full bg-foreground/10">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(3, percent)}%` }} />
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
      </div>
    </Panel>
  );
}

/* ---------------- the feed ---------------- */

const FEED_ICON: Record<FeedEvent["kind"], { icon: LucideIcon; tone: string }> = {
  episode: { icon: PlayIcon, tone: "text-sky-400 bg-sky-500/12" },
  completed: { icon: CheckCheckIcon, tone: "text-emerald-400 bg-emerald-500/12" },
  rated: { icon: StarIcon, tone: "text-amber-400 bg-amber-500/12" },
  added: { icon: BookmarkPlusIcon, tone: "text-violet-400 bg-violet-500/12" },
  achievement: { icon: TrophyIcon, tone: "text-rose-400 bg-rose-500/12" },
};

export function FeedRow({ event, index }: { event: FeedEvent; index: number }) {
  const t = useT();
  const labels = useLabels();
  const { icon: Icon, tone } = FEED_ICON[event.kind];
  const what =
    event.kind === "achievement"
      ? t(`achievements.items.${event.value}.title` as "achievements.items.critic.title")
      : event.anime
        ? labels.title(event.anime)
        : "";
  return (
    <li
      className="flex items-center gap-3 animate-in fade-in-0 slide-in-from-left-1"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms`, animationFillMode: "backwards" } as CSSProperties}
    >
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", tone)}>
        <Icon className={cn("size-4", event.kind === "rated" && "fill-current")} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] text-muted-foreground">
          {t(`profile.feed.${event.kind}` as "profile.feed.episode", { n: event.value ?? "" })}
        </span>
        {event.anime ? (
          <Link to={animeHref(event.anime)} className="block truncate text-sm font-medium transition-colors hover:text-primary">
            {what}
          </Link>
        ) : (
          <span className="block truncate text-sm font-medium">{what}</span>
        )}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/80">{ago(event.at)}</span>
    </li>
  );
}

function RecentFeed({ profile, onMore }: { profile: PublicProfile; onMore: () => void }) {
  const { data, isPending } = useUserFeed(profile.id);
  const items = (data ?? []).slice(0, 6);
  return (
    <Panel
      title="Последнее"
      icon={ActivityIcon}
      action={(data?.length ?? 0) > 0 ? <PanelAction icon={ArrowRightIcon} onClick={onMore}>Вся активность</PanelAction> : undefined}
    >
      {isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-9 animate-pulse rounded-xl bg-foreground/[0.05]" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyNote icon={ActivityIcon} title="Пока тихо" hint="Серии, оценки и достижения появятся здесь." />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((event, i) => (
            <FeedRow key={`${event.kind}-${event.at}-${i}`} event={event} index={i} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------------- aside: taste ---------------- */

const GENRE_COLORS = ["#fb7185", "#60a5fa", "#fbbf24", "#34d399", "#a78bfa", "#f472b6"];

function GenresCard({ profile }: { profile: PublicProfile }) {
  const labels = useLabels();
  const genres = profile.stats.topGenres.slice(0, 6);
  const total = genres.reduce((s, g) => s + g.count, 0);
  if (genres.length === 0) return null;
  return (
    <Panel title="Любимые жанры" icon={HeartIcon}>
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {genres.map((g, i) => (
          <span
            key={g.name}
            title={labels.genreLabel(g.name)}
            className="h-full transition-[flex-grow] duration-700"
            style={{ flexGrow: g.count, background: GENRE_COLORS[i % GENRE_COLORS.length] }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {genres.map((g, i) => {
          const share = total > 0 ? Math.round((g.count / total) * 100) : 0;
          return (
            <li key={g.name} className="flex items-center gap-2.5 text-sm">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: GENRE_COLORS[i % GENRE_COLORS.length] }} />
              <Link to={genreHref(g.name)} className="min-w-0 flex-1 truncate transition-colors hover:text-primary">
                {labels.genreLabel(g.name)}
              </Link>
              <span className="text-xs tabular-nums text-muted-foreground">{share}%</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function CompareCard({ profile }: { profile: PublicProfile }) {
  const { status } = useAuth();
  const labels = useLabels();
  const authed = status === "authenticated";
  const { data, isPending, isError } = useTasteCompare(profile.id, authed);
  const r = 34;
  const c = 2 * Math.PI * r;

  return (
    <div id="compare" className="h-full scroll-mt-32">
      <Panel title="Совпадение вкусов" icon={GitCompareArrowsIcon} className="h-full">
        {!authed ? (
          <EmptyNote
            icon={GitCompareArrowsIcon}
            title="Сравните вкусы"
            hint="Войдите — и увидите, насколько ваши списки похожи."
            action={
              <Link to="/login" className="mt-1 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground">
                Войти
              </Link>
            }
          />
        ) : isError ? (
          <EmptyNote icon={GitCompareArrowsIcon} title="Не получилось сравнить" hint="Попробуйте обновить страницу чуть позже." />
        ) : isPending || !data ? (
          <div className="h-24 animate-pulse rounded-2xl bg-foreground/[0.05]" />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <span className="relative grid size-20 shrink-0 place-items-center">
                <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90" aria-hidden>
                  <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-foreground/10" />
                  <circle
                    cx="40"
                    cy="40"
                    r={r}
                    fill="none"
                    strokeWidth="7"
                    strokeLinecap="round"
                    className="stroke-primary transition-[stroke-dashoffset] duration-1000"
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - data.percent / 100)}
                  />
                </svg>
                <span className="font-display text-xl tabular-nums">{data.percent}%</span>
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {data.percent >= 70 ? "Родственные души" : data.percent >= 40 ? "Похожие вкусы" : "Разные миры"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.sharedCount} общих тайтлов
                  {data.sharedGenres.length > 0 && ` · ${data.sharedGenres.slice(0, 3).map((g) => labels.genreLabel(g)).join(", ")}`}
                </p>
              </div>
            </div>
            {data.common.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {data.common.slice(0, 4).map(({ anime, mine, theirs }) => (
                  <Link key={anime.id} to={animeHref(anime)} title={labels.title(anime)} className="group block">
                    <span className="relative block aspect-[2/3] overflow-hidden rounded-xl bg-muted">
                      {anime.imageUrl && <img src={imageSrc(anime.imageUrl)} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />}
                      {(mine != null || theirs != null) && (
                        <span className="absolute inset-x-0 bottom-0 flex justify-between bg-black/65 px-1 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                          <span title="Ваша оценка">{mine ?? "—"}</span>
                          <span title="Их оценка" className="text-primary">{theirs ?? "—"}</span>
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ---------------- aside: the list at a glance ---------------- */

function ListBreakdown({ profile, go }: { profile: PublicProfile; go: OverviewGo }) {
  const t = useT();
  const { data } = useUserList(profile.id);
  const counts = useMemo(() => {
    const out = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<ListStatus, number>;
    for (const e of data ?? []) if (e.status in out) out[e.status as ListStatus] += 1;
    return out;
  }, [data]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!data) return <div className="h-40 animate-pulse rounded-3xl bg-foreground/[0.04]" />;
  if (total === 0) return null;

  return (
    <Panel title="Список" icon={ListIcon} action={<PanelAction icon={ArrowRightIcon} onClick={() => go("list")}>{total}</PanelAction>}>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <button
            key={s}
            type="button"
            title={`${t(`status.${s}` as "status.WATCHING")}: ${counts[s]}`}
            onClick={() => go("list", s)}
            className="h-full transition-[filter] hover:brightness-125"
            style={{ flexGrow: counts[s], background: STATUS_COLOR[s] }}
          />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-1.5">
        {STATUS_ORDER.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => go("list", s)}
              disabled={counts[s] === 0}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-foreground/[0.05] disabled:opacity-40"
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[s] }} />
              <span className="min-w-0 flex-1 truncate">{t(`status.${s}` as "status.WATCHING")}</span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">{counts[s]}</span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
