import "../apps/api/src/config/env.js";
import { prisma } from "../packages/db/src/index.js";
try {
 console.log(JSON.stringify(await prisma.anime.findMany({where:{OR:[{title:{contains:"Devil May Cry",mode:"insensitive"}},{titleLocalized:{contains:"Дьявол может плакать",mode:"insensitive"}}]},select:{id:true,title:true,titleLocalized:true,titleEnglish:true,year:true},take:20}),null,2));
} finally { await prisma.$disconnect(); }
