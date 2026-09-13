/**
 * Purely informational now — the server already excludes hentai from every
 * response, and excludes R+ ("mild nudity") from every LISTING response
 * unless the viewer has confirmed their age in their profile (see
 * ProfileService/content-guard.ts on the API side). A card can only ever
 * carry an R+ rating here because the viewer is already allowed to see it,
 * so this just decides whether to show the "18+" hint, not whether to.
 */
export function isAdultRating(rating: string | null | undefined): boolean {
  return (rating ?? "").trim().toLowerCase().startsWith("r+");
}
