import { DEFAULT_MOBILE_NAVIGATION, mobileNavigationSchema, normalizeMobileNavigation, type MobileNavigation } from "@animeshadow/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";

function stored(userId: string | undefined): MobileNavigation | undefined {
  if (!userId) return;
  try {
    const raw = JSON.parse(localStorage.getItem(`as:mobile-nav:${userId}`) ?? "null");
    return raw ? normalizeMobileNavigation(raw) : undefined;
  } catch { return; }
}
function remember(userId: string | undefined, value: MobileNavigation) {
  if (userId) try { localStorage.setItem(`as:mobile-nav:${userId}`, JSON.stringify(value)); } catch { /* Server remains the source of truth. */ }
}

export function useMobileNavigation() {
  const { status, user } = useAuth();
  const id = user?.id;
  return useQuery({
    queryKey: ["mobile-navigation", id], enabled: status === "authenticated",
    initialData: () => stored(id), initialDataUpdatedAt: 0,
    queryFn: async ({ signal }) => {
      const result = normalizeMobileNavigation(await apiRequest<MobileNavigation>("/me/navigation", { signal }));
      remember(id, result);
      return result;
    }, select: normalizeMobileNavigation, staleTime: 60_000, retry: 1,
  });
}

export function useSaveMobileNavigation() {
  const { user } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MobileNavigation) => apiRequest<MobileNavigation>("/me/navigation", { method: "PUT", body: mobileNavigationSchema.parse(input) }),
    onSuccess: (value) => {
      remember(user?.id, value);
      client.setQueryData(["mobile-navigation", user?.id], value);
    },
  });
}

export const defaultMobileNavigation = () => ({ buttons: [...DEFAULT_MOBILE_NAVIGATION] });
