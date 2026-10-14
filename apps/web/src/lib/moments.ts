import type { CreateMomentInput, FavoriteMoment } from "@animeshadow/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "./api";

/** "12:34", "1:02:03". */
export function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Where a moment plays: its title page, its episode, its second. */
export function momentHref(m: Pick<FavoriteMoment, "anime" | "episode" | "seconds">): string {
  return `/anime/${m.anime.slug || m.anime.id}?ep=${m.episode}&t=${m.seconds}#watch`;
}

export function useMoments(userId: string | undefined) {
  return useQuery({
    queryKey: ["moments", userId],
    enabled: Boolean(userId),
    queryFn: ({ signal }) => apiRequest<{ items: FavoriteMoment[] }>(`/users/${userId}/moments`, { signal }).then((r) => r.items),
    staleTime: 60_000,
  });
}

function useMine() {
  const { user } = useAuth();
  const client = useQueryClient();
  return (items: FavoriteMoment[]) => client.setQueryData(["moments", user?.id], items);
}

export function useAddMoment() {
  const put = useMine();
  return useMutation({
    mutationFn: (input: CreateMomentInput) => apiRequest<{ items: FavoriteMoment[] }>("/me/moments", { method: "POST", body: input }),
    onSuccess: (r) => put(r.items),
  });
}

export function useUpdateMoment() {
  const put = useMine();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; note?: string | null; position?: number }) =>
      apiRequest<{ items: FavoriteMoment[] }>(`/me/moments/${id}`, { method: "PATCH", body }),
    onSuccess: (r) => put(r.items),
  });
}

export function useRemoveMoment() {
  const put = useMine();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ items: FavoriteMoment[] }>(`/me/moments/${id}`, { method: "DELETE" }),
    onSuccess: (r) => put(r.items),
  });
}
