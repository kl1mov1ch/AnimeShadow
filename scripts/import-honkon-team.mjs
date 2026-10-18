import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "../apps/api/node_modules/sharp/dist/index.mjs";

// Public material from the partner's own team page; no private account access.
const html = await readFile(new URL("../tmp/honkon/about.html", import.meta.url), "utf8").catch(async () => {
  const response = await fetch("https://www.hon-kon.ru/about", { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Hon-Kon team HTTP ${response.status}`);
  return response.text();
});
const decode = (text) =>
  text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
const sections = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((match) => ({
  index: match.index,
  name: decode(match[1]),
}));
const root = new URL("../apps/web/public/studios/hon-kon/team/", import.meta.url);
await mkdir(root, { recursive: true });
const members = [];
const cards = [...html.matchAll(/<div class="group" data-reveal="true">/g)];
for (const [index, match] of cards.entries()) {
  const body = html.slice(
    match.index,
    cards[index + 1]?.index ?? html.indexOf("<footer", match.index),
  );
  const image =
    /<img\s+src="data:image\/(jpeg|png|webp);base64,([^"]+)"\s+alt="([^"]+)"/.exec(
      body,
    );
  const heading = /<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(body);
  if (!image || !heading) continue;
  const name = decode(heading[1]);
  const role = sections.filter((section) => section.index < match.index).at(-1)?.name;
  if (
    !role ||
    !["Глава проекта", "Дабберы", "Сабберы", "Звукорежиссёры"].includes(role)
  )
    continue;
  const key = createHash("sha256").update(image[2]).digest("hex").slice(0, 12);
  const fileName = `${key}.webp`;
  await sharp(Buffer.from(image[2], "base64"))
    .rotate()
    .resize({ width: 480, height: 640, fit: "cover", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(fileURLToPath(new URL(fileName, root)));
  await sharp(Buffer.from(image[2], "base64"))
    .rotate()
    .resize({ width: 960, height: 1280, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 87 })
    .toFile(fileURLToPath(new URL(`full-${fileName}`, root)));
  const links = [
    ...body
      .slice(0, body.indexOf("</h3>"))
      .matchAll(/<a\s+href="([^"]+)"[^>]*aria-label="([^"]+)"/g),
  ].flatMap((link) => {
    const url = new URL(decode(link[1]));
    if (
      !["t.me", "www.youtube.com", "youtube.com", "vk.ru", "vk.com"].includes(
        url.hostname,
      )
    )
      return [];
    // Several public links accidentally contain t.me twice; preserve the actual username.
    if (url.hostname === "t.me") url.pathname = url.pathname.replace(/^\/t\.me\//, "/");
    return [
      {
        label:
          url.hostname === "t.me"
            ? "Telegram"
            : /youtube/.test(url.hostname)
              ? "YouTube"
              : "ВКонтакте",
        url: url.href,
      },
    ];
  });
  const tagline = /<p class="text-\[10px\][^>]*>([\s\S]*?)<\/p>/.exec(body)?.[1];
  const bio = /<p class="mt-3[^>]*>([\s\S]*?)<\/p>/.exec(body)?.[1] ?? "";
  members.push({
    name: name === "Pill0w" ? "White Pill0w" : name,
    role,
    tagline: tagline ? decode(tagline) : null,
    bio: decode(bio),
    image: `/studios/hon-kon/team/${fileName}`,
    fullImage: `/studios/hon-kon/team/full-${fileName}`,
    links,
  });
}
if (members.length < 20) throw new Error(`Incomplete team import: ${members.length}`);
await writeFile(
  new URL("../apps/web/src/components/studio/honkon-team.json", import.meta.url),
  JSON.stringify(members, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    cards: members.length,
    photos: new Set(members.map((m) => m.image)).size,
    names: members.map((m) => m.name),
  }),
);
