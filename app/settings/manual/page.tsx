"use client";

// 设置 → 说明书：echo 的 AGENTS.md（人设 / 说话方式 / 规矩）。普通接口每条消息都重新读；Codex 只在开新对话时读
import { useEffect, useState } from "react";
import { PageShell } from "@/components/Chrome";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

type Feedback = { kind: "working" | "success" | "error"; message: string };
const errorMessage = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

export default function ManualPage() {
  const { ready, settings } = useStore();
  const [saved, setSaved] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Feedback | null>({ kind: "working", message: "正在读取说明书…" });
  const [askThread, setAskThread] = useState(false);
  const codex = settings.apiMode === "codex";
  const dirty = saved !== null && text !== saved;
  const busy = status?.kind === "working";

  useEffect(() => {
    if (!ready) return;
    api.getManual().then((m) => { setSaved(m.content); setText(m.content); setStatus(null); })
      .catch((e) => setStatus({ kind: "error", message: errorMessage(e, "读不到说明书") }));
  }, [ready]);

  async function save() {
    if (!text.trim()) { setStatus({ kind: "error", message: "说明书不能是空的哦" }); return; }
    setStatus({ kind: "working", message: "正在保存…" });
    try {
      const m = await api.saveManual(text);
      setSaved(m.content);
      setText(m.content);
      setStatus({ kind: "success", message: codex ? "已保存。Codex 要开新对话才会读到新版" : "已保存，下一条消息就用新说明书 ✿" });
      setAskThread(codex);
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e, "保存失败") });
    }
  }

  async function restore() {
    if (!window.confirm("恢复成默认说明书？现在写的内容会被替换掉。")) return;
    setStatus({ kind: "working", message: "正在恢复默认…" });
    try {
      const m = await api.resetManual();
      setSaved(m.content);
      setText(m.content);
      setStatus({ kind: "success", message: "已恢复默认说明书" });
      setAskThread(codex);
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e, "恢复失败") });
    }
  }

  async function newThread() {
    setStatus({ kind: "working", message: "正在开新对话…" });
    try {
      await api.codexResetThread();
      setAskThread(false);
      setStatus({ kind: "success", message: "好啦，Codex 下一条消息就会读新说明书 ( ˘ᵕ˘ )" });
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e, "没能开新对话") });
    }
  }

  return (
    <PageShell title="说明书" sub={<p className="truncate text-[12px] text-mute">echo 是谁、怎么说话、有什么规矩</p>}
      right={
        <button type="button" onClick={save} disabled={!dirty || busy}
          className="btn-primary min-h-11 shrink-0 px-4 text-[14px] disabled:opacity-40">保存</button>
      }>
      <div className="space-y-4 pt-1">
        <div className="block-white space-y-2 rounded-[24px] p-4 text-[13px] leading-relaxed text-mute">
          <p>这就是 echo 的 AGENTS.md。用普通 API 聊天时，每条消息都会重新读一遍，改完马上生效。</p>
          <p>用 <b className="font-medium text-ink">Codex（ChatGPT 订阅）</b> 时，Codex 只在开始一段新对话时读一次；改完需要「开新对话」才会用上新版。</p>
        </div>

        <label className="block">
          <span className="sr-only">说明书内容</span>
          <textarea value={text} onChange={(e) => { setText(e.target.value); if (status?.kind !== "working") setStatus(null); }}
            disabled={saved === null} spellCheck={false}
            className="field min-h-[52dvh] resize-y font-mono text-[14px] leading-relaxed" />
        </label>
        <div className="flex items-center justify-between gap-3 text-[12px] text-mute">
          <span>{dirty ? "有没保存的修改" : saved !== null ? "已是最新" : ""}</span>
          <span className="tabular-nums">{new TextEncoder().encode(text).length.toLocaleString()} / 65,536 字节</span>
        </div>

        {askThread && (
          <div className="block-white space-y-3 rounded-[24px] p-4">
            <p className="text-[14px]">要现在让 Codex 开一段新对话、读新说明书吗？之前的上下文它会忘掉，echo 里的聊天记录还在。</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary min-h-11 px-4" onClick={newThread} disabled={busy}>开新对话</button>
              <button type="button" className="btn-ghost min-h-11 px-4" onClick={() => setAskThread(false)}>先不用</button>
            </div>
          </div>
        )}

        <p role="status" aria-atomic="true" className={`min-h-5 text-[13px] ${status?.kind === "error" ? "font-medium text-rose" : "text-mute"}`}>{status?.message}</p>

        <div className="flex flex-wrap gap-2 pb-[env(safe-area-inset-bottom)]">
          <button type="button" onClick={save} disabled={!dirty || busy} className="btn-primary min-h-11 px-5 disabled:opacity-40">保存</button>
          <button type="button" onClick={() => saved !== null && setText(saved)} disabled={!dirty || busy} className="btn-ghost min-h-11 px-4 disabled:opacity-40">撤销修改</button>
          <button type="button" onClick={restore} disabled={busy || saved === null} className="btn-ghost min-h-11 px-4 disabled:opacity-40">恢复默认</button>
        </div>
      </div>
    </PageShell>
  );
}
