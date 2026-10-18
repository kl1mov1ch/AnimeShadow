/**
 * Reviewed differences between catalogue identities and Kodik's layout.
 * Never infer these from similar names: season 0 can contain unrelated extras.
 */
export const KODIK_EPISODE_IDENTITIES: Readonly<
  Record<
    number,
    {
      parentId: number;
      season: string;
      episodes: readonly string[];
      evidence: string;
    }
  >
> = {
  27821: {
    parentId: 22297,
    season: "0",
    episodes: ["1"],
    // The official episode guide identifies the separately catalogued prologue as #00.
    evidence: "https://www.fate-sn.com/ubw/sp/story/",
  },
};

/** Only affected cached sources need to be rebuilt after the numbering fix. */
export function kodikEpisodeIdentityChanged(id: number): boolean {
  return (
    id in KODIK_EPISODE_IDENTITIES ||
    Object.values(KODIK_EPISODE_IDENTITIES).some((entry) => entry.parentId === id)
  );
}
