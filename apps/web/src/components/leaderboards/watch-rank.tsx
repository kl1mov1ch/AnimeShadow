import { type CSSProperties, useId } from "react";
import { Link } from "react-router-dom";
import { CrownIcon, MedalIcon, ShieldIcon, StarIcon, TvIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  watchTimeParts,
  watchTimeLabel,
  type WatchRank,
} from "@/lib/watch-leaderboard";

const rankMetal = (rank: number) =>
  rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "plain";

export function RankSeal({ rank, className }: { rank: number; className?: string }) {
  const Icon =
    rank === 1 ? CrownIcon : rank <= 3 ? MedalIcon : rank <= 10 ? StarIcon : ShieldIcon;
  return (
    <span
      className={cn("hall-rank-seal", className)}
      data-metal={rankMetal(rank)}
      role="img"
      aria-label={`Место ${rank}`}
    >
      <Icon aria-hidden className="size-3.5" />
      <span>{rank}</span>
    </span>
  );
}

export function ViewerAvatar({
  row,
  className,
}: {
  row: WatchRank;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {row.avatarUrl && <AvatarImage src={imageSrc(row.avatarUrl, 240)} alt="" />}
      <AvatarFallback className="hall-avatar-fallback">
        {row.displayName.trim().slice(0, 2).toLocaleUpperCase("ru-RU") || "影"}
      </AvatarFallback>
    </Avatar>
  );
}

function Laurel() {
  const id = useId();
  return (
    <svg className="hall-laurel" viewBox="0 0 180 180" fill="none" aria-hidden>
      <defs>
        <g id={id}>
          <path
            d="M72 151C37 136 21 103 30 64"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M58 143c-13 2-25-5-27-14 12-1 23 5 27 14Zm-13-14c-13-2-22-12-21-21 11 3 19 10 21 21Zm-9-19c-12-6-17-17-13-25 10 5 14 14 13 25Zm-4-21c-9-8-10-20-4-27 7 8 8 18 4 27Zm2-23c-5-10-2-21 6-25 4 10 1 20-6 25Zm8-21c-1-11 5-20 14-21-1 11-7 18-14 21Z"
            fill="currentColor"
            fillOpacity=".65"
          />
          <path
            d="M59 139c2-10 0-16-6-20-6 7-4 14 6 20Zm-13-20c5-7 5-15 0-21-7 6-7 14 0 21Zm-7-23c7-5 9-12 6-19-8 4-10 11-6 19Zm0-23c8-3 12-9 11-17-9 1-13 7-11 17Z"
            fill="currentColor"
            fillOpacity=".38"
          />
        </g>
      </defs>
      <use href={`#${id}`} />
      <use href={`#${id}`} transform="translate(180 0) scale(-1 1)" />
      <path d="m89 22 1-5 1 5 5 1-5 1-1 5-1-5-5-1Z" fill="currentColor" />
    </svg>
  );
}

export function PodiumCard({
  row,
  slot,
  currentUserId,
}: {
  row?: WatchRank;
  slot: number;
  currentUserId?: string;
}) {
  const rank = row?.rank ?? slot + 1;
  const metal = rankMetal(rank);
  const time = row ? watchTimeParts(row.seconds) : null;
  const mine = Boolean(row && currentUserId && row.userId === currentUserId);
  const label =
    rank === 1 ? "На вершине" : rank === 2 ? "Серебряный призёр" : "Бронзовый призёр";
  return (
    <article
      className={cn("hall-podium-card", !row && "hall-podium-vacant")}
      data-metal={metal}
      data-slot={slot}
      style={{ "--hall-delay": `${slot * 90}ms` } as CSSProperties}
    >
      <div className="hall-podium-backdrop" aria-hidden />
      <span className="hall-podium-label">
        {rank === 1 ? (
          <CrownIcon className="size-3.5" />
        ) : (
          <MedalIcon className="size-3.5" />
        )}
        {label}
      </span>
      <div className="hall-emblem">
        <Laurel />
        {rank === 1 && <CrownIcon aria-hidden className="hall-crown" />}
        <span className="hall-avatar-orbit" aria-hidden />
        <div className="hall-podium-avatar">
          {row ? (
            <ViewerAvatar row={row} className="size-full" />
          ) : (
            <ShieldIcon className="size-9 opacity-35" aria-hidden />
          )}
        </div>
        <RankSeal rank={rank} className="hall-podium-seal" />
      </div>
      <h3 className="hall-podium-name">{row?.displayName ?? "Место свободно"}</h3>
      {mine && <span className="hall-you-tag">Это ты</span>}
      {time ? (
        <>
          <p className="hall-podium-time">
            <strong>{time.value.toLocaleString("ru-RU")}</strong>
            <span>{time.unit}</span>
            {time.detail && <small>{time.detail}</small>}
          </p>
          <p className="hall-podium-titles">
            <TvIcon className="size-3.5" />
            {row!.titles.toLocaleString("ru-RU")} аниме
          </p>
        </>
      ) : (
        <p className="hall-podium-invitation">Твоя история может начаться здесь</p>
      )}
      <div className="hall-podium-foot" aria-hidden>
        <span />
        <StarIcon className="size-3" />
        <span />
      </div>
      {row?.username && (
        <Link
          to={`/profile/${encodeURIComponent(row.username)}`}
          className="hall-profile-link"
          aria-label={`Профиль: ${row.displayName}`}
        />
      )}
    </article>
  );
}

export function WatchRankingRow({
  row,
  leaderSeconds,
  mine = false,
  index = 0,
}: {
  row: WatchRank;
  leaderSeconds: number;
  mine?: boolean;
  index?: number;
}) {
  const content = (
    <>
      <RankSeal rank={row.rank} />
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <ViewerAvatar row={row} className="size-9 sm:size-10" />
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{row.displayName}</span>
            {mine && <span className="hall-you-tag">Ты</span>}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:hidden">
            {row.titles} аниме
          </p>
          {row.username && (
            <p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block">
              @{row.username}
            </p>
          )}
        </div>
      </div>
      <span className="hidden text-right text-sm tabular-nums text-muted-foreground sm:block">
        {row.titles.toLocaleString("ru-RU")}
      </span>
      <span className="min-w-0 text-right">
        <strong className="block text-xs font-semibold tabular-nums sm:text-sm">
          {watchTimeLabel(row.seconds)}
        </strong>
        <span
          aria-hidden
          title="Относительно времени лидера"
          className="hall-time-track"
        >
          <span
            style={{
              width: `${Math.min(100, (row.seconds / Math.max(1, leaderSeconds)) * 100)}%`,
            }}
          />
        </span>
      </span>
    </>
  );
  const classes = cn("hall-ranking-row", mine && "hall-ranking-row-mine");
  const style = { "--hall-delay": `${Math.min(index, 8) * 30}ms` } as CSSProperties;
  return (
    <li>
      {row.username ? (
        <Link
          to={`/profile/${encodeURIComponent(row.username)}`}
          className={classes}
          style={style}
        >
          {content}
        </Link>
      ) : (
        <div className={classes} style={style}>
          {content}
        </div>
      )}
    </li>
  );
}
