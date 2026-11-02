import { type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { CrownIcon, FilmIcon, MedalIcon, ShieldIcon, StarIcon, TvIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ProMark } from "@/components/common/pro-mark";
import { LevelBadge } from "@/components/profile/level-visuals";
import { AvatarFrameRing, ProfileTitleBadge } from "@/components/profile/profile-cosmetics";
import { UserTitleBadge } from "@/components/user-title-badge";
import { imageSrc } from "@/lib/format";
import { publicLevelInfo, publicProfileHref } from "@/lib/public-identity";
import { cn } from "@/lib/utils";
import "./watch-identity.css";

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
  size = 40,
}: {
  row: WatchRank;
  className?: string;
  size?: number;
}) {
  return (
    <AvatarFrameRing frame={row.avatarFrame ?? null} weeklyPlace={row.weeklyWatchPlace} monthlyPlace={row.monthlyWatchPlace} fallback="ring-border" cap={false}>
      <Avatar className={className} style={{ width: `var(--hall-avatar-size, ${size}px)`, height: `var(--hall-avatar-size, ${size}px)` }}>
        {row.avatarUrl && <AvatarImage src={imageSrc(row.avatarUrl, 240)} alt="" />}
        <AvatarFallback className="hall-avatar-fallback">
          {row.displayName.trim().slice(0, 2).toLocaleUpperCase("ru-RU") || "影"}
        </AvatarFallback>
      </Avatar>
    </AvatarFrameRing>
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
  const rank = row?.rank ?? slot + 1;
  const time = row ? watchTimeParts(row.seconds) : null;
  const mine = Boolean(row && currentUserId && row.userId === currentUserId);
  return (
    <article
      className={cn("hall-podium-card", !row && "hall-podium-vacant")}
      data-metal={rankMetal(rank)}
      aria-label={`${rank}-е место${row ? `: ${row.displayName}` : " свободно"}`}
    >
      <div className="hall-podium-top">
        <RankSeal rank={rank} />
        <span className="hall-podium-rank-label">
          {rank === 1 ? "Лидер" : rank === 2 ? "Серебро" : "Бронза"}
        </span>
        {proDays && (
          <span className="hall-prize">
            <CrownIcon className="size-3" />+{proDays} {proDays === 3 ? "дня" : "дней"}{" "}
            PRO
          </span>
        )}
      </div>
      <div className="hall-podium-identity">
        <div className={cn("hall-podium-avatar", row && "hall-podium-avatar--framed")}>
          {row ? (
            <ViewerAvatar row={row} size={72} />
          ) : (
            <ShieldIcon className="size-7 opacity-40" aria-hidden />
          )}
        </div>
        <div className="min-w-0">
          <h3 className="hall-podium-name hall-podium-public-name" title={row?.displayName}>
            <span className="min-w-0 truncate">{row?.displayName ?? "Место свободно"}</span>
            {row?.isPro && <ProMark />}
          </h3>
          <p className="hall-podium-handle">
            {mine
              ? "Это ты"
              : row?.username
                ? "@" + row.username
                : row
                  ? "Зритель AnimeShadow"
                  : "Стань одним из первых"}
          </p>
          {row && <PublicRankDetails row={row} podium />}
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
      {row && (
        <Link
          to={publicProfileHref(row.username, row.userId)}
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
            {row.isPro && <ProMark />}
            {mine && <span className="hall-you-tag">Ты</span>}
          </p>
          <PublicRankDetails row={row} />
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
      <Link to={publicProfileHref(row.username, row.userId)} className={classes} style={style}>{content}</Link>
    </li>
  );
}

function PublicRankDetails({ row, podium = false }: { row: WatchRank; podium?: boolean }) {
  const level = publicLevelInfo(row.xp);
  return (
    <div className={cn("hall-public-details", podium && "hall-public-details--podium")}>
      <div className="hall-public-details__meta">
        {level && <LevelBadge info={level} size={24} animated={false} />}
        {row.episodes != null && <span className="inline-flex items-center gap-1"><FilmIcon className="size-3" />{row.episodes.toLocaleString("ru-RU")} сер.</span>}
        {!podium && row.username && <span className="hidden truncate md:inline">@{row.username}</span>}
      </div>
      {(row.profileTitle || row.titlePrefix) && <div className="hall-public-details__titles"><ProfileTitleBadge title={row.profileTitle ?? null} tip={false} /><UserTitleBadge prefix={row.titlePrefix} icon={row.titleIcon} /></div>}
    </div>
  );
}
