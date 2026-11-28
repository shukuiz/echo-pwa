"use client";

// 历史窗口：每一窗一段对话，旧的只读保存；点开可以从头翻到尾，看当时写下的窗影
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import GlassPage from "@/components/glass/GlassPage";
import { GIcon } from "@/components/glass/Wall";
import { api, type ChatWindow, type WindowList } from "@/lib/api";
import { useStore } from "@/lib/store";

const day = (t: number) => { const d = new Date(t); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
const hm = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export default function WindowsPage() {
  return <Suspense><Windows /></Suspense>;
}

function Windows() {
  const params = useSearchParams();
  const id = params.get("id");
  return id ? <WindowView id={id} /> : <WindowList />;
}

function WindowList() {
  const { ready } = useStore();
  const [list, setList] = useState<WindowList | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { if (ready) api.getWindows().then(setList).catch((e) => setErr((e as Error).message)); }, [ready]);
  return (
    <GlassPage title="历史窗口" className="winpage" sub={<small className="mute">{list ? `共 ${list.windows.length} 窗` : "一窗一段对话"}</small>}
      right={<Link href="/chat/window" className="chip ib" aria-label="换窗"><GIcon n="win" s={19} /></Link>}>
      {err && <section className="g card" data-cssg><p className="warn" role="alert">{err}</p></section>}
      {list?.windows.map((w) => <WindowCard key={w.id} w={w} active={w.id === list.activeId} />)}
      {list && list.windows.length === 1 && <p className="hint" data-onwp style={{ textAlign: "center" }}>换过一次窗以后，旧窗口会出现在这里</p>}
    </GlassPage>
  );
}

function WindowCard({ w, active }: { w: ChatWindow; active: boolean }) {
  const router = useRouter();
  const go = () => (active ? router.push("/chat") : router.push(`/chat/windows?id=${encodeURIComponent(w.id)}`));
  return (
    <button type="button" className="g card wcard" data-cssg data-tint="0.08" onClick={go}>
      <span className="wh">
        <b>{w.title}</b>
        {active ? <span className="tag on">当前</span> : <span className="tag">只读</span>}
      </span>
      <span className="wm">{day(w.createdAt)}{w.archivedAt ? ` — ${day(w.archivedAt)}` : " 至今"} · {active ? "正在聊" : `${w.messageCount} 条`}</span>
      {w.shadow ? <span className="ws">窗影 · {w.shadow.title}</span> : !active ? <span className="ws dim2">这一窗没写窗影</span> : null}
    </button>
  );
}

function WindowView({ id }: { id: string }) {
  const { ready } = useStore();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getWindow>> | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { if (ready) api.getWindow(id).then(setData).catch((e) => setErr((e as Error).message)); }, [ready, id]);
  const w = data?.window;
  const s = w?.shadow?.sections;
  return (
    <GlassPage title={w?.title || "历史窗口"} className="winpage"
      sub={<small className="mute">{w ? `只读 · ${day(w.createdAt)}${w.archivedAt ? " — " + day(w.archivedAt) : ""} · ${data?.messages.length ?? 0} 条` : "只读"}</small>}>
      {err && <section className="g card" data-cssg><p className="warn" role="alert">{err}</p></section>}
      {s && (
        <section className="g card" data-cssg data-tint="0.08">
          <h3><GIcon n="star" s={16} />这一窗的窗影 · {w?.shadow?.title}</h3>
          <div className="shadow">
            {([["user_view", "我眼中的你"], ["self_view", "我眼中的自己"], ["recent_events", "这一窗发生的事"]] as const).map(([k, label]) => s[k] ? (
              <details key={k}><summary>{label}</summary><p>{s[k]}</p></details>
            ) : null)}
          </div>
        </section>
      )}
      <div className="wlog" aria-label="这一窗的聊天（只读）">
        {data?.messages.filter((m) => m.text).map((m) => (
          <div key={m.id} className={`wmsg ${m.role === "user" ? "me" : ""}`}>
            <div className={`g bub ${m.role === "user" ? "me" : "ai"}`} data-cssg data-hue={m.role === "user" ? "me" : undefined} data-tint={m.role === "user" ? "0.22" : undefined}>{m.text}</div>
            <small data-onwp>{hm(m.at)}</small>
          </div>
        ))}
        {data && !data.messages.length && <p className="hint" data-onwp style={{ textAlign: "center" }}>这一窗没有聊天记录</p>}
      </div>
      <p className="hint" data-onwp style={{ textAlign: "center", paddingBottom: 12 }}>历史窗口只能看，不能改；想接着聊，回到当前窗口就好</p>
    </GlassPage>
  );
}
