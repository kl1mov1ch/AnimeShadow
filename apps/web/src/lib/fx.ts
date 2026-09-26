const FX = ["glitch", "blur", "slice", "scan", "flip", "chroma", "pop"] as const;

/**
 * Deals a hover effect to a tag (a title or an achievement under a name):
 * a different one from last time, set as `data-fx` so the CSS in
 * index.css (`.fx-tag[data-fx=…]:hover`) plays it once.
 */
export function dealFx(event: React.PointerEvent<HTMLElement>) {
  const el = event.currentTarget;
  const last = el.dataset.fx;
  const pool = FX.filter((fx) => fx !== last);
  el.dataset.fx = pool[Math.floor(Math.random() * pool.length)]!;
}
