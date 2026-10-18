import { readFile, writeFile, mkdir } from "node:fs/promises";
import sharp from "../apps/api/node_modules/sharp/dist/index.mjs";

const fox = JSON.parse(
  await readFile(
    new URL("../apps/web/src/components/brand/honkon-glyph.json", import.meta.url),
    "utf8",
  ),
);
const root = new URL("../docs/prototypes/", import.meta.url);
await mkdir(root, { recursive: true });

// Preview and GIF share the complete mark and one wordmark composition.
function scene(fox, seconds) {
  const phase = (seconds / 8) * Math.PI * 2;
  const y = Math.sin(phase) * 3;
  const alpha = 0.91 + 0.07 * Math.cos(phase);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><radialGradient id="glow"><stop stop-color="#ff4d6d" stop-opacity="${0.07 + 0.015 * Math.cos(phase)}"/><stop offset="1" stop-color="#090b11" stop-opacity="0"/></radialGradient></defs><rect width="1280" height="720" fill="#090b11"/><ellipse cx="470" cy="360" rx="500" ry="350" fill="url(#glow)"/><g transform="translate(0 ${y})"><path d="${fox.path}" transform="translate(270 206) scale(.105)" fill="none" stroke="#ff718c" stroke-opacity="${alpha}" stroke-width="${fox.strokeWidth}" stroke-linecap="round"/><g fill="#f5f1f5" font-family="Segoe UI,Arial,sans-serif"><text x="563" y="327" font-size="78" font-weight="650" letter-spacing="-2">Hon-Kon</text><text x="566" y="405" font-size="55" font-weight="500" letter-spacing="-1">Studio</text></g></g></svg>`;
}

const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hon-Kon — анимация логотипа</title><style>*{box-sizing:border-box}body{margin:0;min-height:100dvh;background:#090b11;color:#f5f1f5;font:14px system-ui;display:grid;place-items:center;padding:16px}main{width:min(100%,1100px)}canvas,video{display:block;width:100%;height:auto;border-radius:18px}nav{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}button,a{display:inline-flex;align-items:center;min-height:40px;border-radius:10px;padding:10px 16px;background:#27232e;color:#f5f1f5;font:500 13px system-ui;border:1px solid #3a3440;text-decoration:none;cursor:pointer}button:disabled{opacity:.5}video{margin-top:16px}[hidden]{display:none!important}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}</style><main><canvas id="scene" width="1280" height="720" aria-label="Зацикленная анимация логотипа Hon-Kon Studio"></canvas><nav><button id="export">Сохранить видео</button><a id="download" hidden>Скачать видео</a></nav><p id="status" class="sr-only" role="status"></p><video id="movie" hidden controls loop playsinline></video></main><script>
const fox=${JSON.stringify(fox)},createScene=${scene.toString()};
const canvas=document.querySelector('#scene'),ctx=canvas.getContext('2d');let start=performance.now(),recording=false,recordStart=0,recorder,painting=false,lastFrame=0,previousUrl;
async function paint(t){if(painting)return;painting=true;const url=URL.createObjectURL(new Blob([createScene(fox,t)],{type:'image/svg+xml'}));const image=new Image();try{image.src=url;await image.decode();ctx.drawImage(image,0,0);}finally{URL.revokeObjectURL(url);painting=false}}
function loop(now){const elapsed=recording?(now-recordStart)/1000:((now-start)%8000)/1000;if(now-lastFrame>=32){lastFrame=now;void paint(elapsed%8)}if(recording&&elapsed>=8&&recorder?.state==='recording')recorder.stop();requestAnimationFrame(loop)}requestAnimationFrame(loop);
document.querySelector('#export').onclick=()=>{const button=document.querySelector('#export'),status=document.querySelector('#status');button.disabled=true;status.textContent='Создаём видео';try{const mime=['video/mp4;codecs=avc1.42E01E','video/webm;codecs=vp9','video/webm;codecs=vp8'].find(m=>MediaRecorder.isTypeSupported(m));if(!mime)throw Error('Экспорт видео не поддерживается этим браузером');const stream=canvas.captureStream(30),chunks=[];recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=()=>{recording=false;stream.getTracks().forEach(t=>t.stop());if(previousUrl)URL.revokeObjectURL(previousUrl);previousUrl=URL.createObjectURL(new Blob(chunks,{type:mime}));const ext=mime.startsWith('video/mp4')?'mp4':'webm',link=document.querySelector('#download');link.href=previousUrl;link.download='hon-kon-logo-loop.'+ext;link.hidden=false;const movie=document.querySelector('#movie');movie.src=previousUrl;movie.hidden=false;status.textContent='Видео готово';button.disabled=false;};recordStart=performance.now();recording=true;recorder.start(250)}catch(error){status.textContent=error.message;button.disabled=false}};
</script></html>`;
await Promise.all(
  ["hon-kon-logo-loop.html", "hon-kon-logo-prototype.html"].map((name) =>
    writeFile(new URL(name, root), html),
  ),
);
await writeFile(new URL("hon-kon-logo-loop.svg", root), scene(fox, 0));
if (process.argv.includes("--frames")) {
  const frames = new URL(".logo-loop-frames/", root);
  await mkdir(frames, { recursive: true });
  for (let i = 0; i < 120; i++)
    await sharp(Buffer.from(scene(fox, i / 15)))
      .resize(960, 540)
      .png()
      .toFile(
        new URL(`${String(i).padStart(3, "0")}.png`, frames).pathname.replace(
          /^\/(\w:)/,
          "$1",
        ),
      );
}
console.log("Created seamless 8-second studio logo loop; no site video integration.");
