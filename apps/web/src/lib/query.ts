import type {
  AdminAnalytics,
  AdminAnalyticsBreakdownGroup,
  AdminAnalyticsBreakdowns,
  AdminAnalyticsHeatmap,
  AdminAnalyticsLive,
  AdminAnalyticsQuery,
  AdminAnalyticsRetention,
  AdminArchiveDetail,
  AdminArchiveMonth,
  AdminOverviewTop,
  CuratedCollection,
  CuratedCollectionDetail,
  AdminSummary,
  AdminTimelinePoint,
  AdminExternalAnalytics,
  AdminVisitor,
  AdminVisitorDetail,
  AdminVisitorsQuery,
  AdminCommentQuery,
  AdminCommentSummary,
  AdminMonitoring,
  CollectionComment,
  CollectionDetail,
  CollectionInput,
  CollectionLimit,
  CollectionQuery,
  CollectionStats,
  CollectionSummary,
  MyCollectionsStats,
  AdminMonitoringRange,
  AdminOverview,
  AdminUpdateUserInput,
  AdminUserQuery,
  AdminUserDetail,
  AdminUserSummary,
  AnimeDetail,
  AnimeStats,
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
  SearchScope,
  SearchPulse,
  SmartSearchResponse,
  SocialSummary,
  FollowKind,
  UserCard,
  WallPage,
  WallPost,
  FriendEvent,
  UpsertLibraryInput,
  WatchResponse,
} from "@animeshadow/shared";
import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useLocale } from "@/i18n";
import { apiRequest } from "./api.js";
import { pickGif, useGifLibrary } from "./gifs";

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
  rating?: string;
  maxScore?: number;
  excludeGenres?: number[];
  yearFrom?: number;
  yearTo?: number;
  episodesMin?: number;
  episodesMax?: number;
  hideListed?: boolean;
  /** Titles with no player too — off by default: the catalogue shows what can be watched. */
  allTitles?: boolean;
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

