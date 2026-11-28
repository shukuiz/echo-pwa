// 当前窗口的聊天记录读写：所有写入排队进行（也和换窗归档排在同一条队里），避免互相覆盖
// chat.json 记着自己属于哪一窗（windowId）；和登记表里的当前窗口对不上，说明已经归档过了，当作新窗口的空记录
import { paths, readJSON, DATA_DIR } from "./storage.js";
import { loadIndex, writeAtomic } from "./windows-store.js";

let queue = Promise.resolve();
const file = () => paths.chat(DATA_DIR);

/** 在聊天记录的队列里跑一段（换窗归档也用它，保证归档那一刻没有别的写入） */
export function withChatLock(fn) {
  const run = queue.then(fn);
  queue = run.then(() => {}, () => {});
  return run;
}

async function load() {
  const idx = await loadIndex();
  const chat = await readJSON(file(), { messages: [] });
  if (!Array.isArray(chat.messages)) chat.messages = [];
  if (chat.windowId && chat.windowId !== idx.activeId) return { windowId: idx.activeId, messages: [] };
  return { ...chat, windowId: idx.activeId };
}

export const readChat = () => load();

/** 在写入队列里改一次聊天记录；fn 返回 false 表示没改，不写盘 */
export function mutateChat(fn) {
  return withChatLock(async () => {
    const chat = await load();
    const out = await fn(chat);
    if (out !== false) await writeAtomic(file(), chat);
    return out;
  });
}
