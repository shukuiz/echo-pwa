import type { Card, FileItem, FileKind, MemoryItem, Msg, Reminder } from "./store";
import type { Favorite } from "./api";

export type Think = NonNullable<Msg["think"]>;

const now = Date.now();
const H = 3600_000;

export const seedMessages: Msg[] = [
  { id: "m1", role: "echo", text: "早上好呀 (´•ω•`) 今天也一起慢慢来。", status: "done", at: now - 3 * H },
  { id: "m2", role: "user", text: "帮我记一下，晚上九点要洗衣服", status: "done", at: now - 2.9 * H },
  { id: "m3", role: "echo", text: "记好啦，今晚 21:00 提醒你洗衣服 ₍ᐢ•ﻌ•ᐢ₎", status: "done", at: now - 2.9 * H },
];

// 记忆本的本地样例（后端连不上时）：字段对齐 Serein 的 Scene / Event / 喜好
export const seedMemory: MemoryItem[] = [
  { id: "p1", tab: "persona", kind: "persona", title: "echo 的性格", text: "温柔、话不多，喜欢用颜文字，说话像雾天里的风铃。", pinned: true, importance: 5, status: "active", createdAt: now - 72 * H, updatedAt: now - 48 * H },
  { id: "p2", tab: "persona", kind: "persona", title: "称呼", text: "叫我「小雾」，不要叫全名。", pinned: false, importance: 4, status: "active", createdAt: now - 40 * H, updatedAt: now - 30 * H },
  { id: "t1", tab: "text", kind: "scene", title: "喜欢的音乐", text: "她说下雨天最想听 wave to earth 的 love.，还把 boynextdoor 的新歌循环了一整晚。", cues: ["下雨天", "音乐", "wave to earth"], domain: "日常", pinned: true, importance: 3, status: "active", createdAt: now - 26 * H, updatedAt: now - 20 * H },
  { id: "t2", tab: "text", kind: "preference", title: "口味", text: "不吃香菜，奶茶三分糖去冰。", preference: { subject: "user", polarity: "dislike", keywords: ["香菜", "奶茶"], reason: "点外卖时说过好几次" }, pinned: false, importance: 3, status: "active", createdAt: now - 12 * H, updatedAt: now - 10 * H },
  { id: "s1", tab: "summary", kind: "event", title: "今日总结", text: "上午整理了 Aidoku 图源，下午搭了 echo 的界面草稿，晚上记得洗衣服。", cues: ["echo 界面", "洗衣服"], pinned: false, importance: 2, status: "active", date: new Date(now).toISOString().slice(0, 10), createdAt: now - 2 * H, updatedAt: now - 1 * H },
];

export const seedFavorites: Favorite[] = [
  {
    id: "fav-demo", title: "记好啦，今晚 21:00 提醒你洗衣服", note: "", source: "chat", createdAt: now - 2.8 * H,
    messages: [
      { id: "m2", role: "user", text: "帮我记一下，晚上九点要洗衣服", at: now - 2.9 * H },
      { id: "m3", role: "echo", text: "记好啦，今晚 21:00 提醒你洗衣服 ₍ᐢ•ﻌ•ᐢ₎", at: now - 2.9 * H },
    ],
  },
];

export const seedReminders: Reminder[] = [
  { id: "r1", text: "洗衣服", time: todayAt(21, 0), done: false, pinned: false },
  { id: "r2", text: "交设计稿", time: todayAt(10, 0) + 24 * H, done: false, pinned: true },
  { id: "r3", text: "给植物浇水", time: todayAt(8, 30), done: true, pinned: false },
];

export const seedFiles: FileItem[] = [
  {
    id: "f1", kind: "worldbook", name: "雾中山寺 · 世界书.md", via: "Claude Code", at: now - 26 * H,
    content: "# 雾中山寺\n\n## 地点\n终年起雾的山寺，钟声能穿过三重雾。\n\n## 规则\n雾浓时说出的话会被风铃记住。\n\n## 人物\n守钟人「echo」，只在雨天说话。\n\n## 关键词\n雾、风铃、樱、旧钟",
  },
  {
    id: "f2", kind: "preset", name: "echo 温柔模式 · 预设.json", via: "Claude Code", at: now - 20 * H,
    content: '{\n  "name": "echo 温柔模式",\n  "tone": "温柔、简短、带颜文字",\n  "call_user": "小雾",\n  "avoid": ["说教", "长段落"]\n}',
  },
  {
    id: "f3", kind: "miniapp", name: "樱色番茄钟.html", via: "Codex", at: now - 5 * H,
    content: "<!-- 樱色番茄钟 -->\n<button id=start>开始</button>\n<div id=t>25:00</div>\n<script>/* 25 分钟专注 + 5 分钟休息 */</script>",
  },
];

function todayAt(h: number, m: number) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

/* ------------ 模拟回复 ------------ */

