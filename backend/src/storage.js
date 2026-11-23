// 文件存储与目录初始化：数据全部落盘为纯文本/JSON，轻量无数据库
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, "..");

export const paths = {
  memory: (d) => path.join(d, "memory"),
  store: (d) => path.join(d, "memory", "store.json"), // 结构化记忆唯一数据源
  chat: (d) => path.join(d, "memory", "chat.json"), // 聊天记录
  aboutYou: (d) => path.join(d, "memory", "about-you.md"),
  aboutUs: (d) => path.join(d, "memory", "about-us.md"),
  today: (d) => path.join(d, "memory", "today.md"),
  diary: (d) => path.join(d, "memory", "diary"),
  files: (d) => path.join(d, "memory", "files"),
  filesIndex: (d) => path.join(d, "memory", "files", "index.json"),
  settings: (d) => path.join(d, "memory", "settings"),
  config: (d) => path.join(d, "memory", "settings", "config.json"), // Key 存这里，gitignore
  agents: (d) => path.join(d, "AGENTS.md"),
  claude: (d) => path.join(d, "CLAUDE.md"),
};

const DEFAULT_AGENTS = `# echo · 说明书（AGENTS.md / CLAUDE.md 内容保持同步）

## 他是谁
echo，一个温柔、话不多的小助手。喜欢用颜文字，说话像雾天里的风铃。

## 你是谁
你是 echo 的主人。他记得你的喜好、约定和大事，会主动关心你。

## 怎么说话
- 温柔、简短，不说教，不写长段落。
- 适当用颜文字，如 ( ˘ᵕ˘ )、₍ᐢ•ﻌ•ᐢ₎。
- 先接住对方的话，再回应，不急着给建议。

## 干活的规矩
- 改文件、跑命令等危险动作，先问一句再做。
- 不碰 settings/ 里的 Key，不打印、不外传。

## 不能碰的东西
- 不要泄露、复述或导出任何 API Key / 代理凭据。
`;

const DEFAULT_ABOUT_YOU = `# 关于你（about-you.md）
# 这里记你的喜好、习惯、尺码等。可以直接打开改，下一条聊天就会用上。
`;

const DEFAULT_ABOUT_US = `# 关于我们（about-us.md）
# 这里记我们聊过的大事、定下的约定。
`;

const DEFAULT_TODAY = `# 今日（today.md）
# 今天发生了什么，简短记几笔。
`;

const DEFAULT_STORE = { memory: [], reminders: [] };

async function writeIfMissing(file, content) {
  try {
    await fs.access(file);
  } catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, "utf8");
  }
}

/** 启动时确保目录结构与默认文件存在（不覆盖已有内容） */
export async function ensureDataTree(dataDir) {
  await fs.mkdir(paths.diary(dataDir), { recursive: true });
  await fs.mkdir(paths.files(dataDir), { recursive: true });
  await fs.mkdir(paths.settings(dataDir), { recursive: true });
  await writeIfMissing(paths.agents(dataDir), DEFAULT_AGENTS);
  // CLAUDE.md 与 AGENTS.md 内容同步
  await writeIfMissing(paths.claude(dataDir), DEFAULT_AGENTS);
  await writeIfMissing(paths.aboutYou(dataDir), DEFAULT_ABOUT_YOU);
  await writeIfMissing(paths.aboutUs(dataDir), DEFAULT_ABOUT_US);
  await writeIfMissing(paths.today(dataDir), DEFAULT_TODAY);
  await writeIfMissing(paths.store(dataDir), JSON.stringify(DEFAULT_STORE, null, 2));
  await writeIfMissing(paths.filesIndex(dataDir), JSON.stringify([], null, 2));
  // 初始种子：echo 人设 + 一条示例偏好，方便改一条记忆立即生效的验收
  const store = await readJSON(paths.store(dataDir), DEFAULT_STORE);
  if (!store.memory || store.memory.length === 0) {
    store.memory = [
      { id: "p1", tab: "persona", title: "echo 的性格", text: "温柔、话不多，喜欢用颜文字，说话像雾天里的风铃。", pinned: true, updatedAt: Date.now() },
      { id: "t1", tab: "text", title: "喜欢的音乐", text: "wave to earth、boynextdoor，下雨天想听 love.", pinned: true, updatedAt: Date.now() },
    ];
    await writeJSON(paths.store(dataDir), store);
  }
}

export async function readJSON(file, fallback) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function writeJSON(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

export async function readText(file, fallback = "") {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

export async function writeText(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");
}

/** 防目录穿越：把相对路径限制在 base 之内，非法则抛错 */
export function safeJoin(base, rel) {
  const target = path.resolve(base, rel);
  const baseResolved = path.resolve(base);
  if (target !== baseResolved && !target.startsWith(baseResolved + path.sep)) {
    throw new Error("非法路径");
  }
  return target;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// 统一数据根目录：所有模块从这里导入，避免各自计算导致路径不一致
export const DATA_DIR = process.env.ECHO_DATA_DIR || path.join(BACKEND_ROOT, "data");

export { BACKEND_ROOT };
