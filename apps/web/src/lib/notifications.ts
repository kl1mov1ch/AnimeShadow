import type { AppNotification } from "@animeshadow/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "./api";

/** The bell's number: one cheap count, refreshed every two minutes and on returning to the tab. */
export function useUnreadNotifications() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: ({ signal }) => apiRequest<{ unread: number }>("/me/notifications/unread", { signal }).then((r) => r.unread),
    enabled: status === "authenticated",
    refetchInterval: 2 * 60_000,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });
}

export function useNotifications(enabled = true) {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["notifications", "list"],
    queryFn: ({ signal }) => apiRequest<{ items: AppNotification[]; unread: number }>("/me/notifications", { signal }),
    enabled: enabled && status === "authenticated",
    staleTime: 30_000,
  });
}

export function useMarkNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids?: string[]; animeId?: number }) =>
      apiRequest<{ marked: number }>("/me/notifications/read", { method: "POST", body: input }),
    onSuccess: (r) => {
      if (r.marked > 0) void client.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** "Вышла 12 серия" / "Вышли серии 11–12". */
export function episodeLine(n: Pick<AppNotification, "episode" | "fromEpisode">): string {
  return n.fromEpisode != null ? `Вышли серии ${n.fromEpisode}–${n.episode}` : `Вышла ${n.episode} серия`;
}

/** Where a notification leads: the title, on the first new episode. */
export function notificationHref(n: AppNotification): string {
  return `/anime/${n.anime.slug || n.anime.id}?ep=${n.fromEpisode ?? n.episode}#watch`;
}
