"use client";
import { useState } from "react";
import { api } from "@/lib/api";

export default function ProjectInstructions() {
  const [file, setFile] = useState<Awaited<ReturnType<typeof api.getProject>>>();
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function read() {
    setBusy(true);
    try {
      const next = await api.getProject();
      setFile(next); setText(next.text); setMessage("");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!file) return;
    setBusy(true);
    try {
      const saved = await api.saveProject(text,file.version);
      setFile({...file,text,version:saved.version});
      setMessage("已提交 " + saved.commit.slice(0,7));
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <details className="g card" onToggle={e=>{if (e.currentTarget.open && !file && !busy) void read();}}>
    <summary>项目说明 · Codex / Claude Code</summary>
    {file && <><small>{file.repo} · {file.branch} · 文件版本 {file.version.slice(0,7)}</small>
      <textarea aria-label="项目说明 AGENTS.md" style={{width:"100%"}} rows={10} disabled={busy} readOnly={!file.writable} value={text} onChange={e=>setText(e.target.value)} />
      {file.writable && <button disabled={busy || text===file.text} onClick={save}>保存到仓库</button>}</>}
    <button disabled={busy} onClick={()=>{if (!file || text===file.text || confirm("放弃当前草稿并重新读取？")) void read();}}>重新读取</button>
    <p role="status">{busy ? "处理中…" : message}</p>
  </details>;
}
