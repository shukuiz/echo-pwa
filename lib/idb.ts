// 图片 / 动图 / 壁纸放 IndexedDB：localStorage 只有几 MB，而且只能存字符串
// 只在浏览器里调用（组件 effect / 事件里），服务端渲染时不会碰到。
"use client";

import { useEffect, useState } from "react";

const DB = "echo-media";
const STORE = "blobs";
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const urls = new Map<string, string>();
const listeners = new Set<() => void>();
const bump = () => listeners.forEach((f) => f());

export async function putBlob(key: string, blob: Blob) {
  await tx("readwrite", (s) => s.put(blob, key));
  const old = urls.get(key);
  if (old) { URL.revokeObjectURL(old); urls.delete(key); }
  bump();
}
export async function getBlob(key: string): Promise<Blob | null> {
  try { return ((await tx("readonly", (s) => s.get(key))) as Blob | undefined) ?? null; } catch { return null; }
}
export async function delBlob(key: string) {
  try { await tx("readwrite", (s) => s.delete(key)); } catch {}
  const old = urls.get(key);
  if (old) { URL.revokeObjectURL(old); urls.delete(key); }
  bump();
}
export async function delBlobs(keys: (string | undefined)[]) {
  for (const k of keys) if (k) await delBlob(k);
}

/** IndexedDB key → object URL（同一个 key 全局只建一次） */
export async function blobUrl(key: string): Promise<string | null> {
  const hit = urls.get(key);
  if (hit) return hit;
  const b = await getBlob(key);
  if (!b) return null;
  const again = urls.get(key);
  if (again) return again;
  const u = URL.createObjectURL(b);
  urls.set(key, u);
  return u;
}

export function useBlobUrls(keys: (string | undefined)[]): (string | null)[] {
  const sig = keys.join("|");
  const [out, setOut] = useState<(string | null)[]>(() => keys.map((k) => (k ? urls.get(k) ?? null : null)));
  const [ver, setVer] = useState(0);
  useEffect(() => { const f = () => setVer((v) => v + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  useEffect(() => {
    let alive = true;
    Promise.all(sig.split("|").map((k) => (k ? blobUrl(k) : Promise.resolve(null)))).then((r) => { if (alive) setOut(r); });
    return () => { alive = false; };
  }, [sig, ver]);
  return out;
}
export function useBlobUrl(key?: string) { return useBlobUrls([key])[0]; }

/** 照片先缩到长边 maxSide，省 IndexedDB 空间和 GPU 纹理内存；GIF/视频不要走这里（会丢动画） */
export async function downscale(file: Blob, maxSide = 2048, quality = 0.88): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (k >= 1 && file.size < 2.5e6) { bmp.close?.(); return file; }
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b || file), "image/jpeg", quality));
  } catch {
    return file;
  }
}
