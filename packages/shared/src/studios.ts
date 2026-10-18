/** Stable provider identity, shared by previews and room source restrictions. */
export type StudioId = "hon-kon";

export function isHonKonSource(source: { id: string; title: string }): boolean {
  return (
    source.id === "kodik:4167" ||
    /^hon[\s-]*kon(?:\s+studio)?$/i.test(source.title.trim())
  );
}

export function sourceBelongsToStudio(
  source: { id: string; title: string },
  studio?: StudioId | null,
): boolean {
  return !studio || isHonKonSource(source);
}
