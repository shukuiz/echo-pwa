// 思考过程翻译（全免费，不需要任何 key）
// 主：Google 网页翻译接口（clients5，质量最好，速度快）
// 备：MyMemory 公共接口（Google 挂了才用，匿名每日有额度）
// 只在「英文占多数」时才翻；结果进内存缓存，重复展开不重复请求；失败一律返回 null。

const MAX_SEG = 600;      // 单片字符数：实测 800 以上偶发返回原文不翻
const MAX_SEGS = 10;      // 最多翻 6000 字
const MAX_CHARS = 12000;
const CACHE_LIMIT = 300;

const cache = new Map();

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/** 英文字母明显多于中文时，才认为需要翻译 */
export function needsTranslation(text) {
  const s = String(text || "");
  if (!s.trim()) return false;
  const letters = (s.match(/[a-zA-Z]/g) || []).length;
  const chinese = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  if (letters < 20) return false;
  return letters > chinese * 2;
}

/** 按句子切段，每段不超过 max 个字符 */
export function splitSegments(text, max = MAX_SEG) {
  const s = String(text || "");
  const out = [];
  let buf = "";
  for (const p of s.split(/(?<=[.!?。！？；;:：\n])\s*/)) {
    if (!p) continue;
    if ((buf + p).length <= max) { buf += p; continue; }
    if (buf) { out.push(buf); buf = ""; }
    if (p.length <= max) { buf = p; continue; }
    for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
  }
  if (buf) out.push(buf);
  return out;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** clients5 的返回：可能是 ["译文"]、[["译文", ...]] 或多句的字符串数组 */
function parseGoogle(raw) {
  const d = JSON.parse(raw);
  if (typeof d === "string") return d;
  if (!Array.isArray(d)) return "";
  if (d.every((x) => typeof x === "string")) return d.join("");
  if (Array.isArray(d[0])) return d.map((x) => (Array.isArray(x) ? x[0] : x)).join("");
  return "";
}

async function viaGoogle(seg) {
  const url = "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=zh-CN&q=" + encodeURIComponent(seg);
  const res = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`google_http_${res.status}`);
  const raw = await res.text();
  const out = decodeEntities(parseGoogle(raw)).trim();
  // 有时候它会把原文原样吐回来，等于没翻
  if (!out || out === seg.trim()) throw new Error("google_untranslated");
  return out;
}

async function viaMyMemory(seg) {
  const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(seg) + "&langpair=en|zh-CN";
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`mymemory_http_${res.status}`);
  const data = await res.json().catch(() => null);
  const out = data?.responseData?.translatedText;
  if (typeof out !== "string" || !out) throw new Error("mymemory_empty");
  if (/MYMEMORY WARNING|ALL AVAILABLE FREE TRANSLATIONS|QUOTA/i.test(out)) throw new Error("mymemory_quota");
  const zh = decodeEntities(out).trim();
  if (!zh || zh === seg.trim()) throw new Error("mymemory_untranslated");
  return zh;
}

async function translateSeg(seg) {
  try {
    return await viaGoogle(seg);
  } catch {
    return await viaMyMemory(seg); // Google 不通/限流时兜底
  }
}

/**
 * 翻译一段思考。返回中文译文；不需要翻 / 失败时返回 null。
 * 调用方只需要：有值就展示，没值就维持原文。
 */
export async function translateThought(text) {
  const s = String(text || "").trim();
  if (!s || s.length > MAX_CHARS) return null;
  if (!needsTranslation(s)) return null;

  const key = hash(s);
  if (cache.has(key)) return cache.get(key);

  const segs = splitSegments(s);
  const use = segs.slice(0, MAX_SEGS);
  const parts = [];
  try {
    for (const seg of use) parts.push(await translateSeg(seg));
  } catch {
    return null;
  }

  let out = parts.join("");
  if (segs.length > use.length) out += `\n\n（后面的 ${segs.length - use.length} 段太长了，没有翻）`;
  if (!out.trim()) return null;

  cache.set(key, out);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return out;
}
