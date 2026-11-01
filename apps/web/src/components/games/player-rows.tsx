import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PlayerRow {
  rank: number;
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  value?: string;
}

export function PlayerRows({
  rows,
  currentUserId,
  empty = "Пока нет результатов. Стань первым!",
}: {
  rows: PlayerRow[];
  currentUserId?: string;
  empty?: string;
}) {
  if (!rows.length)
    return (
      <p className="py-8 text-center text-sm leading-relaxed text-muted-foreground">
        {empty}
      </p>
    );
  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((row) => {
        const content = (
          <>
            <span
              className={cn(
                "w-7 shrink-0 text-center text-sm font-semibold tabular-nums",
                row.rank <= 3 ? "text-primary" : "text-muted-foreground",
              )}
            >
              {row.rank}
            </span>
            <Avatar className="size-9">
              <AvatarImage
                src={row.avatarUrl ? imageSrc(row.avatarUrl) : undefined}
                alt=""
              />
              <AvatarFallback>{row.displayName.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {row.displayName}
              {row.userId === currentUserId && (
                <span className="ml-1 text-xs text-primary">(ты)</span>
              )}
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
              {row.value}
            </span>
          </>
        );
        const classes = cn(
          "flex min-h-14 items-center gap-2 rounded-xl border px-2 py-2 sm:gap-3 sm:px-3",
          row.userId === currentUserId
            ? "border-primary/40 bg-primary/10"
            : "border-transparent bg-secondary/30 hover:bg-secondary/70",
        );
        return (
          <li key={row.userId}>
            {row.username ? (
              <Link to={`/profile/${row.username}`} className={classes}>
                {content}
              </Link>
            ) : (
              <div className={classes}>{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
