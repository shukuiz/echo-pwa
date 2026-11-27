"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent } from "react";
import { PageShell } from "@/components/Chrome";
import { loadChatCss, updateChatCss } from "@/lib/chat-css";
import "./chat-css.css";

const MAX_IMPORT_BYTES = 200 * 1024;

export default function ChatCssPage() {
  const [store, setStore] = useState(loadChatCss);
  const [editor, setEditor] = useState(store.draft);
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingImport = useRef<FileReader | null>(null);

  function change(action: Parameters<typeof updateChatCss>[0], message: string, syncEditor = false) {
    try {
      const next = updateChatCss(action);
      setStore(next);
      if (syncEditor) {
        pendingImport.current?.abort();
        setEditor(next.draft);
      }
      setNotice(message);
    } catch {
      setNotice("没存上，请检查浏览器能否保存本机数据，或腾一点空间再试。");
    }
  }

  function savePreset() {
    const name = window.prompt("给当前已应用的样式起个名字")?.trim();
    if (!name) return;
    const overwrite = loadChatCss().presets.some((preset) => preset.name === name);
    if (overwrite && !window.confirm(`已经有「${name}」了，要覆盖它吗？`)) return;
    change({ type: "save", name, overwrite }, `已保存「${name}」`);
  }

  function importCss(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    pendingImport.current?.abort();
    if (!/\.css$/i.test(file.name)) {
      setNotice("请选择 .css 文件。");
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setNotice("文件超过 200 KB，请缩小后再导入。");
      return;
    }
    const reader = new FileReader();
    pendingImport.current = reader;
    reader.onload = () => {
      setEditor(String(reader.result ?? ""));
      setNotice("已填入编辑框，点「应用」后才会生效。");
    };
    reader.onerror = () => setNotice("没能读到这个文件，请重试。");
    reader.onloadend = () => {
      if (pendingImport.current === reader) pendingImport.current = null;
    };
    reader.readAsText(file);
  }

  return (
    <PageShell title="聊天美化">
      <section className="cs-page">
        <p>只作用于聊天页，写坏了点「停用」就回来。</p>
        <label className="cs-label" htmlFor="chat-css-editor">自定义 CSS</label>
        <textarea id="chat-css-editor" className="cs-editor" spellCheck={false} autoCapitalize="off"
          value={editor} onChange={(event) => setEditor(event.target.value)}
          placeholder={".ec-page {\n  --ec-bubble-r: 16px;\n}"} />
        <div className="cs-actions">
          <button type="button" onClick={() => change({ type: "apply", css: editor }, "已应用")}>应用</button>
          <button type="button" onClick={savePreset}>保存为预设</button>
          <button type="button" onClick={() => fileInput.current?.click()}>导入</button>
          <input ref={fileInput} type="file" accept=".css,text/css" hidden onChange={importCss} />
          <button type="button" onClick={() => change({ type: "disable" }, "已停用", true)}>停用</button>
        </div>
        <p className="cs-notice" role="status">{notice || (editor !== store.draft ? "编辑框里的改动还未应用。" : "")}</p>
        <h2 className="cs-label">本机预设</h2>
        {store.presets.length ? (
          <ul className="cs-presets">
            {store.presets.map((preset) => (
              <li className="cs-preset" key={preset.id}>
                <button type="button" aria-pressed={store.activeId === preset.id}
                  onClick={() => change({ type: "select", id: preset.id }, `已切换到「${preset.name}」`, true)}>{preset.name}</button>
                <button type="button" aria-label={`删除「${preset.name}」`}
                  onClick={() => {
                    if (window.confirm(`删除本机预设「${preset.name}」？`)) {
                      change({ type: "delete", id: preset.id }, `已删除「${preset.name}」`);
                    }
                  }}>×</button>
              </li>
            ))}
          </ul>
        ) : <p className="cs-empty">还没有预设。</p>}
        <Link className="cs-chat" href="/chat">去看聊天页 →</Link>
      </section>
    </PageShell>
  );
}
