import { type CSSProperties } from "react";
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

export function PodiumCard({
  row,
  slot,
  currentUserId,
  proDays,
}: {
  row?: WatchRank;
  slot: number;
  currentUserId?: string;
  proDays?: number;
}) {
  const rank = slot + 1;
  const time = row ? watchTimeParts(row.seconds) : null;
  const mine = Boolean(row && currentUserId && row.userId === currentUserId);
  return (
    <article
      className={cn("hall-podium-card", !row && "hall-podium-vacant")}
      data-metal={rankMetal(rank)}
    >
      <div className="hall-podium-top">
        <RankSeal rank={rank} />
        <span>{rank === 1 ? "Лидер рейтинга" : rank === 2 ? "Серебро" : "Бронза"}</span>
        {proDays && (
          <span className="hall-prize">
            <CrownIcon className="size-3" />+{proDays} {proDays === 3 ? "дня" : "дней"}{" "}
            PRO
          </span>
        )}
      </div>
      <div className="hall-podium-identity">
        <div className="hall-podium-avatar">
          {row ? (
            <ViewerAvatar row={row} className="size-full" />
          ) : (
            <ShieldIcon className="size-7 opacity-40" aria-hidden />
          )}
        </div>
        <div className="min-w-0">
          <h3 className="hall-podium-name">{row?.displayName ?? "Место свободно"}</h3>
          <p className="hall-podium-handle">
            {mine
              ? "Это ты"
              : row?.username
                ? "@" + row.username
                : row
                  ? "Зритель AnimeShadow"
                  : "Стань одним из первых"}
          </p>
        </div>
      </div>
      <div className="hall-podium-stats">
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
          <p className="hall-podium-invitation">
            Смотри любимые истории и поднимайся в топе
          </p>
        )}
      </div>
      {row?.username && (
        <Link
          to={"/profile/" + encodeURIComponent(row.username)}
          className="hall-profile-link"
          aria-label={"Профиль: " + row.displayName}
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
