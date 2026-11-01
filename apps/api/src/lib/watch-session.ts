/** Replays, parallel tabs and a forged start cannot add more than elapsed wall time. */
export function boundedWatchSession(
  input: { startedAt: string; seconds: number },
  previousEnd: Date | null,
  now = new Date(),
) {
  const client = Date.parse(input.startedAt);
  if (!Number.isFinite(client)) return null;
  const start = Math.max(
    client,
    previousEnd?.getTime() ?? 0,
    now.getTime() - 86_400_000,
  );
  const seconds = Math.min(input.seconds, Math.floor((now.getTime() - start) / 1000));
  return seconds >= 15
    ? { seconds, startedAt: new Date(now.getTime() - seconds * 1000), endedAt: now }
    : null;
}
