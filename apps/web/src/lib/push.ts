import type { NotifySettings } from "@animeshadow/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "./api";
import { getVisitorId } from "./visitor";

const SW_URL = "/push-sw.js";
const SW_SCOPE = "/push/";
const KEY = ["notify-settings"] as const;
const OFFER_KEY = "as:push-offer";

/** Push needs a service worker, the Push API and notifications — and, on an iPhone, the site added to the home screen. */
export function pushSupport(): "ok" | "ios-home-screen" | "unsupported" {
  if (typeof window === "undefined") return "unsupported";
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
async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = (await navigator.serviceWorker.getRegistration(SW_SCOPE)) ?? (await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }));
  if (reg.active) return reg;
  const worker = reg.installing ?? reg.waiting;
  if (worker) {
    await new Promise<void>((resolve) => {
      const done = () => worker.state === "activated" && resolve();
      worker.addEventListener("statechange", done);
      done();
      setTimeout(resolve, 8000);
    });
  }
  return reg;
}

/** This browser's subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "ok") return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
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
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "denied" : "dismissed");
  const publicKey = (await apiRequest<{ publicKey: string | null }>("/push/key")).publicKey;
  if (!publicKey) throw new Error("unavailable");
  const reg = await activeRegistration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
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
  return useQuery({ queryKey: ["push-here"], queryFn: async () => Boolean(await currentSubscription()), staleTime: 60_000 });
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
      mutationFn: () => apiRequest<{ telegram: boolean; push: number }>("/me/notify-test", { method: "POST" }),
    }),
  };
}
