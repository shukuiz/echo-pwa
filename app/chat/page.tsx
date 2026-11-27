"use client";

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/Chrome";
import {
  IconCode, IconHand, IconMusic, IconRetry, IconSend, IconStar, IconStop, IconWand,
  IconClip, IconMic, IconChevron, IconClock, IconSpark, IconTool, IconImage, IconCheck, IconFolder,
} from "@/components/Icons";
import { Card, Msg, uid, useStore } from "@/lib/store";
import { fileKindLabel, Think } from "@/lib/mock";
import { api, ApiError, ECHO_AUTH_ENABLED, ECHO_AUTH_REQUIRED_EVENT, type ReplyAction } from "@/lib/api";
import { refreshLive, resumeGenerations, startGeneration, stopGeneration, useLiveGen } from "@/lib/generation";
import { addFavorite } from "@/lib/favorites";
import { createMemory } from "@/lib/memory";
import { GIcon } from "@/components/glass/Wall";
import { playBlob, startRecording, stopPlaying, type Recorder } from "@/lib/wav";

type Confirm = { action: string; onOk: () => void; onNo: () => void };
type Menu = { id: string; mine: boolean; rect: { top: number; left: number; width: number; height: number }; text: string; cls: string };

/** 把选中的图片压到长边 ≤1280、JPEG 0.78，返回 dataURL；手机大图直接发会卡、也容易超限 */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image"));
      img.onload = () => {
        const max = 1280;
        let { width, height } = img;
        if (width > max || height > max) {
          const r = Math.min(max / width, max / height);
          width = Math.round(width * r);
          height = Math.round(height * r);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("ctx"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}
/** 喇叭图标（图标库里没有，内联一个） */
function IconSpeaker({ size = 15, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 9.5v5h3l4.5 3.5v-12L7 9.5H4z" /><path d="M16 8.5a5 5 0 0 1 0 7" />
    </svg>
  );
}

const fileToBase64 = (f: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onerror = () => reject(new Error("read"));
  r.onload = () => resolve(String(r.result || ""));
  r.readAsDataURL(f);
});

type Work = {
  hand: string;
  branch: string;
  lines: string[];
  start: number;
  collapsed: boolean;
  confirm?: { text: string; onOk: () => void; onNo: () => void };
};

const fmtTime = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** 把一条短回复按句末标点断成多个气泡；长回复/小作文原样返回一个。纯函数，方便测试。 */
function splitTextIntoBubbles(text: string): string[] {
  const s = String(text ?? "");
  if (!s.trim()) return [s];
  const ellipses: string[] = [];
  const masked = s.replace(/\.\.\.|……|···/g, (m) => {
    ellipses.push(m);
    return `\uE000${ellipses.length - 1}\uE001`;
  });
  const restore = (p: string) => p.replace(/\uE000(\d+)\uE001/g, (_, i) => ellipses[Number(i)]).trim();
  const raw = masked.split(/(?<=[。！？!?\n])|(?<=\.)(?![0-9a-zA-Z])/);
  const parts = raw.map(restore).filter((p) => p.length > 0);
  const counted = [...s].length;
  if (counted > 120 || parts.length > 5) return [s];
  return parts.length ? parts : [s];
}

export default function ChatPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}

