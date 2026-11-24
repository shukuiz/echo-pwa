"use client";
/* eslint-disable @next/next/no-img-element -- 这里全是 IndexedDB 里的 blob: 地址，next/image 优化不了 */

import { useEffect, useRef, useState } from "react";
import type { WidgetItem } from "@/lib/beauty";
import { useStore } from "@/lib/store";
import { fmtTime } from "@/lib/parseTime";
import { useBlobUrl, useBlobUrls } from "@/lib/idb";
import { GIcon } from "@/components/glass/Wall";

const WK = "日一二三四五六";
const pad2 = (n: number) => String(n).padStart(2, "0");
const RM = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
const dateStr = (n: Date) => `${n.getMonth() + 1}月${n.getDate()}日 周${WK[n.getDay()]}`;

function parseDay(s?: string) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function daysTo(s?: string) { const d = parseDay(s); if (!d) return null; const n = new Date(); const t = new Date(n.getFullYear(), n.getMonth(), n.getDate()); return Math.round((+d - +t) / 864e5); }

// ---------- 时钟 ----------
function Face({ now }: { now: Date }) {
  const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
  const ha = (h % 12) * 30 + m * 0.5, ma = m * 6 + s * 0.1, sa = s * 6;
  return (
    <svg className="face" viewBox="0 0 100 100" stroke="currentColor" strokeLinecap="round">
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180, r1 = i % 3 ? 41 : 38;
        return <line key={i} x1={50 + Math.sin(a) * r1} y1={50 - Math.cos(a) * r1} x2={50 + Math.sin(a) * 44} y2={50 - Math.cos(a) * 44} strokeWidth={i % 3 ? 1.4 : 2.6} />;
      })}
      {[12, 3, 6, 9].map((n, i) => {
        const a = (i * Math.PI) / 2;
        return <text key={n} x={50 + Math.sin(a) * 30} y={50 - Math.cos(a) * 30 + 4.2} textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor" stroke="none">{n}</text>;
      })}
      <line x1="50" y1="50" x2="50" y2="29" strokeWidth="4.2" transform={`rotate(${ha} 50 50)`} />
      <line x1="50" y1="50" x2="50" y2="17" strokeWidth="2.8" transform={`rotate(${ma} 50 50)`} />
      <line x1="50" y1="57" x2="50" y2="14" strokeWidth="1.2" stroke="#ff7fa0" transform={`rotate(${sa} 50 50)`} />
      <circle cx="50" cy="50" r="3" fill="#ff7fa0" stroke="none" />
    </svg>
  );
}
function FlipDigit({ v, size }: { v: string; size: number[] }) {
  const first = useRef(true);
  useEffect(() => { first.current = false; }, []);
  return <b key={v} className={first.current || RM() ? "" : "tick"} style={{ width: size[0], height: size[1], fontSize: size[2] }}>{v}</b>;
}
function Clock({ w }: { w: WidgetItem }) {
  const now = useNow(1000), sz = w.size, st = w.style || "analog";
  const hm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  if (st === "analog") {
    if (sz === "m") return (
      <div className="wpad" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <div style={{ width: 128, height: 128 }}><Face now={now} /></div>
        <div style={{ flex: 1 }}>
          <div className="dig" style={{ fontSize: 40 }}>{hm}</div>
          <div className="mute" style={{ fontSize: 14, marginTop: 8 }}>{dateStr(now)}</div>
          <div className="rose" style={{ fontSize: 13, marginTop: 4 }}>今天也要好好的</div>
        </div>
      </div>
    );
    if (sz === "l") return (
      <div className="wpad" style={{ alignItems: "center", padding: 20 }}>
        <div style={{ flex: 1, width: "100%", minHeight: 0 }}><Face now={now} /></div>
        <div className="mute" style={{ fontSize: 15, marginTop: 6 }}>{dateStr(now)}</div>
      </div>
    );
    return <div className="wpad" style={{ padding: 9 }}><Face now={now} /></div>;
  }
  if (st === "flip") {
    const f = sz === "s" ? [62, 80, 40] : sz === "m" ? [96, 112, 62] : [140, 170, 92];
    return (
      <div className="wpad" style={{ alignItems: "center", justifyContent: "center", gap: sz === "s" ? 8 : 12 }}>
        <div className="flip"><FlipDigit v={pad2(now.getHours())} size={f} /><FlipDigit v={pad2(now.getMinutes())} size={f} /></div>
        <div className="mute" style={{ fontSize: sz === "s" ? 12 : 14 }}>{dateStr(now)}</div>
      </div>
    );
  }
  const fs = sz === "s" ? 44 : sz === "m" ? 64 : 88;
  return (
    <div className="wpad" style={{ justifyContent: "center", alignItems: sz === "s" ? undefined : "center" }}>
      <div className="cap"><GIcon n="clock" s={13} w={2} />现在</div>
      <div className="dig" style={{ fontSize: fs, margin: "8px 0 6px" }}>{hm}</div>
      <div className="mute" style={{ fontSize: sz === "s" ? 13 : 15 }}>{dateStr(now)}</div>
    </div>
  );
}

