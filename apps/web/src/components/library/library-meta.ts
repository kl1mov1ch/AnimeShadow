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
 * One colour per status, used the same way everywhere on the page — the dot
 * on a poster, the bar under it and the tab that filters by it — so the
 * colour alone says which list something is in at a glance.
 */
export const STATUS_META: Record<
  LibraryStatus,
  { Icon: typeof PlayCircleIcon; dot: string; text: string; bar: string }
> = {
  WATCHING: { Icon: PlayCircleIcon, dot: "bg-emerald-500", text: "text-emerald-500", bar: "bg-emerald-500" },
  PLANNED: { Icon: BookmarkIcon, dot: "bg-sky-500", text: "text-sky-500", bar: "bg-sky-500" },
  COMPLETED: { Icon: CheckCircle2Icon, dot: "bg-primary", text: "text-primary", bar: "bg-primary" },
  ON_HOLD: { Icon: PauseCircleIcon, dot: "bg-amber-500", text: "text-amber-500", bar: "bg-amber-500" },
  DROPPED: { Icon: XCircleIcon, dot: "bg-rose-500", text: "text-rose-500", bar: "bg-rose-500" },
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
