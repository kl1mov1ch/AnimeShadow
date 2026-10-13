import { ACHIEVEMENTS } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "./api";

export const SECRET_HINT = "Секретное достижение — как его получить, никто не скажет. Ищи сам.";

export function isSecret(id: string): boolean {
  return ACHIEVEMENTS.some((a) => a.id === id && (a as { secret?: boolean }).secret);
}

export interface SecretRuleInfo {
  id: string;
  condition: string;
  animeId: number;
  episodes: number;
  earnedBy: number;
}

/** The secret rules — only an admin gets them from the server. */
export function useSecretRules() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["admin", "secret-achievements"],
    queryFn: ({ signal }) => apiRequest<{ items: SecretRuleInfo[] }>("/admin/achievements/secret", { signal }).then((r) => r.items),
    enabled: user?.role === "ADMIN",
    staleTime: 10 * 60_000,
  });
}

/**
 * What an achievement's description says to this viewer: a secret one keeps
 * its condition hidden until earned (its flavour line shows then); an admin
 * always sees the rule.
 */
export function useAchievementDesc(id: string, earned: boolean, desc: string): string {
  const { data } = useSecretRules();
  if (!isSecret(id)) return desc;
  const rule = data?.find((r) => r.id === id);
  if (rule) return `${earned ? desc + " " : ""}Условие (видно админам): ${rule.condition}.`;
  return earned ? desc : SECRET_HINT;
}
