"use client";

// 美化设置：风格 / 色调 / 字体 / 字色 / 桌面小组件布局
// 只存在这台设备的 localStorage（带版本号的独立 key），图片放 IndexedDB（见 lib/idb.ts）。
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type ThemeKind = "glass" | "real";
export type WidgetType = "clock" | "photo" | "echo" | "remind" | "note" | "calendar" | "countdown" | "gif";
export type WidgetSize = "s" | "m" | "l";
export type AppId = "chat" | "memory" | "remind" | "files" | "beauty" | "settings";
export type GlassParams = { refract: number; tint: number; blur: number; edge: number; shine: number; wobble: number };

export type WidgetItem = {
  id: string;
  kind: "w";
  type: WidgetType;
  size: WidgetSize;
  bg: "glass" | "solid" | "image";
  style?: "analog" | "flip" | "digital"; // 时钟
  color?: string;                          // 纯色背景
  img?: string;                            // 背景图（IndexedDB key）
  photos?: string[];                       // 照片（IndexedDB key）
  media?: { key: string; kind: "img" | "video" }; // 动图
  text?: string;                           // 便签
  title?: string; date?: string;           // 倒数日
  op?: number | null;                      // 单独透明度；null = 跟随全局
};
export type AppItem = { id: string; kind: "app"; app: AppId };
export type HomeItem = WidgetItem | AppItem;

export type Beauty = {
  v: 1;
  theme: ThemeKind;
  accent: string;
  mat: "frost" | "solid";
  tint: string;
  me: string;
  bubMode: "glass" | "tint";
  font: "sys" | "song";
  songOrig: boolean;          // 霞鹜新致宋 → 改用本机 IPA 原始字体（IPA 授权要求的恢复途径）
  preset: "mist" | "clear" | "frost" | null;
  icon: string;
  iconA: number;
  wA: number;
  P: GlassParams;
  motion: 0 | 1;
  wp: "default" | "user";
  inkMode: "auto" | "custom";
  inkColor: string;
  meInkMode: "follow" | "custom";
  meInkColor: string;
  items: HomeItem[];
  removed: AppId[];
};

export const BEAUTY_KEY = "echo-beauty-v1";

export const TINTS: [string, string][] = [["雾白", "#f3f6fa"], ["冰蓝", "#bfe2ff"], ["樱粉", "#ffc9d8"], ["薄荷", "#bdeedb"], ["奶茶", "#dfc4a8"], ["墨色", "#2b303b"]];
export const ICOLS: [string, string][] = [["雾白", "#f7f8fb"], ["奶白", "#fbf5ea"], ["樱粉", "#ffe6ee"], ["冰蓝", "#e5f1ff"], ["薄荷", "#e3f6ed"], ["雾紫", "#eee8ff"]];
export const MES: [string, string][] = [["樱粉", "#ffb6c8"], ["冰蓝", "#9fd2ff"], ["薄荷", "#9fe3c6"], ["奶茶", "#e6c39f"], ["雾紫", "#cdb8ff"], ["墨色", "#343a48"]];
export const FCOLS: [string, string][] = [["纯白", "#ffffff"], ["奶白", "#fff4e6"], ["墨灰", "#26303d"], ["樱粉", "#c9426f"], ["雾蓝", "#2f5b86"], ["可可", "#5b3d2e"]];
export const PRESETS: Record<"mist" | "clear" | "frost", GlassParams> = {
  mist: { refract: 26, tint: 6, blur: 2, edge: 25, shine: 13, wobble: 15 },
  clear: { refract: 34, tint: 0, blur: 0, edge: 30, shine: 16, wobble: 10 },
  frost: { refract: 18, tint: 14, blur: 7, edge: 20, shine: 10, wobble: 6 },
};
export const SLIDERS: [keyof GlassParams, string, number][] = [["refract", "折射", 60], ["blur", "模糊", 40], ["edge", "边缘", 40], ["shine", "高光", 40], ["wobble", "波动", 40]];

export const APPS: Record<AppId, { n: string; i: string; href: string }> = {
  chat: { n: "聊天", i: "chat", href: "/chat" },
  memory: { n: "记忆本", i: "book", href: "/memory" },
  remind: { n: "记事提醒", i: "bell", href: "/reminders" },
  files: { n: "文件柜", i: "folder", href: "/files" },
  beauty: { n: "美化", i: "palette", href: "/beauty" },
  settings: { n: "设置", i: "gear", href: "/settings" },
};
export const WT: Record<WidgetType, { n: string; i: string; d: string; c: [string, string] }> = {
  clock: { n: "时钟", i: "clock", d: "指针、翻页、数字", c: ["#9fd2ff", "#6aa8f0"] },
  photo: { n: "照片", i: "image", d: "多张会自动轮播", c: ["#ffc6a8", "#ff9a7a"] },
  echo: { n: "echo 状态", i: "star", d: "头像和最新一条消息", c: ["#ffb6c8", "#ff86a6"] },
  remind: { n: "下一个提醒", i: "bell", d: "最近要做的事", c: ["#ffd59e", "#ffae55"] },
  note: { n: "便签", i: "pen", d: "随手写两句", c: ["#ffe79a", "#f7c948"] },
  calendar: { n: "日历", i: "cal", d: "今天会圈出来", c: ["#ffa9b8", "#f2708a"] },
  countdown: { n: "倒数日", i: "hour", d: "离那天还有几天", c: ["#bfe8d4", "#5fc79c"] },
  gif: { n: "动图", i: "film", d: "GIF 或短视频循环播放", c: ["#d6c2ff", "#9a7cf0"] },
};