function Chat() {
  const { messages, set, toast, settings } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const [input, setInput] = useState("");
  const live = useLiveGen();
  const streamingId = live?.echoId ?? null;
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  // 多选：sel 不为 null 就是多选模式；anchor = 最后点的那句，「从这句以后 / 以前」以它为准
  const [sel, setSel] = useState<string[] | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [askDel, setAskDel] = useState<string[] | null>(null);
  const [modelMenu, setModelMenu] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const imgInputRef = useRef<HTMLInputElement>(null);
  // 文件：只留文件名和抽出来的文字，原文不落盘
  const [pendingFiles, setPendingFiles] = useState<{ name: string; chars: number; text: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recLevel, setRecLevel] = useState(0);
  const recRef = useRef<Recorder | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [now, setNow] = useState(Date.now());
  const [winTitle, setWinTitle] = useState("");
  useEffect(() => { api.getWindows().then((l) => setWinTitle(l.windows.find((w) => w.id === l.activeId)?.title || "")).catch(() => {}); }, []);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const messagesRef = useRef<Msg[]>(messages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const followLatest = useRef(true);
  const presetDone = useRef(false);
  const liveMsg = streamingId ? messages.find((m) => m.id === streamingId) : undefined;
  // 还没出第一个字时显示「正在想」
  const working = live && liveMsg && !liveMsg.text && !liveMsg.reasoning ? (live.polling ? "echo 还在写，正在接上…" : "echo 正在想…") : null;
  const busy = !!live || !!work;
  const workOpen = !!work && !work.collapsed;

  useLayoutEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = field.scrollHeight + "px";
  }, [input]);

  useEffect(() => {
    const scroller = bottomRef.current?.closest("main");
    if (scroller && followLatest.current) scroller.scrollTop = scroller.scrollHeight;
  }, [messages, working, confirm, work?.lines.length, workOpen]);

  useEffect(() => {
    const scroller = bottomRef.current?.closest("main");
    if (!scroller) return;
    const onScroll = () => {
      followLatest.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
    };
    const observer = new ResizeObserver(() => {
      if (followLatest.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(scroller);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!work) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [work]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => () => clearAll(), []);

  // 回到聊天页、从后台切回来：接上后端还在写的回复（离开页面不会取消生成）
  useEffect(() => {
    const setMsgs = (fn: (ms: Msg[]) => Msg[]) => set("messages", fn);
    void resumeGenerations(setMsgs);
    const onVis = () => { if (!document.hidden) { void refreshLive(); void resumeGenerations(setMsgs); } };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pageshow", onVis); };
  }, [set]);

  // 从工作台带入的预设指令：自动发送
  useEffect(() => {
    const preset = params.get("preset");
    if (preset && !presetDone.current) {
      presetDone.current = true;
      router.replace("/chat");
      setTimeout(() => sendText(preset), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // 只清本页的小计时器；正在生成的回复放在页面外面，离开聊天页也会写完
  function clearAll() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  /** 把最近 20 条消息发给后端，流式逐字回显；模型在这一刻定下，生成中途换模型不影响这一条 */
  function doChat(history: Msg[], errId?: string, regenerate = false) {
    void startGeneration({ set: (fn) => set("messages", fn), history, echoId: errId, regenerate, model: settings.model });
  }

  function sendText(raw: string, imgs: string[] = [], files: { name: string; chars: number; text: string }[] = []) {
    const text = raw.trim();
    if ((!text && imgs.length === 0 && files.length === 0) || live) return;
    followLatest.current = true;
    const userMsg: Msg = {
      id: uid(), role: "user", text, status: "done", at: Date.now(),
      ...(imgs.length ? { images: imgs } : {}),
      ...(files.length ? { files } : {}),
    };
    set("messages", (ms) => [...ms, userMsg]);
    doChat([...messagesRef.current, userMsg]);
  }

  function send() {
    if ((!input.trim() && pendingImages.length === 0 && pendingFiles.length === 0) || busy || confirm) return;
    const imgs = pendingImages;
    const files = pendingFiles;
    sendText(input, imgs, files);
    setInput("");
    setPendingImages([]);
    setPendingFiles([]);
    setModelMenu(false);
  }

  async function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const room = 4 - pendingImages.length;
    if (room <= 0) { toast("最多 4 张图"); return; }
    if (files.length > room) toast("最多 4 张图");
    const out: string[] = [];
    for (const f of files.slice(0, room)) {
      if (!f.type.startsWith("image/")) continue;
      try { out.push(await compressImage(f)); } catch {}
    }
    if (out.length) setPendingImages((prev) => [...prev, ...out].slice(0, 4));
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    setAttachMenu(false);
    if (!files.length) return;
    const room = 3 - pendingFiles.length;
    if (room <= 0) { toast("最多 3 个文件"); return; }
    if (files.length > room) toast("最多 3 个文件");
    for (const f of files.slice(0, room)) {
      if (f.size > 3 * 1024 * 1024) { toast(`${f.name} 超过 3MB，读不动`); continue; }
      try {
        const data = await fileToBase64(f);
        const out = await api.extractFile(f.name, f.type, data);
        setPendingFiles((p) => [...p, { name: out.name, chars: out.chars, text: out.text }].slice(0, 3));
        if (out.truncated) toast(`${f.name} 太长，只读了前 20 万字`);
      } catch (err) {
        toast((err as Error).message || `${f.name} 读不了`);
      }
    }
  }

  /** 按住说话：松手识别，文字进输入框（不直接发，留给你改） */
  async function beginRecord() {
    if (recording || busy) return;
    try {
      recRef.current = await startRecording(setRecLevel, () => { toast("说满 1 分钟啦，先发这段"); void endRecord(); });
      setRecording(true);
      navigator.vibrate?.(6);
    } catch {
      toast("没拿到麦克风权限，去浏览器设置里开一下");
    }
  }

  async function endRecord(cancel = false) {
    const rec = recRef.current;
    recRef.current = null;
    setRecording(false);
    setRecLevel(0);
    if (!rec) return;
    if (cancel) { rec.cancel(); return; }
    const wav = rec.stop();
    if (!wav) { toast("太短了，再说一次？"); return; }
    setTranscribing(true);
    try {
      const r = await api.transcribe(wav);
      setInput((v) => (v ? `${v} ${r.text}` : r.text));
    } catch (e) {
      toast((e as Error).message || "没听清");
    } finally {
      setTranscribing(false);
    }
  }

  /** 朗读一条回复：再点一次停 */
  async function speak(m: Msg) {
    if (!m.text) return;
    if (speaking === m.id) { stopPlaying(); setSpeaking(null); return; }
    setSpeaking(m.id);
    try {
      await playBlob(await api.speak(m.text));
    } catch (e) {
      toast((e as Error).message || "朗读失败");
    } finally {
      setSpeaking(null);
    }
  }

  /** 把这条消息存成 .md 文件（浏览器直接下载，不经过服务器） */
  function saveAsFile(id: string) {
    const m = messages.find((x) => x.id === id);
    setMenu(null);
    if (!m?.text) return;
    const blob = new Blob([m.text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `echo-${new Date().toISOString().slice(0, 10)}-${id.slice(-4)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("存成文件了");
  }

  function stop() {
    setWork(null);
    void stopGeneration();
  }

  /** 重试：先把后端里那条失败的旧回复删掉（可能带着半截字），再用新的请求 ID 重来 */
  async function retry(errId: string) {
    if (busy) return;
    const idx = messages.findIndex((m) => m.id === errId);
    if (idx < 0) return;
    try { await api.deleteMessages([errId]); } catch {}
    doChat(messages.slice(0, idx), errId);
  }

  /** 报错卡片上的按钮：重试 / 去设置 / 重新登录 */
  function onErrorAction(m: Msg, a: ReplyAction) {
    if (a === "retry") return void retry(m.id);
    if (a === "settings") return router.push("/settings");
    if (a === "relogin") {
      if (m.via === "codex" || settings.apiMode === "codex") return router.push("/settings");
      if (ECHO_AUTH_ENABLED) return void window.dispatchEvent(new Event(ECHO_AUTH_REQUIRED_EVENT));
      return router.push("/settings");
    }
  }

  function answer(ok: boolean) {
    if (!confirm) return;
    const c = confirm;
    setConfirm(null);
    ok ? c.onOk() : c.onNo();
  }

  /** 长按（或桌面右键）气泡：弹出玻璃菜单 */
  function openMenu(el: HTMLElement, m: Msg) {
    if (m.status === "streaming" || sel) return;
    const r = el.getBoundingClientRect();
    setMenu({ id: m.id, mine: m.role === "user", rect: { top: r.top, left: r.left, width: r.width, height: r.height }, text: m.text, cls: el.className });
  }

  const byIds = (ids: string[]) => messagesRef.current.filter((m) => ids.includes(m.id));
  const lastUserIdx = (ms: Msg[]) => { for (let i = ms.length - 1; i >= 0; i--) if (ms[i].role === "user") return i; return -1; };
  /** 只有最新一轮（最后一条用户消息和它之后 echo 的回复）可以重新生成 */
  function canRegenerate(id: string) {
    const ms = messages, u = lastUserIdx(ms), i = ms.findIndex((m) => m.id === id);
    return !busy && u >= 0 && i >= u;
  }

  async function copyMsg(id: string) {
    const m = messages.find((x) => x.id === id);
    try { await navigator.clipboard.writeText(m?.text ?? ""); toast("已复制"); } catch { toast("复制失败了 (；´д｀)"); }
    setMenu(null);
  }

  /** 删除（单条或多选）：先删后端 chat.json，成功再删本地；没开登录且连不上后端时只删本机 */
  async function removeMessages(ids: string[]) {
    setAskDel(null);
    try {
      await api.deleteMessages(ids);
    } catch (e) {
      if (ECHO_AUTH_ENABLED || !(e instanceof ApiError && e.status === 0)) { toast((e as Error).message || "删除失败"); return; }
    }
    set("messages", (ms) => ms.filter((m) => !ids.includes(m.id)));
    setSel(null); setAnchor(null);
    toast(ids.length > 1 ? `已删除 ${ids.length} 条` : "已删除");
  }

  /** 记住：存成记忆本里的一条「场景」 */
  async function remember(ids: string[]) {
    setMenu(null);
    const picked = byIds(ids).filter((m) => m.text.trim());
    if (!picked.length) return;
    const text = picked.length === 1 ? picked[0].text.trim() : picked.map((m) => `${m.role === "user" ? "我" : "echo"}：${m.text.trim()}`).join("\n");
    try {
      const { item, mode } = await createMemory({
        kind: "scene", title: picked[0].text.replace(/\s+/g, " ").trim().slice(0, 14), text,
        source: { type: "chat", messageIds: picked.map((m) => m.id) },
      });
      set("memory", (ms) => [item, ...ms]);
      toast(mode === "local" ? "记住啦（先存在本机）" : "记住啦，在记忆本里 ✓");
      setSel(null); setAnchor(null);
    } catch (e) {
      toast((e as Error).message || "没记住，再试一次？");
    }
  }

  /** 收藏：单条或多选都存成收藏本里的一个条目 */
  async function favorite(ids: string[]) {
    setMenu(null);
    const picked = byIds(ids).filter((m) => m.text.trim());
    if (!picked.length) return;
    try {
      const { source } = await addFavorite(picked.map((m) => ({ id: m.id, role: m.role, text: m.text, at: m.at })));
      toast(source === "local" ? "收藏好啦（先存在本机）" : "收藏好啦 ♡");
      setSel(null); setAnchor(null);
    } catch (e) {
      toast((e as Error).message || "收藏失败了");
    }
  }

  /** 重新生成本轮：删掉最后一条用户消息之后 echo 的回复，用同一句再请求一次 */
  async function regenerate() {
    setMenu(null);
    if (busy) return;
    const ms = messagesRef.current, u = lastUserIdx(ms);
    if (u < 0) return;
    const old = ms.slice(u + 1).map((m) => m.id);
    if (old.length) {
      try { await api.deleteMessages(old); } catch (e) {
        if (ECHO_AUTH_ENABLED || !(e instanceof ApiError && e.status === 0)) { toast((e as Error).message || "旧回复没删掉，先不重新生成"); return; }
      }
      set("messages", (list) => list.filter((m) => !old.includes(m.id)));
    }
    followLatest.current = true;
    doChat(ms.slice(0, u + 1), undefined, true);
  }

  // ---------- 多选 ----------
  const selectable = (m: Msg) => m.status !== "streaming";
  function startSelect(id: string, range?: "after" | "before") {
    setMenu(null);
    setSel(range ? rangeIds(id, range) : [id]);
    setAnchor(id);
  }
  function rangeIds(id: string, dir: "after" | "before") {
    const i = messages.findIndex((m) => m.id === id);
    const part = dir === "after" ? messages.slice(Math.max(0, i)) : messages.slice(0, i + 1);
    return part.filter(selectable).map((m) => m.id);
  }
  function toggle(id: string) {
    setAnchor(id);
    setSel((cur) => (cur ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));
  }
  /** 从这句以后 / 以前：把这一段全部勾上（已经全勾上了就全部取消） */
  function selectRange(dir: "after" | "before") {
    if (!anchor) return;
    const ids = rangeIds(anchor, dir);
    setSel((cur) => {
      const now = cur ?? [];
      const all = ids.every((x) => now.includes(x));
      return all ? now.filter((x) => !ids.includes(x)) : Array.from(new Set([...now, ...ids]));
    });
  }
  const allIds = messages.filter(selectable).map((m) => m.id);
  const allOn = !!sel && allIds.length > 0 && allIds.every((x) => sel.includes(x));
  /** 按聊天顺序排好的已选 id */
  const picked = sel ? messages.filter((m) => sel.includes(m.id)).map((m) => m.id) : [];

  // 从收藏本跳回来：/chat?focus=消息id
  useEffect(() => {
    const id = params.get("focus");
    if (!id) return;
    const t = setTimeout(() => {
      const el = document.getElementById("msg-" + id);
      if (!el) { toast("这条聊天记录已经不在了"); return; }
      followLatest.current = false;
      el.scrollIntoView({ block: "center" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1600);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const quiet = settings.quietThink;
  const selectBar = sel && (
    <div className="relative z-30 shrink-0 px-3">
      <div className="g cbar selbar" data-cssg data-tint="0.08" style={{ "--r": "26px" } as React.CSSProperties}>
        <div className="selhead">
          <b>已选 {picked.length} 条</b>
          <button className="chip selchip selall" onClick={() => setSel(allOn ? [] : allIds)}>{allOn ? "全不选" : "全选"}</button>
          <button className="selx" aria-label="退出多选" onClick={() => { setSel(null); setAnchor(null); }}><GIcon n="x" s={18} w={2.2} /></button>
          <div className="selrange">
            <button className="chip selchip" disabled={!anchor} onClick={() => selectRange("before")} aria-label="从这句以前全部勾选"><GIcon n="up" s={14} w={2.2} />从这句以前</button>
            <button className="chip selchip" disabled={!anchor} onClick={() => selectRange("after")} aria-label="从这句以后全部勾选">从这句以后<GIcon n="down" s={14} w={2.2} /></button>
          </div>
        </div>
        <div className="selacts">
          <button disabled={!picked.length} onClick={() => setAskDel(picked)} className="danger"><GIcon n="trash" s={20} />删除</button>
          <button disabled={!picked.length} onClick={() => favorite(picked)}><GIcon n="heart" s={20} />收藏</button>
          <button disabled={!picked.length} onClick={() => remember(picked)}><GIcon n="brain" s={20} />记住</button>
        </div>
      </div>
    </div>
  );
  const composer = (
      <div className="relative z-30 shrink-0 px-3">
      {/* 模型选择 */}
      {modelMenu && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setModelMenu(false)} />
          <div className="absolute inset-x-0 bottom-full mb-2 z-30 mx-auto w-full max-w-[430px] px-3">
            <div className="ml-auto w-full max-w-[260px] animate-pop rounded-[22px] bg-tile p-2 shadow-soft">
              <p className="px-3 py-1.5 text-[12px] text-mute">当前模型</p>
              <div className="model-list-scroll" tabIndex={0} aria-label="聊天模型列表">
              {settings.models.map((md) => (
                <button
                  key={md}
                  onClick={() => {
                    set("settings", (s) => ({ ...s, model: md })); setModelMenu(false);
                    if (live && md !== live.model) toast("这条还用原来的模型写完，新模型从下一条开始 ✿");
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left font-mono text-[14px] ${md === settings.model ? "bg-sakura/25 text-rose" : "text-ink"}`}
                >
                  <span className="min-w-0 break-all">{md}</span>
                  {md === settings.model && <IconCheck size={16} />}
                </button>
              ))}
              </div>
              <Link href="/settings" className="block px-3 pb-1 pt-2 text-[12px] text-mute">去设置里添加模型 ›</Link>
            </div>
          </div>
        </>
      )}

        <div className="g cbar px-3 pb-2.5 pt-2" data-cssg data-tint="0.08" style={{ "--r": "28px" } as React.CSSProperties}>
          <input ref={imgInputRef} type="file" accept="image/*" multiple onChange={onPickImages} className="hidden" />
          <input ref={fileInputRef} type="file" multiple onChange={onPickFiles}
            accept=".txt,.md,.markdown,.pdf,.docx,.csv,.json,.log,.yml,.yaml,.html,.htm,.xml,.srt,.vtt" className="hidden" />
          {recording && (
            <div className="mb-1.5 flex items-center gap-2 rounded-2xl bg-sakura/30 px-3 py-2 text-[13px] text-rose">
              <span className="h-2 w-2 animate-blink rounded-full bg-rose" />
              正在听…松手结束
              <span className="ml-auto flex h-4 items-end gap-[2px]">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="w-[3px] rounded-full bg-rose transition-all"
                    style={{ height: `${4 + recLevel * 14 * (i % 2 ? 0.7 : 1)}px` }} />
                ))}
              </span>
            </div>
          )}
          {(pendingImages.length > 0 || pendingFiles.length > 0) && (
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 px-1">
              {pendingImages.map((src, i) => (
                <div key={i} className="relative">
                  <img src={src} alt="" className="h-16 w-16 rounded-xl object-cover" />
                  <button
                    type="button"
                    aria-label="移除这张"
                    onClick={() => setPendingImages((p) => p.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-cream text-[12px]"
                  >×</button>
                </div>
              ))}
              {pendingFiles.map((f, i) => (
                <div key={`f${i}`} className="flex max-w-[62%] items-center gap-1 rounded-xl bg-tile px-2 py-1.5 text-[12px]">
                  <IconFolder size={13} className="shrink-0 text-mute" />
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-mute">{f.chars > 1000 ? `${Math.round(f.chars / 1000)}k字` : `${f.chars}字`}</span>
                  <button type="button" aria-label="移除这个文件" onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                    className="shrink-0 px-0.5 text-mute">×</button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
            rows={1}
            placeholder={confirm ? "请先在上方确认…" : recording ? "正在听…" : transcribing ? "正在认字…" : "跟 echo 说点什么…"}
            className="block max-h-32 min-h-[38px] w-full resize-none bg-transparent px-1.5 py-1.5 text-input text-[color:var(--g-ink)] outline-none placeholder:text-[color:var(--g-mute)]"
          />
          <div className="mt-0.5 flex items-center gap-1.5">
            <div className="relative shrink-0">
              <button aria-label="附件" onClick={() => setAttachMenu((v) => !v)} className="chip press grid h-9 w-9 place-items-center rounded-full">
                <IconClip size={18} />
              </button>
              {attachMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setAttachMenu(false)} />
                  <div className="absolute bottom-full left-0 z-30 mb-2 w-[176px] animate-pop overflow-hidden rounded-[18px] bg-tile p-1 shadow-soft">
                    <button type="button" onClick={() => { setAttachMenu(false); imgInputRef.current?.click(); }}
                      className="press flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-[14px]">
                      <IconImage size={16} /> 图片
                    </button>
                    <button type="button" onClick={() => { setAttachMenu(false); fileInputRef.current?.click(); }}
                      className="press flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-[14px]">
                      <IconFolder size={16} /> 文件（PDF / Word / 文本）
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              aria-label="按住说话"
              onPointerDown={(e) => { e.preventDefault(); void beginRecord(); }}
              onPointerUp={() => void endRecord()}
              onPointerCancel={() => void endRecord(true)}
              onContextMenu={(e) => e.preventDefault()}
              disabled={transcribing || busy}
              className={`chip press grid h-9 w-9 shrink-0 touch-none place-items-center rounded-full ${recording ? "bg-rose text-white" : ""} disabled:opacity-50`}
            >
              {transcribing ? <span className="text-[11px]">听…</span> : <IconMic size={18} />}
            </button>
            <button
              onClick={() => setModelMenu((v) => !v)}
              className="chip press flex h-9 min-w-0 flex-1 items-center justify-between gap-1 rounded-capsule px-3 font-mono text-[13px]"
            >
              <span className="truncate">{settings.model}</span>
              <IconChevron size={14} className={`shrink-0 transition ${modelMenu ? "" : "rotate-180"}`} />
            </button>
            {busy ? (
              <button aria-label="停止生成" onClick={stop} className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-cream">
                <IconStop size={18} />
              </button>
            ) : (
              <button aria-label="发送" onClick={send} disabled={(!input.trim() && pendingImages.length === 0 && pendingFiles.length === 0) || !!confirm} className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose text-[color:var(--accent-ink)] disabled:bg-orb/45">
                <IconSend size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
  );

  return (
    <PageShell
      glass
      title={winTitle ? `echo · ${winTitle}` : "echo"}
      footer={selectBar || composer}
      right={
        <Link href="/chat/window" className={`chip winbtn press ${busy ? "opacity-50" : ""}`} aria-label="换窗" aria-disabled={busy}
          onClick={(e) => { if (busy) { e.preventDefault(); toast("echo 还在回复，等这条说完再换窗"); } }}>
          <GIcon n="win" s={17} />换窗
        </Link>
      }
      sub={
        <div className="flex items-center gap-3">
          <button
            onClick={() => set("settings", (s) => ({ ...s, quietThink: !s.quietThink }))}
            className="mute flex items-center gap-1.5 text-[12px]"
            role="switch"
            aria-checked={!quiet}
            aria-label="自动展开思考"
          >
            {busy ? "忙碌中 · " : ""}自动展开思考
            <span className={`relative h-[16px] w-[28px] rounded-capsule transition ${!quiet ? "bg-rose" : "bg-orb/35"}`}>
              <span className={`absolute top-[2px] h-3 w-3 rounded-full bg-white transition-all ${!quiet ? "left-[14px]" : "left-[2px]"}`} />
            </span>
          </button>
          <button
            onClick={() => set("settings", (s) => ({ ...s, splitBubbles: !s.splitBubbles }))}
            className="mute flex items-center gap-1.5 text-[12px]"
            role="switch"
            aria-checked={!!settings.splitBubbles}
            aria-label="分气泡显示"
          >
            分气泡
            <span className={`relative h-[16px] w-[28px] rounded-capsule transition ${settings.splitBubbles ? "bg-rose" : "bg-orb/35"}`}>
              <span className={`absolute top-[2px] h-3 w-3 rounded-full bg-white transition-all ${settings.splitBubbles ? "left-[14px]" : "left-[2px]"}`} />
            </span>
          </button>
        </div>
      }
    >
      {confirm && (
        <div className="sticky top-0 z-20 -mx-1 mb-3 animate-pop">
          <div className="block-white flex items-center gap-3 rounded-[26px] p-3 pl-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sakura/40 text-rose"><IconHand size={20} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-mute">echo 想要执行</p>
              <p className="truncate text-[15px] font-medium">{confirm.action}</p>
            </div>
            <button onClick={() => answer(false)} className="press rounded-capsule bg-orb/15 px-3.5 py-2 text-[15px] text-ink">不同意</button>
            <button onClick={() => answer(true)} className="press rounded-capsule bg-rose px-3.5 py-2 text-[15px] text-white">同意</button>
          </div>
        </div>
      )}

      {/* 工作窗收起后的小胶囊 */}
      {work && work.collapsed && (
        <div className="sticky top-0 z-20 flex justify-center">
          <button
            onClick={() => setWork((w) => w && { ...w, collapsed: false })}
            className="press flex animate-pop items-center gap-2 rounded-capsule bg-cream px-4 py-2 text-[13px] text-ink/80 shadow-soft"
          >
            <span className={`h-1.5 w-1.5 rounded-full bg-rose ${work.confirm ? "" : "animate-blink"}`} />
            {work.hand} {work.confirm ? "等你点头" : "干活中"} · {fmtDur(now - work.start)}
            <IconChevron size={14} className="rotate-180" />
          </button>
        </div>
      )}

      <div className="space-y-1 pt-2">
        {messages.length === 0 && (
          <p className="pt-20 text-center" data-onwp>和 echo 说点什么吧 ( ˘ᵕ˘ )</p>
        )}
        {messages.map((m) => (
          <div key={m.id} id={"msg-" + m.id} className={`msgrow ${sel ? "selecting" : ""} ${sel?.includes(m.id) ? "picked" : ""}`}
            onClick={sel && selectable(m) ? () => toggle(m.id) : undefined}>
            {sel && selectable(m) && (
              <span className="selbox" role="checkbox" aria-checked={sel.includes(m.id)} aria-label={sel.includes(m.id) ? "取消勾选" : "勾选这条"}>
                <GIcon n="check" s={14} w={3} />
              </span>
            )}
            <Bubble m={m} quiet={quiet} latest={m.id === messages.at(-1)?.id} selecting={!!sel} split={!!settings.splitBubbles} translateThink={settings.thinkTranslate !== false} onMenu={openMenu} onAction={(a) => onErrorAction(m, a)} busy={busy} onSpeak={speak} speaking={speaking} />
          </div>
        ))}
        {working && (
          <div className="flex items-center gap-2 pt-2 animate-rise">
            <Avatar />
            <div className="g bub flex items-center gap-2 rounded-[22px] rounded-bl-md px-4 py-2.5 text-[15px]" data-cssg>
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-blink rounded-full bg-rose" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </span>
              {working}
            </div>
          </div>
        )}
        <div ref={bottomRef} className={workOpen ? "h-[260px]" : undefined} />
      </div>

      {/* 动手入口工作窗 */}
      {workOpen && work && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+122px)] z-30 mx-auto w-full max-w-[430px] px-3 animate-pop">
          <div className="overflow-hidden rounded-[24px] bg-cream shadow-soft">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <span className="text-[15px] font-semibold">{work.hand}</span>
              <span className="rounded-capsule bg-sakura/30 px-2.5 py-0.5 font-mono text-[12px] text-rose">{work.branch}</span>
              <span className="flex-1" />
              <button aria-label="收起" onClick={() => setWork((w) => w && { ...w, collapsed: true })} className="press grid h-8 w-8 place-items-center rounded-full bg-fog text-mute">
                <IconChevron size={16} />
              </button>
            </div>
            <div className="max-h-[190px] overflow-y-auto px-4 py-2.5 font-mono text-[12.5px] leading-[1.8]">
              {work.lines.length === 0 && <p className="text-mute">› 正在连上旧电脑…</p>}
              {work.lines.map((l, i) => (
                <p key={i} className={`animate-rise ${l.startsWith("✓") ? "text-ink" : "text-mute"}`}>
                  {l.startsWith("✓") ? <><span className="text-rose">✓</span>{l.slice(1)}</> : l}
                </p>
              ))}
            </div>
            {work.confirm && (
              <div className="mx-3 mb-3 animate-pop rounded-[18px] bg-tile p-3">
                <p className="flex items-center gap-2 text-[14px]"><IconHand size={16} className="text-rose" /> {work.confirm.text}</p>
                <div className="mt-2.5 flex gap-2">
                  <button onClick={work.confirm.onNo} className="press flex-1 rounded-capsule bg-fog py-2 text-[15px]">不同意</button>
                  <button onClick={work.confirm.onOk} className="press flex-1 rounded-capsule bg-rose py-2 text-[15px] text-white">同意</button>
                </div>
              </div>
            )}
            <div className="flex justify-between px-4 pb-3 text-[12px] text-mute">
              <span>已忙 {fmtDur(now - work.start)}</span>
              <span>{work.confirm ? "等你点头" : "干活中…"}</span>
            </div>
          </div>
        </div>
      )}

      {menu && (() => {
        const H = 172, vh = window.innerHeight, vw = Math.min(window.innerWidth, 430);
        const regen = canRegenerate(menu.id);
        const bubbleTop = Math.max(70, Math.min(menu.rect.top, vh - H - menu.rect.height - 24));
        const below = bubbleTop + menu.rect.height + 10;
        const menuW = 292, left = Math.max(10, Math.min(menu.mine ? menu.rect.left + menu.rect.width - menuW : menu.rect.left, vw - menuW - 10));
        const acts: [string, string, () => void, string?][] = [
          ["copy", "复制", () => copyMsg(menu.id)],
          ["brain", "记住", () => remember([menu.id])],
          ["heart", "收藏", () => favorite([menu.id])],
          ["select", "多选", () => startSelect(menu.id)],
          ["chev", "从这句以后", () => startSelect(menu.id, "after")],
          ["download", "存成文件", () => saveAsFile(menu.id)],
          ...(regen ? [["retry", "重新生成本轮", regenerate] as [string, string, () => void]] : []),
          ["trash", "删除", () => { setMenu(null); setAskDel([menu.id]); }, "danger"],
        ];
        return (
          <div className="msgmenu fixed inset-0 z-50" onClick={() => setMenu(null)} onContextMenu={(e) => e.preventDefault()}>
            <div className="absolute inset-0 bg-[rgba(16,24,38,.22)] backdrop-blur-[3px]" />
            <div className={menu.cls + " pointer-events-none absolute animate-pop whitespace-pre-wrap break-words"}
              style={{ top: bubbleTop, left: menu.rect.left, width: menu.rect.width, maxHeight: vh * 0.45, overflow: "hidden" }}>
              {menu.text}
            </div>
            <div className="gmenu animate-pop" role="menu" aria-label="消息操作" style={{ top: Math.min(below, vh - H - 12), left, width: menuW }} onClick={(e) => e.stopPropagation()}>
              {acts.map(([icon, label, fn, cls]) => (
                <button key={label} role="menuitem" className={cls} onClick={fn}><GIcon n={icon} s={21} />{label}</button>
              ))}
            </div>
          </div>
        );
      })()}

      {askDel && (
        <>
          <div className="gmask" onClick={() => setAskDel(null)} />
          <div className="gsheet on" role="alertdialog" aria-label="确认删除">
            <div className="grab" />
            <div className="sh-h"><b>删除 {askDel.length} 条消息？</b></div>
            <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>聊天记录里也会删掉，删了就找不回来了（收藏和记住过的不受影响）</p>
            <div className="addl">
              <button className="gbtn red" onClick={() => removeMessages(askDel)}>删除</button>
              <button className="gbtn" onClick={() => setAskDel(null)}>取消</button>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}

function Avatar() {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center self-end rounded-full bg-sakura/40 text-rose">
      <IconStar size={16} />
    </span>
  );
}

function ThinkLine({ think, defaultOpen = false, live = false, translate = true }: { think: Think; defaultOpen?: boolean; live?: boolean; translate?: boolean }) {
  const [expanded, setExpanded] = useState<boolean>();
  const open = expanded ?? defaultOpen;
  const box = useRef<HTMLParagraphElement>(null);
  // 思考翻译：展开时才请求（不展开不花钱），翻完缓存在组件里；失败就保持原文
  const [zh, setZh] = useState("");
  const [orig, setOrig] = useState(false);
  const [tr, setTr] = useState<"idle" | "loading" | "done" | "none">("idle");
  const asked = useRef("");
  // 边想边写：展开时跟着滚到最新一行
  useEffect(() => { if (live && open && box.current) box.current.scrollTop = box.current.scrollHeight; }, [think.text, live, open]);
  useEffect(() => {
    if (!translate || !open || live || tr !== "idle") return;
    const t = (think.text || "").trim();
    if (!t || asked.current === t) return;
    asked.current = t;
    setTr("loading");
    api.translateThought(t)
      .then((r) => { if (r?.text) { setZh(r.text); setTr("done"); } else setTr("none"); })
      .catch(() => setTr("none"));
  }, [open, live, translate, think.text, tr]);
  const showingZh = tr === "done" && !!zh && !orig;
  return (
    <div className="mb-1.5 pl-10">
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]" data-onwp>
        <button aria-expanded={open} onClick={() => setExpanded(!open)} className="flex min-h-11 items-center gap-1">
          <IconClock size={14} /> {live ? <>正在思考<span className="animate-blink">…</span></> : "思考过程"} <IconChevron size={13} className={`transition ${open ? "" : "-rotate-90"}`} />
        </button>
        {think.tags.map((t, i) => (
          <span key={i} className={`flex items-center gap-1 rounded-capsule px-2 py-0.5 [text-shadow:none] ${t.kind === "memory" ? "bg-sakura/60 text-rose" : "bg-white/50 text-[#3d393b]"}`}>
            {t.kind === "memory" ? <IconSpark size={12} /> : t.kind === "hand" ? <IconHand size={12} /> : <IconTool size={12} />}
            {t.label}
          </span>
        ))}
      </div>
      {open && (
        <div className="thinkbox mt-1.5 max-w-full rounded-xl bg-tile/90 px-3 py-2 text-[13px] leading-[1.6] text-mute">
          <p ref={box} className={`max-w-full whitespace-pre-wrap break-words ${live ? "max-h-40 overflow-y-auto" : ""}`}>{showingZh ? zh : think.text}</p>
          {!live && (tr === "loading" || tr === "done") && (
            <div className="mt-1 flex items-center gap-2 text-[11.5px] opacity-70" data-onwp>
              {tr === "loading" ? <span>正在翻译…</span> : <button type="button" onClick={() => setOrig(!orig)} className="underline underline-offset-2">{orig ? "看译文" : "看原文"}</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 长按 500ms 或右键：触发 cb；手指一动（滚动）就取消；长按触发后吞掉随后的那次点击 */
function useLongPress(cb: (el: HTMLElement) => void, disabled: boolean, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => { clearTimeout(timer.current); start.current = null; };
  useEffect(() => clear, []);
  if (disabled) return {};
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      const el = e.currentTarget;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { fired.current = true; start.current = null; navigator.vibrate?.(8); cb(el); }, ms);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const s0 = start.current;
      if (s0 && Math.hypot(e.clientX - s0.x, e.clientY - s0.y) > 8) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      clear();
      if (!fired.current) cb(e.currentTarget);
      fired.current = false;
    },
    onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
      if (fired.current) { e.stopPropagation(); e.preventDefault(); fired.current = false; }
    },
  };
}

const ACTION_LABEL: Record<ReplyAction, string> = { retry: "重试", settings: "去设置", relogin: "重新登录", continue: "接着说" };
const KIND_ACTIONS: Record<string, ReplyAction[]> = {
  login: ["relogin", "settings"], quota: ["settings", "retry"], network: ["retry"], param: ["settings", "retry"],
  timeout: ["retry", "settings"], busy: ["retry"], other: ["retry", "settings"],
};

/** 出错卡片：说人话的原因 + 能做的事；已经写出的字照样留在上面的气泡里 */
function ErrorCard({ m, onAction, busy }: { m: Msg; onAction: (a: ReplyAction) => void; busy: boolean }) {
  const acts = (m.actions?.length ? m.actions : KIND_ACTIONS[m.errorKind || "other"] || ["retry"]).filter((a) => a !== "continue");
  return (
    <div className="flex items-end gap-2 animate-rise">
      {!m.text && <Avatar />}
      <div className={`g reply-err ${m.text ? "ml-10" : ""}`} data-cssg data-tint="0.12" role="alert">
        <p className="t">{m.text ? "这条没写完 (；´д｀)" : "回复失败了 (；´д｀)"}</p>
        {m.errorMessage && <p className="d">{m.errorMessage}</p>}
        {m.text && <p className="d mute">已经写出的字都留着</p>}
        <div className="acts">
          {acts.map((a) => (
            <button key={a} type="button" disabled={busy && a === "retry"} onClick={() => onAction(a)} className={a === "retry" ? "on" : ""}>
              {a === "retry" && <IconRetry size={15} />}{ACTION_LABEL[a]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bubble({ m, quiet, latest, selecting, split, translateThink, onMenu, onAction, busy, onSpeak, speaking }: { m: Msg; quiet: boolean; latest: boolean; selecting: boolean; split: boolean; translateThink: boolean; onMenu: (el: HTMLElement, m: Msg) => void; onAction: (a: ReplyAction) => void; busy: boolean; onSpeak: (m: Msg) => void; speaking: string | null }) {
  const mine = m.role === "user";
  const [zoom, setZoom] = useState<string | null>(null);
  const hasImages = !!(m.images && m.images.length);
  const press = useLongPress((el) => onMenu(el, m), selecting || m.status === "streaming");
  const thoughts = !mine && m.reasoning?.trim() ? <ThinkLine think={{ text: m.reasoning, tags: [] }} defaultOpen={!quiet} live={m.status === "streaming" && !m.text} translate={translateThink} />
    : !mine && m.think ? <ThinkLine think={m.think} defaultOpen={!quiet} translate={translateThink} />
    : !mine && latest && m.status === "done" && m.text
      ? <p className="mb-1 pl-10 text-[12px]" data-onwp>这条回复没有收到模型提供的思考内容</p> : null;
  // 只拆「echo 的、生成完成的、开关打开的、短回复」；流式/我方/小作文都保持单气泡
  const parts = m.text ? (!mine && split && m.status === "done" ? splitTextIntoBubbles(m.text) : [m.text]) : [];
  const multi = parts.length > 1;
  const bubbleClass = (p: string) => `g bub inline-block whitespace-pre-wrap break-words px-4 py-2.5 text-[15px] leading-[22px] transition ${selecting ? "" : "active:scale-[0.98]"} ${
    mine ? "me float-right rounded-[22px] rounded-br-md" : "ai rounded-[22px] rounded-bl-md"
  }${multi ? " animate-rise" : ""}`;
  const bubbleStyle = (i: number) => multi ? { animationDelay: `${i * 0.28}s`, animationFillMode: "both" as const } : undefined;
  if (!m.text && !m.card && !hasImages && m.status !== "error") {
    return thoughts && (
      <div className="pt-2">
        {thoughts}
        {m.status === "stopped" && <p className="pl-10 text-[12px]" data-onwp>已停止生成</p>}
        {m.note && <p className="pl-10 text-[12px]" data-onwp>{m.note}</p>}
      </div>
    );
  }
  if (m.status === "error" && !m.text) {
    return (
      <div className="pt-2">
        {thoughts}
        <ErrorCard m={m} onAction={onAction} busy={busy} />
      </div>
    );
  }
  return (
    <div className="pt-2 animate-rise">
    {thoughts}
    <div className={`flex items-end gap-2 ${mine ? "justify-end" : ""}`}>
      {!mine && <Avatar />}
      <div className={`max-w-[80%] ${m.card && m.status === "done" ? "w-[80%]" : ""}`}>
        {hasImages && (
          <div className={`mb-1.5 flex flex-wrap gap-1.5 ${mine ? "justify-end" : ""}`}>
            {m.images!.map((src, i) => (
              <button key={i} type="button" onClick={() => setZoom(src)} className="press overflow-hidden rounded-xl">
                <img src={src} alt="" className="h-24 w-24 object-cover" />
              </button>
            ))}
          </div>
        )}
        {!!m.files?.length && (
          <div className={`mb-1.5 flex flex-wrap gap-1.5 ${mine ? "justify-end" : ""}`}>
            {m.files.map((f, i) => (
              <span key={i} className="flex max-w-[240px] items-center gap-1.5 rounded-xl bg-tile px-2.5 py-1.5 text-[12px] text-mute">
                <IconFolder size={13} className="shrink-0" />
                <span className="truncate text-ink">{f.name}</span>
                <span className="shrink-0">{f.chars > 1000 ? `${Math.round(f.chars / 1000)}k字` : `${f.chars}字`}</span>
              </span>
            ))}
          </div>
        )}
        <div className={multi ? `flex flex-col gap-1.5 ${mine ? "items-end" : "items-start"}` : ""}>
          {parts.map((p, i) => (
            <div
              key={i}
              {...(i === 0 ? press : {})}
              data-cssg
              data-hue={mine ? "me" : undefined}
              data-tint={mine ? "0.22" : undefined}
              className={bubbleClass(p)}
              style={bubbleStyle(i)}
            >
              {p}
              {m.status === "streaming" && i === parts.length - 1 && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-blink bg-rose" />}
            </div>
          ))}
        </div>
        {mine && <div className="clear-both" />}
        {m.card && m.status === "done" && <ResultCard card={m.card} />}
        {m.status === "stopped" && <p className="mt-1 pl-2 text-[12px]" data-onwp>已停止生成，写出的字留着</p>}
        {m.note && <p className="mt-1 pl-2 text-[12px]" data-onwp>{m.note}</p>}
        {m.status !== "streaming" && (
          <p className={`mt-1 flex items-center gap-2 px-2 text-[11px] opacity-80 ${mine ? "justify-end" : ""}`} data-onwp>
            <span>{fmtTime(m.at)}</span>
            {!mine && m.text && (
              <button type="button" aria-label={speaking === m.id ? "停止朗读" : "朗读这条"} onClick={() => onSpeak(m)} className="press flex items-center gap-1">
                <IconSpeaker size={13} className={speaking === m.id ? "text-rose" : ""} />
                {speaking === m.id && <span className="text-rose">朗读中</span>}
              </button>
            )}
          </p>
        )}
      </div>
    </div>
    {m.status === "error" && <div className="mt-1.5"><ErrorCard m={m} onAction={onAction} busy={busy} /></div>}
    {zoom && (
      <div className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-4" onClick={() => setZoom(null)}>
        <img src={zoom} alt="" className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain" />
      </div>
    )}
    </div>
  );
}

/* ---------- 结果卡片 ---------- */

function ResultCard({ card }: { card: Card }) {
  const [playing, setPlaying] = useState<number | null>(null);
  const [big, setBig] = useState<number | null>(null);
  const shell = "mt-2 animate-pop overflow-hidden rounded-[22px] bg-tile shadow-soft";

  if (card.type === "images")
    return (
      <div className={shell + " p-2"}>
        <div className="grid grid-cols-2 gap-2">
          {card.items.map((it, i) => (
            <button
              key={i}
              onClick={() => setBig(big === i ? null : i)}
              className={`press relative grid place-items-center overflow-hidden rounded-2xl text-[34px] ${big === i ? "col-span-2 aspect-[16/10]" : "aspect-square"}`}
              style={{ background: `linear-gradient(150deg, ${it.from}, ${it.to})` }}
            >
              <IconImage size={30} className="text-white/80" />
              <span className="absolute bottom-1.5 left-2 rounded-capsule bg-white/70 px-2 py-0.5 text-[12px] text-[#3d393b]">{it.title}</span>
            </button>
          ))}
        </div>
      </div>
    );

  if (card.type === "music")
    return (
      <div className={shell + " divide-y divide-line"}>
        {card.tracks.map((t, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fog to-sakura/60 text-orb"><IconMusic size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">{t.title}</p>
              <p className="truncate text-[13px] text-mute">{t.artist} · {t.dur}</p>
            </div>
            <button
              aria-label={playing === i ? "暂停" : "播放"}
              onClick={() => setPlaying(playing === i ? null : i)}
              className={`press grid h-9 w-9 place-items-center rounded-full ${playing === i ? "bg-rose text-white" : "bg-orb text-white"}`}
            >
              {playing === i ? <IconStop size={14} /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>}
            </button>
          </div>
        ))}
      </div>
    );

  if (card.type === "file")
    return (
      <div className={shell}>
        <div className="flex items-center gap-3 px-4 pt-3">
          <span className="orb h-9 w-9 shrink-0">{card.kind === "miniapp" ? <IconCode size={18} /> : <IconWand size={18} />}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium">{card.name}</p>
            <p className="text-[12px] text-mute">{fileKindLabel[card.kind]} · 已存入文件柜</p>
          </div>
        </div>
        <pre className="mx-3 mt-2 max-h-28 overflow-hidden whitespace-pre-wrap rounded-xl bg-fog px-3 py-2 font-mono text-[12px] leading-5 text-ink/80">{card.preview}</pre>
        <Link href={`/files?open=${card.fileId}`} className="press m-3 block rounded-capsule bg-sakura/40 py-2 text-center text-[15px] text-rose">在文件柜打开</Link>
      </div>
    );

  if (card.type === "diff")
    return (
      <div className={shell}>
        <p className="px-4 pt-3 text-[13px] text-mute">修改结果 · {card.file}</p>
        <div className="m-3 mt-2 overflow-hidden rounded-xl bg-fog font-mono text-[12px] leading-6">
          {card.lines.map((l, i) => (
            <div key={i} className={`truncate px-3 ${l.t === "+" ? "bg-sakura/30 text-rose" : l.t === "-" ? "text-mute line-through decoration-mute/50" : ""}`}>
              {l.t} {l.s}
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <div className={shell + " p-4"}>
      <p className="text-[13px] text-mute">原文</p>
      <p className="text-[15px]">{card.source}</p>
      <div className="my-2.5 h-px bg-line" />
      <p className="text-[13px] text-rose">译文</p>
      <p className="text-[15px] font-medium">{card.target}</p>
    </div>
  );
}
