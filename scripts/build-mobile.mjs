import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {initialState} from '../seed.mjs';

const project=resolve(import.meta.dirname,'..');
const destination=process.argv[2];
if (!destination) throw new Error('Usage: node scripts/build-mobile.mjs DIRECTORY');
const out=resolve(destination);
const source=join(project,'public');
if (out===source || out===project) throw new Error('Use a separate destination for the mobile build');
await mkdir(out,{recursive:true});

const files=['style.css','app.js','builder.js','annotation.js','catalog.json','photos.json','demo.webm',
  'demo-history.webm','demo-poster.png','demo-history.png','icon-192.png','icon-512.png','manifest.webmanifest'];
const seed=initialState();
for (const session of seed.sessions) for (const exercise of session.exercises) {
  if (exercise.media) for (const field of ['url','poster']) {
    if (exercise.media[field]) exercise.media[field]=exercise.media[field].replace(/^\//,'./');
  }
}
const page=(await readFile(join(source,'index.html'),'utf8')).replace('</head>',[
  '<meta name="treni-device-storage" content="true">',
  '<link rel="manifest" href="./manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="./icon-192.png">',
  '</head>'
].join(''));
const mobileSeed=JSON.stringify(seed);
const worker=await readFile(join(source,'service-worker.js'),'utf8');
const hash=createHash('sha256').update(page).update(mobileSeed).update(worker);
for (const file of files) {
  hash.update(await readFile(join(source,file)));
  await copyFile(join(source,file),join(out,file));
}
const version=hash.digest('hex').slice(0,16);
await Promise.all([
  writeFile(join(out,'index.html'),page),writeFile(join(out,'mobile-seed.json'),mobileSeed),
  writeFile(join(out,'service-worker.js'),worker.replace('__BUILD__',version)),writeFile(join(out,'.nojekyll'),'')
]);
console.log('Mobile build '+version+' · '+out);
