"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { APPS, AppId, HomeItem, WidgetItem, WidgetSize, WidgetType, WT, newWidget, useBeauty } from "@/lib/beauty";
import { useStore } from "@/lib/store";
import { delBlobs, downscale, putBlob } from "@/lib/idb";
import { hex2rgb } from "@/lib/color";
import { useGlassRect } from "@/components/glass/hooks";
import { GIcon, WallScreen } from "@/components/glass/Wall";
import { BgImage, WidgetBody, isMedia, useNow } from "./widgets";
import { AddSheet, WidgetSheet } from "./Sheets";
import { HomeGrid } from "./grid";

const pad2 = (n: number) => String(n).padStart(2, "0");
const blobKeys = (w: HomeItem) => (w.kind === "w" ? [...(w.photos || []), w.media?.key, w.img] : []);

function DockIcon({ n, label, href }: { n: string; label: string; href: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  useGlassRect(ref, true);
  return (
    <button ref={ref} className="g icn" data-glass data-icn aria-label={label} onClick={() => router.push(href)} style={{ border: 0, padding: 0 }}>
      <GIcon n={n} s={28} />
    </button>
  );
}
function Dock() {
  const ref = useRef<HTMLElement>(null);
  useGlassRect(ref, true);
  return (
    <nav ref={ref} className="g dock" data-glass data-tint="0.06">
      <DockIcon n="chat" label="聊天" href="/chat" />
      <DockIcon n="tool" label="技能" href="/workbench" />
      <DockIcon n="book" label="记忆本" href="/memory" />
      <DockIcon n="photo" label="相册" href="/album" />
    </nav>
  );
}

function Item({ it, editing, wA, onDelete, onText }: { it: HomeItem; editing: boolean; wA: number; onDelete: (id: string) => void; onText: (id: string, t: string) => void }) {
  const dl = useRef((-Math.random() * 0.3).toFixed(2) + "s").current;
  const del = (
    <button className="del" aria-label={it.kind === "app" ? "移除" : "删除"} onClick={(e) => { e.stopPropagation(); onDelete(it.id); }}>
      <GIcon n="minus" s={16} w={2.6} />
    </button>
  );
  if (it.kind === "app") {
    const a = APPS[it.app];
    return (
      <div className="it ic" data-id={it.id} style={{ "--dl": dl } as React.CSSProperties}>
        <div className="jig">
          <div className="app"><div className="g icn" data-glass data-icn><GIcon n={a.i} s={28} /></div><span data-onwp>{a.n}</span></div>
          {del}
        </div>
      </div>
    );
  }
  const w = it, solid = w.bg === "solid", im = w.bg === "image" && !!w.img && !isMedia(w), rim = isMedia(w) || im;
  const a = rim ? 1 : (w.op ?? wA) / 100;
  const col = hex2rgb(w.color || "#ffe3ea");
  const style = { "--wa": a.toFixed(3), ...(solid ? { "--sbg": `rgba(${col.join(",")},${a.toFixed(3)})` } : {}) } as React.CSSProperties;
  return (
    <div className="it wid" data-id={w.id} style={{ "--dl": dl } as React.CSSProperties}>
      <div className="jig">
        <div
          className={`g wsh ${solid ? "solid" : ""} ${rim ? "rim" : ""}`}
          data-glass={solid ? undefined : ""}
          data-rim={rim ? "" : undefined}
          data-solid={solid ? "" : undefined}
          data-sbg={solid ? w.color || "#ffe3ea" : undefined}
          data-wa={a.toFixed(3)}
          style={style}
        >
          {im ? (
            <><BgImage k={w.img!} /><div className="imgink"><WidgetBody w={w} editing={editing} onText={(t) => onText(w.id, t)} /></div></>
          ) : <WidgetBody w={w} editing={editing} onText={(t) => onText(w.id, t)} />}
        </div>
        {del}
      </div>
    </div>
  );
}

export default function HomeScreen() {
  const { b, setB, ready } = useBeauty();
  const { toast, settings } = useStore();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [wid, setWid] = useState<string | null>(null);
  const pagerRef = useRef<HTMLDivElement>(null), pagesRef = useRef<HTMLDivElement>(null), dotsRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HomeGrid | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickCb = useRef<((fs: File[]) => void) | null>(null);
  const bRef = useRef(b); bRef.current = b;
  const now = useNow(15_000);

  const updateItem = useCallback((id: string, patch: Partial<WidgetItem>) => {
    setB((p) => ({ items: p.items.map((i) => (i.id === id && i.kind === "w" ? { ...i, ...patch } : i)) }));
  }, [setB]);

  const tap = useCallback((id: string) => {
    const it = bRef.current.items.find((i) => i.id === id); if (!it) return;
    const g = gridRef.current;
    if (g?.editing) { if (it.kind === "w") setWid(id); return; }
    if (it.kind === "app") { router.push(APPS[it.app].href); return; }
    if (it.type === "photo") pickFor(it, "photos");
    else if (it.type === "gif") pickFor(it, "gif");
    else if (it.type === "echo") router.push("/chat");
    else if (it.type === "remind") router.push("/reminders");
    else if (it.type === "note") (document.querySelector(`.it[data-id="${CSS.escape(id)}"] [data-note]`) as HTMLElement | null)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // 网格引擎：只建一次
  useLayoutEffect(() => {
    if (!pagerRef.current || !pagesRef.current || !dotsRef.current) return;
    const g = new HomeGrid(pagerRef.current, pagesRef.current, dotsRef.current, {
      tap: (id) => tapRef.current(id),
      longPress: () => { setEditing(true); (document.activeElement as HTMLElement | null)?.blur?.(); },
      emptyTap: () => setEditing(false),
      commit: (items) => setB({ items }),
    });
    g.items = bRef.current.items;
    gridRef.current = g;
    g.attach();
    g.layout(true);
    return () => { g.detach(); gridRef.current = null; };
  }, [setB]);
  const tapRef = useRef(tap); tapRef.current = tap;

  // 内容变了（加/删/改尺寸/拖完）→ 重新排
  const first = useRef(true);
  useLayoutEffect(() => {
    const g = gridRef.current; if (!g || g.drag) return;
    g.items = b.items;
    g.layout(first.current || !ready);
    first.current = false;
  }, [b.items, ready]);
  useEffect(() => { if (gridRef.current) gridRef.current.editing = editing; }, [editing]);
  // 字体/主题换了，字宽和圆角会变：等这一帧的样式生效、字体到位后再排（不靠定时器猜时间）
  useEffect(() => {
    let alive = true;
    const run = () => { if (alive) gridRef.current?.layout(true); };
    const raf = requestAnimationFrame(run);
    (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(run).catch(() => {});
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [b.font, b.songOrig, b.theme]);

  function pick(accept: string, multiple: boolean, cb: (fs: File[]) => void) {
    const f = fileRef.current; if (!f) return;
    f.value = ""; f.accept = accept; f.multiple = multiple; pickCb.current = cb; f.click();
  }
  function pickFor(w: WidgetItem, what: "photos" | "gif" | "bgimg") {
    if (what === "photos") pick("image/*", true, async (fs) => {
      const ts = Date.now().toString(36), keys: string[] = [];
      try {
        for (const [i, f] of fs.slice(0, 12).entries()) { const k = `ph:${w.id}:${ts}:${i}`; await putBlob(k, await downscale(f, 1600)); keys.push(k); }
      } catch { toast("存照片失败了，可能是空间不够 (；´д｀)"); return; }
      const old = (bRef.current.items.find((i) => i.id === w.id) as WidgetItem | undefined)?.photos || [];
      updateItem(w.id, { photos: keys });
      delBlobs(old);
      toast(fs.length > 1 ? `${Math.min(fs.length, 12)} 张照片会轮流播放` : "换好啦");
    });
    if (what === "gif") pick("image/gif,image/webp,image/png,image/apng,video/*", false, async (fs) => {
      const f = fs[0];
      if (f.size > 40e6) { toast("文件有点大，挑个 40MB 以内的吧"); return; }
      const k = `gif:${w.id}:${Date.now().toString(36)}`;
      try { await putBlob(k, f); } catch { toast("存动图失败了 (；´д｀)"); return; }
      const old = (bRef.current.items.find((i) => i.id === w.id) as WidgetItem | undefined)?.media?.key;
      updateItem(w.id, { media: { key: k, kind: f.type.startsWith("video") ? "video" : "img" } });
      delBlobs([old]);
      toast("动起来啦");
    });
    if (what === "bgimg") pick("image/*", false, async (fs) => {
      const k = `bg:${w.id}:${Date.now().toString(36)}`;
      try { await putBlob(k, await downscale(fs[0], 1600)); } catch { toast("存图片失败了 (；´д｀)"); return; }
      const old = (bRef.current.items.find((i) => i.id === w.id) as WidgetItem | undefined)?.img;
      updateItem(w.id, { img: k, bg: "image" });
      delBlobs([old]);
    });
  }

  function removeItem(id: string) {
    const it = bRef.current.items.find((x) => x.id === id); if (!it) return;
    setB((p) => ({
      items: p.items.filter((x) => x.id !== id),
      removed: it.kind === "app" && !p.removed.includes(it.app) ? [...p.removed, it.app] : p.removed,
    }));
    delBlobs(blobKeys(it));
    if (it.kind === "app") toast(`「${APPS[it.app].n}」挪到添加面板里啦`);
    if (wid === id) setWid(null);
  }
  function addWidget(type: WidgetType, size: WidgetSize) {
    const w = newWidget(type, size), g = gridRef.current, cur = g?.PG.cur ?? 0;
    setB((p) => {
      const firstOnPage = p.items.findIndex((i) => g?.G.pos[i.id]?.p === cur);
      const items = p.items.slice(); items.splice(Math.max(0, firstOnPage), 0, w);
      return { items };
    });
    setAdding(false); toast(`加好了：${WT[type].n}`);
    if (type === "photo" || type === "gif") setTimeout(() => setWid(w.id), 350);
  }
  function addApp(a: AppId) {
    setB((p) => ({ removed: p.removed.filter((x) => x !== a), items: [...p.items, { id: "a-" + a + "-" + Date.now().toString(36), kind: "app", app: a }] }));
  }

  const sheetW = (wid && (b.items.find((i) => i.id === wid && i.kind === "w") as WidgetItem | undefined)) || null;
  const showBar = settings.showStatusBar !== false;

  return (
    <WallScreen gl fixed className={`home ${editing ? "editing" : ""}`}>
      <div className="hstatus" data-onwp>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{showBar ? `${now.getHours()}:${pad2(now.getMinutes())}` : ""}</span>
        <span className="r">{showBar && <>5G <span className="bat" /></>}</span>
        <div className="ebar">
          <button className="pill" onClick={() => setEditing(false)}>完成</button>
          <button className="pill round" aria-label="添加小组件" onClick={() => setAdding(true)}><GIcon n="plus" s={20} /></button>
        </div>
      </div>
      <div className="pager" ref={pagerRef}>
        <div className="pages" ref={pagesRef}>
          {b.items.map((it) => (
            <Item key={it.id} it={it} editing={editing} wA={b.wA} onDelete={removeItem} onText={(id, t) => updateItem(id, { text: t })} />
          ))}
        </div>
      </div>
      <div className="hdots" ref={dotsRef} data-onwp />
      <Dock />
      <input ref={fileRef} type="file" hidden onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) pickCb.current?.(fs); }} />
      <AddSheet open={adding} removed={b.removed} onClose={() => setAdding(false)} onAdd={addWidget} onAddApp={addApp} />
      <WidgetSheet
        w={sheetW}
        globalA={b.wA}
        onClose={() => setWid(null)}
        onChange={(patch) => sheetW && updateItem(sheetW.id, patch)}
        onPick={(what) => sheetW && pickFor(sheetW, what)}
        onDelete={() => { if (sheetW) { const id = sheetW.id; setWid(null); removeItem(id); } }}
      />
    </WallScreen>
  );
}