export const nid = () => "w" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

function nextChristmas() {
  const n = new Date();
  const y = n.getMonth() === 11 && n.getDate() > 25 ? n.getFullYear() + 1 : n.getFullYear();
  return `${y}-12-25`;
}

export function newWidget(type: WidgetType, size: WidgetSize): WidgetItem {
  const w: WidgetItem = { id: nid(), kind: "w", type, size, bg: "glass" };
  if (type === "clock") w.style = "analog";
  if (type === "photo") w.photos = [];
  if (type === "countdown") { w.title = "圣诞节"; w.date = nextChristmas(); }
  if (type === "note") w.text = "写点什么吧 (｡･ω･｡)";
  return w;
}

const seedItems = (): HomeItem[] => [
  { id: "w-clock", kind: "w", type: "clock", size: "s", style: "analog", bg: "glass" },
  { id: "w-cal", kind: "w", type: "calendar", size: "s", bg: "glass" },
  { id: "w-echo", kind: "w", type: "echo", size: "m", bg: "glass" },
  { id: "w-remind", kind: "w", type: "remind", size: "s", bg: "glass" },
  { id: "w-cd", kind: "w", type: "countdown", size: "s", title: "圣诞节", date: nextChristmas(), bg: "glass" },
  { id: "a-chat", kind: "app", app: "chat" }, { id: "a-remind", kind: "app", app: "remind" },
  { id: "a-files", kind: "app", app: "files" }, { id: "a-beauty", kind: "app", app: "beauty" },
  { id: "a-memory", kind: "app", app: "memory" }, { id: "a-settings", kind: "app", app: "settings" },
  { id: "w-note", kind: "w", type: "note", size: "s", text: "下雨天也要好好吃饭\n记得带伞 ☂", bg: "glass" },
  { id: "w-photo", kind: "w", type: "photo", size: "s", photos: [], bg: "glass" },
];

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const DEFAULT_ACCENT = "#b4637a";

export const defaultBeauty = (): Beauty => ({
  v: 1, theme: "glass", accent: DEFAULT_ACCENT, mat: "frost", tint: "#f3f6fa", me: "#ffb6c8", bubMode: "glass", font: "sys", songOrig: false,
  preset: "mist", icon: "#f7f8fb", iconA: 88, wA: 100, P: { ...PRESETS.mist }, motion: reducedMotion() ? 0 : 1, wp: "default",
  inkMode: "auto", inkColor: "#ffffff", meInkMode: "follow", meInkColor: "#3a2630",
  items: seedItems(), removed: [],
});

// ---------- 读取 + 迁移：每个字段单独校验，坏字段退回默认，不让一次脏数据弄坏整个桌面 ----------
const isHex = (s: unknown): s is string => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
const oneOf = <T extends string | number>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : undefined);
const WTYPES = Object.keys(WT) as WidgetType[];
const APPIDS = Object.keys(APPS) as AppId[];

function cleanItem(raw: unknown, seen: Set<string>): HomeItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let id = typeof r.id === "string" && r.id ? r.id.slice(0, 40) : nid();
  if (seen.has(id)) id = nid();
  if (r.kind === "app") {
    if (!APPIDS.includes(r.app as AppId)) return null;
    seen.add(id);
    return { id, kind: "app", app: r.app as AppId };
  }
  if (r.kind !== "w" || !WTYPES.includes(r.type as WidgetType)) return null;
  seen.add(id);
  const w: WidgetItem = { id, kind: "w", type: r.type as WidgetType, size: oneOf(r.size, ["s", "m", "l"] as const, "s"), bg: oneOf(r.bg, ["glass", "solid", "image"] as const, "glass") };
  if (r.style) w.style = oneOf(r.style, ["analog", "flip", "digital"] as const, "analog");
  if (isHex(r.color)) w.color = r.color;
  if (typeof r.img === "string") w.img = r.img;
  if (Array.isArray(r.photos)) w.photos = r.photos.filter((p): p is string => typeof p === "string").slice(0, 12);
  if (r.media && typeof r.media === "object") {
    const m = r.media as Record<string, unknown>;
    if (typeof m.key === "string") w.media = { key: m.key, kind: m.kind === "video" ? "video" : "img" };
  }
  const text = str(r.text); if (text !== undefined) w.text = text;
  const title = str(r.title, 60); if (title !== undefined) w.title = title;
  if (typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) w.date = r.date;
  w.op = typeof r.op === "number" ? num(r.op, 0, 100, 100) : null;
  if (w.bg === "image" && !w.img) w.bg = "glass";
  return w;
}

