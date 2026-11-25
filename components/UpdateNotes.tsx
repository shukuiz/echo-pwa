"use client";

// 更新公告：更新后第一次打开弹一次（记在 localStorage），设置 → 关于 里可以再打开
import { useEffect, useState } from "react";
import { APP_VERSION, CHANGELOG, SEEN_VERSION_KEY } from "@/lib/version";

const OPEN_EVENT = "echo-open-changelog";
export const openUpdateNotes = () => window.dispatchEvent(new Event(OPEN_EVENT));

export default function UpdateNotes() {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false); // 先挂上再加 .on，滑上来才有动画

  useEffect(() => {
    let seen: string | null = null;
    try { seen = localStorage.getItem(SEEN_VERSION_KEY); } catch {}
    if (seen !== APP_VERSION) setOpen(true);
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);
  useEffect(() => {
    if (!open) { setShown(false); return; }
    const r = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(r); window.removeEventListener("keydown", onKey); };
  }, [open]);

  function close() {
    try { localStorage.setItem(SEEN_VERSION_KEY, APP_VERSION); } catch {}
    setOpen(false);
  }
  if (!open) return null;
  const [latest, ...older] = CHANGELOG;
  return (
    <>
      <div className="gmask" onClick={close} />
      <div className={`gsheet unotes ${shown ? "on" : ""}`} role="dialog" aria-modal="true" aria-labelledby="unotes-t">
        <div className="grab" />
        <div className="sh-h">
          <b id="unotes-t">更新公告</b>
          <span className="uv">v{latest.version} · {latest.date}</span>
        </div>
        <p className="ulead">{latest.title}</p>
        <ol className="ulist">
          {latest.items.map((it, i) => (
            <li key={i}><b>{it.t}</b><span>{it.d}</span></li>
          ))}
        </ol>
        {older.length > 0 && (
          <details className="uold">
            <summary>更早的更新</summary>
            {older.map((n) => (
              <div key={n.version}><b>v{n.version} · {n.date}</b>
                <ul>{n.items.map((it, i) => <li key={i}>{it.t}：{it.d}</li>)}</ul>
              </div>
            ))}
          </details>
        )}
        <button className="gbtn dark ubtn" onClick={close} autoFocus>知道啦 ( ˘ᵕ˘ )</button>
        <p className="uhint">以后想再看，在 设置 → 关于 → 更新公告</p>
      </div>
    </>
  );
}
