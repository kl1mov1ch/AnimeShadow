import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "@/lib/query";

/**
 * Applies the theme saved on the account once per session, so a signed-in
 * user gets their own light/dark/system choice back on a new device or
 * browser instead of whatever that browser's local default happens to be.
 * One-shot on purpose — after this, the Settings tab is the only thing that
 * should move the theme, and it already writes back to the account too.
 */
export function ThemeSync() {
  const { status } = useAuth();
  const { data: profile } = useMyProfile(status === "authenticated");
  const { setTheme } = useTheme();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current || !profile?.theme) return;
    applied.current = true;
    setTheme(profile.theme);
  }, [profile?.theme, setTheme]);

  return null;
}
