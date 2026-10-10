import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Which upstream calls can wait.
 *
 * The catalogue's own upkeep — the warm-up passes, filling in a synopsis a
 * listing turned out to be missing — goes through the same rate-limited
 * upstream clients as the requests a visitor is waiting on. In one shared
 * first-come queue, a catalogue page could sit behind two dozen detail
 * fetches it had itself just scheduled: fifteen seconds for page two.
 *
 * Work started inside `inBackground` is marked, through every await it
 * makes, so a client can serve everything else first. Nothing to pass down,
 * no signature to change: the mark travels with the async context.
 */
const lane = new AsyncLocalStorage<"background">();

export function inBackground<T>(task: () => Promise<T>): Promise<T> {
  return lane.run("background", task);
}

export function isBackground(): boolean {
  return lane.getStore() === "background";
}
