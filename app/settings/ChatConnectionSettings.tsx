"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { SettingsDrawer } from "@/components/Chrome";
import { api, type EchoSettings } from "@/lib/api";
import { useStore } from "@/lib/store";
import MemoryModelSettingsSection from "./MemoryModelSettings";

const OFFICIAL = {
  openai: { name: "OpenAI", url: "https://api.openai.com/v1", suggestedModel: "gpt-4o-mini" },
  anthropic: { name: "Claude", url: "https://api.anthropic.com/v1", suggestedModel: "claude-sonnet-4-5" },
  deepseek: { name: "DeepSeek", url: "https://api.deepseek.com/v1", suggestedModel: "deepseek-chat" },
};
type Provider = keyof typeof OFFICIAL;

type Connection =
  | { kind: "official"; provider: Provider; name: string; url: string; keyMask: string; model: string; workspaceId: string }
  | { kind: "custom"; id: string; name: string; url: string; keyMask: string; model: string };

type Feedback = { kind: "working" | "success" | "error"; message: string };

const NEW_CONNECTION: Connection = { kind: "custom", id: "", name: "", url: "", keyMask: "", model: "" };
const errorMessage = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

function connectionId(connection: Connection) {
  return connection.kind === "official" ? `official-${connection.provider}` : `custom-${connection.id}`;
}

function connectionIsCurrent(connection: Connection, config: EchoSettings) {
  return connection.kind === "official"
    ? config.apiMode === "official" && config.provider === connection.provider
    : config.apiMode === "custom" && config.activePresetId === connection.id;
}

function InlineStatus({ value }: { value: Feedback | null }) {
  const color = value?.kind === "error" ? "font-medium text-rose" : "text-mute";
  return (
    <p role="status" aria-atomic="true" className={`break-words text-[13px] empty:sr-only ${color}`}>
      {value?.message}
    </p>
  );
}

