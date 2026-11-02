import { animeIdFromReference } from "@animeshadow/shared";

/** Display names in numeric-prefix URLs never change the requested identity. */
export function animeRequestIdentity(reference: number | string, locale: string) {
  const id = animeIdFromReference(reference);
  const key = String(id ?? reference);
  return {
    queryKey: ["anime", key, locale] as const,
    path: id != null ? `/anime/${id}` : `/anime/by-slug/${encodeURIComponent(key)}`,
  };
}