// ---------- 日历 ----------
function Calendar({ w }: { w: WidgetItem }) {
  const n = useNow(60_000), y = n.getFullYear(), m = n.getMonth(), td = n.getDate();
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const sz = w.size, cell = sz === "s" ? 18 : sz === "m" ? 19 : 40, fs = sz === "s" ? 11 : sz === "m" ? 12 : 16, wfs = sz === "l" ? 15 : fs;
  const grid = (
    <div className="cal">
      {[...WK].map((c) => <span key={c} className="wk" style={{ height: cell - 2, fontSize: wfs }}>{c}</span>)}
      {Array.from({ length: first }, (_, i) => <span key={"e" + i} />)}
      {Array.from({ length: days }, (_, i) => {
        const d = i + 1, wd = (first + d - 1) % 7;
        return (
          <span key={d} style={{ height: cell, fontSize: fs }}>
            <span className={d === td ? "td" : wd % 6 === 0 ? "wkend" : "dd"} style={{ width: cell - 1, height: cell - 1 }}>{d}</span>
          </span>
        );
      })}
    </div>
  );
  if (sz === "m") return (
    <div className="wpad" style={{ flexDirection: "row", gap: 12, padding: "12px 14px" }}>
      <div style={{ width: 96, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="rose" style={{ fontSize: 14, fontWeight: 700 }}>周{WK[n.getDay()]}</div>
        <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.05 }}>{td}</div>
        <div className="mute" style={{ fontSize: 13 }}>{y}年{m + 1}月</div>
      </div>
      <div style={{ flex: 1, alignSelf: "center" }}>{grid}</div>
    </div>
  );
  if (sz === "l") return (
    <div className="wpad" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <b style={{ fontSize: 22 }}>{m + 1}月</b><span className="mute" style={{ fontSize: 14 }}>{y} · 今天周{WK[n.getDay()]}</span>
      </div>
      {grid}
    </div>
  );
  return <div className="wpad" style={{ padding: "11px 11px 8px" }}><div className="rose" style={{ fontSize: 12.5, fontWeight: 700, margin: "0 0 3px 4px" }}>{m + 1}月</div>{grid}</div>;
}

// ---------- 倒数日 ----------
function Countdown({ w }: { w: WidgetItem }) {
  useNow(60_000);
  const n = daysTo(w.date), d = parseDay(w.date), sz = w.size;
  const sub = n === null ? "选个日子吧" : n > 0 ? "还有" : n < 0 ? "已经过去" : "就是今天";
  const ds = d ? `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} 周${WK[d.getDay()]}` : "";
  const fs = sz === "s" ? 50 : sz === "m" ? 60 : 96;
  return (
    <div className="wpad">
      <div className="cap"><GIcon n="hour" s={13} w={2} />倒数日</div>
      <div className="clamp2" style={{ fontSize: sz === "s" ? 15 : 17, fontWeight: 700, marginTop: 6 }}>
        {w.title || "某个重要的日子"} <span className="mute" style={{ fontWeight: 400, fontSize: 13 }}>{sub}</span>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 4 }}>
        <b style={{ fontSize: fs, lineHeight: 0.95, fontVariantNumeric: "tabular-nums" }}>{n === 0 ? "♡" : n === null ? "?" : Math.abs(n)}</b>
        {n ? <span style={{ fontSize: 15, marginBottom: 6 }}>天</span> : null}
      </div>
      <div className="mute" style={{ fontSize: 12, marginTop: 4 }}>{ds}</div>
    </div>
  );
}

