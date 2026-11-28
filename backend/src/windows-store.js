// 窗口（= 一段连续的对话）的登记表：data/memory/windows/index.json
// 当前窗口的消息仍在 memory/chat.json（旧代码和备份都认这个文件）；换窗时把它归档到 windows/<id>.json，只读保存
// 迁移：第一次读到时，把现有聊天当作「第 1 窗」（Serein 窗口 ID 沿用 main，和以前网关里的记录对得上），不搬动任何文件
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { paths, readJSON, DATA_DIR } from "./storage.js";

export const windowsDir = (d = DATA_DIR) => path.join(paths.memory(d), "windows");
export const indexFile = (d = DATA_DIR) => path.join(windowsDir(d), "index.json");
export const windowFile = (id, d = DATA_DIR) => path.join(windowsDir(d), `${id}.json`);
export const validWindowId = (id) => typeof id === "string" && /^w[0-9a-z-]{1,40}$/.test(id);
export const newSereinWindowId = (n) => `echo-w${n}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex")}`;

/** 先写临时文件再改名：写到一半断电也不会留下半个 JSON */
export async function writeAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

let migrating = null;
/** 读登记表；没有就按现有 chat.json 建「第 1 窗」 */
export async function loadIndex(d = DATA_DIR) {
  const idx = await readJSON(indexFile(d), null);
  if (idx && Array.isArray(idx.windows) && idx.activeId) return idx;
  migrating ||= (async () => {
    const again = await readJSON(indexFile(d), null);
    if (again && Array.isArray(again.windows) && again.activeId) return again;
    const chat = await readJSON(paths.chat(d), { messages: [] });
    const msgs = Array.isArray(chat.messages) ? chat.messages : [];
    const codex = await readJSON(path.join(paths.settings(d), "codex-thread.json"), {});
    const first = {
      id: "w1", n: 1, title: "第 1 窗", sereinWindowId: "main",
      createdAt: Number(msgs[0]?.at) || Date.now(), archivedAt: 0, messageCount: msgs.length,
      ...(codex?.threadId ? { codexThreadId: codex.threadId } : {}), migrated: true,
    };
    const next = { version: 1, activeId: "w1", windows: [first], selection: null };
    await writeAtomic(indexFile(d), next);
    return next;
  })().finally(() => { migrating = null; });
  return migrating;
}

export async function saveIndex(idx, d = DATA_DIR) { await writeAtomic(indexFile(d), idx); return idx; }

export async function activeWindow(d = DATA_DIR) {
  const idx = await loadIndex(d);
  return idx.windows.find((w) => w.id === idx.activeId) || idx.windows.at(-1);
}

/** 改当前窗口的登记（比如记下 /resume 锚点） */
export async function patchActiveWindow(patch, d = DATA_DIR) {
  const idx = await loadIndex(d);
  const w = idx.windows.find((x) => x.id === idx.activeId);
  if (!w) return null;
  Object.assign(w, typeof patch === "function" ? patch(w) : patch);
  await saveIndex(idx, d);
  return w;
}
