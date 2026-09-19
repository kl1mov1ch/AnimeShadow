import type { LibraryEntry, LibraryStatus } from "@animeshadow/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { useLabels } from "@/lib/labels";
import { useRemoveLibraryEntry, useUpsertLibraryEntry } from "@/lib/query";

/**
 * Long enough that five quick clicks on "+1" become one request carrying the
 * final number, short enough that leaving the page right after still saves.
 */
const SAVE_DELAY_MS = 600;

interface Patch {
  status?: LibraryStatus;
  score?: number | null;
  progress?: number;
  notes?: string | null;
}

/**
 * Every edit the library page makes, applied to the cached list first and
 * saved second — so "+1 episode" moves the bar the instant it is clicked
 * instead of after a round trip.
 */
export function useLibraryEdit() {
  const t = useT();
  const labels = useLabels();
  const client = useQueryClient();
  const upsert = useUpsertLibraryEntry();
  const remove = useRemoveLibraryEntry();
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const current = useCallback(
    (animeId: number): LibraryEntry | undefined =>
      client
        .getQueryData<LibraryEntry[]>(["library", "all"])
        ?.find((e) => e.anime.id === animeId),
    [client],
  );

  const patchCache = useCallback(
    (animeId: number, patch: Patch) => {
      client.setQueriesData<LibraryEntry[]>({ queryKey: ["library"] }, (data) =>
        // The summary lives under the same prefix and is not a list.
        Array.isArray(data)
          ? data.map((e) =>
              e.anime.id === animeId
                ? { ...e, ...patch, updatedAt: new Date().toISOString() }
                : e,
            )
          : data,
      );
    },
    [client],
  );

  const fail = useCallback(
    (error: unknown) => {
      toast.error(error instanceof ApiRequestError ? error.message : t("library.saveError"));
      // Whatever we guessed locally is now wrong; take the server's word.
      void client.invalidateQueries({ queryKey: ["library"] });
    },
    [client, t],
  );

  const send = useCallback(
    (animeId: number) => {
      const entry = current(animeId);
      if (!entry) return;
      upsert.mutate(
        {
          animeId,
          input: {
            status: entry.status,
            score: entry.score,
            progress: entry.progress,
            notes: entry.notes,
          },
        },
        { onError: fail },
      );
    },
    [current, fail, upsert],
  );

  // A pending save still goes out if the page is left mid-debounce.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const [animeId, timer] of pending) {
        clearTimeout(timer);
        send(animeId);
      }
      pending.clear();
    };
    // `send` is stable enough for an unmount flush; re-running this on every
    // render would flush on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schedule = useCallback(
    (animeId: number) => {
      const existing = timers.current.get(animeId);
      if (existing) clearTimeout(existing);
      timers.current.set(
        animeId,
        setTimeout(() => {
          timers.current.delete(animeId);
          send(animeId);
        }, SAVE_DELAY_MS),
      );
    },
    [send],
  );

  const update = useCallback(
    (entry: LibraryEntry, patch: Patch) => {
      patchCache(entry.anime.id, patch);
      schedule(entry.anime.id);
    },
    [patchCache, schedule],
  );

  /**
   * One episode forward or back, with the status following along: the first
   * episode of something planned means it is being watched, and the last one
   * means it is finished.
   */
  const step = useCallback(
    (entry: LibraryEntry, delta: 1 | -1) => {
      const latest = current(entry.anime.id) ?? entry;
      const total = latest.anime.episodes ?? 0;
      const ceiling = total > 0 ? total : 10_000;
      const progress = Math.min(ceiling, Math.max(0, latest.progress + delta));
      if (progress === latest.progress) return;

      const title = labels.title(latest.anime);
      let status = latest.status;
      if (delta > 0 && status !== "WATCHING" && status !== "COMPLETED") {
        status = "WATCHING";
        toast(t("library.startedWatching", { title }));
      }
      if (delta > 0 && total > 0 && progress === total && status !== "COMPLETED") {
        status = "COMPLETED";
        toast.success(t("library.finished", { title }));
      }
      update(latest, { progress, status });
    },
    [current, labels, t, update],
  );

  const setStatus = useCallback(
    (entry: LibraryEntry, status: LibraryStatus) => {
      const total = entry.anime.episodes ?? 0;
      // Marking something completed fills the bar; nobody wants to click
      // "+1" twelve times to say they finished it.
      const progress = status === "COMPLETED" && total > 0 ? total : entry.progress;
      update(entry, { status, progress });
      toast.success(
        t("library.savedStatus", { title: labels.title(entry.anime), status: t(`status.${status}`) }),
      );
    },
    [labels, t, update],
  );

  const removeEntry = useCallback(
    (entry: LibraryEntry) => {
      const pending = timers.current.get(entry.anime.id);
      if (pending) clearTimeout(pending);
      timers.current.delete(entry.anime.id);
      remove.mutate(entry.anime.id, {
        onSuccess: () => toast.success(t("library.removed", { title: labels.title(entry.anime) })),
        onError: fail,
      });
    },
    [fail, labels, remove, t],
  );

  return {
    step,
    setStatus,
    setScore: (entry: LibraryEntry, score: number | null) => update(entry, { score }),
    setNotes: (entry: LibraryEntry, notes: string | null) => {
      update(entry, { notes });
      toast.success(t("library.notesSaved"));
    },
    remove: removeEntry,
    removing: remove.isPending,
  };
}

export type LibraryEdit = ReturnType<typeof useLibraryEdit>;
