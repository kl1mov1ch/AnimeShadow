import type {
  AnimeDetail,
  AnimeSummary,
  Character,
  CharacterDetail,
  DiscoverResponse,
  Genre,
  LibraryEntry,
  LibraryStatus,
  LibrarySummary,
  Paginated,
  RecommendationItem,
  ReviewList,
  SmartSearchResponse,
  UpsertLibraryInput,
  UpsertReviewInput,
  WatchResponse,
} from "@animeshadow/shared";
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useLocale } from "@/i18n";
import { apiRequest } from "./api.js";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const queryKeys = {
  discover: (lang: string) => ["discover", lang] as const,
  genres: ["genres"] as const,
  browse: (params: Record<string, unknown>) => ["browse", params] as const,
  anime: (id: number, lang: string) => ["anime", id, lang] as const,
  characters: (id: number) => ["anime", id, "characters"] as const,
  recommendations: (id: number) => ["anime", id, "recommendations"] as const,
  reviews: (id: number) => ["anime", id, "reviews"] as const,
  watch: (id: number) => ["anime", id, "watch"] as const,
  library: (status?: LibraryStatus) => ["library", status ?? "all"] as const,
  librarySummary: ["library", "summary"] as const,
};

export type BrowseParams = {
  q?: string;
  page?: number;
  perPage?: number;
  type?: string;
  airing?: string;
  genres?: number[];
  minScore?: number;
  year?: number;
  season?: string;
  orderBy?: string;
  sort?: "asc" | "desc";
  hasPlayer?: boolean;
};

export function useDiscover() {
  const { locale } = useLocale();
  return useQuery({
    queryKey: queryKeys.discover(locale),
    queryFn: ({ signal }) =>
      apiRequest<DiscoverResponse>("/discover", { signal, query: { lang: locale } }),
    staleTime: 5 * 60_000,
  });
}

export function useGenres() {
  return useQuery({
    queryKey: queryKeys.genres,
    queryFn: ({ signal }) =>
      apiRequest<{ items: Genre[] }>("/genres", { signal }).then((r) => r.items),
    staleTime: 60 * 60_000,
  });
}

export function useSmartSearch(q: string, enabled = true) {
  const { locale } = useLocale();
  const term = q.trim();
  return useQuery({
    queryKey: ["search", locale, term],
    enabled: enabled && term.length >= 2,
    queryFn: ({ signal }) =>
      apiRequest<SmartSearchResponse>("/search", {
        signal,
        query: { q: term, lang: locale, fast: true },
      }),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}

export function useBrowse(params: BrowseParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.browse(params),
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<Paginated<AnimeSummary>>("/anime", {
        signal,
        query: {
          ...params,
          genres: params.genres?.length ? params.genres.join(",") : undefined,
        },
      }),
    placeholderData: (previous) => previous,
  });
}

export function useAnime(idOrSlug: number | string) {
  const { locale } = useLocale();
  const key = String(idOrSlug);
  const numeric = typeof idOrSlug === "number" || /^\d+$/.test(key);
  const path = numeric ? `/anime/${key}` : `/anime/by-slug/${encodeURIComponent(key)}`;
  return useQuery({
    queryKey: ["anime", key, locale],
    queryFn: ({ signal }) =>
      apiRequest<AnimeDetail>(path, { signal, query: { lang: locale } }),
    staleTime: 10 * 60_000,
  });
}

export function useCharacters(id: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.characters(id),
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ items: Character[] }>(`/anime/${id}/characters`, { signal }).then(
        (r) => r.items,
      ),
    staleTime: 30 * 60_000,
  });
}

export function useCharacterDetail(id: number | null) {
  const { locale } = useLocale();
  return useQuery({
    queryKey: ["character", id, locale],
    enabled: id != null,
    queryFn: ({ signal }) =>
      apiRequest<CharacterDetail>(`/characters/${id}`, { signal, query: { lang: locale } }),
    staleTime: 30 * 60_000,
  });
}

export function useRecommendations(id: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.recommendations(id),
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ items: RecommendationItem[] }>(
        `/anime/${id}/recommendations`,
        { signal },
      ).then((r) => r.items),
    staleTime: 30 * 60_000,
  });
}

export function useWatchSources(id: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.watch(id),
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<WatchResponse>(`/anime/${id}/watch`, { signal }),
    staleTime: 15 * 60_000,
  });
}

export function useReviews(id: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reviews(id),
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<ReviewList>(`/anime/${id}/reviews`, { signal }),
  });
}

export function useUpsertReview(animeId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertReviewInput) =>
      apiRequest(`/anime/${animeId}/reviews`, { method: "PUT", body: input }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.reviews(animeId) });
    },
  });
}

export function useDeleteReview(animeId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<void>(`/anime/${animeId}/reviews`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.reviews(animeId) });
    },
  });
}

export function useLibrary(status?: LibraryStatus, enabled = true) {
  return useQuery({
    queryKey: queryKeys.library(status),
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ items: LibraryEntry[] }>("/library", {
        signal,
        query: { status },
      }).then((r) => r.items),
  });
}

export function useLibrarySummary(enabled = true) {
  return useQuery({
    queryKey: queryKeys.librarySummary,
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<LibrarySummary>("/library/summary", { signal }),
  });
}

export function useUpsertLibraryEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      animeId,
      input,
    }: {
      animeId: number;
      input: UpsertLibraryInput;
    }) =>
      apiRequest<LibraryEntry>(`/library/${animeId}`, {
        method: "PUT",
        body: input,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["library"] });
    },
  });
}

