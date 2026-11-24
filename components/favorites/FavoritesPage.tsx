"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import GlassPage from "@/components/glass/GlassPage";
import { GIcon } from "@/components/glass/Wall";
import { useStore } from "@/lib/store";
import { Favorite, FavSource, listFavorites, removeFavorite } from "@/lib/favorites";

const fmt = (t: number) => {
  const d = new Date(t), now = new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`;
  return `${d.getFullYear() === now.getFullYear() ? "" : d.getFullYear() + "年"}${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
};

export default function FavoritesPage() {
  const { toast } = useStore();
  const router = useRouter();
  const [list, setList] = useState<Favorite[] | null>(null);
  const [source, setSource] = useState<FavSource>("cloud");
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [askDel, setAskDel] = useState<Favorite | null>(null);

  useEffect(() => {
    listFavorites()
      .then(({ list, source }) => { setList(list); setSource(source); })
      .catch((e) => { setList([]); setError((e as Error).message || "收藏本没读出来"); });
  }, []);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!list) return [];
    if (!k) return list;
    return list.filter((f) => f.title.toLowerCase().includes(k) || f.note.toLowerCase().includes(k) || f.messages.some((m) => m.text.toLowerCase().includes(k)));
  }, [list, q]);

  async function copy(f: Favorite) {
    const text = f.messages.length === 1 ? f.messages[0].text : f.messages.map((m) => `${m.role === "user" ? "我" : "echo"}：${m.text}`).join("\n");
    try { await navigator.clipboard.writeText(text); toast("已复制"); } catch { toast("复制失败了 (；´д｀)"); }
  }
  async function del(f: Favorite) {
    setAskDel(null);
    try {
      await removeFavorite(f.id, source);
      setList((l) => (l || []).filter((x) => x.id !== f.id));
      toast("已从收藏本移除");
    } catch (e) { toast((e as Error).message || "删除失败"); }
  }

  return (
    <GlassPage title="收藏本" sub={list && <small className="mute">{list.length} 条{source === "local" ? " · 本机" : ""}</small>}>
      <label className="g card search" data-cssg>
        <GIcon n="search" s={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜收藏的聊天…" aria-label="搜索收藏" enterKeyHint="search" />
        {q && <button className="clr" aria-label="清空搜索" onClick={() => setQ("")}><GIcon n="x" s={14} w={2.4} /></button>}
      </label>

      {source === "local" && <p className="hint" style={{ margin: "-4px 6px 0" }}>后端没连上，现在看到的是存在这台设备里的收藏</p>}
      {error && <p className="g card" data-cssg role="alert">{error}</p>}
      {list === null && <p className="g card empty" data-cssg>正在翻收藏本…</p>}
      {list && !shown.length && !error && (
        <div className="g card empty" data-cssg>
          <GIcon n="heart" s={28} />
          <p>{q ? "没找到这句 (´•ω•`)" : "还没有收藏"}</p>
          {!q && <small className="mute">在聊天里长按一条消息，点「收藏」；多选后也能一起收藏</small>}
        </div>
      )}

      {shown.map((f) => {
        const expanded = open === f.id;
        const msgs = expanded ? f.messages : f.messages.slice(0, 2);
        return (
          <article key={f.id} className="g card fav" data-cssg>
            <button className="favhead" onClick={() => setOpen(expanded ? null : f.id)} aria-expanded={expanded}>
              <b className="clamp2">{f.title}</b>
              <small className="mute">{fmt(f.createdAt)} · 来自聊天 · {f.messages.length} 条</small>
            </button>
            <div className="favmsgs" onClick={() => setOpen(expanded ? null : f.id)}>
              {msgs.map((m) => (
                <p key={m.id} className={m.role === "user" ? "me" : ""}>
                  <span className="who">{m.role === "user" ? "我" : "echo"}</span>
                  <span className={expanded ? "" : "clamp3"}>{m.text}</span>
                </p>
              ))}
              {!expanded && f.messages.length > 2 && <small className="mute more">还有 {f.messages.length - 2} 条，点开看全部</small>}
            </div>
            <div className="acts">
              <button onClick={() => copy(f)}><GIcon n="copy" s={17} />复制</button>
              <button onClick={() => router.push(`/chat?focus=${encodeURIComponent(f.messages[0].id)}`)}><GIcon n="jump" s={17} />回到聊天</button>
              <button className="danger" onClick={() => setAskDel(f)}><GIcon n="trash" s={17} />删除</button>
            </div>
          </article>
        );
      })}

      {askDel && (
        <>
          <div className="gmask" onClick={() => setAskDel(null)} />
          <div className="gsheet on" role="alertdialog" aria-label="确认删除收藏">
            <div className="grab" />
            <div className="sh-h"><b>移出收藏本？</b></div>
            <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>只删收藏，聊天记录里的原话还在</p>
            <div className="addl">
              <button className="gbtn red" onClick={() => del(askDel)}>移出收藏</button>
              <button className="gbtn" onClick={() => setAskDel(null)}>取消</button>
            </div>
          </div>
        </>
      )}
    </GlassPage>
  );
}