const kaomoji = ["(´•ω•`)", "₍ᐢ•ﻌ•ᐢ₎", "(-人-。)", "( ˘ᵕ˘ )", "(っ˘ω˘ς)", "ʕ•ᴥ•ʔ"];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export type ToolId = "translate" | "media" | "worldbook" | "miniapp" | "script";

/** 聊天里的工具（+ 按钮 / 打字触发） */
export const chatTools: { id: ToolId; name: string; label: string; via: "API" | "hand"; prompt: string }[] = [
  { id: "translate", name: "翻译工具", label: "翻译总结", via: "API", prompt: "帮我把这段翻译成中文并总结：" },
  { id: "media", name: "找图找歌工具", label: "找图找歌", via: "API", prompt: "帮我找几张雾天寺庙的氛围图" },
  { id: "worldbook", name: "世界书工具", label: "写预设 / 世界书", via: "API", prompt: "帮我写一个雾中山寺的古风世界书" },
  { id: "miniapp", name: "小应用工具", label: "写小应用", via: "hand", prompt: "帮我写一个粉色番茄钟小应用" },
  { id: "script", name: "脚本工具", label: "运行脚本", via: "hand", prompt: "帮我运行脚本，把文件柜里的文件按日期重命名" },
];

/** 工作台快捷按钮：带入预设指令后跳回聊天执行 */
export const workbenchShortcuts = [
  { id: "worldbook", title: "写预设和世界书", desc: "人设、世界观、条目", prompt: "帮我写一个雾中山寺的古风世界书" },
  { id: "translate", title: "翻译总结", desc: "多语互译、长文摘要", prompt: "帮我把这句日文歌词翻译成中文并总结：霧が晴れる前に、想いを紙の舟にして" },
  { id: "media", title: "找图找音乐", desc: "氛围图、歌单、素材", prompt: "帮我找几首适合下雨天听的韩语独立乐" },
  { id: "miniapp", title: "写小应用", desc: "小工具、小网页", prompt: "帮我写一个粉色番茄钟小应用" },
] as const;

export function detectTool(t: string): ToolId | null {
  if (/运行|执行|脚本|批量|重命名/.test(t)) return "script";
  if (/翻译|总结|摘要/.test(t)) return "translate";
  if (/找.*(图|歌|音乐|乐|素材|壁纸)|(图|歌单|音乐)推荐/.test(t)) return "media";
  if (/世界书|预设|人设|设定/.test(t)) return "worldbook";
  if (/小应用|小工具|网页|番茄钟|app|App/.test(t)) return "miniapp";
  return null;
}

export type MockPlan =
  | { kind: "reply"; text: string; think?: Think }
  | { kind: "confirm"; action: string; okText: string; noText: string }
  | { kind: "fail" }
  | {
      kind: "tool";
      tool: ToolId;
      toolName: string;
      via: "API" | "hand";
      needConfirm: boolean;
      text: string;
      card: Card | null;
      think: Think;
      handIntro?: string;
      steps?: string[];
      confirmAt?: number;
      confirmText?: string;
      file?: { kind: FileKind; name: string; content: string };
    };

export function planReply(input: string): MockPlan {
  const t = input.trim();
  if (/失败|报错|出错/.test(t)) return { kind: "fail" };
  const tool = detectTool(t);
  if (tool) return planTool(tool, t);
  if (/删除|清空|安装|发送/.test(t)) {
    return {
      kind: "confirm",
      action: `「${t.slice(0, 18)}${t.length > 18 ? "…" : ""}」`,
      okText: `好的，已经帮你完成啦 ${pick(kaomoji)}`,
      noText: `收到，这件事先不做了 ${pick(kaomoji)}`,
    };
  }
  const replies = [
    `嗯嗯，我在听 ${pick(kaomoji)} 你继续说，我都记着。`,
    `今天的雾有点浓呢，要不要我帮你把这件事记进记忆本？${pick(kaomoji)}`,
    `收到～我想了一下，觉得你说得很对，只是可以再慢一点 ${pick(kaomoji)}`,
    `好呀！需要的话我可以把它设成提醒，到点叫你 ${pick(kaomoji)}`,
  ];
  const memHit = /累|歌|音乐|奶茶|喝|吃/.test(t);
  return {
    kind: "reply",
    text: pick(replies),
    think: memHit
      ? { text: "你提到了状态和喜好，翻一下记忆本：喜欢 wave to earth，奶茶三分糖去冰。语气放软，别说教。", tags: [{ kind: "memory", label: "想起了：你喜欢 wave to earth" }] }
      : { text: "先回应用户的话，简短回应，不急着给建议。", tags: [] },
  };
}