export function useRemoveLibraryEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (animeId: number) =>
      apiRequest<void>(`/library/${animeId}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["library"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Profile · progress · achievements · comments (social platform)
// ---------------------------------------------------------------------------

import type {
  AnimeProgress,
  Comment,
  CommentQuery,
  CreateCommentInput,
  EarnedAchievement,
  MyProfile,
  ProgressDetail,
  PublicProfile,
  UpdateProfileInput,
  UpsertProgressInput,
} from "@animeshadow/shared";

export function useMyProfile(enabled = true) {
  return useQuery({
    queryKey: ["me", "profile"],
    enabled,
    queryFn: ({ signal }) => apiRequest<MyProfile>("/me/profile", { signal }),
  });
}

export function usePublicProfile(username: string | undefined) {
  return useQuery({
    queryKey: ["profile", username],
    enabled: Boolean(username),
    queryFn: ({ signal }) =>
      apiRequest<PublicProfile>(`/profile/${username}`, { signal }),
  });
}

export function useMyProgress(enabled = true) {
  return useQuery({
    queryKey: ["me", "progress"],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<ProgressDetail[]>("/me/progress", { signal }),
  });
}

/** Per-episode progress for one title — where to resume, and what's been watched. */
export function useAnimeProgress(animeId: number, enabled = true) {
  return useQuery({
    queryKey: ["anime", animeId, "progress"],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<AnimeProgress>(`/anime/${animeId}/progress`, { signal }),
  });
}

export function useUpdateProgress(animeId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertProgressInput) =>
      apiRequest<AnimeProgress>(`/anime/${animeId}/progress`, {
        method: "PUT",
        body: input,
      }),
    onSuccess: (data) => {
      client.setQueryData(["anime", animeId, "progress"], data);
      void client.invalidateQueries({ queryKey: ["me", "progress"] });
      void client.invalidateQueries({ queryKey: ["me", "continue"] });
    },
  });
}

export function useAchievements(enabled = true) {
  return useQuery({
    queryKey: ["me", "achievements"],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<EarnedAchievement[]>("/me/achievements", { signal }),
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      apiRequest<MyProfile>("/me/profile", { method: "PATCH", body: input }),
    onSuccess: (data) => {
      client.setQueryData(["me", "profile"], data);
    },
  });
}

export function useSetUsername() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (username: string) =>
      apiRequest<MyProfile>("/me/username", { method: "PUT", body: { username } }),
    onSuccess: (data) => client.setQueryData(["me", "profile"], data),
  });
}

export function useUploadAvatar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (dataUrl: string) =>
      apiRequest<{ avatarUrl: string }>("/me/avatar", {
        method: "POST",
        body: { dataUrl },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["me", "profile"] });
    },
  });
}

export function useLogSession() {
  return useMutation({
    mutationFn: (input: {
      animeId: number;
      episode: number;
      seconds: number;
      startedAt: string;
    }) => apiRequest<void>("/me/session", { method: "POST", body: input }),
  });
}

export function useComments(animeId: number, query: CommentQuery) {
  return useQuery({
    queryKey: ["comments", animeId, query],
    queryFn: ({ signal }) =>
      apiRequest<{ comments: Comment[]; count: number }>(
        `/anime/${animeId}/comments`,
        { signal, query: { ...query } },
      ),
    placeholderData: (prev) => prev,
  });
}

export function useCreateComment(animeId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      apiRequest<Comment>("/comments", { method: "POST", body: input }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["comments", animeId] });
    },
  });
}

export function useEditComment(animeId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      apiRequest<Comment>(`/comments/${id}`, { method: "PATCH", body: { body } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["comments", animeId] });
    },
  });
}

export function useDeleteComment(animeId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/comments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["comments", animeId] });
    },
  });
}

export function useVoteComment(animeId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: -1 | 0 | 1 }) =>
      apiRequest<Comment>(`/comments/${id}/vote`, {
        method: "POST",
        body: { value },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["comments", animeId] });
    },
  });
}

import type { ContinueWatchingItem } from "@animeshadow/shared";

export function useContinueWatching(enabled = true) {
  return useQuery({
    queryKey: ["me", "continue"],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ items: ContinueWatchingItem[] }>("/me/continue", { signal }),
  });
}

import type { RecommendationResponse } from "@animeshadow/shared";

export function useGenrePreferences(enabled = true) {
  return useQuery({
    queryKey: ["me", "genre-preferences"],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ genreIds: number[] }>("/me/genre-preferences", { signal }).then(
        (r) => r.genreIds,
      ),
  });
}

export function useSetGenrePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (genreIds: number[]) =>
      apiRequest<{ genreIds: number[] }>("/me/genre-preferences", {
        method: "PUT",
        body: { genreIds },
      }).then((r) => r.genreIds),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["me", "genre-preferences"] });
      void client.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}

export function useHomeRecommendations(enabled = true) {
  return useQuery({
    queryKey: ["recommendations", "home"],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<RecommendationResponse>("/recommendations/home", { signal }),
    staleTime: 5 * 60_000,
  });
}

export function useSimilarAnime(animeId: number, enabled = true) {
  return useQuery({
    queryKey: ["recommendations", "similar", animeId],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<RecommendationResponse>(`/anime/${animeId}/similar`, { signal }),
    staleTime: 5 * 60_000,
  });
}
