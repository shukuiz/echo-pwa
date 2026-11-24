"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, type MemoryModelKind, type MemoryModelSettings } from "@/lib/api";

const MODEL_TYPES = {
  embedding: { label: "向量模型", endpoint: "https://api.example.com/v1/embeddings" },
  rerank: { label: "重排模型", endpoint: "https://api.example.com/v1/rerank" },
};

function ModelForm({ kind, initial }: { kind: MemoryModelKind; initial: MemoryModelSettings }) {
  const { label, endpoint } = MODEL_TYPES[kind];
  const [saved, setSaved] = useState(initial);
  const [url, setUrl] = useState(initial.url);
  const [model, setModel] = useState(initial.model);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState<"saving" | "testing" | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const dirty = url.trim() !== saved.url || model.trim() !== saved.model || Boolean(apiKey.trim()) || clearKey;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("saving");
    setFeedback(null);
    try {
      const settings = await api.saveMemoryModel(kind, {
        url: url.trim(),
        model: model.trim(),
        ...(clearKey || apiKey.trim() ? { apiKey: clearKey ? "" : apiKey.trim() } : {}),
      });
      const next = settings[kind];
      setSaved(next);
      setUrl(next.url);
      setModel(next.model);
      setApiKey("");
      setClearKey(false);
      setFeedback({ ok: true, message: "已保存" });
    } catch (error) {
      setFeedback({ ok: false, message: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy("testing");
    setFeedback(null);
    try {
      setFeedback(await api.testMemoryModel(kind));
    } catch (error) {
      setFeedback({ ok: false, message: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={save}>
      <fieldset disabled={Boolean(busy)} className="min-w-0 space-y-3">
        <legend className="mb-2 text-[15px] font-semibold">{label}</legend>
        <label className="block space-y-1 text-[13px] text-mute">
          <span className="block">接口地址</span>
          <input className="field w-full" type="url" inputMode="url" autoCapitalize="none" spellCheck={false} required maxLength={2048}
            placeholder={endpoint} value={url} onChange={(event) => { setUrl(event.target.value); setFeedback(null); }} />
        </label>
        <label className="block space-y-1 text-[13px] text-mute">
          <span className="block">模型名</span>
          <input className="field w-full" autoCapitalize="none" spellCheck={false} required maxLength={200}
            value={model} onChange={(event) => { setModel(event.target.value); setFeedback(null); }} />
        </label>
        <label className="block space-y-1 text-[13px] text-mute">
          <span className="block">API Key</span>
          <input className="field w-full" type="password" autoComplete="new-password" maxLength={4096} disabled={clearKey}
            placeholder={saved.hasKey ? "已配置 · 输入新 Key 可替换" : "服务需要鉴权时填写"} value={apiKey}
            onChange={(event) => { setApiKey(event.target.value); setFeedback(null); }} />
        </label>
        {saved.hasKey && (
          <label className="flex min-h-8 items-center gap-2 text-[13px] text-mute">
            <input type="checkbox" checked={clearKey} onChange={(event) => { setClearKey(event.target.checked); setFeedback(null); }} />
            保存时清除已有 Key
          </label>
        )}
        {saved.hasKey && url.trim() !== saved.url && (
          <p className="text-[13px] text-mute">更换地址后，请填写新地址对应的 Key。</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary min-h-11 px-4 disabled:opacity-60"
            disabled={!dirty || !url.trim() || !model.trim()}>{busy === "saving" ? "保存中…" : "保存"}</button>
          <button type="button" className="btn-ghost min-h-11 px-4 disabled:opacity-60"
            disabled={dirty || !saved.url || !saved.model} onClick={testConnection}>
            {busy === "testing" ? "测试中…" : "测试连接"}
          </button>
        </div>
        <p role="status" className={feedback?.ok === false ? "text-[13px] font-medium text-rose" : "text-[13px] text-mute"}>
          {feedback?.message}
        </p>
      </fieldset>
    </form>
  );
}

export default function MemoryModelSettingsSection() {
  const [settings, setSettings] = useState<Record<MemoryModelKind, MemoryModelSettings> | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let mounted = true;
    api.getMemoryModels().then((result) => {
      if (mounted) setSettings(result);
    }).catch((err: Error) => {
      if (mounted) setError(err.message || "加载失败");
    });
    return () => { mounted = false; };
  }, [attempt]);

  return (
    <section aria-labelledby="memory-models-title">
      <h2 id="memory-models-title" className="mb-2 px-1 text-[15px] font-semibold text-mute">记忆模型</h2>
      <div className="block-white space-y-4 rounded-[26px] p-4">
        <p className="text-[13px] text-mute">向量模型查找相近的记忆，重排模型筛选相关结果。查询和记忆片段会发给你配置的服务。</p>
        {settings ? (
          <>
            <ModelForm kind="embedding" initial={settings.embedding} />
            <div className="border-t border-fog pt-4"><ModelForm kind="rerank" initial={settings.rerank} /></div>
          </>
        ) : error ? (
          <div className="space-y-2">
            <p role="alert" className="text-[13px] text-rose">{error}</p>
            <button type="button" className="btn-ghost min-h-11 px-4" onClick={() => { setError(""); setAttempt(attempt + 1); }}>重新加载</button>
          </div>
        ) : <p role="status" className="text-[13px] text-mute">正在读取设置…</p>}
      </div>
    </section>
  );
}
