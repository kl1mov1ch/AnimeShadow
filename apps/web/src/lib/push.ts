import type { NotifySettings } from "@animeshadow/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "./api";

const SW_URL = "/push-sw.js";
const SW_SCOPE = "/push/";
const KEY = ["notify-settings"] as const;

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

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  return existing ?? navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
}

/** This browser's subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "ok") return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  return (await reg?.pushManager.getSubscription()) ?? null;
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
  const put = (data: NotifySettings) => {
    client.setQueryData(KEY, data);
    void client.invalidateQueries({ queryKey: ["push-here"] });
  };
  return {
    toggle: useMutation({
      mutationFn: (input: { telegram?: boolean; push?: boolean }) =>
        apiRequest<NotifySettings>("/me/notify-settings", { method: "PATCH", body: input }),
      onSuccess: put,
    }),
    link: useMutation({
      mutationFn: () => apiRequest<{ url: string }>("/me/telegram/link", { method: "POST" }),
    }),
    unlink: useMutation({
      mutationFn: () => apiRequest<NotifySettings>("/me/telegram/link", { method: "DELETE" }),
      onSuccess: put,
    }),
    /** Asks the browser, subscribes, tells the server. */
    enablePush: useMutation({
      mutationFn: async (publicKey: string) => {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error(permission === "denied" ? "denied" : "dismissed");
        const reg = await registration();
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        return apiRequest<NotifySettings>("/me/push/subscribe", { method: "POST", body: { endpoint: json.endpoint, keys: json.keys } });
      },
      onSuccess: put,
    }),
    disablePushHere: useMutation({
      mutationFn: async () => {
        const sub = await currentSubscription();
        if (!sub) return apiRequest<NotifySettings>("/me/notify-settings");
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => undefined);
        return apiRequest<NotifySettings>("/me/push/unsubscribe", { method: "POST", body: { endpoint } });
      },
      onSuccess: put,
    }),
    test: useMutation({
      mutationFn: () => apiRequest<{ telegram: boolean; push: number }>("/me/notify-test", { method: "POST" }),
    }),
  };
}