export function useGenres(enabled = true) {
  return useQuery({
    queryKey: queryKeys.genres,
    enabled,
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
export function useSmartSearch(q: string, enabled = true, fast = true, scope: SearchScope = "all") {
  const { locale } = useLocale();
  const term = q.trim();
  return useQuery({
    queryKey: ["search", locale, term, fast, scope],
    enabled: enabled && term.length >= 2,
    queryFn: ({ signal }) =>
      apiRequest<SmartSearchResponse>("/search", {
        signal,
        query: { q: term, lang: locale, fast, scope },
      }),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}

export interface TrendingPick {
  id: number;
  slug: string;
  title: string;
  titleLocalized: string | null;
  imageUrl: string | null;
  type: AnimeSummary["type"];
  year: number | null;
  score: number | null;
}

/** What the empty search window offers: a few titles being watched now. */
/** What the empty search window shows: searches now, titles watched, top genres. */
export function useSearchPulse(enabled: boolean) {
  const { locale } = useLocale();
  return useQuery({
    queryKey: ["search", "pulse", locale],
    enabled,
    staleTime: 2 * 60_000,
    queryFn: ({ signal }) => apiRequest<SearchPulse>("/search/pulse", { signal, query: { lang: locale } }),
  });
}

/** Notes a search someone made — on Enter or on a result picked. Never waited for. */
export function logSearch(term: string): void {
  const q = term.trim();
  if (q.length < 2 || q.length > 60) return;
  void apiRequest<void>("/search/log", { method: "POST", body: { term: q } }).catch(() => undefined);
}

export function useSearchTrending(enabled: boolean) {
  const { locale } = useLocale();
  return useQuery({
    queryKey: ["search-trending", locale],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ items: TrendingPick[] }>("/search/trending", { signal, query: { lang: locale } }).then((r) => r.items),
    staleTime: 10 * 60_000,
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
          allTitles: undefined,
          hasPlayer: params.hasPlayer || !params.allTitles ? true : undefined,
          genres: params.genres?.length ? params.genres.join(",") : undefined,
          excludeGenres: params.excludeGenres?.length ? params.excludeGenres.join(",") : undefined,
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
 * Audience counts from Shikimori for one title. Long stale time —
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
/**
 * A reaction gif: from the site's own library when it has the category
 * (instant, cached a year), from the live endpoint only otherwise.
 */
export function useReactionGif(category: string, enabled = true) {
  const { data: library, isFetched } = useGifLibrary();
  const own = pickGif(library, category);
  const live = useQuery({
    queryKey: ["reaction-gif", category],
    // Asked only once the library has said it has nothing for this one.
    enabled: enabled && !own && (isFetched || library !== undefined),
    queryFn: ({ signal }) =>
      apiRequest<{ url: string; category: string }>("/fun/reaction", {
        signal,
        query: { category },
      }),
    staleTime: Infinity,
    retry: 1,
  });
  if (own) return { ...live, data: { url: own, category }, isPending: false };
  return live;
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
        // A hard stop rather than a spinner forever: the server gives the
        // outside service 25s, so anything past this has gone wrong somewhere
        // between here and there, and saying so beats waiting.
        signal: AbortSignal.timeout(40_000),
      }),
  });
}

export function useWatchSources(id: number, enabled = true) {
  const client = useQueryClient();
  const query = useQuery<WatchResponse>({
    queryKey: queryKeys.watch(id),
    refetchInterval: (query) => query.state.data?.sourcesPending ? 2000 : false,
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<WatchResponse>(`/anime/${id}/watch`, { signal }),
    staleTime: 30_000,
  });
  return {
    ...query,
    refreshSources: async () => {
      const fresh = await apiRequest<WatchResponse>(`/anime/${id}/watch?refresh=1`, { signal: AbortSignal.timeout(20_000) });
      client.setQueryData(queryKeys.watch(id), fresh);
      return fresh;
    },
  };
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
      // The server moves the list entry along with the episodes — progress,
      // and "watching"/"completed" — so every view of the list refreshes.
      void client.invalidateQueries({ queryKey: ["library"] });
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
    // Read by the achievement toast watcher on every page; ten minutes is
    // plenty for "you just earned something", and the profile refetches
    // on its own.
    staleTime: 10 * 60_000,
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

/** The wide picture behind the profile header — a cropped upload. */
export function useUploadBanner() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (dataUrl: string) =>
      apiRequest<{ bannerUrl: string }>("/me/banner", { method: "POST", body: { dataUrl } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["me", "profile"] });
      void client.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

/** A random background from the catalogue's key visuals; says which title. */
export function useSetRandomBanner() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ bannerUrl: string; anime: { id: number; slug: string; title: string } }>(
        "/me/banner/random",
        { method: "POST" },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["me", "profile"] });
      void client.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useRemoveBanner() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>("/me/banner", { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["me", "profile"] });
      void client.invalidateQueries({ queryKey: ["profile"] });
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
    }) => apiRequest<void>("/me/session", { method: "POST", body: input, keepalive: true }),
  });
}

/** Player time from a visitor who isn't signed in — see GuestWatchSession. */
export function logGuestSession(input: {
  animeId: number;
  episode: number;
  seconds: number;
  startedAt: string;
  visitorId: string;
}): Promise<void> {
  return apiRequest<void>("/guest/session", { method: "POST", body: input, keepalive: true });
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

export function useReportComment() {
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; reason: string; note?: string }) =>
      apiRequest<{ already: boolean }>(`/comments/${id}/report`, { method: "POST", body: input }),
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
    staleTime: 30 * 60_000,
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
    staleTime: 30 * 60_000,
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

/** The analytics tab's numbers and curve, for one set of filters; the last
 *  answer stays on screen while the next one loads. Not refetched on a
 *  timer — only "who is on the site now" is (useAdminAnalyticsLive). */
