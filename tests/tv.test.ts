import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { escapeTv, isTvBrowser, tvDestination, tvDocument } from "../apps/api/src/lib/tv-mode.ts";

test("Samsung 2020 is redirected without classifying Samsung phones as televisions", () => {
  assert.ok(isTvBrowser("Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 Chrome/69.0 TV Safari/537.36"));
  assert.equal(isTvBrowser("Mozilla/5.0 (Linux; Android 14; SM-S918B) SamsungBrowser/25 Chrome/121"), false);
  assert.equal(tvDestination("/anime/61469-steel-ball-run?ep=2"), "/tv/anime/61469");
  assert.equal(tvDestination("//external.invalid"), "/tv");
});

test("TV HTML escapes catalogue data and works without module scripts or Tailwind", () => {
  const html = tvDocument('<script>"', "<h1>Каталог</h1>");
  assert.ok(html.includes("&lt;script&gt;&quot;"));
  assert.equal(escapeTv("'<&"), "&#39;&lt;&amp;");
  assert.ok(html.includes('/tv.css?v=1'));
  assert.ok(html.includes('/tv.js?v=1'));
  assert.equal(html.includes('type="module"'), false);
  assert.equal(html.includes("tailwind"), false);
});

test("TV client syntax stays compatible with Chromium 69 and below", () => {
  const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
  // ESLint is a declared workspace dependency; its parser supports an
  // explicit ECMAScript version without relying on hoisted Acorn internals.
  const { parse } = createRequire(require.resolve("eslint"))("espree");
  const source = readFileSync(new URL("../apps/web/public/tv.js", import.meta.url), "utf8");
  assert.doesNotThrow(() => parse(source, { ecmaVersion: 5 }));
  assert.doesNotThrow(() => parse(readFileSync(require.resolve("hls.js/dist/hls.light.min.js"), "utf8"), { ecmaVersion: 2018 }));
});