function planTool(tool: ToolId, t: string): MockPlan & { kind: "tool" } {
  const meta = chatTools.find((x) => x.id === tool)!;
  const base = {
    kind: "tool" as const, tool, toolName: meta.name, via: meta.via, needConfirm: tool === "script",
    think: {
      text: meta.via === "API"
        ? `这件事用【${meta.name}】就能做完，走 API，不用叫电脑。`
        : `要在电脑上写文件和跑起来看效果，交给动手入口去做；先读 AGENTS.md，再动 memory/files/。`,
      tags: [{ kind: (meta.via === "API" ? "tool" : "hand") as "tool" | "hand", label: meta.via === "API" ? `调用了【${meta.name}】` : "交给动手入口" }],
    } as Think,
  };
  switch (tool) {
    case "translate": {
      const src = t.split(/[:：]/).slice(1).join("：").trim() || "霧が晴れる前に、想いを紙の舟にして";
      return {
        ...base,
        text: `翻译好啦 ${pick(kaomoji)} 一句话总结：关于等待和温柔告别，情绪克制、画面感很强。`,
        card: { type: "translate", source: src, target: "在雾散之前，把想念折成一只纸船。" },
      };
    }
    case "media": {
      const music = /歌|音乐|乐|歌单/.test(t);
      return music
        ? {
            ...base,
            text: `找到 4 首，适合窗外下雨的时候听 ${pick(kaomoji)}`,
            card: {
              type: "music",
              tracks: [
                { title: "love.", artist: "wave to earth", dur: "4:12" },
                { title: "seasons", artist: "wave to earth", dur: "4:16" },
                { title: "bad", artist: "wave to earth", dur: "3:58" },
                { title: "오늘만 I LOVE YOU", artist: "BOYNEXTDOOR", dur: "3:10" },
              ],
            },
          }
        : {
            ...base,
            text: `挑了 4 张雾灰调的，点开可以保存 ${pick(kaomoji)}`,
            card: {
              type: "images",
              items: [
                { title: "雾中山门", from: "#d9d6d5", to: "#a8a3a4" },
                { title: "樱色风铃", from: "#f6dfe5", to: "#e9b3c1" },
                { title: "四叶草布丁", from: "#faf7f2", to: "#e9b3c1" },
                { title: "雨后石阶", from: "#e2e0df", to: "#8e8b8c" },
              ],
            },
          };
    }
    case "worldbook": {
      const preset = /预设|人设/.test(t) && !/世界书/.test(t);
      const name = preset ? "新预设 · echo.json" : "雾中山寺 · 世界书 v2.md";
      const content = preset
        ? '{\n  "name": "echo",\n  "tone": "温柔、简短",\n  "call_user": "小雾"\n}'
        : "# 雾中山寺 v2\n\n## 地点\n终年起雾的山寺。\n\n## 规则\n雾浓时说出的话会被风铃记住。\n\n## 人物\n守钟人「echo」。";
      return {
        ...base,
        text: `写好啦，已经放进文件柜 ${pick(kaomoji)}`,
        card: null,
        file: { kind: preset ? "preset" : "worldbook", name, content },
      };
    }
    case "miniapp":
      return {
        ...base,
        handIntro: "这个要写代码再跑起来看看，我交给动手入口去做，你在这儿看着就好。",
        steps: [
          "› 读 AGENTS.md / CLAUDE.md",
          "› 新建 memory/files/粉色番茄钟.html",
          "✓ 写入计时逻辑 · 25 + 5 循环",
          "✓ 套用樱粉配色",
          "› 在隔离环境启动预览",
          "✓ 预览正常，已存入文件柜",
        ],
        text: `小应用做好了，可以在文件柜里预览 ${pick(kaomoji)}`,
        card: null,
        file: {
          kind: "miniapp",
          name: "粉色番茄钟.html",
          content: "<!-- 粉色番茄钟 -->\n<div id=t>25:00</div>\n<button>开始</button>\n<button>重置</button>\n<script>/* 25+5 循环 */</script>",
        },
      };
    case "script":
      return {
        ...base,
        handIntro: "这活儿要动电脑上的文件，我交给动手入口去做，你在这儿看着就好。",
        steps: [
          "› 读 AGENTS.md / CLAUDE.md",
          "› 扫描 memory/files/ · 3 个文件",
          "› 准备执行 rename.sh（系统命令）",
          "✓ 雾中山寺 · 世界书.md → 2026-11-22_…",
          "✓ echo 温柔模式 · 预设.json → 2026-11-22_…",
          "✓ 樱色番茄钟.html → 2026-11-23_…",
        ],
        confirmAt: 3,
        confirmText: "要执行系统命令 rename.sh，改 3 个文件名",
        text: `脚本跑完了，改动了 3 个文件名 ${pick(kaomoji)}`,
        card: {
          type: "diff",
          file: "文件柜 / rename.log",
          lines: [
            { t: "-", s: "雾中山寺 · 世界书.md" },
            { t: "+", s: "2026-11-22_雾中山寺 · 世界书.md" },
            { t: "-", s: "echo 温柔模式 · 预设.json" },
            { t: "+", s: "2026-11-22_echo 温柔模式 · 预设.json" },
            { t: "-", s: "樱色番茄钟.html" },
            { t: "+", s: "2026-11-23_樱色番茄钟.html" },
          ],
        },
      };
  }
}

export const fileKindLabel: Record<FileKind, string> = {
  worldbook: "世界书",
  preset: "预设",
  miniapp: "小应用",
  script: "脚本",
};

export type { Msg };
