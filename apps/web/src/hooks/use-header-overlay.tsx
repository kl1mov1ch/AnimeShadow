import { createContext, useContext, useLayoutEffect } from "react";

/** A portal belongs to the header even though its DOM lives under body. */
export const HeaderOverlayContext = createContext<(() => () => void) | null>(null);
export function useHeaderOverlay(open: boolean) {
  const acquire = useContext(HeaderOverlayContext);
  useLayoutEffect(() => {
    if (open && acquire) return acquire();
  }, [open, acquire]);
}