export function useAdminAnalytics(params: Partial<AdminAnalyticsQuery>) {
  return useQuery({
    queryKey: ["admin", "analytics", params],
    queryFn: ({ signal }) => apiRequest<AdminAnalytics>("/admin/analytics", { signal, query: params }),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}

/** Five minutes of who is on the site — one cheap query, every 30 seconds. */
export function useAdminAnalyticsLive(params: Partial<AdminAnalyticsQuery>) {
  return useQuery({
    queryKey: ["admin", "analytics-live", params],
    queryFn: ({ signal }) => apiRequest<AdminAnalyticsLive>("/admin/analytics/live", { signal, query: params }),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}

/** The analytics blocks below the curve, each its own request, made only
 *  once the block is on screen (`enabled`). */
export function useAdminHeatmap(params: Partial<AdminAnalyticsQuery>, enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "heatmap", params],
    enabled,
    queryFn: ({ signal }) => apiRequest<AdminAnalyticsHeatmap>("/admin/analytics/heatmap", { signal, query: params }),
    placeholderData: (previous) => previous,
    staleTime: 5 * 60_000,
  });
}

export function useAdminBreakdowns(
  params: Partial<AdminAnalyticsQuery>,
  group: AdminAnalyticsBreakdownGroup,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["admin", "breakdowns", group, params],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<Partial<AdminAnalyticsBreakdowns>>("/admin/analytics/breakdowns", { signal, query: { ...params, group } }),
    placeholderData: (previous) => previous,
    staleTime: 5 * 60_000,
  });
}

export function useAdminRetention(params: Partial<AdminAnalyticsQuery>, enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "retention", { ...params, to: undefined }],
    enabled,
    queryFn: ({ signal }) => apiRequest<AdminAnalyticsRetention>("/admin/analytics/retention", { signal, query: params }),
    placeholderData: (previous) => previous,
    staleTime: 30 * 60_000,
  });
}

/** The daily rollups by month — everything older than the raw page views. */
export function useAdminArchive(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "archive"],
    enabled,
    queryFn: ({ signal }) => apiRequest<AdminArchiveMonth[]>("/admin/analytics/archive", { signal }),
    staleTime: 10 * 60_000,
  });
}

export function useAdminArchiveMonth(month: string | null) {
  return useQuery({
    queryKey: ["admin", "archive", month],
    enabled: month != null,
    queryFn: ({ signal }) => apiRequest<AdminArchiveDetail>(`/admin/analytics/archive/${month}`, { signal }),
    staleTime: 10 * 60_000,
  });
}

export function useAdminVisitors(params: Partial<AdminVisitorsQuery>) {
  return useQuery({
    queryKey: ["admin", "visitors", params],
    queryFn: ({ signal }) => apiRequest<Paginated<AdminVisitor>>("/admin/analytics/visitors", { signal, query: params }),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

export function useAdminVisitor(id: string | null) {
  return useQuery({
    queryKey: ["admin", "visitor", id],
    enabled: id != null,
    queryFn: ({ signal }) => apiRequest<AdminVisitorDetail>(`/admin/analytics/visitors/${encodeURIComponent(id!)}`, { signal }),
  });
}

export function useAdminExternalAnalytics() {
  return useQuery({
    queryKey: ["admin", "external-analytics"],
    queryFn: ({ signal }) => apiRequest<AdminExternalAnalytics>("/admin/analytics/external", { signal }),
    staleTime: 5 * 60_000,
  });
}

/** The site's own themed collections, and the one of the day. */
export function useCuratedCollections() {
  return useQuery({
    queryKey: ["collections", "curated"],
    queryFn: ({ signal }) =>
      apiRequest<{ daily: string | null; items: CuratedCollection[] }>("/collections/curated", { signal }),
    staleTime: 10 * 60_000,
  });
}

export function useCuratedCollection(slug: string) {
  return useQuery({
    queryKey: ["collections", "curated", slug],
    queryFn: ({ signal }) => apiRequest<CuratedCollectionDetail>(`/collections/curated/${slug}`, { signal }),
    staleTime: 10 * 60_000,
  });
}

/** The admin page's header: tab badges and today's pills — a few counts. */
export function useAdminSummary(enabled = true) {
  return useQuery({
    queryKey: ["admin", "summary"],
    enabled,
    queryFn: ({ signal }) => apiRequest<AdminSummary>("/admin/summary", { signal }),
    staleTime: 60_000,
  });
}

/** The overview's numbers and registered/guests split. */
export function useAdminOverview(enabled = true) {
  return useQuery({
    queryKey: ["admin", "overview"],
    enabled,
    queryFn: ({ signal }) => apiRequest<AdminOverview>("/admin/overview", { signal }),
    staleTime: 60_000,
  });
}

/** The overview's 30-day curve — loaded when it comes into view. */
export function useAdminOverviewTimeline(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "overview-timeline"],
    enabled,
    queryFn: ({ signal }) => apiRequest<AdminTimelinePoint[]>("/admin/overview/timeline", { signal }),
    staleTime: 5 * 60_000,
  });
}

