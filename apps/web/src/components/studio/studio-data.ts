import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export const STUDIO_PATH = "/studio/hon-kon";
export type StudioVideo = {
  id: string;
  title: string;
  image: string | null;
  stream?: string;
  youtubeId?: string;
  sourceUrl?: string;
  episodes?: number[];
};
export type StudioIndex = {
  pending: boolean;
  updatedAt: string | null;
  unavailable: boolean;
  indexed: number;
  videos: StudioVideo[];
  uploads?: StudioVideo[];
};
export type StudioAnime = {
  id: number;
  slug: string;
  title: string;
  titleLocalized: string | null;
  imageUrl: string | null;
  imageLargeUrl: string | null;
  bannerImage: string | null;
  year: number | null;
  episodes: number | null;
  airing: string;
  availableEpisodes: number;
  episodeNumbers: number[];
};
export function useStudioCatalog() {
  return useQuery({
    queryKey: ["studio", "hon-kon"],
    queryFn: ({ signal }) =>
      apiRequest<{ releases: StudioAnime[]; index?: StudioIndex }>("/studios/hon-kon", {
        signal,
      }),
    staleTime: 5 * 60_000,
    retry: 1,
    refetchInterval: (query) => (query.state.data?.index?.pending ? 5000 : false),
  });
}
