"use client";

// 设置 → 开发 → 代码规矩：仓库根目录的 AGENTS.md（给 Codex / Claude Code 这类写代码的 AI 看，不是 echo 人设）
// 读写都走后端 /api/project/instructions，保存 = 直接在 GitHub 上提交一次
import { useEffect, useState } from "react";
import { PageShell } from "@/components/Chrome";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

type Project = Awaited<ReturnType<typeof api.getProject>>;
type Feedback = { kind: "working" | "success" | "error"; message: string };

export default function CodeRulesPage() {
  const { ready } = useStore();
  const [file, setFile] = useState<Project | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Feedback | null>({ kind: "working", message: "正在读取代码规矩…" });
  const [ask, setAsk] = useState(false);
  const dirty = !!file && text !== file.text;
  const busy = status?.kind === "working";

  async function read() {
    setStatus({ kind: "working", message: "正在读取代码规矩…" });
    try {
      const next = await api.getProject();
      setFile(next); setText(next.text); setStatus(null);
    } catch (e) {
      setStatus({ kind: "error", message: (e as Error).message || "读不到代码规矩" });
    }
  }
  useEffect(() => { if (ready) void read(); }, [ready]);

  async function save() {
    if (!file) return;
    setAsk(false);
    setStatus({ kind: "working", message: "正在提交到仓库…" });
    try {
      const saved = await api.saveProject(text, file.version);
      setFile({ ...file, text, version: saved.version });
      setStatus({ kind: "success", message: `已提交到仓库 · ${saved.commit.slice(0, 7)}` });
    } catch (e) {
      setStatus({ kind: "error", message: (e as Error).message || "提交失败了" });
    }
  }

  return (
    <PageShell glass title="代码规矩" sub={<p className="truncate text-[12px]" data-onwp>给写代码的 AI 看，不是 echo 人设</p>}
      right={file?.writable ? (
        <button type="button" onClick={() => setAsk(true)} disabled={!dirty || busy}
          className="btn-primary min-h-11 shrink-0 px-4 text-[14px] disabled:opacity-40">保存</button>
      ) : undefined}>
      <div className="space-y-4 pt-1">
        <div className="g card coderules-note" data-cssg data-tint="0.1">
          <p>这是仓库里的 <b>AGENTS.md</b>，Codex、Claude Code 这些帮你写代码的 AI 开工前会先读它：项目怎么组织、分支怎么开、测试怎么跑。</p>
          <p>echo 是谁、怎么说话，在 设置 → <b>说明书</b> 里改，和这里互不影响。</p>
          {file && <p className="mono">{file.repo} · {file.branch} · 版本 {file.version.slice(0, 7)}</p>}
        </div>

        <label className="g card coderules-edit" data-cssg data-tint="0.06">
          <span className="sr-only">代码规矩内容</span>
          <textarea value={text} onChange={(e) => { setText(e.target.value); if (!busy) setStatus(null); }}
            disabled={!file || busy} readOnly={!file?.writable} spellCheck={false} aria-label="代码规矩 AGENTS.md" />
        </label>
        <div className="flex items-center justify-between gap-3 text-[12px]" data-onwp>
          <span>{!file ? "" : !file.writable ? "只读：后端还没开启仓库写入" : dirty ? "有没提交的修改" : "和仓库里一致"}</span>
          <span className="tabular-nums">{new TextEncoder().encode(text).length.toLocaleString()} 字节</span>
        </div>

        <p role="status" aria-atomic="true" className={`min-h-5 text-[13px] ${status?.kind === "error" ? "font-medium text-rose" : ""}`} data-onwp>{status?.message}</p>

        <div className="flex flex-wrap gap-2 pb-[env(safe-area-inset-bottom)]">
          {file?.writable && <button type="button" onClick={() => setAsk(true)} disabled={!dirty || busy} className="btn-primary min-h-11 px-5 disabled:opacity-40">保存到仓库</button>}
          <button type="button" onClick={() => file && setText(file.text)} disabled={!dirty || busy} className="btn-ghost min-h-11 px-4 disabled:opacity-40">撤销修改</button>
          <button type="button" onClick={() => { if (!dirty || window.confirm("放弃当前修改，重新读取仓库里的版本？")) void read(); }} disabled={busy} className="btn-ghost min-h-11 px-4 disabled:opacity-40">重新读取</button>
        </div>
      </div>

      {ask && (
        <>
          <div className="gmask" onClick={() => setAsk(false)} />
          <div className="gsheet on" role="alertdialog" aria-labelledby="coderules-ask">
            <div className="grab" />
            <div className="sh-h"><b id="coderules-ask">会直接提交到仓库</b></div>
            <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
              保存后会在 {file?.repo} 的 {file?.branch} 分支上直接提交一次 AGENTS.md，写代码的 AI 下次开工就按新规矩来。确定吗？
            </p>
            <div className="addl">
              <button className="gbtn dark" onClick={save}>确定提交</button>
              <button className="gbtn" onClick={() => setAsk(false)}>再想想</button>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
