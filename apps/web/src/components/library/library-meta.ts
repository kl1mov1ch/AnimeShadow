import { type LibraryEntry, type LibraryStatus, libraryStatusSchema } from "@animeshadow/shared";
import {
  BookmarkIcon,
  CheckCircle2Icon,
  PauseCircleIcon,
  PlayCircleIcon,
  XCircleIcon,
} from "lucide-react";

export const STATUSES = libraryStatusSchema.options;

/**
 * A calm mark per status, the same everywhere on the page: the site's colour
 * for what is being watched now, shades of grey for the rest — the icon
 * and the name say which list it is, not a rainbow.
 */
export const STATUS_META: Record<
  LibraryStatus,
  { Icon: typeof PlayCircleIcon; dot: string; text: string; bar: string }
> = {
  WATCHING: { Icon: PlayCircleIcon, dot: "bg-primary", text: "text-primary", bar: "bg-primary" },
  PLANNED: { Icon: BookmarkIcon, dot: "bg-foreground/45", text: "text-foreground/70", bar: "bg-foreground/40" },
  COMPLETED: { Icon: CheckCircle2Icon, dot: "bg-foreground/80", text: "text-foreground", bar: "bg-foreground/60" },
  ON_HOLD: { Icon: PauseCircleIcon, dot: "bg-foreground/30", text: "text-muted-foreground", bar: "bg-foreground/30" },
  DROPPED: { Icon: XCircleIcon, dot: "bg-foreground/20", text: "text-muted-foreground", bar: "bg-foreground/20" },
};

/** 0–100, or null when the episode count is unknown. */
export function progressPercent(entry: LibraryEntry): number | null {
  const total = entry.anime.episodes ?? 0;
  if (total <= 0) return null;
  return Math.min(100, Math.round((entry.progress / total) * 100));
}

export function progressLabel(entry: LibraryEntry): string {
  const total = entry.anime.episodes ?? 0;
  return total > 0 ? `${entry.progress}/${total}` : `${entry.progress}/?`;
}
