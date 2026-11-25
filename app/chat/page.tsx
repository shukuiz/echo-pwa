"use client";

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/Chrome";
import {
  IconCode, IconHand, IconMusic, IconRetry, IconSend, IconStar, IconStop, IconWand,
  IconClip, IconMic, IconChevron, IconClock, IconSpark, IconTool, IconImage, IconCheck,
} from "@/components/Icons";
import { Card, Msg, uid, useStore } from "@/lib/store";
import { fileKindLabel, Think } from "@/lib/mock";
import { api, ApiError, ECHO_AUTH_ENABLED } from "@/lib/api";
import { addFavorite } from "@/lib/favorites";
import { createMemory } from "@/lib/memory";
import { GIcon } from "@/components/glass/Wall";

type Confirm = { action: string; onOk: () => void; onNo: () => void };
type Menu = { id: string; mine: boolean; rect: { top: number; left: number; width: number; height: number }; text: string; cls: string };
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
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  // 多选：sel 不为 null 就是多选模式；anchor = 最后点的那句，「从这句以后 / 以前」以它为准
  const [sel, setSel] = useState<string[] | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [askDel, setAskDel] = useState<string[] | null>(null);
  const [modelMenu, setModelMenu] = useState(false);
  const [work, setWork] = useState<Work | null>(null);
  const [now, setNow] = useState(Date.now());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Msg[]>(messages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const followLatest = useRef(true);
  const presetDone = useRef(false);
  const busy = !!streamingId || !!working || !!work;
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

  function clearAll() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    abortRef.current?.abort();
    abortRef.current = null;
  }
  const patch = (id: string, p: Partial<Msg>) => set("messages", (ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));

  /** 把最近 20 条消息发给后端，流式逐字回显 */
  async function doChat(history: Msg[], errId?: string, regenerate = false) {
    const echoId = errId ?? uid();
    if (errId) {
      patch(errId, { text: "", reasoning: undefined, note: undefined, status: "streaming", errorMessage: undefined, at: Date.now() });
    } else {
      set("messages", (ms) => [...ms, { id: echoId, role: "echo", text: "", status: "streaming", at: Date.now() }]);
    }
    setStreamingId(echoId);
    setWorking("echo 正在想…");

    const ac = new AbortController();
    abortRef.current = ac;
    const input = history.filter((m) => m.text).slice(-20).map((m) => ({ role: m.role, text: m.text }));
    const userId = [...history].reverse().find((m) => m.role === "user")?.id;
    let first = true;

    try {
      await api.chatStream(input, {
        model: settings.model,
        signal: ac.signal,
        ids: { user: userId, echo: echoId },
        regenerate,
        onReasoning: (text) => {
          if (first) { setWorking(null); first = false; }
          set("messages", (ms) => ms.map((m) => m.id === echoId ? { ...m, reasoning: (m.reasoning || "") + text } : m));
        },
        onNote: (text) => patch(echoId, { note: text }),
        onDelta: (d) => {
          if (first) { setWorking(null); first = false; }
          set("messages", (ms) => ms.map((m) => (m.id === echoId ? { ...m, text: m.text + d } : m)));
        },
      });
      patch(echoId, { status: "done" });
    } catch (e) {
      const aborted = (e as Error)?.name === "AbortError";
      patch(echoId, {
        status: aborted ? "stopped" : "error",
        errorMessage: aborted ? undefined : (e as Error).message,
      });
    } finally {
      setWorking(null);
      setStreamingId(null);
      abortRef.current = null;
    }
  }

  function sendText(raw: string) {
    const text = raw.trim();
    if (!text || abortRef.current) return;
    followLatest.current = true;
    const userMsg: Msg = { id: uid(), role: "user", text, status: "done", at: Date.now() };
    set("messages", (ms) => [...ms, userMsg]);
    doChat([...messagesRef.current, userMsg]);
  }

  function send() {
    if (!input.trim() || busy || confirm) return;
    sendText(input);
    setInput("");
    setModelMenu(false);
  }

  function stop() {
    abortRef.current?.abort();
    setWorking(null);
    setWork(null);
    if (streamingId) patch(streamingId, { status: "stopped" });
  }

  function retry(errId: string) {
    if (busy) return;
    const idx = messages.findIndex((m) => m.id === errId);
    if (idx < 0) return;
    doChat(messages.slice(0, idx), errId);
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
                  onClick={() => { set("settings", (s) => ({ ...s, model: md })); setModelMenu(false); }}
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
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
            rows={1}
            placeholder={confirm ? "请先在上方确认…" : "跟 echo 说点什么…"}
            className="block max-h-32 min-h-[38px] w-full resize-none bg-transparent px-1.5 py-1.5 text-input text-[color:var(--g-ink)] outline-none placeholder:text-[color:var(--g-mute)]"
          />
          <div className="mt-0.5 flex items-center gap-1.5">
            <button aria-label="附件" onClick={() => toast("附件先占位，P1 接上")} className="chip press grid h-9 w-9 shrink-0 place-items-center rounded-full">
              <IconClip size={18} />
            </button>
            <button aria-label="语音" onClick={() => toast("语音先占位")} className="chip press grid h-9 w-9 shrink-0 place-items-center rounded-full">
              <IconMic size={18} />
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
              <button aria-label="发送" onClick={send} disabled={!input.trim() || !!confirm} className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose text-[color:var(--accent-ink)] disabled:bg-orb/45">
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
      title="echo"
      footer={selectBar || composer}
      sub={
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
            <Bubble m={m} quiet={quiet} latest={m.id === messages.at(-1)?.id} selecting={!!sel} onMenu={openMenu} onRetry={() => retry(m.id)} />
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
          ["down", "从这句以后", () => startSelect(menu.id, "after")],
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

function ThinkLine({ think, defaultOpen = false, live = false }: { think: Think; defaultOpen?: boolean; live?: boolean }) {
  const [expanded, setExpanded] = useState<boolean>();
  const open = expanded ?? defaultOpen;
  const box = useRef<HTMLParagraphElement>(null);
  // 边想边写：展开时跟着滚到最新一行
  useEffect(() => { if (live && open && box.current) box.current.scrollTop = box.current.scrollHeight; }, [think.text, live, open]);
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
        <p ref={box} className={`thinkbox mt-1.5 max-w-full whitespace-pre-wrap break-words rounded-xl bg-tile/90 px-3 py-2 text-[13px] leading-[1.6] text-mute ${live ? "max-h-40 overflow-y-auto" : ""}`}>{think.text}</p>
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

function Bubble({ m, quiet, latest, selecting, onMenu, onRetry }: { m: Msg; quiet: boolean; latest: boolean; selecting: boolean; onMenu: (el: HTMLElement, m: Msg) => void; onRetry: () => void }) {
  const mine = m.role === "user";
  const press = useLongPress((el) => onMenu(el, m), selecting || m.status === "streaming");
  const thoughts = !mine && m.reasoning?.trim() ? <ThinkLine think={{ text: m.reasoning, tags: [] }} defaultOpen={!quiet} live={m.status === "streaming" && !m.text} />
    : !mine && m.think ? <ThinkLine think={m.think} defaultOpen={!quiet} />
    : !mine && latest && m.status === "done" && m.text
      ? <p className="mb-1 pl-10 text-[12px]" data-onwp>这条回复没有收到模型提供的思考内容</p> : null;
  if (!m.text && !m.card && m.status !== "error") {
    return thoughts && (
      <div className="pt-2">
        {thoughts}
        {m.status === "stopped" && <p className="pl-10 text-[12px]" data-onwp>已停止生成</p>}
        {m.note && <p className="pl-10 text-[12px]" data-onwp>{m.note}</p>}
      </div>
    );
  }
  if (m.status === "error") {
    return (
      <div className="pt-2">
        {thoughts}
        <div className="flex items-end gap-2 animate-rise">
          <Avatar />
          <div className="rounded-[22px] rounded-bl-md border border-rose/40 bg-tile px-4 py-2.5">
            <p className="text-[15px] text-rose">回复失败了 (；´д｀)</p>
            {m.errorMessage && <p className="max-w-[65vw] break-words text-sm text-rose">{m.errorMessage}</p>}
            <button onClick={onRetry} className="press mt-1.5 flex items-center gap-1.5 rounded-capsule bg-rose/10 px-3 py-1.5 text-[15px] text-rose"><IconRetry size={16} /> 重试</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="pt-2 animate-rise">
    {thoughts}
    <div className={`flex items-end gap-2 ${mine ? "justify-end" : ""}`}>
      {!mine && <Avatar />}
      <div className={`max-w-[80%] ${m.card && m.status === "done" ? "w-[80%]" : ""}`}>
        <div
          {...press}
          data-cssg
          data-hue={mine ? "me" : undefined}
          data-tint={mine ? "0.22" : undefined}
          className={`g bub inline-block whitespace-pre-wrap break-words px-4 py-2.5 text-[15px] leading-[22px] transition ${selecting ? "" : "active:scale-[0.98]"} ${
            mine ? "me float-right rounded-[22px] rounded-br-md" : "ai rounded-[22px] rounded-bl-md"
          }`}
        >
          {m.text}
          {m.status === "streaming" && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-blink bg-rose" />}
        </div>
        {mine && <div className="clear-both" />}
        {m.card && m.status === "done" && <ResultCard card={m.card} />}
        {m.status === "stopped" && <p className="mt-1 pl-2 text-[12px]" data-onwp>已停止生成</p>}
        {m.note && <p className="mt-1 pl-2 text-[12px]" data-onwp>{m.note}</p>}
        {m.status !== "streaming" && <p className={`mt-1 px-2 text-[11px] opacity-80 ${mine ? "text-right" : ""}`} data-onwp>{fmtTime(m.at)}</p>}
      </div>
    </div>
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
