"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GlassPage from "@/components/glass/GlassPage";
import { GIcon } from "@/components/glass/Wall";
import { exportBackup, MemoryItem, useStore } from "@/lib/store";
import { api, type PreferenceInfo } from "@/lib/api";
import {
  createMemory, deleteMemory, KIND_META, KINDS, kindOf, MemoryDraft, MemoryKind, updateMemory,
} from "@/lib/memory";

type Filter = MemoryKind | "all" | "archived";
type Sort = "recent" | "important";
type Draft = MemoryDraft & { id?: string; cueText: string; kwText: string };

const day = (t?: number) => (t ? new Date(t).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : "—");
const splitList = (s: string, n: number, max: number) =>
  Array.from(new Set(s.split(/[,，、\n]/).map((x) => x.trim().slice(0, max)).filter(Boolean))).slice(0, n);
const SUBJ: [PreferenceInfo["subject"], string][] = [["user", "我"], ["ai", "echo"], ["both", "我们"]];

function toDraft(m?: MemoryItem, kind: MemoryKind = "scene"): Draft {
  const k = m ? kindOf(m) : kind;
  return {
    id: m?.id, version:m?.version, kind: k, title: m?.title ?? "", text: m?.text ?? "", pinned: m?.pinned ?? false,
    cues: m?.cues ?? [], cueText: (m?.cues ?? []).join("，"), domain: m?.domain ?? "", importance: m?.importance ?? 3,
    status: m?.status ?? "active", favorite: m?.favorite ?? false, date: m?.date,
    preference: m?.preference ?? { subject: "user", polarity: "like", keywords: [], reason: "" },
    kwText: (m?.preference?.keywords ?? []).join("，"),
  };
}

function Dots({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="imp" aria-label={`重要度 ${n}`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? "on" : ""} />)}</span>;
}

