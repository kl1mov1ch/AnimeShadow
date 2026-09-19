import type {
  AdminCommentQuery,
  AdminCommentSummary,
  AdminOverview,
  AdminUpdateUserInput,
  AdminUserQuery,
  AdminUserSummary,
  AnimeDetail,
  AnimeOpening,
  AnimeStats,
  AnimeThemes,
  AnimeSummary,
  Character,
  CharacterDetail,
  DeleteAccountInput,
  DiscoverResponse,
  ForgotPasswordInput,
  FrameSearchResponse,
  FranchiseEntry,
  Genre,
  LibraryEntry,
  LibraryStatus,
  LibrarySummary,
  Paginated,
  RecommendationItem,
  ResetPasswordInput,
  SmartSearchResponse,
  UpsertLibraryInput,
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
  franchise: (id: number) => ["anime", id, "franchise"] as const,
  animeStats: (id: number) => ["anime", id, "stats"] as const,
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
  hasCustomPlayer?: boolean;
  studio?: string;
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

/**
 * `fast` (default true) is the header/typeahead mode: title-only, capped
 * latency. Full search-result pages (browse.tsx) want `fast: false` — the
 * richer character/studio/mood/synopsis lenses cost more but the visitor
 * is already committed to a results page, not typing into a dropdown.
 */
export function useSmartSearch(q: string, enabled = true, fast = true) {
  const { locale } = useLocale();
  const term = q.trim();
  return useQuery({
    queryKey: ["search", locale, term, fast],
    enabled: enabled && term.length >= 2,
    queryFn: ({ signal }) =>
      apiRequest<SmartSearchResponse>("/search", {
        signal,
        query: { q: term, lang: locale, fast },
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

/**
 * The one definition of how a title page's data is fetched and keyed. Shared
 * by useAnime and by the hover prefetch on cards: if the two ever built the
 * key even slightly differently, a prefetch would land in a cache entry the
 * page never reads, and cost a request for nothing.
 */
export function animeQueryOptions(idOrSlug: number | string, locale: string) {
  const key = String(idOrSlug);
  const numeric = typeof idOrSlug === "number" || /^\d+$/.test(key);
  const path = numeric ? `/anime/${key}` : `/anime/by-slug/${encodeURIComponent(key)}`;
  return {
    queryKey: ["anime", key, locale] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiRequest<AnimeDetail>(path, { signal, query: { lang: locale } }),
    staleTime: 10 * 60_000,
  };
}

export function useAnime(idOrSlug: number | string) {
  const { locale } = useLocale();
  return useQuery(animeQueryOptions(idOrSlug, locale));
}

/**
 * Audience counts from MAL (via Jikan) for one title. Long stale time —
 * these move slowly, and the endpoint answers null rather than failing
 * when the upstream is down, so a miss costs the page nothing.
 */
export function useAnimeStats(id: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.animeStats(id),
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ stats: AnimeStats | null }>(`/anime/${id}/stats`, { signal }).then(
        (r) => r.stats,
      ),
    staleTime: 60 * 60_000,
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

/**
 * A purely decorative reaction gif (nekos.best, proxied) for spots with no
 * real anime/character to show. Cached per category for the session — no
 * need to reroll on every re-render, just when a genuinely different empty
 * state appears.
 */
export function useReactionGif(category: string, enabled = true) {
  return useQuery({
    queryKey: ["reaction-gif", category],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ url: string; category: string }>("/fun/reaction", {
        signal,
        query: { category },
      }),
    staleTime: Infinity,
    retry: 1,
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

export function useFranchise(id: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.franchise(id),
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ items: FranchiseEntry[] }>(`/anime/${id}/franchise`, { signal }).then(
        (r) => r.items,
      ),
    staleTime: 60 * 60_000,
  });
}

/**
 * A title's opening, for use as background motion. Cached hard and shared
 * across every card and hero that asks for the same title: the answer never
 * changes, and a null (the archive has no opening for it) is worth
 * remembering just as much as a hit.
 */
export function useAnimeOpening(id: number, enabled = true) {
  return useQuery({
    queryKey: ["anime", "opening", id],
    enabled: enabled && id > 0,
    queryFn: ({ signal }) =>
      apiRequest<{ opening: AnimeOpening | null }>(`/anime/${id}/opening`, {
        signal,
      }).then((r) => r.opening),
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });
}

/** A title's opening and ending — song titles, artists and audio tracks. */
export function useAnimeThemes(id: number, enabled = true) {
  return useQuery({
    queryKey: ["anime", "themes", id],
    enabled: enabled && id > 0,
    queryFn: ({ signal }) =>
      apiRequest<AnimeThemes>(`/anime/${id}/themes`, { signal }),
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });
}

/**
 * "Which anime is this frame from?" — a one-shot mutation rather than a
 * query: the input is an image the visitor just picked, there is nothing to
 * key a cache on, and re-running it is always a deliberate act.
 */
export function useFrameSearch() {
  return useMutation({
    mutationFn: (dataUrl: string) =>
      apiRequest<FrameSearchResponse>("/search/frame", {
        method: "POST",
        body: { dataUrl },
      }),
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

/** For a comment author who hasn't claimed a username — same data, by id. */
export function usePublicProfileById(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", "by-id", userId],
    enabled: Boolean(userId),
    queryFn: ({ signal }) =>
      apiRequest<PublicProfile>(`/users/${userId}/public-profile`, { signal }),
    staleTime: 60_000,
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

/** Forgets a title entirely — every episode's progress and watch session for it. */
export function useDeleteProgress() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (animeId: number) =>
      apiRequest<void>(`/anime/${animeId}/progress`, { method: "DELETE" }),
    onSuccess: (_data, animeId) => {
      client.removeQueries({ queryKey: ["anime", animeId, "progress"] });
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

/** Swaps to a fresh random reaction gif — the "I'd rather have a gif"
 * counterpart to uploading a photo. No body: the server just rolls one. */
export function useSetRandomAvatar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ avatarUrl: string }>("/me/avatar/random", { method: "POST" }),
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

// -- signup confirmation + password reset ----------------------------------

/** Resends the signup code — unauthenticated (no account exists yet), so
 * the pending signup is addressed by email rather than a bearer token. */
export function useResendRegistration() {
  return useMutation({
    mutationFn: (email: string) =>
      apiRequest<void>("/auth/register/resend", { method: "POST", body: { email } }),
  });
}

/** For accounts created before signup required a code — emails a fresh one. */
export function useResendVerification() {
  return useMutation({
    mutationFn: () => apiRequest<void>("/auth/resend-verification", { method: "POST" }),
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (code: string) =>
      apiRequest<{ user: { emailVerified: boolean } }>("/auth/verify-email", {
        method: "POST",
        body: { code },
      }),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) =>
      apiRequest<void>("/auth/forgot-password", { method: "POST", body: input }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: ResetPasswordInput) =>
      apiRequest<void>("/auth/reset-password", { method: "POST", body: input }),
  });
}

/** Permanently deletes the signed-in account. The frontend's own "type a
 * phrase" step (see DeleteAccountSection in routes/profile.tsx) is a
 * misclick guard; this call itself still requires the current password. */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: (input: DeleteAccountInput) =>
      apiRequest<void>("/auth/me", { method: "DELETE", body: input }),
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

import type { GenrePreferences, RecommendationResponse } from "@animeshadow/shared";

export function useGenrePreferences(enabled = true) {
  return useQuery({
    queryKey: ["me", "genre-preferences"],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<GenrePreferences>("/me/genre-preferences", { signal }).then(
        (r) => r.genreIds,
      ),
  });
}

/** Same endpoint as `useGenrePreferences`, unwrapped differently — the
 * Settings picker needs `remainingEdits` too, to know when to lock itself.
 * A distinct query key from `useGenrePreferences` on purpose: same URL, but
 * each hook's queryFn resolves to a different shape, and query keys are
 * meant to be one shape per key. */
export function useGenrePreferencesStatus(enabled = true) {
  return useQuery({
    queryKey: ["me", "genre-preferences", "status"],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<GenrePreferences>("/me/genre-preferences", { signal }),
  });
}

export function useSetGenrePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (genreIds: number[]) =>
      apiRequest<GenrePreferences>("/me/genre-preferences", {
        method: "PUT",
        body: { genreIds },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["me", "genre-preferences"] });
      void client.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}

export function useLikedAnime(enabled = true) {
  return useQuery({
    queryKey: ["me", "liked-anime"],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ items: AnimeSummary[] }>("/me/liked-anime", { signal }).then(
        (r) => r.items,
      ),
  });
}

export function useLikeAnime() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (animeId: number) =>
      apiRequest<{ liked: boolean }>(`/me/liked-anime/${animeId}`, { method: "PUT" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["me", "liked-anime"] });
      void client.invalidateQueries({ queryKey: ["me", "recommendations-status"] });
      void client.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}

export function useUnlikeAnime() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (animeId: number) =>
      apiRequest<{ liked: boolean }>(`/me/liked-anime/${animeId}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["me", "liked-anime"] });
      void client.invalidateQueries({ queryKey: ["me", "recommendations-status"] });
      void client.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}

/** Whether the account has configured recommendations yet — drives the
 * unobtrusive header nudge (see UserMenu). */
export function useRecommendationsStatus(enabled = true) {
  return useQuery({
    queryKey: ["me", "recommendations-status"],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ configured: boolean }>("/me/recommendations-status", { signal }).then(
        (r) => r.configured,
      ),
    staleTime: 5 * 60_000,
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

// ---------------------------------------------------------------------------
// Admin — all of these hit /admin/*, which the server rejects with 403 for
// anyone whose role isn't ADMIN (see requireAdmin), so `enabled` is left to
// the caller to gate on the viewer's own role.
// ---------------------------------------------------------------------------

export function useAdminOverview(enabled = true) {
  return useQuery({
    queryKey: ["admin", "overview"],
    enabled,
    queryFn: ({ signal }) => apiRequest<AdminOverview>("/admin/overview", { signal }),
    staleTime: 30_000,
  });
}

/** Every filter optional (the server applies its defaults), page required. */
type AdminListParams<Q> = Partial<Omit<Q, "page" | "perPage">> & { page: number };

export function useAdminUsers(params: AdminListParams<AdminUserQuery>, enabled = true) {
  return useQuery({
    queryKey: ["admin", "users", params],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<Paginated<AdminUserSummary>>("/admin/users", { signal, query: params }),
    placeholderData: (prev) => prev,
  });
}

export function useAdminSetUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminUpdateUserInput }) =>
      apiRequest<AdminUserSummary>(`/admin/users/${id}`, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "users"] });
      void client.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });
}

export function useAdminComments(params: AdminListParams<AdminCommentQuery>, enabled = true) {
  return useQuery({
    queryKey: ["admin", "comments", params],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<Paginated<AdminCommentSummary>>("/admin/comments", { signal, query: params }),
    placeholderData: (prev) => prev,
  });
}

export function useAdminDeleteComment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/admin/comments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "comments"] });
    },
  });
}
