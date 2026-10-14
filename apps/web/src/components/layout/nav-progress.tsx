import { useEffect, useState } from "react";
import { useNavigation } from "react-router-dom";

/**
 * A thin bar across the top while the next page is on its way: it appears
 * only if the wait passes 120 ms (no flicker on a fast step), creeps
 * towards the end, then fills and fades when the page is there.
 */
export function NavProgress() {
  const busy = useNavigation().state !== "idle";
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (busy) {
      setDone(false);
      const t = setTimeout(() => setShown(true), 120);
      return () => clearTimeout(t);
    }
    if (!shown) return;
    setDone(true);
    const t = setTimeout(() => {
      setShown(false);
      setDone(false);
    }, 380);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);
  if (!shown) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px]">
      <div className={done ? "nav-progress nav-progress-done" : "nav-progress"} />
    </div>
  );
}