export function migrateBeauty(raw: unknown): Beauty {
  const d = defaultBeauty();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  // 以后升级到 v2 时在这里按 r.v 逐级迁移；现在只有 v1
  const P = (r.P && typeof r.P === "object" ? r.P : {}) as Record<string, unknown>;
  const b: Beauty = {
    v: 1,
    theme: oneOf(r.theme, ["glass", "real"] as const, d.theme),
    mat: oneOf(r.mat, ["frost", "solid"] as const, d.mat),
    accent: isHex(r.accent) ? r.accent : d.accent,
    tint: isHex(r.tint) ? r.tint : d.tint,
    me: isHex(r.me) ? r.me : d.me,
    bubMode: oneOf(r.bubMode, ["glass", "tint"] as const, d.bubMode),
    font: oneOf(r.font, ["sys", "song"] as const, d.font),
    songOrig: r.songOrig === true,
    preset: r.preset === null ? null : oneOf(r.preset, ["mist", "clear", "frost"] as const, "mist"),
    icon: isHex(r.icon) ? r.icon : d.icon,
    iconA: num(r.iconA, 0, 100, d.iconA),
    wA: num(r.wA, 0, 100, d.wA),
    P: {
      refract: num(P.refract, 0, 60, d.P.refract), tint: num(P.tint, 0, 80, d.P.tint), blur: num(P.blur, 0, 40, d.P.blur),
      edge: num(P.edge, 0, 40, d.P.edge), shine: num(P.shine, 0, 40, d.P.shine), wobble: num(P.wobble, 0, 40, d.P.wobble),
    },
    motion: r.motion === 0 ? 0 : r.motion === 1 ? 1 : d.motion,
    wp: oneOf(r.wp, ["default", "user"] as const, "default"),
    inkMode: oneOf(r.inkMode, ["auto", "custom"] as const, "auto"),
    inkColor: isHex(r.inkColor) ? r.inkColor : d.inkColor,
    meInkMode: oneOf(r.meInkMode, ["follow", "custom"] as const, "follow"),
    meInkColor: isHex(r.meInkColor) ? r.meInkColor : d.meInkColor,
    items: d.items,
    removed: Array.isArray(r.removed) ? (r.removed.filter((a) => APPIDS.includes(a as AppId)) as AppId[]) : [],
  };
  if (Array.isArray(r.items)) {
    const seen = new Set<string>();
    const items = r.items.map((it) => cleanItem(it, seen)).filter((x): x is HomeItem => !!x);
    if (items.length) b.items = items;
  }
  // 新版本加了新应用：既不在桌面也没被移走的，补到最后
  const onHome = new Set(b.items.filter((i): i is AppItem => i.kind === "app").map((i) => i.app));
  b.removed = b.removed.filter((a, i, arr) => !onHome.has(a) && arr.indexOf(a) === i);
  for (const a of APPIDS) if (!onHome.has(a) && !b.removed.includes(a)) b.items.push({ id: "a-" + a + "-" + nid(), kind: "app", app: a });
  return b;
}

export function loadBeauty(): Beauty {
  try {
    const raw = localStorage.getItem(BEAUTY_KEY);
    return raw ? migrateBeauty(JSON.parse(raw)) : defaultBeauty();
  } catch {
    return defaultBeauty();
  }
}

type Ctx = {
  b: Beauty;
  ready: boolean;
  setB: (patch: Partial<Beauty> | ((prev: Beauty) => Partial<Beauty>)) => void;
};
const BeautyCtx = createContext<Ctx | null>(null);

export function BeautyProvider({ children }: { children: React.ReactNode }) {
  const [b, setState] = useState<Beauty>(defaultBeauty);
  const [ready, setReady] = useState(false);
  const saveT = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { setState(loadBeauty()); setReady(true); }, []);

  useEffect(() => {
    if (!ready) return;
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      try { localStorage.setItem(BEAUTY_KEY, JSON.stringify(b)); } catch {}
    }, 200);
  }, [b, ready]);

  // 关页面前立刻写一次，别丢最后 200ms 的改动
  useEffect(() => {
    if (!ready) return;
    const flush = () => { try { localStorage.setItem(BEAUTY_KEY, JSON.stringify(bRef.current)); } catch {} };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [ready]);
  useEffect(() => {
    const root = document.documentElement.style;
    const rgb = b.accent.slice(1).match(/.{2}/g)?.map((channel) => parseInt(channel, 16));
    if (!rgb) return;
    root.setProperty("--accent", rgb.join(" "));
    const luminance = rgb.reduce((sum, channel, i) => {
      const srgb = channel / 255;
      return sum + [0.2126, 0.7152, 0.0722][i] * (srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4);
    }, 0);
    root.setProperty("--accent-ink", luminance > 0.179 ? "#171417" : "#fff");
  }, [b.accent]);
  const bRef = useRef(b);
  bRef.current = b;

  const setB: Ctx["setB"] = useCallback((patch) => {
    setState((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  }, []);

  return <BeautyCtx.Provider value={{ b, ready, setB }}>{children}</BeautyCtx.Provider>;
}

export function useBeauty() {
  const ctx = useContext(BeautyCtx);
  if (!ctx) throw new Error("useBeauty must be used inside BeautyProvider");
  return ctx;
}
