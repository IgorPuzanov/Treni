import {createServer} from 'node:http';
import {createReadStream, createWriteStream} from 'node:fs';
import {mkdir, stat, unlink, rename} from 'node:fs/promises';
import {join, extname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pipeline} from 'node:stream/promises';
import {initialState} from './seed.mjs';

const port = Number(process.env.TRENI_PORT || 4173);
const host = '127.0.0.1';
const publicDir = join(import.meta.dirname, 'public');
const storage = process.env.TRENI_STORAGE || join(import.meta.dirname, 'local-storage');
const mediaDir = join(storage, 'media');
await mkdir(mediaDir, {recursive:true});
const db = new DatabaseSync(join(storage, 'treni.sqlite'));
db.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL)');
db.prepare('INSERT OR IGNORE INTO workspace VALUES (1, 0, ?)').run(JSON.stringify(initialState()));
const read = db.prepare('SELECT revision, state FROM workspace WHERE id = 1');
const update = db.prepare('UPDATE workspace SET revision = revision + 1, state = ? WHERE id = 1 AND revision = ?');
const json = (res, status, value) => {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(value));
};
const types = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.webm':'video/webm', '.mp4':'video/mp4',
  '.mov':'video/quicktime', '.ogv':'video/ogg', '.png':'image/png'
};
const uploads = new Map(Object.entries(types).filter(([,mime]) => mime.startsWith('video/') || mime === 'image/png').map(([ext,mime]) => [mime,ext]));

async function sendFile(req, res, file) {
  const {size} = await stat(file);
  const headers = {'Content-Type':types[extname(file)], 'Accept-Ranges':'bytes', 'X-Content-Type-Options':'nosniff'};
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (req.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range && (range[1] || range[2])) {
      start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      if (range[1] && range[2]) end = Math.min(end, Number(range[2]));
    }
    if (!range || !(range[1] || range[2]) || start > end || start >= size) {
      res.writeHead(416, {...headers,'Content-Range':`bytes */${size}`}).end();
      return;
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  res.writeHead(status, {...headers,'Content-Length':end-start+1});
  if (req.method === 'HEAD' || !size) res.end();
  else await pipeline(createReadStream(file, {start,end}), res);
}

const assets = new Set(['index.html','style.css','app.js','builder.js','annotation.js','catalog.json','photos.json','demo.webm',
  'demo-history.webm','demo-poster.png','demo-history.png']);
const server = createServer(async (req, res) => {
  const permitted = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!permitted.includes(req.headers.host) || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) {
    return json(res, 403, {error:'Доступ только с этого компьютера'});
  }
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    if (path === '/api/state' && req.method === 'GET') {
      const row = read.get();
      return json(res, 200, {revision:row.revision,state:JSON.parse(row.state)});
    }
    if (path === '/api/state' && req.method === 'PUT') {
      if (req.headers['content-type'] !== 'application/json') return json(res,415,{error:'Ожидается JSON'});
      let length = 0;
      const chunks = [];
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 16 * 1024 * 1024) return json(res,413,{error:'Слишком много данных'});
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks)); } catch { return json(res,400,{error:'Некорректные данные'}); }
      if (!Number.isInteger(body?.revision) || !body.state?.program || !Array.isArray(body.state.sessions)) {
        return json(res,400,{error:'Некорректное состояние'});
      }
      const changed = update.run(JSON.stringify(body.state), body.revision).changes;
      return changed ? json(res,200,{revision:body.revision+1}) : json(res,409,{error:'Данные изменились в другой вкладке. Обнови страницу.'});
    }
    if (path === '/api/media' && req.method === 'POST') {
      const ext = uploads.get(req.headers['content-type']);
      const length = Number(req.headers['content-length']);
      if (!ext) return json(res,415,{error:'Выбери MP4, WebM, MOV или Ogg'});
      if (!Number.isSafeInteger(length) || length < 1 || length > 150 * 1024 * 1024) {
        return json(res,413,{error:'Размер файла должен быть от 1 байта до 150 МБ'});
      }
      const file = randomUUID() + ext;
      const destination = join(mediaDir,file);
      const temporary = destination + '.part';
      try {
        await pipeline(req, createWriteStream(temporary,{flags:'wx'}));
        await rename(temporary,destination);
      } finally {
        await unlink(temporary).catch(() => {});
      }
      return json(res,201,{url:'/media/'+file});
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const asset = path === '/' ? 'index.html' : path.slice(1);
      if (assets.has(asset)) return await sendFile(req,res,join(publicDir,asset));
      if (/^\/media\/[0-9a-f-]{36}\.(webm|mp4|mov|ogv|png)$/.test(path)) {
        return await sendFile(req,res,join(mediaDir,path.slice(7)));
      }
    }
    json(res,404,{error:'Страница или файл не найдены'});
  } catch (error) {
    if (!res.headersSent && !res.destroyed) json(res,error.code === 'ENOENT' ? 404 : 500,{error:'Не удалось выполнить запрос'});
    if (error.code !== 'ENOENT' && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error(error);
  }
});
server.listen(port,host,() => console.log(`Трени · http://${host}:${port}`));