function ConnectionEditor({
  connection, candidates, activate, onClose, onSaved,
}: {
  connection: Connection;
  candidates: string[];
  activate: boolean;
  onClose: () => void;
  onSaved: (config: EchoSettings) => void;
}) {
  const [name, setName] = useState(connection.name);
  const [url, setUrl] = useState(connection.url);
  const [model, setModel] = useState(connection.model);
  const [workspaceId, setWorkspaceId] = useState(connection.kind === "official" ? connection.workspaceId : "");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [models, setModels] = useState(candidates);
  const [query, setQuery] = useState("");
  const [saveStatus, setSaveStatus] = useState<Feedback | null>(null);
  const [listStatus, setListStatus] = useState<Feedback | null>(null);
  const candidatesId = useId();
  const pending = saveStatus?.kind === "working" || listStatus?.kind === "working";
  const isNew = connection.kind === "custom" && !connection.id;
  const urlChanged = url.trim().replace(/\/+$/, "") !== connection.url.replace(/\/+$/, "");
  const visibleModels = models.filter((candidate) => candidate.toLowerCase().includes(query.trim().toLowerCase()));
  const keyPatch = clearKey || apiKey.trim() ? { apiKey: clearKey ? "" : apiKey.trim() } : {};

  function resetCandidates() {
    setModels([]);
    setQuery("");
    setListStatus(null);
    setSaveStatus(null);
  }

  async function fetchModels() {
    setListStatus({ kind: "working", message: "正在拉取候选模型…" });
    try {
      const draft = connection.kind === "official"
        ? { provider: connection.provider, anthropicWorkspaceId: workspaceId, ...keyPatch }
        : { provider: "custom", presetId: connection.id, url: url.trim(), ...keyPatch };
      const { models: received } = await api.listChatModels(draft);
      setModels(received);
      setQuery("");
      setListStatus({
        kind: "success",
        message: received.length ? `已更新 ${received.length} 个候选模型` : "服务未返回模型，可手动填写模型名。",
      });
    } catch (error) {
      setListStatus({ kind: "error", message: errorMessage(error, "拉取模型失败") });
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!model.trim() || (connection.kind === "custom" && (!name.trim() || !url.trim()))) {
      setSaveStatus({ kind: "error", message: "请填写连接名称、接口地址和默认聊天模型。" });
      return;
    }
    setSaveStatus({ kind: "working", message: "正在保存连接…" });
    try {
      const modelName = model.trim();
      if (connection.kind === "official") {
        onSaved(await api.saveSettings({ officialConnection: {
          provider: connection.provider, model: modelName, anthropicWorkspaceId: workspaceId, activate, ...keyPatch,
        } }));
      } else if (connection.id) {
        onSaved(await api.updatePreset(connection.id, {
          name: name.trim(), model: modelName, activate, ...(urlChanged ? { url: url.trim() } : {}), ...keyPatch,
        }));
      } else {
        onSaved(await api.createPreset({ name: name.trim(), url: url.trim(), model: modelName, activate: false, ...keyPatch }));
      }
    } catch (error) {
      setSaveStatus({ kind: "error", message: errorMessage(error, "保存连接失败") });
    }
  }

  return (
    <form onSubmit={submit} className="border-t border-line pt-4">
      <fieldset disabled={pending} className="min-w-0 space-y-3">
        <legend className="mb-3 text-[15px] font-semibold">{isNew ? "添加自定义连接" : `编辑 ${connection.name}`}</legend>
        {connection.kind === "custom" && (
          <label className="block space-y-1 text-[13px] text-mute">
            <span className="block">连接名称</span>
            <input required maxLength={40} value={name} onChange={(event) => { setName(event.target.value); setSaveStatus(null); }}
              placeholder="例如 Serein" autoCapitalize="off" className="field" />
          </label>
        )}
        <label className="block space-y-1 text-[13px] text-mute">
          <span className="block">接口地址</span>
          <input required type="url" inputMode="url" maxLength={2048} readOnly={connection.kind === "official"}
            value={url} onChange={(event) => { setUrl(event.target.value); setClearKey(false); resetCandidates(); }}
            placeholder="https://example.com/v1" autoCapitalize="none" spellCheck={false} className="field font-mono" />
        </label>
        <label className="block space-y-1 text-[13px] text-mute">
          <span className="block">API Key</span>
          <input type="password" autoComplete="new-password" maxLength={4096} disabled={clearKey}
            placeholder={connection.keyMask ? `已保存 ${connection.keyMask}` : "聊天和连接测试需要 Key"}
            value={apiKey} onChange={(event) => { setApiKey(event.target.value); resetCandidates(); }} className="field" />
        </label>
        {connection.keyMask && !urlChanged && (
          <label className="flex min-h-8 items-center gap-2 text-[13px] text-mute">
            <input type="checkbox" checked={clearKey} onChange={(event) => {
              setClearKey(event.target.checked);
              setApiKey("");
              resetCandidates();
            }} />
            保存时清除已有 Key
          </label>
        )}
        {connection.keyMask && urlChanged && (
          <p className="text-[13px] text-mute">更换接口地址会清除原有 Key。如新地址需要鉴权，请填写对应的 Key。</p>
        )}
        {connection.kind === "official" && connection.provider === "anthropic" && (
          <label className="block space-y-1 text-[13px] text-mute">
            <span className="block">Workspace ID（可选）</span>
            <input value={workspaceId} onChange={(event) => { setWorkspaceId(event.target.value); resetCandidates(); }}
              placeholder="wrkspc_…" autoCapitalize="none" spellCheck={false} className="field font-mono" />
          </label>
        )}
        <label className="block space-y-1 text-[13px] text-mute">
          <span className="block">默认聊天模型</span>
          <input required maxLength={200} autoCapitalize="none" spellCheck={false} value={model}
            placeholder="输入模型名或从候选列表选择" onChange={(event) => { setModel(event.target.value); setSaveStatus(null); }}
            className="field font-mono" />
        </label>
        {models.length > 0 && (
          <div className="space-y-2">
            {models.length > 12 && (
              <label className="block space-y-1 text-[13px] text-mute">
                <span className="block">搜索候选模型</span>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="field" />
              </label>
            )}
            <div className="space-y-1">
              <label htmlFor={candidatesId} className="block text-[13px] text-mute">候选模型</label>
              <select id={candidatesId} value={visibleModels.includes(model) ? model : ""} onChange={(event) => {
                setModel(event.target.value);
                setSaveStatus(null);
              }} className="field font-mono">
                <option value="" disabled>{visibleModels.length ? "选择模型" : "没有匹配的模型"}</option>
                {visibleModels.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
              </select>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" disabled={!url.trim()} onClick={fetchModels}
            className="btn-ghost min-h-11 px-4 disabled:opacity-50">
            {listStatus?.kind === "working" ? "拉取中…" : "拉取模型"}
          </button>
          <p className="text-[12px] text-mute">使用表单中的连接配置读取候选模型</p>
        </div>
        <InlineStatus value={listStatus} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary min-h-11 px-4 disabled:opacity-50">
            {saveStatus?.kind === "working" ? "保存中…" : activate ? "保存并设为当前" : "保存连接"}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost min-h-11 px-4 disabled:opacity-50">取消</button>
        </div>
        <InlineStatus value={saveStatus} />
      </fieldset>
    </form>
  );
}

export default function ChatConnectionSettings() {
  const { ready, set } = useStore();
  const [config, setConfig] = useState<EchoSettings | null>(null);
  const [editor, setEditor] = useState<{ connection: Connection; activate: boolean } | null>(null);
  const [showConnections, setShowConnections] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<Feedback | null>({ kind: "working", message: "正在读取聊天连接…" });
  const [testStatus, setTestStatus] = useState<Feedback | null>(null);
  const [attempt, setAttempt] = useState(0);
  const pending = settingsStatus?.kind === "working" || testStatus?.kind === "working";
  const edit = editor?.connection;

  useEffect(() => {
    if (!ready) return;
    let active = true;
    api.getSettings().then((result) => {
      if (!active) return;
      setConfig(result);
      setSettingsStatus(null);
    }).catch((error) => {
      if (active) setSettingsStatus({ kind: "error", message: errorMessage(error, "读取聊天连接失败") });
    });
    return () => { active = false; };
  }, [attempt, ready]);

  function applyConfig(next: EchoSettings, message: string) {
    setConfig(next);
    set("settings", (current) => ({
      ...current,
      apiKey: "",
      apiMode: next.apiMode,
      provider: next.provider,
      presets: next.presets,
      activePresetId: next.activePresetId,
      officialKeyMasks: next.officialKeyMasks,
      proxyUrl: next.proxyUrl,
      anthropicWorkspaceId: next.anthropicWorkspaceId,
      model: next.model,
      models: next.models,
    }));
    setEditor(null);
    setSettingsStatus({ kind: "success", message });
    setTestStatus(null);
  }

  async function makeCurrent(connection: Connection) {
    if (!connection.model) {
      openEditor(connection, true);
      return;
    }
    setSettingsStatus({ kind: "working", message: "正在切换聊天连接…" });
    setTestStatus(null);
    try {
      const patch = connection.kind === "official"
        ? { apiMode: "official", provider: connection.provider }
        : { apiMode: "custom", activePresetId: connection.id };
      applyConfig(await api.saveSettings(patch), `已将 ${connection.name} 设为当前连接。`);
    } catch (error) {
      setSettingsStatus({ kind: "error", message: errorMessage(error, "切换聊天连接失败") });
    }
  }

  async function remove(connection: Extract<Connection, { kind: "custom" }>) {
    if (!window.confirm(`删除连接「${connection.name}」？`)) return;
    setSettingsStatus({ kind: "working", message: "正在删除连接…" });
    setTestStatus(null);
    try {
      applyConfig(await api.deletePreset(connection.id), "已删除连接。");
    } catch (error) {
      setSettingsStatus({ kind: "error", message: errorMessage(error, "删除连接失败") });
    }
  }

  async function testCurrent() {
    setTestStatus({ kind: "working", message: "正在测试当前连接…" });
    try {
      const result = await api.testConnection();
      setTestStatus({ kind: result.ok ? "success" : "error", message: result.ok ? `测试通过 · ${result.message}` : `测试失败 · ${result.message}` });
    } catch (error) {
      setTestStatus({ kind: "error", message: errorMessage(error, "测试连接失败") });
    }
  }

  const connections: Connection[] = config ? [
    ...(Object.keys(OFFICIAL) as Provider[]).map((provider): Connection => ({
      kind: "official", provider, ...OFFICIAL[provider],
      keyMask: config.officialKeyMasks[provider] || "",
      model: config.apiMode === "official" && config.provider === provider ? config.model : config.officialModels?.[provider] || "",
      workspaceId: provider === "anthropic" ? config.anthropicWorkspaceId : "",
    })),
    ...config.presets.map((preset): Connection => ({
      kind: "custom", id: preset.id, name: preset.name, url: preset.url, keyMask: preset.keyMask,
      model: config.apiMode === "custom" && config.activePresetId === preset.id ? config.model : preset.model || "",
    })),
  ] : [];
  const current = config && connections.find((connection) => connectionIsCurrent(connection, config));
  const editCandidates = edit?.model ? [edit.model]
    : edit?.kind === "official" ? [OFFICIAL[edit.provider].suggestedModel] : [];

  function openEditor(connection: Connection, activate = false) {
    setEditor({ connection, activate });
    setSettingsStatus(null);
  }

  return (
    <>
      <SettingsDrawer title="聊天连接" open>
        <div className="space-y-4">
          {config ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="text-[13px] text-mute">当前连接</p>
                  <p className="mt-0.5 break-words text-[17px] font-semibold">{current?.name ?? "未选择"}</p>
                  {current && <p className="mt-1 break-all font-mono text-[13px] text-mute">{current.model || "未设置默认聊天模型"}</p>}
                </div>
                {current && !edit && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={pending} onClick={() => openEditor(current)}
                      className="btn-primary min-h-11 px-4 disabled:opacity-50">编辑连接</button>
                    <button type="button" disabled={pending} onClick={testCurrent}
                      className="btn-ghost min-h-11 px-4 disabled:opacity-50">
                      {testStatus?.kind === "working" ? "测试中…" : "测试连接"}
                    </button>
                  </div>
                )}
              </div>
              <InlineStatus value={testStatus} />
              {editor && (
                <ConnectionEditor key={connectionId(editor.connection)} connection={editor.connection} candidates={editCandidates} activate={editor.activate}
                  onClose={() => setEditor(null)} onSaved={(next) => {
                    if (editor.connection.kind === "custom" && !editor.connection.id) setShowConnections(true);
                    applyConfig(next, editor.activate ? "已保存并设为当前连接。" : "已保存连接。");
                  }} />
              )}
              {!editor && (
                <button type="button" disabled={pending} onClick={() => openEditor(NEW_CONNECTION)}
                  className="btn-ghost min-h-11 px-4 disabled:opacity-50">添加自定义连接</button>
              )}
              <details className="border-t border-line pt-2" hidden={Boolean(editor)} open={showConnections || !current}
                  onToggle={(event) => setShowConnections(event.currentTarget.open)}>
                  <summary className="cursor-pointer rounded-lg py-2 text-[15px] font-medium">已保存的连接</summary>
                  <ul className="divide-y divide-line">
                    {connections.map((connection) => {
                      const isCurrent = connectionIsCurrent(connection, config);
                      return (
                        <li key={connectionId(connection)} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
                          <div className="min-w-0 flex-1 basis-[10rem]">
                            <p className="break-words text-[14px] font-medium">{connection.name}
                              {isCurrent && <span className="ml-2 text-[12px] font-normal text-rose">当前</span>}
                            </p>
                            {!isCurrent && <p className="mt-0.5 break-all text-[12px] text-mute">{connection.model || "待设置默认模型"}</p>}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {!isCurrent && (
                              <>
                                <button type="button" disabled={pending} onClick={() => openEditor(connection)}
                                  aria-label={`编辑 ${connection.name}`} className="btn-ghost min-h-11 px-3 text-[13px] disabled:opacity-50">编辑</button>
                                <button type="button" disabled={pending} onClick={() => makeCurrent(connection)}
                                  aria-label={`将 ${connection.name} 设为当前`} className="btn-ghost min-h-11 px-3 text-[13px] disabled:opacity-50">设为当前</button>
                              </>
                            )}
                            {connection.kind === "custom" && (
                              <button type="button" disabled={pending} onClick={() => remove(connection)}
                                aria-label={`删除 ${connection.name}`} className="btn-ghost min-h-11 px-3 text-[13px] text-rose disabled:opacity-50">删除</button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
              </details>
            </>
          ) : settingsStatus?.kind === "error" ? (
            <button type="button" onClick={() => {
              setSettingsStatus({ kind: "working", message: "正在读取聊天连接…" });
              setAttempt((value) => value + 1);
            }} className="btn-ghost min-h-11 px-4">重新加载</button>
          ) : null}
          <InlineStatus value={settingsStatus} />
        </div>
      </SettingsDrawer>
      <MemoryModelSettingsSection owner={config?.memoryOwner ?? (config ? "echo" : undefined)}
        sereinSettingsUrl={config?.sereinSettingsUrl} />
    </>
  );
}
