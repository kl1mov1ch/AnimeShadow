/** Replace the boot screen as a region, including nested elements in older builds. */
export function renderShell(shell: string, head: string, body: string): string {
  const root = `<div id="root">${body}</div>`;
  const marked = /<!--\s*app-root:start\s*-->[\s\S]*?<!--\s*app-root:end\s*-->/i;
  const legacy = /<div\s+id=["']root["']\s*>[\s\S]*?<\/div>(?=\s*(?:<script\b|<\/body\s*>))/i;
  return shell
    .replace(/<html[^>]*>/i, () => '<html lang="ru" class="dark">')
    .replace(/<title>[\s\S]*?<\/title>/i, () => "")
    .replace(/<meta\s+name="description"[^>]*>/i, () => "")
    .replace(/<\/head>/i, () => `${head}\n</head>`)
    .replace(marked.test(shell) ? marked : legacy, () => root);
}