// ---------- echo 状态：真实的最新消息 ----------
function Echo({ w }: { w: WidgetItem }) {
  const { messages } = useStore();
  const now = useNow(60_000), sz = w.size;
  const last = [...messages].reverse().find((m) => m.role === "echo" && m.text);
  const msg = last ? last.text.replace(/\n+/g, " ") : "还没有消息哦 ( ˘ᵕ˘ )";
  if (sz === "s") return (
    <div className="wpad">
      <div className="ava"><GIcon n="star" s={24} /></div>
      <b style={{ fontSize: 15, marginTop: 8 }}>echo <span className="mute" style={{ fontSize: 12, fontWeight: 400 }}>· 在线</span></b>
      <p className="mute clamp3" style={{ fontSize: 13, lineHeight: 1.4, marginTop: 3 }}>{msg}</p>
    </div>
  );
  const head = (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <div className="ava" style={{ width: 54, height: 54 }}><GIcon n="star" s={28} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
          <b style={{ fontSize: 17, whiteSpace: "nowrap" }}>echo <span className="mute" style={{ fontSize: 13, fontWeight: 400 }}>· 在线</span></b>
          <span className="mute" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{dateStr(now)}</span>
        </div>
        <p className="mute" style={{ fontSize: 12.5, marginTop: 2 }}>记着你的事</p>
      </div>
    </div>
  );
  if (sz === "m") return (
    <div className="wpad" style={{ padding: "14px 16px" }}>
      {head}
      <p className="clamp2" style={{ fontSize: 14.5, lineHeight: 1.45, marginTop: 10 }}>{msg}</p>
      <div className="rose" style={{ fontSize: 12.5, marginTop: "auto" }}>打开聊天 ›</div>
    </div>
  );
  const recent = messages.filter((m) => m.text).slice(-4);
  return (
    <div className="wpad" style={{ padding: 16 }}>
      {head}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14, flex: 1, overflow: "hidden" }}>
        {recent.length ? recent.map((m) => (
          <div key={m.id} className="clamp2" style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "82%", padding: "7px 12px", borderRadius: 16, fontSize: 13.5, lineHeight: 1.4, background: m.role === "user" ? "rgba(var(--g-me),.55)" : "rgba(255,255,255,.18)" }}>{m.text}</div>
        )) : <p className="mute" style={{ fontSize: 14 }}>{msg}</p>}
      </div>
    </div>
  );
}