/** The overview's lists — loaded when they come into view. */
export function useAdminOverviewTop(enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "overview-top"],
    enabled,
    queryFn: ({ signal }) => apiRequest<AdminOverviewTop>("/admin/overview/top", { signal }),
    staleTime: 5 * 60_000,
  });
}

/** Live curves from Prometheus, via the API. Refreshed every 30 seconds
 *  while the tab is open; the previous range stays on screen while the next
 *  one loads. */
export function useAdminMonitoring(range: AdminMonitoringRange) {
  return useQuery({
    queryKey: ["admin", "monitoring", range],
    queryFn: ({ signal }) => apiRequest<AdminMonitoring>("/admin/monitoring", { signal, query: { range } }),
    refetchInterval: 30_000,
    staleTime: 15_000,
    placeholderData: (previous) => previous,
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
      void client.invalidateQueries({ queryKey: ["admin", "user"] });
      void client.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });
}

/** Everything about one account, for the admin user panel. */
export function useAdminUser(id: string | null) {
  return useQuery({
    queryKey: ["admin", "user", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => apiRequest<AdminUserDetail>(`/admin/users/${id}`, { signal }),
  });
}

/** Sets a new password the user can sign in with right away. */
export function useAdminSetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiRequest<{ loginEmail: string }>(`/admin/users/${id}/password`, {
        method: "POST",
        body: { password },
      }),
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

export function useAdminDismissCommentReports() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ dismissed: number }>(`/admin/comments/${id}/dismiss-reports`, { method: "POST" }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin", "comments"] }),
  });
}

export function useAdminDeleteComment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/admin/comments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "comments"] });
      void client.invalidateQueries({ queryKey: ["admin", "user"] });
    },
  });
}

import type {
  AdminReportGroup,
  AdminReportQuery,
  AdminResolveReportsInput,
  AdminResolveReportsResult,
  CreateProfileReportInput,
  ProfileReportResult,
} from "@animeshadow/shared";

export function useAdminReports(params: AdminListParams<AdminReportQuery>, enabled = true) {
  return useQuery({
    queryKey: ["admin", "reports", params],
    enabled,
    queryFn: ({ signal }) => apiRequest<Paginated<AdminReportGroup>>("/admin/reports", { signal, query: params }),
    placeholderData: (prev) => prev,
  });
}

export function useAdminResolveReports() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ targetId, input }: { targetId: string; input: AdminResolveReportsInput }) =>
      apiRequest<AdminResolveReportsResult>(`/admin/reports/${targetId}/resolve`, { method: "POST", body: input }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "reports"] });
      void client.invalidateQueries({ queryKey: ["admin", "summary"] });
      void client.invalidateQueries({ queryKey: ["admin", "user"] });
    },
  });
}

/** A complaint about someone's profile, for the admins. */
export function useReportProfile(userId: string) {
  return useMutation({
    mutationFn: (input: CreateProfileReportInput) =>
      apiRequest<ProfileReportResult>(`/users/${userId}/report`, { method: "POST", body: input }),
  });
}

