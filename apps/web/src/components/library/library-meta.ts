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
 * One colour per status, the same everywhere on the page — the dot on a
 * poster, the counter's fill and the list it filters by — so which list a
 * title is in reads at a glance: green watching, blue planned, the site's
 * colour finished, amber on hold, grey dropped.
 */
export const STATUS_META: Record<
  LibraryStatus,
  { Icon: typeof PlayCircleIcon; dot: string; text: string; bar: string }
> = {
  WATCHING: { Icon: PlayCircleIcon, dot: "bg-emerald-400", text: "text-emerald-400", bar: "bg-emerald-400" },
  PLANNED: { Icon: BookmarkIcon, dot: "bg-sky-400", text: "text-sky-400", bar: "bg-sky-400" },
  COMPLETED: { Icon: CheckCircle2Icon, dot: "bg-primary", text: "text-primary", bar: "bg-primary" },
  ON_HOLD: { Icon: PauseCircleIcon, dot: "bg-amber-400", text: "text-amber-400", bar: "bg-amber-400" },
  DROPPED: { Icon: XCircleIcon, dot: "bg-zinc-400", text: "text-zinc-400", bar: "bg-zinc-400" },
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
