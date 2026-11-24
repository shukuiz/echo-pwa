"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { APPS, AppId, WT, WidgetItem, WidgetSize, WidgetType } from "@/lib/beauty";
import { GIcon } from "@/components/glass/Wall";
import { isMedia } from "./widgets";

/** 底部面板：挂载后下一帧再加 .on，才有上滑动画 */
export function GSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))); return () => cancelAnimationFrame(r); }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 320);
    return () => clearTimeout(t);
  }, [open]);
  if (!mounted) return null;
  return (
    <>
      {open && <div className="gmask" onClick={onClose} />}
      <div className={`gsheet ${shown ? "on" : ""}`} role="dialog"><div className="grab" />{children}</div>
    </>
  );
}

function Seg<T extends string>({ value, opts, onChange }: { value: T; opts: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {opts.map(([v, l]) => <button key={v} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function AddSheet({ open, removed, onClose, onAdd, onAddApp }: {
  open: boolean; removed: AppId[]; onClose: () => void;
  onAdd: (t: WidgetType, s: WidgetSize) => void; onAddApp: (a: AppId) => void;
}) {
  return (
    <GSheet open={open} onClose={onClose}>
      <div className="sh-h"><b><GIcon n="apps" s={20} w={2} />添加小组件</b><button onClick={onClose}>好了</button></div>
      <div className="addl">
        {(Object.keys(WT) as WidgetType[]).map((k) => {
          const t = WT[k];
          return (
            <div key={k} className="addr" style={{ "--c1": t.c[0], "--c2": t.c[1] } as React.CSSProperties}>
              <div className="ai"><GIcon n={t.i} s={22} w={2} /></div>
              <div className="tx"><b>{t.n}</b><small>{t.d}</small></div>
              <div className="szs">
                {([["s", "小"], ["m", "中"], ["l", "大"]] as [WidgetSize, string][]).map(([s, l]) => (
                  <button key={s} aria-label={`添加${l}号${t.n}`} onClick={() => onAdd(k, s)}>{l}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {removed.length > 0 && (
        <div className="sec" style={{ marginTop: 12 }}>
          <h4>移走的应用</h4>
          <div className="addl">
            {removed.map((a) => (
              <div key={a} className="addr" style={{ "--c1": "#cfd7e2", "--c2": "#97a5b7", padding: "6px 0" } as React.CSSProperties}>
                <div className="ai"><GIcon n={APPS[a].i} s={22} w={2} /></div>
                <div className="tx"><b>{APPS[a].n}</b></div>
                <div className="szs"><button onClick={() => onAddApp(a)}>放回</button></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </GSheet>
  );
}

export function WidgetSheet({ w, globalA, onClose, onChange, onPick, onDelete }: {
  w: WidgetItem | null; globalA: number; onClose: () => void;
  onChange: (patch: Partial<WidgetItem>) => void;
  onPick: (what: "photos" | "gif" | "bgimg") => void;
  onDelete: () => void;
}) {
  const open = !!w;
  // 关面板动画期间保留最后一次的内容
  const [last, setLast] = useState<WidgetItem | null>(w);
  useEffect(() => { if (w) setLast(w); }, [w]);
  const x = w || last;
  if (!x) return <GSheet open={false} onClose={onClose}>{null}</GSheet>;
  const T = WT[x.type], media = x.type === "photo" || x.type === "gif";
  const fol = x.op == null, op = Math.round(fol ? globalA : (x.op as number));
  const shell = !(isMedia(x) || (x.bg === "image" && x.img));

  let content: React.ReactNode = null;
  if (x.type === "clock") content = <Seg value={x.style || "analog"} opts={[["analog", "指针"], ["flip", "翻页"], ["digital", "数字"]]} onChange={(v) => onChange({ style: v })} />;
  if (x.type === "photo") content = <><button className="gbtn" onClick={() => onPick("photos")}><GIcon n="image" s={18} w={2} />选择照片（可多选）</button><p className="hint">现在 {(x.photos || []).length} 张，多于一张时每 4 秒换一张。照片存在这台设备里，不会被玻璃扭曲，只有边上一圈光</p></>;
  if (x.type === "gif") content = <><button className="gbtn" onClick={() => onPick("gif")}><GIcon n="film" s={18} w={2} />选择 GIF 或短视频</button><p className="hint">视频会静音循环播放，存在这台设备里</p></>;
  if (x.type === "note") content = <textarea className="fld" value={x.text ?? ""} placeholder="写点什么…" onChange={(e) => onChange({ text: e.target.value })} />;
  if (x.type === "countdown") content = <><input className="fld" value={x.title || ""} placeholder="名字，比如 生日" maxLength={40} onChange={(e) => onChange({ title: e.target.value })} /><div style={{ height: 8 }} /><input className="fld" type="date" value={x.date || ""} onChange={(e) => onChange({ date: e.target.value })} /></>;
  if (x.type === "remind") content = <p className="hint" style={{ margin: 0 }}>自动显示「记事提醒」里最近一条没做完的事。<Link href="/reminders" style={{ color: "#e0496d" }}>去记事提醒 ›</Link></p>;
  if (x.type === "echo") content = <p className="hint" style={{ margin: 0 }}>自动显示 echo 的头像和最新一条消息，点一下进聊天</p>;
  if (x.type === "calendar") content = <p className="hint" style={{ margin: 0 }}>显示这个月，今天会圈出来</p>;

  return (
    <GSheet open={open} onClose={onClose}>
      <div className="sh-h"><b><GIcon n={T.i} s={20} w={2} />{T.n}</b><button onClick={onClose}>完成</button></div>
      <div className="sec"><h4>尺寸</h4><Seg value={x.size} opts={[["s", "小 2×2"], ["m", "中 4×2"], ["l", "大 4×4"]]} onChange={(v) => onChange({ size: v })} /></div>
      {!media && (
        <div className="sec">
          <h4>背景</h4>
          <Seg value={x.bg} opts={[["glass", "玻璃"], ["solid", "纯色"], ["image", "图片"]]} onChange={(v) => { if (v === "image" && !x.img) onPick("bgimg"); else onChange({ bg: v }); }} />
          {x.bg === "solid" && (
            <label className="lbl2"><input type="color" value={x.color || "#ffe3ea"} onChange={(e) => onChange({ color: e.target.value })} />点色块换颜色，字会自动变深或变浅</label>
          )}
          {x.bg === "image" && <button className="gbtn" style={{ marginTop: 10 }} onClick={() => onPick("bgimg")}><GIcon n="image" s={18} w={2} />换一张背景图</button>}
        </div>
      )}
      <div className="sec">
        <h4>透明度</h4>
        {shell ? (
          <>
            <label className="tgl"><span>默认跟随全局（{globalA}%）</span><input type="checkbox" checked={fol} onChange={(e) => onChange({ op: e.target.checked ? null : globalA })} /><i /></label>
            <div className={`brow ${fol ? "dim" : ""}`} style={{ marginTop: 6 }}>
              <span>透明度</span>
              <input type="range" min={0} max={100} value={op} aria-label="这个小组件的透明度" onChange={(e) => onChange({ op: +e.target.value })} />
              <output>{op}%</output>
            </div>
            <p className="hint" style={{ marginTop: 4 }}>只改底板，{x.bg === "solid" ? "纯色背景会一起变淡" : "上面的字会自动换深浅"}</p>
          </>
        ) : <p className="hint" style={{ margin: 0 }}>{x.bg === "image" ? "图片背景" : "照片和动图"}本身保持不透明，不跟透明度走</p>}
      </div>
      <div className="sec"><h4>内容</h4>{content}</div>
      <button className="gbtn red" onClick={onDelete}><GIcon n="trash" s={18} w={2} />删除这个小组件</button>
    </GSheet>
  );
}