/* ---------------- profile history & list portability ---------------- */

import type {
  FeedEvent,
  LibraryImportInput,
  TasteCompare,
  YearRecap,
} from "@animeshadow/shared";

export interface PublicListEntry {
  anime: AnimeSummary;
  status: LibraryStatus;
  score: number | null;
  progress: number;
  updatedAt: string;
}

export interface WatchingNow {
  anime: AnimeSummary;
  episode: number;
  positionSeconds: number;
  completed: boolean;
  at: string;
}

export function useUserYear(userId: string | undefined, year: number, enabled = true) {
  return useQuery({
    queryKey: ["user", userId, "year", year],
    enabled: Boolean(userId) && enabled,
    queryFn: ({ signal }) => apiRequest<YearRecap>(`/users/${userId}/year`, { signal, query: { year } }),
    staleTime: 5 * 60_000,
  });
}

export function useUserFeed(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["user", userId, "feed"],
    enabled: Boolean(userId) && enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ items: FeedEvent[] }>(`/users/${userId}/feed`, { signal }).then((r) => r.items),
    staleTime: 60_000,
  });
}

export function useUserList(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["user", userId, "list"],
    enabled: Boolean(userId) && enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ items: PublicListEntry[] }>(`/users/${userId}/list`, { signal }).then((r) => r.items),
    staleTime: 60_000,
  });
}

export function useUserWatching(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["user", userId, "watching"],
    enabled: Boolean(userId) && enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ items: WatchingNow[] }>(`/users/${userId}/watching`, { signal }).then((r) => r.items),
    staleTime: 60_000,
  });
}

export function useTasteCompare(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["user", userId, "compare"],
    enabled: Boolean(userId) && enabled,
    queryFn: ({ signal }) => apiRequest<TasteCompare>(`/users/${userId}/compare`, { signal }),
    staleTime: 5 * 60_000,
  });
}

export function useImportLibrary() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: LibraryImportInput) =>
      apiRequest<{ total: number; imported: number; skipped: number }>("/me/library/import", {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["library"] });
      void client.invalidateQueries({ queryKey: ["me"] });
      void client.invalidateQueries({ queryKey: ["user"] });
    },
  });
}

// -- collections ---------------------------------------------------------

type CollectionListParams = Partial<Omit<CollectionQuery, "page">> & { page?: number };

export function useCollections(params: CollectionListParams) {
  return useQuery({
    queryKey: ["collections", "list", params],
    queryFn: ({ signal }) =>
      apiRequest<Paginated<CollectionSummary>>("/collections", { signal, query: { ...params } }),
    placeholderData: (previous) => previous,
  });
}

export function useCollection(id: string | undefined) {
  return useQuery({
    queryKey: ["collections", "one", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => apiRequest<CollectionDetail>(`/collections/${id}`, { signal }),
  });
}

export function useUserCollections(userId: string | undefined) {
  return useQuery({
    queryKey: ["collections", "user", userId],
    enabled: Boolean(userId),
    queryFn: ({ signal }) =>
      apiRequest<{ items: CollectionSummary[]; limit: CollectionLimit | null }>(`/users/${userId}/collections`, { signal }),
  });
}

export function useMyCollectionsStats(enabled = true) {
  return useQuery({
    queryKey: ["collections", "my-stats"],
    enabled,
    queryFn: ({ signal }) => apiRequest<MyCollectionsStats>("/me/collections/stats", { signal }),
  });
}

export function useCollectionStats(id: string | undefined) {
  return useQuery({
    queryKey: ["collections", "stats", id],
    enabled: Boolean(id),
    queryFn: ({ signal }) => apiRequest<CollectionStats>(`/collections/${id}/stats`, { signal }),
  });
}

/** Create (no id) or replace (with id) a collection. */
export function useSaveCollection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CollectionInput }) =>
      apiRequest<CollectionDetail>(id ? `/collections/${id}` : "/collections", {
        method: id ? "PUT" : "POST",
        body: input,
      }),
    onSuccess: (saved) => {
      client.setQueryData(["collections", "one", saved.id], saved);
      void client.invalidateQueries({ queryKey: ["collections", "list"] });
      void client.invalidateQueries({ queryKey: ["collections", "user"] });
      void client.invalidateQueries({ queryKey: ["collections", "my-stats"] });
    },
  });
}

