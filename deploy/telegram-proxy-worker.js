// A Cloudflare Worker that passes the bot's calls on to the Telegram Bot API —
// for a server whose host blocks api.telegram.org.
//
// 1. dash.cloudflare.com → Workers & Pages → Create → "Hello World" worker,
//    "Edit code", paste this file, Deploy.
// 2. Settings → Variables and Secrets → add a Secret named SECRET with a long
//    random value (e.g. `openssl rand -hex 24` on the server).
// 3. In the server's .env:
//      TELEGRAM_API_URL=https://<worker-name>.<account>.workers.dev/<SECRET>
//    then `systemctl restart animeshadow-api`.
//
// Without the secret in the path the worker answers 404 to everyone, so it
// can't be used as an open proxy. It forwards only /bot… calls, keeps the
// method and body, and waits as long as Telegram's long polling does.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const prefix = `/${env.SECRET}`;
    if (!env.SECRET || !url.pathname.startsWith(`${prefix}/bot`)) {
      return new Response("Not found", { status: 404 });
    }
    const target = `https://api.telegram.org${url.pathname.slice(prefix.length)}${url.search}`;
    return fetch(target, {
      method: request.method,
      headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    });
  },
};
