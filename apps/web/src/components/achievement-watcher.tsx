import { useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { useAchievements } from "@/lib/query";

const SNAP_KEY = "animeshadow.ach";

/**
 * Renders nothing; watches the signed-in user's achievements and fires a toast
 * the first time a new one is earned (compared to a local snapshot).
 */
export function AchievementWatcher() {
  const { status } = useAuth();
  const authed = status === "authenticated";
  const { data } = useAchievements(authed);
  const t = useT();

  useEffect(() => {
    if (!authed || !data) return;
    let prev: string[] = [];
    try {
      prev = JSON.parse(localStorage.getItem(SNAP_KEY) ?? "[]");
    } catch {
      /* ignore */
    }
    const now = data.filter((a) => a.earned).map((a) => a.id);
    if (prev.length > 0) {
      for (const id of now.filter((x) => !prev.includes(x))) {
        toast.success(
          t("achievements.toast", {
            name: t(
              `achievements.items.${id}.title` as "achievements.items.critic.title",
            ),
          }),
        );
      }
    }
    try {
      localStorage.setItem(SNAP_KEY, JSON.stringify(now));
    } catch {
      /* ignore */
    }
  }, [authed, data, t]);

  return null;
}
