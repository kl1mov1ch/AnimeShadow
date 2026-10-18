export const PUSH_WORKER = "/push-sw.js";
export const PUSH_SCOPE = "/push/";

/** getRegistration matches a client URL, so a root worker can also match /push/. */
export async function findPushRegistration(container: ServiceWorkerContainer, origin: string) {
  const registration = await container.getRegistration(new URL(PUSH_SCOPE, origin).href);
  const worker = registration?.active ?? registration?.installing ?? registration?.waiting;
  return registration?.scope === new URL(PUSH_SCOPE, origin).href && worker?.scriptURL === new URL(PUSH_WORKER, origin).href
    ? registration : undefined;
}

/** Never subscribe through the retired root worker or a worker that failed to activate. */
export async function activePushRegistration(container: ServiceWorkerContainer, timeoutMs = 10_000): Promise<ServiceWorkerRegistration> {
  const registration = await container.register(PUSH_WORKER, { scope: PUSH_SCOPE, updateViaCache: "none" });
  if (registration.active?.state === "activated") return registration;
  await new Promise<void>((resolve, reject) => {
    const observed = new Set<ServiceWorker>();
    const finish = (error?: Error) => {
      clearTimeout(timer);
      registration.removeEventListener("updatefound", watch);
      for (const worker of observed) worker.removeEventListener("statechange", check);
      if (error) reject(error); else resolve();
    };
    const check = () => {
      if (registration.active?.state === "activated") finish();
      else if (observed.size && [...observed].every(worker => worker.state === "redundant")) finish(new Error("worker-failed"));
    };
    const watch = () => {
      for (const worker of [registration.installing, registration.waiting, registration.active]) {
        if (worker && !observed.has(worker)) { observed.add(worker); worker.addEventListener("statechange", check); }
      }
      check();
    };
    const timer = setTimeout(() => finish(new Error("worker-timeout")), timeoutMs);
    registration.addEventListener("updatefound", watch);
    watch();
  });
  return registration;
}

export function subscriptionUsesKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const saved = subscription.options?.applicationServerKey;
  if (!saved) return false;
  const bytes = new Uint8Array(saved);
  return bytes.length === key.length && bytes.every((value, index) => value === key[index]);
}

/** Reuse only a live subscription signed with this server's current VAPID key. */
export async function subscribeWithCurrentKey(registration: ServiceWorkerRegistration, key: Uint8Array<ArrayBuffer>, forget: (endpoint: string) => Promise<unknown>) {
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && (!subscriptionUsesKey(subscription, key) || (subscription.expirationTime != null && subscription.expirationTime <= Date.now()))) {
    const endpoint = subscription.endpoint;
    if (!await subscription.unsubscribe()) throw new Error("unsubscribe-failed");
    await forget(endpoint).catch(() => undefined);
    subscription = null;
  }
  return subscription ?? registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

export function pushErrorHint(error: unknown): string {
  const reason = error instanceof Error ? error.message : "";
  const name = error instanceof Error ? error.name : "";
  if (reason === "denied" || name === "NotAllowedError") return "Разрешите уведомления в настройках этого сайта в браузере, затем включите их снова.";
  if (reason === "dismissed") return "Запрос браузера был закрыт. Нажмите «Включить» и разрешите уведомления.";
  if (reason === "unavailable") return "Сервер уведомлений пока не настроен. Попробуйте позже.";
  if (reason === "insecure") return "Откройте сайт по HTTPS: браузер не разрешает push на незащищённом адресе.";
  if (reason === "ios-home-screen") return "Добавьте сайт на экран «Домой» и включите уведомления из установленного приложения.";
  if (reason === "unsupported") return "Этот браузер не поддерживает push. Попробуйте Chrome, Edge, Firefox или установленное приложение Safari.";
  if (reason.startsWith("worker-") || name === "SecurityError") return "Не удалось запустить обработчик уведомлений. Обновите страницу и попробуйте снова.";
  return "Браузер не смог подключиться к службе push. Проверьте сеть, VPN и настройки уведомлений устройства, затем повторите попытку.";
}
