/** Site URLs use an immutable catalogue ID followed by an optional display slug. */
export function animeIdFromReference(reference: number | string): number | null {
  const match =
    typeof reference === "number"
      ? null
      : /^(\d+)(?:-[\p{L}\p{N}_-]+)?$/u.exec(reference);
  const id = typeof reference === "number" ? reference : match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}
