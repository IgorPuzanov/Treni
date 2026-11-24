const scope = self.registration.scope;
const asset = path => new URL(path,scope).href;
const cacheName = 'treni-shell-'+scope+'-b7c0ce9c5295446b';
const shell = ['index.html','style.css','app.js','builder.js','annotation.js','catalog.json','photos.json',
  'demo.webm','demo-history.webm','demo-poster.png','demo-history.png','mobile-seed.json',
  'manifest.webmanifest','icon-192.png','icon-512.png'];
const shellPaths = new Set(shell);

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(cacheName);
  await cache.addAll(shell.map(path=>new Request(asset(path),{cache:'reload'})));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(name=>name.startsWith('treni-shell-'+scope+'-')&&name!==cacheName).map(name=>caches.delete(name)));
  await self.clients.claim();
})()));

let database;
function openDatabase() {
  database ??= new Promise((resolve,reject)=>{
    const request=indexedDB.open('treni-device-'+new URL(scope).pathname,1);
    request.onupgradeneeded=()=>{
      request.result.createObjectStore('workspace');
      request.result.createObjectStore('media');
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  }).catch(error=>{database=null;throw error;});
  return database;
}
function requestResult(request) {
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
function complete(transaction) {
  return new Promise((resolve,reject)=>{
    transaction.oncomplete=resolve;
    transaction.onabort=()=>reject(transaction.error);
  });
}
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
async function deviceState(request) {
  const db=await openDatabase();
  if (request.method==='GET') {
    const current=await requestResult(db.transaction('workspace').objectStore('workspace').get('current'));
    if (current) return json(current);
    const cache=await caches.open(cacheName);
    const seed=await cache.match(asset('mobile-seed.json'));
    return json({revision:0,state:await seed.json()});
  }
  if (request.method!=='PUT') return json({error:'Действие недоступно'},405);
  const body=await request.json();
  if (!Number.isInteger(body?.revision) || !body.state?.program || !Array.isArray(body.state.sessions)) {
    return json({error:'Некорректное состояние'},400);
  }
  const transaction=db.transaction('workspace','readwrite');
  const done=complete(transaction);
  const store=transaction.objectStore('workspace');
  const revision=await new Promise((resolve,reject)=>{
    const read=store.get('current');
    read.onerror=()=>reject(read.error);
    read.onsuccess=()=>{
      const current=read.result?.revision||0;
      if (current!==body.revision) {resolve(null);return;}
      store.put({revision:current+1,state:body.state},'current');
      resolve(current+1);
    };
  });
  await done;
  if (revision===null) return json({error:'Данные изменились в другой вкладке. Обнови страницу.'},409);
  return json({revision});
}

const formats = new Map([['video/webm','webm'],['video/mp4','mp4'],['video/quicktime','mov'],['video/ogg','ogv'],['image/png','png']]);
async function storeMedia(request) {
  if (request.method!=='POST') return json({error:'Действие недоступно'},405);
  const extension=formats.get(request.headers.get('Content-Type'));
  if (!extension) return json({error:'Выбери MP4, WebM, MOV или Ogg'},415);
  const file=await request.blob();
  if (!file.size || file.size>150*1024*1024) {
    return json({error:'Размер файла должен быть от 1 байта до 150 МБ'},413);
  }
  const fileName=crypto.randomUUID()+'.'+extension;
  const db=await openDatabase();
  const tx=db.transaction('media','readwrite');
  const done=complete(tx);
  tx.objectStore('media').add(file,fileName);
  await done;
  return json({url:'./media/'+fileName},201);
}

function ranged(file,request) {
  const headers={'Content-Type':file.type,'Accept-Ranges':'bytes','Content-Length':String(file.size)};
  const range=request.headers.get('Range');
  if (!range || request.method==='HEAD') return new Response(request.method==='HEAD'?null:file,{headers});
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  const start=match?.[1] ? Number(match[1]) : Math.max(0,file.size-Number(match?.[2]));
  const end=match?.[1]&&match[2] ? Math.min(file.size-1,Number(match[2])) : file.size-1;
  if (!match || !(match[1]||match[2]) || start>end || start>=file.size) {
    return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+file.size}});
  }
  return new Response(file.slice(start,end+1,file.type),{
    status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${file.size}`}
  });
}
async function deviceMedia(request,path) {
  const db=await openDatabase();
  const file=await requestResult(db.transaction('media').objectStore('media').get(path.slice(6)));
  return file ? ranged(file,request) : json({error:'Файл отсутствует на этом устройстве'},404);
}
async function cachedAsset(request,path) {
  const cache=await caches.open(cacheName);
  const response=await cache.match(asset(path));
  if (!response) return fetch(request);
  if (['demo.webm','demo-history.webm'].includes(path)&&request.headers.has('Range')) {
    return ranged(await response.blob(),request);
  }
  return response;
}
self.addEventListener('fetch',event=>{
  const {request}=event;
  if (!request.url.startsWith(scope)) return;
  const path=new URL(request.url).pathname.slice(new URL(scope).pathname.length);
  let response;
  if (path==='api/state') response=deviceState(request);
  else if (path==='api/media') response=storeMedia(request);
  else if (path.startsWith('media/')) response=deviceMedia(request,path);
  else if (request.mode==='navigate') response=cachedAsset(request,'index.html');
  else if (shellPaths.has(path)) response=cachedAsset(request,path);
  if (response) event.respondWith(response.catch(error=>json({
    error:error.name==='QuotaExceededError'?'На устройстве не хватает места для сохранения.':'Не удалось открыть данные на этом устройстве.'
  },500)));
});
