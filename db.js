// Úložiště v telefonu (IndexedDB). Nic se neposílá na server.
const DB_NAME = 'foceni';
const STORES = ['shoots', 'props', 'places', 'images'];

let dbPromise;
function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  }));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const all = (store) => run(store, 'readonly', (s) => s.getAll());
export const get = (store, id) => run(store, 'readonly', (s) => s.get(id));
export const put = (store, value) => run(store, 'readwrite', (s) => s.put(value)).then(() => value);
export const del = (store, id) => run(store, 'readwrite', (s) => s.delete(id));

// Obrázky: blob v IndexedDB, v paměti jako object URL.
const urls = new Map();
export async function saveImage(blob) {
  const id = uid();
  await put('images', { id, blob });
  return id;
}
export async function imageUrl(id) {
  if (!id) return '';
  if (urls.has(id)) return urls.get(id);
  const rec = await get('images', id);
  if (!rec) return '';
  const url = URL.createObjectURL(rec.blob);
  urls.set(id, url);
  return url;
}
export async function imageBlob(id) {
  return (await get('images', id))?.blob;
}
export async function deleteImage(id) {
  if (!id) return;
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
  await del('images', id);
}

// Požádá prohlížeč, aby data nemazal při nedostatku místa.
export function persist() {
  return navigator.storage?.persist?.().catch(() => false);
}

// Záloha: jeden JSON soubor se vším včetně fotek (base64).
const toDataUrl = (blob) => new Promise((resolve) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.readAsDataURL(blob);
});

export async function exportAll() {
  const out = { app: 'foceni', version: 1, date: new Date().toISOString() };
  for (const s of STORES) {
    const rows = await all(s);
    out[s] = s === 'images' ? await Promise.all(rows.map(async (r) => ({ id: r.id, data: await toDataUrl(r.blob) }))) : rows;
  }
  return new Blob([JSON.stringify(out)], { type: 'application/json' });
}

export async function importAll(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'foceni') throw new Error('Tohle není záloha aplikace Focení.');
  for (const s of STORES) {
    for (const row of data[s] ?? []) {
      if (s === 'images') await put('images', { id: row.id, blob: await (await fetch(row.data)).blob() });
      else await put(s, row);
    }
  }
}