// ---------- 下一个提醒：真实的提醒 ----------
function Remind({ w }: { w: WidgetItem }) {
  const { reminders } = useStore();
  useNow(60_000);
  const next = reminders.filter((r) => !r.done).sort((a, b) => a.time - b.time)[0];
  const t = next ? next.text : "暂无提醒 ( ˘ᵕ˘ )", tm = next ? fmtTime(next.time) : "点一下去记一条";
  const bell = (s: number) => (
    <div style={{ width: s, height: s, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(255,183,94,.9)", color: "#fff", flexShrink: 0 }}>
      <GIcon n="bell" s={s * 0.55} w={2} />
    </div>
  );
  if (w.size === "s") return (
    <div className="wpad">
      {bell(36)}
      <div className="cap" style={{ marginTop: 10 }}>下一个提醒</div>
      <b className="clamp2" style={{ fontSize: 16, marginTop: 3, lineHeight: 1.35 }}>{t}</b>
      <div className="rose" style={{ fontSize: 13, marginTop: "auto" }}>{tm}</div>
    </div>
  );
  return (
    <div className="wpad" style={{ flexDirection: "row", gap: 14, alignItems: "center", padding: "16px 18px" }}>
      {bell(54)}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="cap">下一个提醒</div>
        <b className="clamp2" style={{ fontSize: w.size === "l" ? 22 : 18, marginTop: 4, display: "block" }}>{t}</b>
        <div className="rose" style={{ fontSize: 14, marginTop: 4 }}>{tm}</div>
      </div>
    </div>
  );
}

// ---------- 便签：不受控，避免打字时光标跳 ----------
function Note({ w, editing, onText }: { w: WidgetItem; editing: boolean; onText: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerText !== (w.text ?? "")) el.innerText = w.text ?? "";
  }, [w.text]);
  return (
    <div className="wpad" style={{ padding: "13px 15px" }}>
      <div className="cap"><GIcon n="pen" s={13} w={2} />便签</div>
      <div
        ref={ref}
        className="note"
        data-note
        contentEditable={editing ? false : "plaintext-only"}
        suppressContentEditableWarning
        spellCheck={false}
        style={{ fontSize: w.size === "s" ? 14.5 : 16 }}
        onInput={(e) => onText((e.target as HTMLDivElement).innerText)}
      />
    </div>
  );
}

// ---------- 照片 / 动图 ----------
const Empty = ({ ic, a, b }: { ic: string; a: string; b: string }) => (
  <div className="wpad" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: 6 }}>
    <GIcon n={ic} s={30} w={1.6} /><b style={{ fontSize: 14 }}>{a}</b><span className="mute" style={{ fontSize: 12 }}>{b}</span>
  </div>
);
function Photos({ w, editing }: { w: WidgetItem; editing: boolean }) {
  const urls = useBlobUrls(w.photos || []).filter((u): u is string => !!u);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (urls.length < 2 || editing) return;
    const t = setInterval(() => setI((v) => v + 1), 4000);
    return () => clearInterval(t);
  }, [urls.length, editing]);
  if (!urls.length) return <Empty ic="image" a="点一下选照片" b="可以一次选好几张" />;
  const cur = i % urls.length;
  return (
    <div className="media">
      {urls.map((u, k) => <img key={u} src={u} alt="" className={k === cur ? "on" : ""} draggable={false} />)}
      {urls.length > 1 && <div className="phdots">{urls.map((u, k) => <i key={u} className={k === cur ? "on" : ""} />)}</div>}
      <div className="glint" />
    </div>
  );
}
function Gif({ w }: { w: WidgetItem }) {
  const u = useBlobUrl(w.media?.key);
  if (!w.media || !u) return <Empty ic="film" a="点一下选动图" b="GIF 或几秒的短视频" />;
  return (
    <div className="media">
      {w.media.kind === "video" ? <video src={u} className="on" autoPlay muted loop playsInline /> : <img src={u} className="on" alt="" draggable={false} />}
      <div className="glint" />
    </div>
  );
}

/** 照片/动图有内容时是"媒体"：内容不折射、不跟透明度走，只留一圈边框光 */
export const isMedia = (w: WidgetItem) => (w.type === "photo" && (w.photos || []).length > 0) || (w.type === "gif" && !!w.media);

export function WidgetBody({ w, editing, onText }: { w: WidgetItem; editing: boolean; onText: (t: string) => void }) {
  switch (w.type) {
    case "clock": return <Clock w={w} />;
    case "calendar": return <Calendar w={w} />;
    case "countdown": return <Countdown w={w} />;
    case "echo": return <Echo w={w} />;
    case "remind": return <Remind w={w} />;
    case "note": return <Note w={w} editing={editing} onText={onText} />;
    case "photo": return <Photos w={w} editing={editing} />;
    default: return <Gif w={w} />;
  }
}

export function BgImage({ k }: { k: string }) {
  const u = useBlobUrl(k);
  return <div className="media">{u && <img src={u} className="on" alt="" draggable={false} />}<div className="glint" /></div>;
}