export default function MemoryBook() {
  const { memory, reminders, messages, files, set, toast } = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [summary, setSummary] = useState<MemoryItem | null>(null);
  const [askDel, setAskDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const [connection, setConnection] = useState("正在读取记忆本…");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    async function read() {
      try {
        const result = await api.getMemory();
        if (!active) return;
        if (result.shared) set("memory", result.memory);
        setConnection(result.shared ? "已连接 Serein · 共用记忆库" : "当前使用 Echo 记忆库");
      } catch { if (active) setConnection("未能刷新记忆本"); }
    }
    void read();
    window.addEventListener("focus", read);
    const timer = window.setInterval(() => {if (!document.hidden) void read();}, 30000);
    return () => {active=false; clearInterval(timer); window.removeEventListener("focus",read);};
  // Store actions act on the current state via functional updates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, archived: 0 };
    for (const m of memory) {
      if (m.status === "archived") { c.archived++; continue; }
      c.all++; const k = kindOf(m); c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [memory]);

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return memory
      .filter((m) => (filter === "archived" ? m.status === "archived" : m.status !== "archived" && (filter === "all" || kindOf(m) === filter)))
      .filter((m) => !k || [m.title, m.text, m.domain, ...(m.cues || []), ...(m.preference?.keywords || [])].some((x) => x?.toLowerCase().includes(k)))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)
        || (sort === "important" ? (b.importance || 0) - (a.importance || 0) : 0)
        || b.updatedAt - a.updatedAt);
  }, [memory, filter, q, sort]);

  async function save() {
    if (!draft || !draft.text.trim() || busy) return;
    setBusy(true);
    const body: MemoryDraft = {
      kind: draft.kind, title: draft.title.trim() || draft.text.trim().slice(0, 12), text: draft.text.trim(), pinned: draft.pinned,
      cues: splitList(draft.cueText, 8, 80), domain: draft.domain?.trim() || "", importance: draft.importance,
      status: draft.status, favorite: draft.favorite, ...(draft.date ? { date: draft.date } : {}),
      ...(draft.kind === "preference" ? { preference: { ...draft.preference!, keywords: splitList(draft.kwText, 12, 40) } } : {}),
    };
    try {
      if (draft.id) {
        const id = draft.id;
        const mode = await updateMemory(id, { ...body, version:draft.version });
        set("memory", (ms) => ms.map((m) => (m.id === id ? { ...m, ...body, updatedAt: Date.now() } : m)));
        toast(mode === "local" ? "改好啦（本机）" : "改好啦 ✓");
      } else {
        const { item, mode } = await createMemory({ ...body, source: { type: "manual", messageIds: [] } });
        set("memory", (ms) => [item, ...ms]);
        toast(mode === "local" ? "记下啦（本机）" : "记下啦 ✓");
      }
      setRefresh(n=>n+1);
      setDraft(null);
    } catch (e) {
      toast((e as Error).message || "没保存上，再试一次？");
    } finally { setBusy(false); }
  }

  async function quick(m: MemoryItem, patch: Partial<MemoryDraft>, msg: string) {
    const before = m;
    set("memory", (ms) => ms.map((x) => (x.id === m.id ? { ...x, ...patch } : x)));
    try { await updateMemory(m.id, {...patch,version:m.version}); setRefresh(n=>n+1); toast(msg); }
    catch (e) { set("memory", (ms) => ms.map((x) => (x.id === m.id ? before : x))); toast((e as Error).message || "操作失败"); }
  }

  async function remove() {
    if (!draft?.id) return;
    const id = draft.id;
    setAskDel(false);
    try {
      await deleteMemory(id, draft.version);
      set("memory", (ms) => ms.filter((m) => m.id !== id));
      setRefresh(n=>n+1);
      setDraft(null);
      toast("已删除");
    } catch (e) { toast((e as Error).message || "删除失败"); }
  }

  const filters: [Filter, string][] = [["all", "全部"], ...KINDS.map((k) => [k, KIND_META[k].n] as [Filter, string]), ["archived", "已归档"]];
  const d = draft;

  return (
    <GlassPage
      title="记忆本"
      sub={<small className="mute">{counts.all} 条在用{counts.archived ? ` · ${counts.archived} 条归档` : ""}</small>}
      right={
        <span className="baracts">
          <button className="chip ib" aria-label="导出备份" onClick={() => { exportBackup({ memory, reminders, messages, files }); toast("备份已导出"); }}><GIcon n="download" s={18} /></button>
          <button className="chip ib add" aria-label="新增记忆" onClick={() => setDraft(toDraft(undefined, filter !== "all" && filter !== "archived" ? filter : "scene"))}><GIcon n="plus" s={20} w={2.2} /></button>
        </span>
      }
    >
      <button className="chip" onClick={()=>setRefresh(n=>n+1)}>{connection} · 刷新</button>
      <label className="g card search" data-cssg>
        <GIcon n="search" s={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜标题、正文、线索、关键词…" aria-label="搜索记忆" enterKeyHint="search" />
        {q && <button className="clr" aria-label="清空搜索" onClick={() => setQ("")}><GIcon n="x" s={14} w={2.4} /></button>}
      </label>

      <div className="fchips" role="tablist" aria-label="记忆类型">
        {filters.map(([f, n]) => (
          <button key={f} role="tab" aria-selected={filter === f} className={`fchip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {n}<em>{counts[f] ?? 0}</em>
          </button>
        ))}
      </div>

      <div className="srt">
        <span className="mute">{list.length} 条</span>
        <div className="seg mini" role="radiogroup" aria-label="排序">
          {([["recent", "最近更新"], ["important", "重要度"]] as [Sort, string][]).map(([v, l]) => (
            <button key={v} role="radio" aria-checked={sort === v} className={sort === v ? "on" : ""} onClick={() => setSort(v)}>{l}</button>
          ))}
        </div>
      </div>

      {!list.length && (
        <div className="g card empty" data-cssg>
          <GIcon n="book" s={28} />
          <p>{q ? "没找到 (´•ω•`)" : filter === "archived" ? "没有归档的记忆" : "这里还是空的"}</p>
          {!q && filter !== "archived" && <small className="mute">点右上角 + 写一条，或在聊天里长按消息点「记住」</small>}
        </div>
      )}

      {list.map((m) => {
        const k = kindOf(m);
        return (
          <article key={m.id} className={`g card mem ${m.status === "archived" ? "arch" : ""}`} data-cssg>
            <button className="memmain" onClick={() => m.readonly ? setSummary(m) : setDraft(toDraft(m))} aria-label={`编辑：${m.title}`}>
              <div className="memtop">
                <span className={`kb k-${k}`}>{KIND_META[k].n}</span>
                {m.pinned && <span className="tag">置顶</span>}
                {m.domain && <span className="tag">{m.domain}</span>}
                <span style={{ flex: 1 }} />
                <Dots n={m.importance} />
              </div>
              <b className="clamp2">{m.title}</b>
              <p className="clamp3">{m.text}</p>
              {k === "preference" && m.preference && (
                <p className="pref">
                  <span className={m.preference.polarity === "dislike" ? "no" : "yes"}>{m.preference.polarity === "dislike" ? "不喜欢" : "喜欢"}</span>
                  {SUBJ.find(([s]) => s === m.preference!.subject)?.[1]}
                  {m.preference.keywords.length > 0 && <> · 关键词 {m.preference.keywords.join("、")}</>}
                </p>
              )}
              {!!m.cues?.length && <div className="cues">{m.cues.map((c) => <span key={c}>{c}</span>)}</div>}
              <small className="mute meta">
                {m.date ? `${m.date} · ` : ""}{m.createdAt ? `创建 ${day(m.createdAt)} · ` : ""}更新 {day(m.updatedAt)}{m.shared && ` · 来源 ${m.origin}`}{m.source?.type === "chat" ? " · 来自聊天" : ""}
              </small>
            </button>
            {!m.readonly && <div className="memacts">
              <button aria-label={m.favorite ? "取消收藏" : "收藏"} className={m.favorite ? "on" : ""} onClick={() => quick(m, { favorite: !m.favorite }, m.favorite ? "取消收藏" : "收藏啦 ♡")}><GIcon n="heart" s={18} /></button>
              <button aria-label={m.pinned ? "取消置顶" : "置顶"} className={m.pinned ? "on" : ""} onClick={() => quick(m, { pinned: !m.pinned }, m.pinned ? "取消置顶" : "置顶啦")}><GIcon n="pin" s={18} /></button>
              <button aria-label={m.status === "archived" ? "取消归档" : "归档"} onClick={() => quick(m, { status: m.status === "archived" ? "active" : "archived" }, m.status === "archived" ? "放回来啦" : "归档啦，不会再被想起")}><GIcon n="archive" s={18} /></button>
            </div>}
          </article>
        );
      })}

      <Link href="/reminders" className="g card linkcard" data-cssg><GIcon n="bell" s={18} />提醒挪到「记事提醒」里啦<span style={{ flex: 1 }} />›</Link>

      {summary && <section className="g card"><h2>{summary.title}</h2>{summary.summaryEditable ? <><textarea aria-label="总结正文" rows={8} value={summary.text} onChange={e=>setSummary({...summary,text:e.target.value})} /><button disabled={busy} onClick={async()=>{
        setBusy(true);
        try {await api.saveSummary(summary.id,summary.text,summary.version!);setSummary(null);setRefresh(n=>n+1);toast("总结已保存到 Serein");}
        catch(error){toast((error as Error).message);} finally {setBusy(false);}
      }}>保存总结</button></> : <p style={{whiteSpace:"pre-wrap"}}>{summary.text}</p>}<button onClick={()=>setSummary(null)}>收起全文</button></section>}
      {d && (
        <>
          <div className="gmask" onClick={() => setDraft(null)} />
          <div className="gsheet on memsheet" role="dialog" aria-label={d.id ? "编辑记忆" : "新增记忆"}>
            <div className="grab" />
            <div className="sh-h">
              <b>{d.id ? "编辑记忆" : "写一条记忆"}</b>
              <button onClick={save} disabled={!d.text.trim() || busy}>{busy ? "保存中…" : "保存"}</button>
            </div>
            <div className="sec">
              <h4>类型</h4>
              <div className="seg" role="radiogroup" aria-label="记忆类型">
                {KINDS.map((k) => <button key={k} role="radio" aria-checked={d.kind === k} className={d.kind === k ? "on" : ""} onClick={() => setDraft({ ...d, kind: k })}>{KIND_META[k].n}</button>)}
              </div>
              <p className="hint">{KIND_META[d.kind].d}</p>
            </div>
            <div className="sec">
              <h4>标题</h4>
              <input className="fld" value={d.title} onChange={(e) => setDraft({ ...d, title: e.target.value })} placeholder="不填就用正文开头" maxLength={60} />
              <h4 style={{ marginTop: 12 }}>正文</h4>
              <textarea className="fld big" value={d.text} onChange={(e) => setDraft({ ...d, text: e.target.value })} placeholder="写下要记住的事…" />
            </div>
            {d.kind === "preference" && (
              <div className="sec">
                <h4>喜好</h4>
                <div className="seg" role="radiogroup" aria-label="喜欢还是不喜欢">
                  {(["like", "dislike"] as const).map((p) => <button key={p} role="radio" aria-checked={d.preference?.polarity === p} className={d.preference?.polarity === p ? "on" : ""} onClick={() => setDraft({ ...d, preference: { ...d.preference!, polarity: p } })}>{p === "like" ? "喜欢" : "不喜欢"}</button>)}
                </div>
                <div className="seg" role="radiogroup" aria-label="是谁的喜好" style={{ marginTop: 8 }}>
                  {SUBJ.map(([s, n]) => <button key={s} role="radio" aria-checked={d.preference?.subject === s} className={d.preference?.subject === s ? "on" : ""} onClick={() => setDraft({ ...d, preference: { ...d.preference!, subject: s } })}>{n}</button>)}
                </div>
                <input className="fld" style={{ marginTop: 8 }} value={d.kwText} onChange={(e) => setDraft({ ...d, kwText: e.target.value })} placeholder="浮现关键词，用逗号隔开（逐字命中）" />
                <input className="fld" style={{ marginTop: 8 }} value={d.preference?.reason ?? ""} onChange={(e) => setDraft({ ...d, preference: { ...d.preference!, reason: e.target.value } })} placeholder="原话或原因（可不填）" />
              </div>
            )}
            <div className="sec">
              <h4>召回线索 cues</h4>
              <input className="fld" value={d.cueText} onChange={(e) => setDraft({ ...d, cueText: e.target.value })} placeholder="最多 8 条，用逗号隔开，比如：下雨天，音乐" />
              <p className="hint">聊到这些时更容易想起这条；每条最多 80 字</p>
              <div className="row2">
                <label><h4>分类</h4><input className="fld" value={d.domain ?? ""} onChange={(e) => setDraft({ ...d, domain: e.target.value })} placeholder="如：日常" maxLength={40} /></label>
                <label><h4>日期</h4><input className="fld" type="date" value={d.date ?? ""} onChange={(e) => setDraft({ ...d, date: e.target.value || undefined })} /></label>
              </div>
              <h4 style={{ marginTop: 12 }}>重要度</h4>
              <div className="seg" role="radiogroup" aria-label="重要度">
                {[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={d.importance === n} className={d.importance === n ? "on" : ""} onClick={() => setDraft({ ...d, importance: n })}>{n}</button>)}
              </div>
            </div>
            <div className="sec">
              <label className="tgl"><span>置顶</span><input type="checkbox" checked={!!d.pinned} onChange={(e) => setDraft({ ...d, pinned: e.target.checked })} /><i /></label>
              <label className="tgl" style={{ marginTop: 10 }}><span>收藏</span><input type="checkbox" checked={!!d.favorite} onChange={(e) => setDraft({ ...d, favorite: e.target.checked })} /><i /></label>
              <label className="tgl" style={{ marginTop: 10 }}><span>归档（不再被想起，也不进提示词）</span><input type="checkbox" checked={d.status === "archived"} onChange={(e) => setDraft({ ...d, status: e.target.checked ? "archived" : "active" })} /><i /></label>
            </div>
            {d.id && (askDel
              ? <div className="addl"><button className="gbtn red" onClick={remove}>确认删除这条记忆</button><button className="gbtn" onClick={() => setAskDel(false)}>算了</button></div>
              : <button className="gbtn red" onClick={() => setAskDel(true)}><GIcon n="trash" s={18} />删除</button>)}
          </div>
        </>
      )}
    </GlassPage>
  );
}
