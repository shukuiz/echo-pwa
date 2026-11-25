"use client";

// 换窗：这一窗写好窗影、收进「历史窗口」，新的一窗从窗影和挑好的资料接上
// 资料都来自 Serein（窗影 / Event / Scene / 收藏 / 原话），每类 1–50 条、默认 10 条，确认前可以先预览
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GlassPage from "@/components/glass/GlassPage";
import { GIcon } from "@/components/glass/Wall";
import { api, ApiError, type LatestShadow, type ResumeCandidate, type ResumePreview, type ResumeSelection, type WindowList } from "@/lib/api";
import { useStore } from "@/lib/store";
import { useLiveGen } from "@/lib/generation";

const DEFAULT: ResumeSelection = {
  latest_shadow: true, recent_events: true, recent_event_limit: 10, recent_scenes: true, recent_scene_limit: 10,
  favorite_scenes: true, recent_originals: false, recent_original_limit: 10, pending_originals: false,
  selected_memories: false, selected_ids: [],
};
const SECTION: Record<string, string> = {
  latest_shadow: "最新窗影", recent_event: "最近 Event", recent_scene: "最近 Scene", favorite: "收藏的 Scene",
  selected_memory: "自选", recent_original: "最近原话", pending_original: "尚未整理的原话",
};
type Fail = { stage: string; message: string };

