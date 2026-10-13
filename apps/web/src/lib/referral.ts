import type { ReferralState } from "@animeshadow/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "./api";

const KEY = "animeshadow:ref";

/**
 * A friend's code from the address (?ref=CODE), kept until sign-up — so a
 * friend who looks around first and registers later still counts.
 */
export function captureReferral(): void {
  try {
    const code = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase();
    if (code && /^[A-Z0-9]{4,12}$/.test(code)) localStorage.setItem(KEY, code);
  } catch {
    // No storage: the code can still be typed in by hand.
  }
}

export function readReferral(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function forgetReferral(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Fine.
  }
}

/** The link a friend opens: straight to sign-up, with the code in it. */
export function inviteLink(code: string): string {
  return `${window.location.origin}/register?ref=${code}`;
}

export function useReferrals() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["me", "referrals"],
    queryFn: ({ signal }) => apiRequest<ReferralState>("/referrals/me", { signal }),
    enabled: status === "authenticated",
    staleTime: 60_000,
  });
}

export function useClaimReferral() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (rewardId: string) => apiRequest<ReferralState>("/referrals/claim", { method: "POST", body: { rewardId } }),
    onSuccess: (state) => {
      client.setQueryData(["me", "referrals"], state);
      void client.invalidateQueries({ queryKey: ["me", "profile"] });
      void client.invalidateQueries({ queryKey: ["me", "promo"] });
      void client.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

/** Whose code this is — for the sign-up form's "from <name>". */
export function useReferralCheck(code: string) {
  const clean = code.trim().toUpperCase();
  return useQuery({
    queryKey: ["referral-check", clean],
    queryFn: ({ signal }) =>
      apiRequest<{ valid: boolean; name: string | null }>("/referrals/check", { signal, query: { code: clean } }),
    enabled: /^[A-Z0-9]{4,12}$/.test(clean),
    staleTime: 5 * 60_000,
  });
}