export function useDeleteCollection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/collections/${id}`, { method: "DELETE" }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["collections"] }),
  });
}

/** A heart on a collection: shown at once, the server catches up. */
export function useLikeCollection(id: string) {
  const client = useQueryClient();
  const key = ["collections", "one", id];
  return useMutation({
    mutationFn: (on: boolean) =>
      apiRequest<{ liked: boolean; likeCount: number }>(`/collections/${id}/like`, { method: on ? "PUT" : "DELETE" }),
    onMutate: (on) => {
      const before = client.getQueryData<CollectionDetail>(key);
      if (before) client.setQueryData<CollectionDetail>(key, { ...before, liked: on, likeCount: Math.max(0, before.likeCount + (on ? 1 : -1)) });
      return { before };
    },
    onError: (_e, _on, ctx) => ctx?.before && client.setQueryData(key, ctx.before),
    onSuccess: (r) => client.setQueryData<CollectionDetail>(key, (old) => (old ? { ...old, ...r } : old)),
  });
}

/** Keeping a collection in one's saved list. */
export function useFavoriteCollection(id: string) {
  const client = useQueryClient();
  const key = ["collections", "one", id];
  return useMutation({
    mutationFn: (on: boolean) => apiRequest<{ favorited: boolean }>(`/collections/${id}/favorite`, { method: on ? "PUT" : "DELETE" }),
    onMutate: (on) => {
      const before = client.getQueryData<CollectionDetail>(key);
      if (before) client.setQueryData<CollectionDetail>(key, { ...before, favorited: on });
      return { before };
    },
    onError: (_e, _on, ctx) => ctx?.before && client.setQueryData(key, ctx.before),
    onSettled: () => void client.invalidateQueries({ queryKey: ["collections", "list"] }),
  });
}

export function useRateCollection(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (value: number) =>
      apiRequest<{ ratingAvg: number | null; ratingCount: number; myRating: number }>(`/collections/${id}/rating`, {
        method: "PUT",
        body: { value },
      }),
    onSuccess: (r) =>
      client.setQueryData<CollectionDetail>(["collections", "one", id], (old) => (old ? { ...old, ...r } : old)),
  });
}

export function useCollectionComments(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["collections", "comments", id],
    enabled: Boolean(id) && enabled,
    queryFn: ({ signal }) => apiRequest<CollectionComment[]>(`/collections/${id}/comments`, { signal }),
  });
}

export function useAddCollectionComment(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; parentId?: string }) =>
      apiRequest<CollectionComment>(`/collections/${id}/comments`, { method: "POST", body: input }),
    onSuccess: (comment) => {
      // Comments come oldest first; the page orders threads itself.
      client.setQueryData<CollectionComment[]>(["collections", "comments", id], (old) => [...(old ?? []), comment]);
      client.setQueryData<CollectionDetail>(["collections", "one", id], (old) =>
        old ? { ...old, commentCount: old.commentCount + 1 } : old,
      );
    },
  });
}

export function useDeleteCollectionComment(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      apiRequest<void>(`/collections/${id}/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: (_, commentId) => {
      client.setQueryData<CollectionComment[]>(["collections", "comments", id], (old) =>
        (old ?? []).filter((c) => c.id !== commentId),
      );
      client.setQueryData<CollectionDetail>(["collections", "one", id], (old) =>
        old ? { ...old, commentCount: Math.max(0, old.commentCount - 1) } : old,
      );
    },
  });
}

