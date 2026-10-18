import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "../apps/api/node_modules/sharp/dist/index.mjs";

// Reviewed identities: official studio title -> the same catalogue title.
const identities = {
  "serial-78459": 64534,
  "serial-79115": 63293,
  "serial-79094": 64340,
  "serial-78135": 64713,
  "serial-78523": 61578,
  "serial-77788": 62542,
  "serial-77434": 62856,
};
const html = await readFile(
  new URL("../tmp/honkon/releases.html", import.meta.url),
  "utf8",
);
const directory = new URL(
  "../apps/web/public/studios/hon-kon/posters/",
  import.meta.url,
);
await mkdir(directory, { recursive: true });
const imported = {};
for (const card of html.matchAll(
  /<a\b[^>]*href="\/titles\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
)) {
  const id = identities[card[1]];
  if (!id) continue;
  const image = /<img\b[^>]*src="data:image\/[^;]+;base64,([^"]+)"/.exec(card[2]);
  if (!image) continue;
  const buffer = Buffer.from(image[1], "base64");
  for (const width of [240, 480]) {
    await sharp(buffer)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 84 })
      .toFile(fileURLToPath(new URL(`${id}-${width}.webp`, directory)));
  }
  imported[id] = {
    source: `https://www.hon-kon.ru/titles/${card[1]}`,
    image: `/studios/hon-kon/posters/${id}-480.webp`,
  };
}
await writeFile(
  new URL("../apps/web/src/components/studio/honkon-posters.json", import.meta.url),
  JSON.stringify(imported, null, 2) + "\n",
);
console.log(
  `Imported ${Object.keys(imported).length} official Hon-Kon posters in two responsive sizes.`,
);
