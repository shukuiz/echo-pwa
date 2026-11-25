"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SettingsDrawer } from "@/components/Chrome";
import { api, type MemoryModelKind, type MemoryModelSettings } from "@/lib/api";

const MODEL_TYPES = {
  embedding: { label: "Echo 向量模型", endpoint: "https://api.example.com/v1/embeddings" },
  rerank: { label: "Echo 重排模型", endpoint: "https://api.example.com/v1/rerank" },
};

type Feedback = { ok: boolean; message: string };

function InlineStatus({ feedback }: { feedback: Feedback | null }) {
  return (
    <p role="status" aria-atomic="true" className={feedback?.ok === false ? "break-words text-[13px] font-medium text-rose" : "break-words text-[13px] text-mute"}>
      {feedback?.message}
    </p>
  );
}

function ModelForm({ kind, initial }: { kind: MemoryModelKind; initial: MemoryModelSettings }) {
  const { label, endpoint } = MODEL_TYPES[kind];
  const [saved, setSaved] = useState(initial);
  const [url, setUrl] = useState(initial.url);
  const [model, setModel] = useState(initial.model);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState<"saving" | "testing" | "listing" | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<Feedback | null>(null);
  const [testFeedback, setTestFeedback] = useState<Feedback | null>(null);
  const [listFeedback, setListFeedback] = useState<Feedback | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const dirty = url.trim() !== saved.url || model.trim() !== saved.model || Boolean(apiKey.trim()) || clearKey;

  function resetModelList() {
    setModels([]);
    setListFeedback(null);
    setSaveFeedback(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("saving");
    setSaveFeedback(null);
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
      setSaveFeedback({ ok: true, message: "已保存" });
      setTestFeedback(null);
    } catch (error) {
      setSaveFeedback({ ok: false, message: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function fetchModels() {
    setBusy("listing");
    setListFeedback(null);
    try {
      const result = await api.listMemoryModels(kind, {
        url: url.trim(),
        ...(clearKey || apiKey.trim() ? { apiKey: clearKey ? "" : apiKey.trim() } : {}),
      });
      setModels(result.models);
      setListFeedback({
        ok: true,
        message: result.models.length ? `已更新 ${result.models.length} 个候选模型` : "服务未返回模型，可手动填写模型名。",
      });
    } catch (error) {
      setListFeedback({ ok: false, message: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy("testing");
    setTestFeedback(null);
    try {
      const result = await api.testMemoryModel(kind);
      setTestFeedback({ ok: result.ok, message: result.ok ? `测试通过 · ${result.message}` : `测试失败 · ${result.message}` });
    } catch (error) {
      setTestFeedback({ ok: false, message: (error as Error).message });
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
            placeholder={endpoint} value={url} onChange={(event) => { setUrl(event.target.value); resetModelList(); }} />
        </label>
        <label className="block space-y-1 text-[13px] text-mute">
          <span className="block">模型名</span>
          <input className="field w-full" autoCapitalize="none" spellCheck={false} required maxLength={200}
            value={model} onChange={(event) => { setModel(event.target.value); setSaveFeedback(null); }} />
        </label>
        <label className="block space-y-1 text-[13px] text-mute">
          <span className="block">API Key</span>
          <input className="field w-full" type="password" autoComplete="new-password" maxLength={4096} disabled={clearKey}
            placeholder={saved.hasKey ? "已保存 ••••••••" : "服务需要鉴权时填写"} value={apiKey}
            onChange={(event) => { setApiKey(event.target.value); resetModelList(); }} />
        </label>
        {saved.hasKey && (
          <label className="flex min-h-8 items-center gap-2 text-[13px] text-mute">
            <input type="checkbox" checked={clearKey} onChange={(event) => {
              setClearKey(event.target.checked);
              setApiKey("");
              resetModelList();
            }} />
            保存时清除已有 Key
          </label>
        )}
        {saved.hasKey && url.trim() !== saved.url && (
          <p className="text-[13px] text-mute">更换接口地址会清除原有 Key。如新地址需要鉴权，请填写对应的 Key。</p>
        )}
        {models.length > 0 && (
          <div tabIndex={0} aria-label={label + "列表"} className="model-list-scroll divide-y divide-line rounded-2xl bg-fog/50">
            {models.map((id) => (
              <button key={id} type="button" aria-pressed={model === id}
                className="block min-h-11 w-full break-all px-3 py-2 text-left text-[14px] aria-pressed:font-semibold aria-pressed:text-rose"
                onClick={() => { setModel(id); setSaveFeedback(null); }}>
                {id}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary min-h-11 px-4 disabled:opacity-60"
            disabled={!dirty || !url.trim() || !model.trim()}>{busy === "saving" ? "保存中…" : "保存"}</button>
          <button type="button" className="btn-ghost min-h-11 px-4 disabled:opacity-60" disabled={!url.trim()} onClick={fetchModels}>
            {busy === "listing" ? "拉取中…" : "拉取模型"}
          </button>
          <button type="button" className="btn-ghost min-h-11 px-4 disabled:opacity-60"
            disabled={dirty || !saved.url || !saved.model} onClick={testConnection}>
            {busy === "testing" ? "测试中…" : "测试连接"}
          </button>
        </div>
        {busy === "saving" ? <InlineStatus feedback={{ ok: true, message: "正在保存…" }} /> : <InlineStatus feedback={saveFeedback} />}
        {busy === "listing" ? <InlineStatus feedback={{ ok: true, message: "正在拉取候选模型…" }} /> : <InlineStatus feedback={listFeedback} />}
        {busy === "testing" ? <InlineStatus feedback={{ ok: true, message: "正在测试已保存的连接…" }} /> : <InlineStatus feedback={testFeedback} />}
      </fieldset>
    </form>
  );
}

function EchoMemorySettings() {
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
    <div className="space-y-4">
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
  );
}

export default function MemoryModelSettingsSection({
  owner, sereinSettingsUrl,
}: {
  owner?: "echo" | "serein";
  sereinSettingsUrl?: string;
}) {
  const [fromRecall, setFromRecall] = useState(false);
  const section = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => setFromRecall(location.hash === "#echo-memory-retrieval");
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (fromRecall && owner) section.current?.scrollIntoView({ block: "start" });
  }, [fromRecall, owner]);

  return (
    <div ref={section} id="echo-memory-retrieval">
      <SettingsDrawer title="记忆检索" open={fromRecall || undefined}>
        {owner === "serein" ? (
          <div className="space-y-2 text-[13px] text-mute">
            <p className="text-[15px] font-medium text-ink">由 Serein 管理</p>
            <p>当前聊天连接使用 Serein。请在 Serein 的设置中查看向量模型、重排模型和检索状态。</p>
            {sereinSettingsUrl ? (
              <a href={sereinSettingsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-medium text-rose underline underline-offset-4">
                打开 Serein 设置
              </a>
            ) : <p>打开你的 Serein 控制台，进入「设置」。</p>}
            <details className="border-t border-line pt-2" open={fromRecall || undefined}>
              <summary className="min-h-11 cursor-pointer py-2 font-medium text-ink">Echo 记忆本的召回设置</summary>
              <p className="mb-3">这里的模型用于 Echo 记忆本中的召回测试。</p>
              <EchoMemorySettings />
            </details>
          </div>
        ) : owner === "echo" ? <EchoMemorySettings /> : (
          <p className="text-[13px] text-mute">请先加载聊天连接。</p>
        )}
      </SettingsDrawer>
    </div>
  );
}
