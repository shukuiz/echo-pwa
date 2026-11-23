"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/Chrome";
import {
  IconCode, IconCopy, IconHand, IconMusic, IconRetry, IconSend, IconStar, IconStop, IconTrash, IconWand,
  IconClip, IconMic, IconChevron, IconClock, IconSpark, IconTool, IconImage, IconCheck,
} from "@/components/Icons";
import { Card, Msg, uid, useStore } from "@/lib/store";
import { fileKindLabel, Think } from "@/lib/mock";
import { api } from "@/lib/api";

type Confirm = { action: string; onOk: () => void; onNo: () => void };
type Menu = { id: string; top: number; left: number; right: number; mine: boolean; rect: { top: number; left: number; width: number; height: number }; html: string; cls: string };
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
  const [modelMenu, setModelMenu] = useState(false);
  const [work, setWork] = useState<Work | null>(null);
  const [now, setNow] = useState(Date.now());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Msg[]>(messages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const presetDone = useRef(false);
  const busy = !!streamingId || !!working || !!work;
  const workOpen = !!work && !work.collapsed;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, working, confirm, work?.lines.length, workOpen]);

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
  async function doChat(history: Msg[], errId?: string) {
    const echoId = errId ?? uid();
    if (errId) {
      patch(errId, { text: "", status: "streaming", at: Date.now() });
    } else {
      set("messages", (ms) => [...ms, { id: echoId, role: "echo", text: "", status: "streaming", at: Date.now() }]);
    }
    setStreamingId(echoId);
    setWorking("echo 正在想…");

    const ac = new AbortController();
    abortRef.current = ac;
    const input = history.slice(-20).map((m) => ({ role: m.role, text: m.text }));
    let first = true;

    try {
      await api.chatStream(input, {
        model: settings.model,
        signal: ac.signal,
        onDelta: (d) => {
          if (first) { setWorking(null); first = false; }
          set("messages", (ms) => ms.map((m) => (m.id === echoId ? { ...m, text: m.text + d } : m)));
        },
      });
      patch(echoId, { status: "done" });
    } catch (e) {
      const aborted = (e as Error)?.name === "AbortError";
      patch(echoId, { status: aborted ? "stopped" : "error" });
    } finally {
      setWorking(null);
      setStreamingId(null);
      abortRef.current = null;
    }
  }

  function sendText(raw: string) {
    const text = raw.trim();
    if (!text) return;
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
    abortRef.current = null;
    setWorking(null);
    setWork(null);
    if (streamingId) patch(streamingId, { status: "stopped" });
    setStreamingId(null);
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

  function openMenu(e: React.MouseEvent<HTMLDivElement>, m: Msg) {
    if (m.status === "streaming" || m.status === "error") return;
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ id: m.id, top: r.bottom + 8, left: r.left, right: window.innerWidth - r.right, mine: m.role === "user", rect: { top: r.top, left: r.left, width: r.width, height: r.height }, html: m.text, cls: e.currentTarget.className });
  }

  async function copyMsg(id: string) {
    const m = messages.find((x) => x.id === id);
    try { await navigator.clipboard.writeText(m?.text ?? ""); toast("已复制"); } catch { toast("复制失败，请长按文字手动复制"); }
    setMenu(null);
  }
  function deleteMsg(id: string) {
    set("messages", (ms) => ms.filter((m) => m.id !== id));
    setMenu(null);
    toast("已删除");
  }

  const quiet = settings.quietThink;

  return (
    <PageShell
      title="echo"
      sub={
        <button
          onClick={() => set("settings", (s) => ({ ...s, quietThink: !s.quietThink }))}
          className="flex items-center gap-1.5 text-[12px] text-mute"
          role="switch"
          aria-checked={quiet}
          aria-label="安静思考"
        >
          {busy ? "忙碌中 · " : ""}安静思考
          <span className={`relative h-[16px] w-[28px] rounded-capsule transition ${quiet ? "bg-sakura" : "bg-orb/35"}`}>
            <span className={`absolute top-[2px] h-3 w-3 rounded-full bg-white transition-all ${quiet ? "left-[14px]" : "left-[2px]"}`} />
          </span>
        </button>
      }
    >
      {confirm && (
        <div className="sticky top-[100px] z-20 -mx-1 mb-3 animate-pop">
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
        <div className="sticky top-[104px] z-20 flex justify-center">
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
          <p className="pt-20 text-center text-mute">和 echo 说点什么吧 ( ˘ᵕ˘ )</p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} quiet={quiet} onTap={openMenu} onRetry={() => retry(m.id)} />
        ))}
        {working && (
          <div className="flex items-center gap-2 pt-2 animate-rise">
            <Avatar />
            <div className="glass flex items-center gap-2 rounded-[22px] rounded-bl-md px-4 py-2.5 text-[15px] text-ink/80">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-blink rounded-full bg-rose" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </span>
              {working}
            </div>
          </div>
        )}
        <div ref={bottomRef} className={workOpen ? "h-[380px]" : "h-32"} />
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

      {/* 模型选择 */}
      {modelMenu && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setModelMenu(false)} />
          <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+122px)] z-30 mx-auto w-full max-w-[430px] px-3">
            <div className="ml-24 w-[230px] animate-pop rounded-[22px] bg-tile p-2 shadow-soft">
              <p className="px-3 py-1.5 text-[12px] text-mute">当前模型</p>
              {settings.models.map((md) => (
                <button
                  key={md}
                  onClick={() => { set("settings", (s) => ({ ...s, model: md })); setModelMenu(false); }}
                  className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left font-mono text-[14px] ${md === settings.model ? "bg-sakura/25 text-rose" : "text-ink"}`}
                >
                  {md}
                  {md === settings.model && <IconCheck size={16} />}
                </button>
              ))}
              <Link href="/settings" className="block px-3 pb-1 pt-2 text-[12px] text-mute">去设置里添加模型 ›</Link>
            </div>
          </div>
        </>
      )}

      {/* 底栏：输入框 + 工具行 */}
      <div className="fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),4px)+14px)] z-30 mx-auto w-full max-w-[430px] px-3">
        <div className="rounded-[28px] bg-tile/95 px-3 pb-2.5 pt-2 shadow-soft backdrop-blur-xl">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
            rows={1}
            placeholder={confirm ? "请先在上方确认…" : "跟 echo 说点什么…"}
            className="block max-h-32 min-h-[38px] w-full resize-none bg-transparent px-1.5 py-1.5 text-input text-ink outline-none placeholder:text-mute"
          />
          <div className="mt-0.5 flex items-center gap-1.5">
            <button aria-label="附件" onClick={() => toast("附件先占位，P1 接上")} className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fog text-orb">
              <IconClip size={18} />
            </button>
            <button aria-label="语音" onClick={() => toast("语音先占位")} className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fog text-orb">
              <IconMic size={18} />
            </button>
            <button
              onClick={() => setModelMenu((v) => !v)}
              className="press flex h-9 min-w-0 flex-1 items-center justify-between gap-1 rounded-capsule border border-line bg-fog/60 px-3 font-mono text-[13px] text-ink/80"
            >
              <span className="truncate">{settings.model}</span>
              <IconChevron size={14} className={`shrink-0 transition ${modelMenu ? "" : "rotate-180"}`} />
            </button>
            {busy ? (
              <button aria-label="停止生成" onClick={stop} className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-cream">
                <IconStop size={18} />
              </button>
            ) : (
              <button aria-label="发送" onClick={send} disabled={!input.trim() || !!confirm} className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose text-white disabled:bg-orb/45">
                <IconSend size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {menu && (
        <div className="fixed inset-0 z-50" onClick={() => setMenu(null)}>
          <div className="absolute inset-0 bg-fog/40 backdrop-blur-sm" />
          <div
            className={menu.cls + " pointer-events-none absolute animate-pop shadow-soft"}
            style={{ top: Math.min(menu.rect.top, window.innerHeight - 140 - menu.rect.height - 8), left: menu.rect.left, width: menu.rect.width }}
          >
            {menu.html}
          </div>
          <div
            className="absolute w-[220px] animate-pop overflow-hidden rounded-[22px] bg-tile/95 shadow-soft"
            style={{ top: Math.min(menu.top, window.innerHeight - 140), ...(menu.mine ? { right: Math.max(menu.right, 12) } : { left: Math.max(menu.left, 12) }) }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => copyMsg(menu.id)} className="flex w-full items-center justify-between px-5 py-3.5 text-[16px] active:bg-fog">复制 <IconCopy size={20} /></button>
            <div className="h-px bg-line" />
            <button onClick={() => deleteMsg(menu.id)} className="flex w-full items-center justify-between px-5 py-3.5 text-[16px] text-rose active:bg-fog">删除 <IconTrash size={20} /></button>
          </div>
        </div>
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

function ThinkLine({ think }: { think: Think }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-1.5 pl-10">
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-mute">
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1">
          <IconClock size={14} /> 思考过程 <IconChevron size={13} className={`transition ${open ? "" : "-rotate-90"}`} />
        </button>
        {think.tags.map((t, i) => (
          <span key={i} className={`flex items-center gap-1 rounded-capsule px-2 py-0.5 ${t.kind === "memory" ? "bg-sakura/30 text-rose" : "glass text-ink/70"}`}>
            {t.kind === "memory" ? <IconSpark size={12} /> : t.kind === "hand" ? <IconHand size={12} /> : <IconTool size={12} />}
            {t.label}
          </span>
        ))}
      </div>
      {open && (
        <p className="mt-1.5 max-w-[86%] animate-rise rounded-[6px_16px_16px_6px] border-l-[3px] border-sakura bg-tile/55 px-3 py-2 text-[13px] leading-[1.6] text-mute">{think.text}</p>
      )}
    </div>
  );
}

function Bubble({ m, quiet, onTap, onRetry }: { m: Msg; quiet: boolean; onTap: (e: React.MouseEvent<HTMLDivElement>, m: Msg) => void; onRetry: () => void }) {
  const mine = m.role === "user";
  if (m.status === "error") {
    return (
      <div className="flex items-end gap-2 animate-rise">
        <Avatar />
        <div className="rounded-[22px] rounded-bl-md border border-rose/40 bg-tile px-4 py-2.5">
          <p className="text-[15px] text-rose">回复失败了 (；´д｀)</p>
          <button onClick={onRetry} className="press mt-1.5 flex items-center gap-1.5 rounded-capsule bg-rose/10 px-3 py-1.5 text-[15px] text-rose"><IconRetry size={16} /> 重试</button>
        </div>
      </div>
    );
  }
  return (
    <div className="pt-2 animate-rise">
    {!mine && quiet && m.think && <ThinkLine think={m.think} />}
    <div className={`flex items-end gap-2 ${mine ? "justify-end" : ""}`}>
      {!mine && <Avatar />}
      <div className={`max-w-[80%] ${m.card && m.status === "done" ? "w-[80%]" : ""}`}>
        <div
          onClick={(e) => onTap(e, m)}
          className={`inline-block cursor-pointer whitespace-pre-wrap break-words px-4 py-2.5 text-[15px] leading-[22px] transition active:scale-[0.98] ${
            mine ? "float-right rounded-[22px] rounded-br-md bg-sakura text-[#4a2630]" : "rounded-[22px] rounded-bl-md bg-tile text-ink shadow-soft"
          }`}
        >
          {m.text}
          {m.status === "streaming" && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-blink bg-rose" />}
        </div>
        {mine && <div className="clear-both" />}
        {m.card && m.status === "done" && <ResultCard card={m.card} />}
        {m.status === "stopped" && <p className="mt-1 pl-2 text-[12px] text-mute">已停止生成</p>}
        {m.status !== "streaming" && <p className={`mt-1 px-2 text-[11px] text-mute/80 ${mine ? "text-right" : ""}`}>{fmtTime(m.at)}</p>}
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