export default function WindowSwitchPage() {
  const { ready, set, toast } = useStore();
  const router = useRouter();
  const live = useLiveGen();
  const [list, setList] = useState<WindowList | null>(null);
  const [shadow, setShadow] = useState<LatestShadow>(null);
  const [sel, setSel] = useState<ResumeSelection>(DEFAULT);
  const [preview, setPreview] = useState<ResumePreview | null>(null);
  const [loading, setLoading] = useState("");
  const [step, setStep] = useState<"" | "shadow" | "switch">("");
  const [fail, setFail] = useState<Fail | null>(null);
  const [noShadow, setNoShadow] = useState(false);
  const [pick, setPick] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!ready) return;
    api.getWindows().then((l) => { setList(l); setSel({ ...DEFAULT, ...(l.selection || {}) }); }).catch((e) => setErr((e as Error).message));
    api.latestShadow().then((r) => setShadow(r.shadow)).catch(() => {});
  }, [ready]);
  useEffect(() => { setPreview(null); }, [sel]);

  const active = list?.windows.find((w) => w.id === list.activeId);
  const upd = (p: Partial<ResumeSelection>) => setSel((s) => {
    const n = { ...s, ...p };
    if (p.recent_originals) n.pending_originals = false;
    if (p.pending_originals) n.recent_originals = false;
    return n;
  });

  async function doPreview() {
    setLoading("正在把要带上的资料找出来…");
    try { setPreview(await api.previewResume(sel)); setErr(""); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(""); }
  }

  async function doSwitch(opts: { skipShadow?: boolean; skipContinuity?: boolean } = {}) {
    setFail(null);
    const skipShadow = opts.skipShadow ?? noShadow;
    setStep(skipShadow ? "switch" : "shadow");
    try {
      const r = await api.switchWindow({ selection: sel, skipShadow, skipContinuity: opts.skipContinuity });
      set("messages", []);
      toast(r.shadow.status === "saved" ? `窗影写好了，${r.window.title}开始啦 ✿` : `${r.window.title}开始啦 ✿`);
      router.replace("/chat");
    } catch (e) {
      const stage = (e as ApiError & { stage?: string }).stage || "";
      setFail({ stage, message: (e as Error).message });
    } finally { setStep(""); }
  }

  const grouped = useMemo(() => {
    const g: Record<string, ResumePreview["items"]> = {};
    for (const it of preview?.items || []) (g[it.section] ||= []).push(it);
    return g;
  }, [preview]);
  const busy = !!step || !!live;

  return (
    <GlassPage title="换窗" className="winpage"
      sub={<small className="mute">{active ? `${active.title} → 第 ${active.n + 1} 窗` : "一窗一段对话"}</small>}
      right={<Link href="/chat/windows" className="chip ib" aria-label="历史窗口"><GIcon n="book" s={19} /></Link>}>

      <section className="g card win-lead" data-cssg data-tint="0.1">
        <p className="poem">一窗是一段连续的对话。换窗时，echo 先把这一窗写成<b>窗影</b>，旧窗口收进「历史窗口」只读保存，新的一窗从窗影和你挑的资料接上。</p>
        {list && <p className="meta">{list.modeLabel}{list.serein ? "" : " · 还没接上 Serein"}</p>}
        {live && <p className="warn">echo 还在回复，等这条说完再换窗</p>}
        {err && <p className="warn" role="alert">{err}</p>}
      </section>

      <section className="g card" data-cssg data-tint="0.08">
        <h3><GIcon n="star" s={16} />最新窗影 · 只读</h3>
        {!shadow ? <p className="hint" style={{ marginTop: 0 }}>还没有窗影。换窗时 echo 会写第一篇。</p> : (
          <div className="shadow">
            <b className="st">{shadow.title}</b>
            {([["user_view", "我眼中的你"], ["self_view", "我眼中的自己"], ["recent_events", "这一窗发生的事"]] as const).map(([k, label]) => {
              const own = shadow.sections?.[k];
              const inherited = !own && k !== "recent_events" ? shadow.portraitViews?.[k]?.text : "";
              const text = own || inherited;
              return text ? (
                <details key={k} open={k !== "recent_events"}>
                  <summary>{label}{inherited ? <small>（沿用更早的窗影）</small> : null}</summary>
                  <p>{text}</p>
                </details>
              ) : null;
            })}
          </div>
        )}
      </section>

      <section className="g card" data-cssg data-tint="0.08">
        <h3><GIcon n="layers" s={16} />带上哪些资料</h3>
        <Toggle label="最新窗影" sub="上一窗的我眼中的你 / 我眼中的自己 / 这一窗发生的事" on={sel.latest_shadow} onChange={(v) => upd({ latest_shadow: v })} />
        <Counted label="最近 Event" on={sel.recent_events} n={sel.recent_event_limit} onOn={(v) => upd({ recent_events: v })} onN={(n) => upd({ recent_event_limit: n })} />
        <Counted label="最近 Scene" on={sel.recent_scenes} n={sel.recent_scene_limit} onOn={(v) => upd({ recent_scenes: v })} onN={(n) => upd({ recent_scene_limit: n })} />
        <Toggle label="收藏的 Scene" sub="在 Serein 里收藏过的场景" on={sel.favorite_scenes} onChange={(v) => upd({ favorite_scenes: v })} />
        <Counted label="最近原话" on={sel.recent_originals} n={sel.recent_original_limit} onOn={(v) => upd({ recent_originals: v })} onN={(n) => upd({ recent_original_limit: n })} />
        <Toggle label="尚未整理的原话" sub="还没被 Serein 整理成 Event 的聊天（和最近原话二选一）" on={sel.pending_originals} onChange={(v) => upd({ pending_originals: v })} />
        <Toggle label={`自选${sel.selected_ids.length ? ` · ${sel.selected_ids.length} 条` : ""}`} sub="自己挑几条 Event / Scene" on={sel.selected_memories} onChange={(v) => { upd({ selected_memories: v }); if (v) setPick(true); }} />
        {sel.selected_memories && <button type="button" className="chip wbtn" onClick={() => setPick(true)}>挑选资料</button>}
        <button type="button" className="chip wbtn" onClick={doPreview} disabled={!!loading}>{loading ? "找资料中…" : preview ? "重新预览" : "预览要带上的资料"}</button>
        {loading && <p className="hint">{loading}</p>}
      </section>

      {preview && (
        <section className="g card" data-cssg data-tint="0.08" aria-label="资料预览">
          <h3><GIcon n="eye" s={16} />预览 · {preview.items.length} 条 · 约 {preview.chars.toLocaleString()} 字</h3>
          {preview.items.length === 0 && <p className="hint" style={{ marginTop: 0 }}>按现在的选择，没有要带上的资料。</p>}
          {Object.entries(grouped).map(([sec, items]) => (
            <details key={sec} className="pv">
              <summary>{SECTION[sec] || sec}<span>{items.length}</span></summary>
              {items.map((it) => (
                <div key={it.id + it.section} className="pvi">
                  <b>{it.kind === "raw" ? (it.role === "user" ? "她" : "echo") + (it.createdAt ? ` · ${it.createdAt}` : "") : it.title}</b>
                  <p>{it.body.length > 260 ? it.body.slice(0, 260) + "…" : it.body}</p>
                </div>
              ))}
            </details>
          ))}
        </section>
      )}

      <section className="g card win-go" data-cssg data-tint="0.12">
        <label className="btgl" style={{ marginTop: 0 }}>
          <span>先不写窗影<small>（只换窗，不让 echo 写这一窗）</small></span>
          <input type="checkbox" checked={noShadow} onChange={(e) => setNoShadow(e.target.checked)} /><i />
        </label>
        <button type="button" className="win-btn" disabled={busy || !list} onClick={() => doSwitch()}>
          {step === "shadow" ? "echo 正在写窗影…" : step === "switch" ? "正在换窗…" : noShadow ? "换窗" : "写窗影并换窗"}
        </button>
        <p className="hint">旧窗口的聊天一条不少地收进「历史窗口」，随时可以翻看。</p>
      </section>

      {fail && (
        <>
          <div className="gmask" onClick={() => setFail(null)} />
          <div className="gsheet on" role="alertdialog" aria-labelledby="win-fail">
            <div className="grab" />
            <div className="sh-h"><b id="win-fail">{fail.stage === "shadow" ? "窗影没写成" : fail.stage === "continuity" ? "资料没接上" : fail.stage === "busy" ? "现在换不了" : "换窗没成功"}</b></div>
            <p className="hint" style={{ marginTop: 0, marginBottom: 6 }}>{fail.message}</p>
            <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>还没换窗，这一窗的聊天都还在。</p>
            <div className="addl">
              <button className="gbtn dark" onClick={() => doSwitch()}>重试</button>
              {fail.stage === "shadow" && <button className="gbtn" onClick={() => doSwitch({ skipShadow: true })}>不写窗影，直接换窗</button>}
              {fail.stage === "continuity" && <button className="gbtn" onClick={() => doSwitch({ skipShadow: true, skipContinuity: true })}>不带资料，直接换窗</button>}
              <button className="gbtn" onClick={() => setFail(null)}>先不换</button>
            </div>
          </div>
        </>
      )}

      {pick && <Picker ids={sel.selected_ids} onClose={() => setPick(false)} onSave={(ids) => { upd({ selected_ids: ids, selected_memories: ids.length > 0 }); setPick(false); }} />}
    </GlassPage>
  );
}

