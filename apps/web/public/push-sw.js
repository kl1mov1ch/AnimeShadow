/* AnimeShadow push notifications — this worker does nothing else: no
 * caching, no fetch handling (the site itself has no service worker; see
 * main.tsx). It shows "new episode" notifications and opens the episode
 * when one is clicked. Registered with the scope /push/, so it never
 * controls any page. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "AnimeShadow", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "AnimeShadow";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: data.icon || "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const target = new URL(url, self.location.origin);
      for (const client of windows) {
        if (new URL(client.url).origin === target.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) return client.navigate(target.href).catch(() => self.clients.openWindow(target.href));
          return undefined;
        }
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
