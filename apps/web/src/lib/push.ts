import type { NotifySettings } from "@animeshadow/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "./api";
import { getVisitorId } from "./visitor";
import { activePushRegistration, findPushRegistration, subscribeWithCurrentKey, subscriptionUsesKey } from "./push-registration";

const KEY = ["notify-settings"] as const;
const OFFER_KEY = "as:push-offer";

/** Push needs a service worker, the Push API and notifications — and, on an iPhone, the site added to the home screen. */
export function pushSupport(): "ok" | "ios-home-screen" | "unsupported" | "insecure" {
  if (typeof window === "undefined") return "unsupported";
  if (window.isSecureContext === false) return "insecure";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
  if (ios && !standalone) return "ios-home-screen";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "ok";
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * The push worker, registered and active. Not `navigator.serviceWorker.ready`:
 * that waits for a worker controlling *this page*, and ours (scope /push/)
 * never controls any — it would wait forever.
 */
/** This browser's subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "ok") return null;
  const reg = await findPushRegistration(navigator.serviceWorker, window.location.origin);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** What this browser last said to the offer: dismissed it or turned push off, and when. */
export function offerMemory(): { state: "dismissed" | "off"; at: number } | null {
  try {
    const raw = localStorage.getItem(OFFER_KEY);
    return raw ? (JSON.parse(raw) as { state: "dismissed" | "off"; at: number }) : null;
  } catch {
    return null;
  }
}
export function rememberOffer(state: "dismissed" | "off" | null) {
  try {
    if (state) localStorage.setItem(OFFER_KEY, JSON.stringify({ state, at: Date.now() }));
    else localStorage.removeItem(OFFER_KEY);
  } catch {
    // Private mode: asked again next time — fine.
  }
}

/**
 * Asks the browser, subscribes, tells the server — as the account when
 * signed in, as this browser otherwise (the guest hears about new episodes
 * of what it watched; signing in later makes it the account's).
 */
export async function enablePushHere(authed: boolean): Promise<NotifySettings | { ok: true }> {
  const support = pushSupport();
  if (support !== "ok") throw new Error(support);
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "denied" : "dismissed");
  const publicKey = (await apiRequest<{ publicKey: string | null }>("/push/key", { cache: "no-store" })).publicKey;
  if (!publicKey) throw new Error("unavailable");
  const reg = await activePushRegistration(navigator.serviceWorker);
  const sub = await subscribeWithCurrentKey(reg, keyBytes(publicKey), endpoint =>
    apiRequest("/push/unsubscribe", { method: "POST", body: { endpoint } }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const body = { endpoint: json.endpoint, keys: json.keys, visitorId: getVisitorId() };
  rememberOffer(null);
  return authed
    ? apiRequest<NotifySettings>("/me/push/subscribe", { method: "POST", body })
    : apiRequest<{ ok: true }>("/push/subscribe", { method: "POST", body });
}

/** Off in this browser: unsubscribed here and the row deleted on the server; offered again later. */
export async function disablePushHere(): Promise<void> {
  const sub = await currentSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => undefined);
    await apiRequest("/push/unsubscribe", { method: "POST", body: { endpoint } }).catch(() => undefined);
  }
  rememberOffer("off");
}

export function useNotifySettings() {
  const { status } = useAuth();
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => apiRequest<NotifySettings>("/me/notify-settings", { signal }),
    enabled: status === "authenticated",
    staleTime: 30_000,
    // Back from the bot's tab: the menu and settings show "подключён" at once.
    refetchOnWindowFocus: "always",
  });
}

/** Whether this very browser is subscribed (others may be). */
export function useThisBrowserPush() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["push-here", user?.id ?? null], queryFn: async () => {
    const sub = await currentSubscription();
    if (!sub || Notification.permission !== "granted") return false;
    const { publicKey } = await apiRequest<{ publicKey: string | null }>("/push/key", { cache: "no-store" });
    if (!publicKey || !subscriptionUsesKey(sub, keyBytes(publicKey))) return false;
    if (!user) return true;
    const state = await apiRequest<{ registered: boolean; enabled: boolean }>("/me/push/status", { method: "POST", body: { endpoint: sub.endpoint } });
    return state.registered && state.enabled;
  }, staleTime: 30_000, refetchOnWindowFocus: "always" });
}

export function useNotifyActions() {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: KEY });
    void client.invalidateQueries({ queryKey: ["push-here"] });
  };
  const put = (data: NotifySettings) => {
    client.setQueryData(KEY, data);
    void client.invalidateQueries({ queryKey: ["push-here"] });
  };
  return {
    toggle: useMutation({
      mutationFn: (input: { telegram?: boolean; push?: boolean }) =>
        apiRequest<NotifySettings>("/me/notify-settings", { method: "PATCH", body: input }),
      onSuccess: (data, input) => {
        put(data);
        // "Off on every device" also forgets this browser's subscription.
        if (input.push === false) void disablePushHere().then(refresh);
      },
    }),
    link: useMutation({
      mutationFn: () => apiRequest<{ url: string }>("/me/telegram/link", { method: "POST" }),
    }),
    unlink: useMutation({
      mutationFn: () => apiRequest<NotifySettings>("/me/telegram/link", { method: "DELETE" }),
      onSuccess: put,
    }),
    enablePush: useMutation({
      mutationFn: (_publicKey?: string) => enablePushHere(true),
      onSuccess: refresh,
    }),
    disablePushHere: useMutation({
      mutationFn: disablePushHere,
      onSuccess: refresh,
    }),
    test: useMutation({
      mutationFn: (channel?: "all" | "telegram" | "push") => apiRequest<{ telegram: boolean; push: number; telegramError?: string }>("/me/notify-test", { method: "POST", body: { channel: channel ?? "all" } }),
    }),
  };
}