function Toggle({ label, sub, on, onChange }: { label: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="btgl wrow">
      <span>{label}{sub && <small>{sub}</small>}</span>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /><i />
    </label>
  );
}

/** 带条数的一类资料：开关 + 1–50 条的加减 */
function Counted({ label, on, n, onOn, onN }: { label: string; on: boolean; n: number; onOn: (v: boolean) => void; onN: (n: number) => void }) {
  const clamp = (v: number) => Math.max(1, Math.min(50, Math.round(v) || 1));
  return (
    <div className="wrow counted">
      <label className="btgl">
        <span>{label}</span>
        <input type="checkbox" checked={on} onChange={(e) => onOn(e.target.checked)} /><i />
      </label>
      {on && (
        <div className="stepper" role="group" aria-label={`${label}条数`}>
          <button type="button" aria-label="少一条" onClick={() => onN(clamp(n - 1))} disabled={n <= 1}>−</button>
          <input type="number" inputMode="numeric" min={1} max={50} value={n} aria-label={`${label}条数（1–50）`} onChange={(e) => onN(clamp(+e.target.value))} />
          <button type="button" aria-label="多一条" onClick={() => onN(clamp(n + 1))} disabled={n >= 50}>＋</button>
          <small>条</small>
        </div>
      )}
    </div>
  );
}

/** 自选：搜 Serein 里的 Event / Scene，勾几条 */
function Picker({ ids, onClose, onSave }: { ids: string[]; onClose: () => void; onSave: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ResumeCandidate[]>([]);
  const [picked, setPicked] = useState<string[]>(ids);
  const [msg, setMsg] = useState("正在读取…");
  useEffect(() => {
    const t = setTimeout(() => {
      api.resumeCandidates(q).then((r) => { setItems(r.items); setMsg(r.items.length ? "" : "没有找到"); }).catch((e) => setMsg((e as Error).message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <>
      <div className="gmask" onClick={onClose} />
      <div className="gsheet on" role="dialog" aria-labelledby="win-pick">
        <div className="grab" />
        <div className="sh-h"><b id="win-pick">自选资料</b><button onClick={() => onSave(picked)}>好了 · {picked.length}</button></div>
        <input className="fld" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜标题或正文…" aria-label="搜索资料" />
        {msg && <p className="hint">{msg}</p>}
        <div className="addl" style={{ marginTop: 10 }}>
          {items.map((it) => {
            const on = picked.includes(it.id);
            return (
              <button key={it.id} type="button" className={`addr pickr ${on ? "on" : ""}`} aria-pressed={on}
                onClick={() => setPicked((p) => on ? p.filter((x) => x !== it.id) : [...p, it.id])}>
                <span className="tx"><b>{it.title || it.id}</b><small>{it.kind === "event" ? "Event" : "Scene"}{it.date ? " · " + it.date : ""}</small></span>
                <span className="ck">{on ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