/** Counted once per visitor per day on the server. */
export function recordCollectionView(id: string, visitorId: string): Promise<void> {
  return apiRequest<void>(`/collections/${id}/view`, { method: "POST", body: { visitorId } });
}

// ---------------------------------------------------------------------------
// People: following, friends, the profile wall, friends' activity
// ---------------------------------------------------------------------------

export function useSocial(userId: string | undefined) {
  return useQuery({
    queryKey: ["social", userId],
    enabled: Boolean(userId),
    queryFn: ({ signal }) => apiRequest<SocialSummary>(`/users/${userId}/social`, { signal }),
    staleTime: 30_000,
  });
}

/** Follow or unfollow; the counts and the button change at once. */
export function useFollow(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (follow: boolean) =>
      apiRequest<SocialSummary>(`/users/${userId}/follow`, { method: follow ? "POST" : "DELETE" }),
    onMutate: async (follow) => {
      await client.cancelQueries({ queryKey: ["social", userId] });
      const before = client.getQueryData<SocialSummary>(["social", userId]);
      if (before) {
        client.setQueryData<SocialSummary>(["social", userId], {
          ...before,
          isFollowing: follow,
          followers: Math.max(0, before.followers + (follow ? 1 : -1)),
          friends: before.followsYou ? Math.max(0, before.friends + (follow ? 1 : -1)) : before.friends,
        });
      }
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) client.setQueryData(["social", userId], ctx.before);
    },
    onSuccess: (data) => {
      client.setQueryData(["social", userId], data);
      void client.invalidateQueries({ queryKey: ["people"] });
      void client.invalidateQueries({ queryKey: ["friends-activity"] });
    },
  });
}

export function usePeople(userId: string | undefined, kind: FollowKind, enabled = true) {
  return useQuery({
    queryKey: ["people", userId, kind],
    enabled: Boolean(userId) && enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ items: UserCard[] }>(`/users/${userId}/people`, { signal, query: { kind } }).then((r) => r.items),
    staleTime: 30_000,
  });
}

/** People by nick or name (the search window's "People"). */
export function useSearchPeople(q: string, enabled = true) {
  return useQuery({
    queryKey: ["people", "search", q],
    enabled: enabled && q.trim().replace(/^@+/, "").length >= 2,
    queryFn: ({ signal }) =>
      apiRequest<{ items: UserCard[] }>("/people/search", { signal, query: { q } }).then((r) => r.items),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}

/** Popular and active people of the last two weeks (the search window's people). */
export function usePopularPeople(enabled = true) {
  return useQuery({
    queryKey: ["people", "popular"],
    enabled,
    queryFn: ({ signal }) =>
      apiRequest<{ items: Array<UserCard & { weekHours: number; followers: number }> }>("/people/popular", { signal }).then((r) => r.items),
    staleTime: 5 * 60_000,
  });
}

export function useSuggestedPeople(enabled = true) {
  return useQuery({
    queryKey: ["people", "suggested"],
    enabled,
    queryFn: ({ signal }) => apiRequest<{ items: UserCard[] }>("/people/suggested", { signal }).then((r) => r.items),
    staleTime: 5 * 60_000,
  });
}

export function useWall(userId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["wall", userId],
    enabled: Boolean(userId),
    initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) =>
      apiRequest<WallPage>(`/users/${userId}/wall`, { signal, query: { cursor: pageParam ?? undefined } }),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });
}

export function usePostToWall(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => apiRequest<WallPost>(`/users/${userId}/wall`, { method: "POST", body: { body } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["wall", userId] }),
  });
}

export function useDeleteWallPost(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => apiRequest<void>(`/wall/${postId}`, { method: "DELETE" }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["wall", userId] }),
  });
}

export function useFriendsActivity(enabled = true) {
  return useQuery({
    queryKey: ["friends-activity"],
    enabled,
    queryFn: ({ signal }) => apiRequest<{ items: FriendEvent[] }>("/me/friends/activity", { signal }).then((r) => r.items),
    staleTime: 60_000,
  });
}
