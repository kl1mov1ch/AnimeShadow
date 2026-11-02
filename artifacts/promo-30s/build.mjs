import sharp from '../../node_modules/.pnpm/sharp@0.35.4_@types+node@22.20.1/node_modules/sharp/dist/index.mjs';
import fs from 'node:fs/promises';
const dir=new URL('./',import.meta.url);
const items=[
 ['01-hook','01-home', 'ТВОЙ АНИМЕ-ВЕЧЕР', ['НАЧИНАЕТСЯ','ЗДЕСЬ.'], 'AnimeShadow',90,1000],
 ['02-catalog','02-catalog','ВЫБИРАЙ СВОЙ МИР',['10 000+','ТАЙТЛОВ'], 'Новинки. Классика. Твоё следующее любимое.',80,1250],
 ['03-quality','07-features','СМОТРИ ПО-СВОЕМУ',['РЕЖИМ','ДО 2K'], 'Масштабирование в PRO · совместимые устройства',250,1100],
 ['04-voices','03-dubbing','ЗНАКОМЫЕ ГОЛОСА',['ТВОЯ ЛЮБИМАЯ','ОЗВУЧКА'], 'AniDUB · AniLibria.TV · AnimeVost и другие',120,1100],
 ['05-together','04-rooms','ЗОВИ СВОИХ',['ОДНО АНИМЕ.','ВМЕСТЕ.'], 'Общие залы, чат и свои комнаты с PRO',80,1050],
 ['06-progress','07-features','ПРОДОЛЖАЙ ИСТОРИЮ',['С ТОЙ ЖЕ','МИНУТЫ.'], 'Аккаунт сохраняет серию и прогресс',280,1000],
 ['07-offer','06-registration','ПОДАРОК ЗА РЕГИСТРАЦИЮ',['15 ДНЕЙ PRO','БЕСПЛАТНО'], 'Потом −50% на месяц PRO',535,860]
];
const text=(x,y,s,size=80,color='#f6f5fa',weight=800)=>`<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" font-weight="${weight}" fill="${color}">${s}</text>`;
for(let i=0;i<items.length;i++){
const [name,src,eyebrow,lines,sub,top,height]=items[i];
const image=await sharp(await fs.readFile(new URL(src+'.jpg',dir))).extract({left:0,top,width:1070,height}).resize(920,850,{fit:'cover',position:'top'}).png().toBuffer();
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#17101d"/><stop offset="1" stop-color="#080b14"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#bg)"/><path d="M 900 0 L 1080 0 L 1080 470 Z" fill="#fd426e" opacity=".13"/>${text(80,150,'影',60,'#ff476f')}${text(160,146,'AnimeShadow',43)}${text(80,262,eyebrow,24,'#ff6689',600)}${lines.map((s,j)=>text(75,375+j*108,s,name==='04-voices'?76:91)).join('')}${text(80,555,sub,29,'#bcbcc9',400)}<rect x="72" y="625" width="936" height="866" rx="26" fill="#272533"/><image x="80" y="633" width="920" height="850" href="data:image/png;base64,${image.toString('base64')}"/>${text(80,1570,name==='07-offer'?'ЗАРЕГИСТРИРУЙСЯ И ЗАБИРАЙ':'СМОТРИ. ВЫБИРАЙ. НАХОДИ СВОИХ.',27,'#e7e5ee',600)}<rect x="80" y="1620" width="920" height="115" rx="16" fill="#ff426e"/>${text(125,1694,'animeshadow.online',62,'#ffffff')}${text(80,1800,'ANIMESHADOW  /  '+String(i+1).padStart(2,'0'),22,'#7c7a8b',400)}${text(80,1844,name==='07-offer'?'Условия и срок акции — на сайте.':'',22,'#a09aa9',400)}</svg>`;
await fs.writeFile(new URL(name+'.svg',dir),svg);
await sharp(Buffer.from(svg)).png().toFile(new URL(name+'.png',dir).pathname.replace(/^\/(\w:)/,'$1'));
}
const thumbs=await Promise.all(items.map(async ([name],i)=>({input:await sharp(await fs.readFile(new URL(name+'.png',dir))).resize(270,480).toBuffer(),left:(i%4)*270,top:Math.floor(i/4)*480})));
await sharp({create:{width:1080,height:960,channels:3,background:'#090b14'}}).composite(thumbs).png().toFile(new URL('preview.png',dir).pathname.replace(/^\/(\w:)/,'$1'));
console.log('7 cards and preview exported');

