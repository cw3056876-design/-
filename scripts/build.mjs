import {mkdir,cp,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
await mkdir('dist',{recursive:true});
// The existing homepage contains large inline images. Keep its source intact,
// and replace only the uniquely identified third project during the build.
const original=await readFile('index.html','utf8');const marker=original.indexOf('第三个AI项目待补充');
if(marker<0||original.indexOf('第三个AI项目待补充',marker+1)>=0)throw new Error('Homepage project marker changed; inspect before rebuilding.');
const start=original.lastIndexOf('            <article ',marker),end=original.indexOf('</article>',marker)+10;
if(start<0||end<10)throw new Error('Cannot safely locate the third project card.');
const card=await readFile('src/project-card.html','utf8');
const homepage=(original.slice(0,start)+card.trimEnd()+original.slice(end)).replace('</head>','<link rel="stylesheet" href="/assets/prd-project.css">\n</head>');
await writeFile('dist/index.html',homepage);await cp('assets','dist/assets',{recursive:true});await cp('tools','dist/tools',{recursive:true});
await build({entryPoints:['src/app.mjs'],bundle:true,minify:true,format:'esm',target:['es2022'],outfile:'dist/tools/ai-prd/app.js',legalComments:'eof'});
const config=JSON.parse(await readFile('vercel.json','utf8'));
if(!config.functions?.['api/prd.js'])throw new Error('Missing API function configuration');
await writeFile('dist/robots.txt','User-agent: *\nAllow: /\nDisallow: /api/\n');
console.log('Portfolio and AI PRD workbench built. Server methodology is excluded from public output.');
