// 聊天记录读写：所有写入排队进行，避免两次回复同时落盘互相覆盖
import { paths, readJSON, writeJSON, DATA_DIR } from "./storage.js";

let queue = Promise.resolve();
const file = () => paths.chat(DATA_DIR);

export const readChat = () => readJSON(file(), { messages: [] });

/** 在写入队列里改一次聊天记录；fn 返回 false 表示没改，不写盘 */
export function mutateChat(fn) {
  const run = queue.then(async () => {
    const chat = await readChat();
    if (!Array.isArray(chat.messages)) chat.messages = [];
    const out = await fn(chat);
    if (out !== false) await writeJSON(file(), chat);
    return out;
  });
  queue = run.then(() => {}, () => {});
  return run;
}
