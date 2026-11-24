"use client";

import { useEffect, useState } from "react";
import { PageShell, Segmented, SettingsDrawer, Toggle } from "@/components/Chrome";
import { IconCheck, IconClose, IconCode, IconHand, IconKey, IconWand } from "@/components/Icons";
import { Hand, Settings, useStore } from "@/lib/store";
import { api, ECHO_AUTH_ENABLED } from "@/lib/api";
import { DEFAULT_ACCENT, useBeauty } from "@/lib/beauty";
import MemoryModelSettingsSection from "./MemoryModelSettings";

type TestState = { status: "idle" | "testing" | "ok" | "fail"; msg?: string };

const OFFICIAL_BASES: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  anthropic: "https://api.anthropic.com/v1",
};

// 切换官方类型时顺带切到对应默认模型，避免拿着 OpenAI 模型名去请求 Claude
const OFFICIAL_DEFAULT_MODEL: Record<string, string> = {
  openai: "gpt-4o-mini",
  deepseek: "deepseek-chat",
  anthropic: "claude-sonnet-4-5",
};

const PROVIDER_LABEL: Record<string, string> = { openai: "OpenAI", anthropic: "Claude", deepseek: "DeepSeek" };

// 模型列表默认只显示这么多，其余点「查看更多」
const MODEL_COLLAPSE = 12;

// 计划接入的 MCP 服务（与后端 /api/tools 一致），后期接入
const MCP_SERVERS = [
  { id: "amap", name: "高德地图", desc: "地点搜索、路线规划、周边、天气" },
  { id: "mcdonalds", name: "麦当劳", desc: "门店、菜单、优惠券、点餐" },
];

// 「Key 也存本机浏览器」的本地存储键
const LOCAL_KEY = "echo-api-key-local";
const LOCAL_KEY_PREF = "echo-store-key-locally";

export default function SettingsPage() {
  const { settings, set, theme, toast } = useStore();
  const { b, setB } = useBeauty();
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [keyMask, setKeyMask] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [newModel, setNewModel] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [storeLocally, setStoreLocally] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);
  const [presetForm, setPresetForm] = useState<{ id: string; name: string; url: string; apiKey: string } | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);

  // 初始化：读取「是否存浏览器」偏好，若曾存过 Key 则回填输入框；再从后端读 Key 状态（脱敏）
  useEffect(() => {
    try {
      if (!ECHO_AUTH_ENABLED) {
        setStoreLocally(localStorage.getItem(LOCAL_KEY_PREF) === "1");
        const savedKey = localStorage.getItem(LOCAL_KEY);
        if (savedKey) setKeyInput(savedKey);
      }
    } catch {}
    api.getSettings().then(applyCfg).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 用后端返回的脱敏配置同步接口相关状态
  function applyCfg(cfg: any) {
    if (!cfg) return;
    setKeyMask(cfg.hasKey ? cfg.apiKeyMask || "已设置" : "");
    set("settings", (s) => ({
      ...s,
      apiMode: cfg.apiMode ?? s.apiMode,
      provider: cfg.provider ?? s.provider,
      presets: cfg.presets ?? s.presets,
      activePresetId: cfg.activePresetId ?? s.activePresetId,
      officialKeyMasks: cfg.officialKeyMasks ?? s.officialKeyMasks,
      proxyUrl: cfg.proxyUrl ?? s.proxyUrl,
      model: cfg.model ?? s.model,
      models: cfg.models ?? s.models,
    }));
  }

  // 接口相关的修改：等后端确认后再同步（Key 归属取决于后端当前生效的接口）
  async function saveApi(patch: Partial<Settings> & Record<string, unknown>) {
    try {
      applyCfg(await api.saveSettings(patch));
      setTest({ status: "idle" });
    } catch (e) {
      toast((e as Error).message || "保存失败");
    }
  }

  // 本地乐观更新 + 异步写后端
  const upd = (p: Partial<typeof settings>) => {
    set("settings", (s) => {
      const next = { ...s, ...p };
      if (next.defaultHand === "codex" && !next.codexEnabled && next.claudeEnabled) next.defaultHand = "claude";
      if (next.defaultHand === "claude" && !next.claudeEnabled && next.codexEnabled) next.defaultHand = "codex";
      return next;
    });
    api.saveSettings(p).catch((e) => toast(e.message || "保存失败"));
  };

  // 官方厂商切换：地址固定，顺带切到该厂商默认模型
  const onProviderChange = (v: string) => {
    const m = OFFICIAL_DEFAULT_MODEL[v];
    const models = settings.models.includes(m) ? settings.models : [m, ...settings.models];
    saveApi({ apiMode: "official", provider: v, model: m, models });
  };

  // 自定义预设：新建 / 修改 / 删除 / 选用
  async function submitPreset() {
    if (!presetForm) return;
    const { id, name, url, apiKey } = presetForm;
    if (!name.trim()) return toast("请输入预设名称");
    const saved = settings.presets.find((preset) => preset.id === id);
    const changedUrl = url.trim() !== saved?.url;
    if (changedUrl && !/^https?:\/\//i.test(url.trim())) return toast("接口地址需以 http(s):// 开头");
    setSavingPreset(true);
    try {
      const cfg = id
        ? await api.updatePreset(id, { name: name.trim(), ...(changedUrl ? { url: url.trim() } : {}), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) })
        : await api.createPreset({ name, url, apiKey });
      applyCfg(cfg);
      setPresetForm(null);
      setTest({ status: "idle" });
      toast(id ? "预设已更新" : "预设已保存并选用");
    } catch (e) {
      toast((e as Error).message || "保存失败");
    } finally {
      setSavingPreset(false);
    }
  }

  async function removePreset(id: string, name: string) {
    if (!window.confirm(`删除预设「${name}」？`)) return;
    try {
      applyCfg(await api.deletePreset(id));
      if (presetForm?.id === id) setPresetForm(null);
      toast("已删除");
    } catch (e) {
      toast((e as Error).message || "删除失败");
    }
  }

  // 切换「Key 也存本机浏览器」：开启才允许写 Key 到浏览器；关闭即清除浏览器里的 Key
  function toggleStoreLocally(v: boolean) {
    setStoreLocally(v);
    try {
      localStorage.setItem(LOCAL_KEY_PREF, v ? "1" : "0");
      if (!v) {
        localStorage.removeItem(LOCAL_KEY);
        setKeyInput("");
      }
    } catch {}
  }

  // 保存 API Key：默认只写后端；开启「存本机浏览器」时同步留一份在浏览器并回填输入框
  async function saveKey() {
    const k = keyInput.trim();
    if (!k) return toast("请输入 API Key");
    setSavingKey(true);
    try {
      const cfg = await api.saveSettings({ apiKey: k });
      applyCfg(cfg);
      if (storeLocally && settings.apiMode === "official") {
        try { localStorage.setItem(LOCAL_KEY, k); } catch {}
        setKeyInput(k); // 保留在输入框，刷新也能看到
        toast("API Key 已保存到后端和本机浏览器");
      } else {
        try { localStorage.removeItem(LOCAL_KEY); } catch {}
        setKeyInput("");
        toast("API Key 已保存到后端");
      }
    } catch (e) {
      toast((e as Error).message || "保存失败");
    } finally {
      setSavingKey(false);
    }
  }

  // 真实测试连接：走后端，不触碰 Key
  async function testConnection() {
    setTest({ status: "testing" });
    try {
      const r = await api.testConnection();
      setTest(r.ok ? { status: "ok", msg: r.message } : { status: "fail", msg: r.message });
    } catch (e) {
      setTest({ status: "fail", msg: (e as Error).message });
    }
  }

  // 拉取模型列表：走后端 /models，支持搜索过滤
  async function fetchModels() {
    setLoadingModels(true);
    try {
      const r = await api.getModels();
      if (r.error) { toast(r.message || "拉取失败"); return; }
      const list = r.models || [];
      if (!list.length) { toast("没拉到模型，检查 Key 和接口地址"); return; }
      const nextModel = list.includes(settings.model) ? settings.model : list[0];
      upd({ models: list, model: nextModel });
      toast(`已拉取 ${list.length} 个模型`);
    } catch (e) {
      toast((e as Error).message || "拉取失败");
    } finally {
      setLoadingModels(false);
    }
  }

  const noneEnabled = !settings.codexEnabled && !settings.claudeEnabled;
  const q = modelSearch.trim().toLowerCase();
  const matchedModels = settings.models.filter((md) => !q || md.toLowerCase().includes(q));
  const collapsed = !showAllModels && matchedModels.length > MODEL_COLLAPSE;
  const visibleModels = collapsed
    ? (() => {
        const head = matchedModels.slice(0, MODEL_COLLAPSE);
        // 当前模型排在后面时也保证能看到
        return head.includes(settings.model) || !matchedModels.includes(settings.model) ? head : [settings.model, ...head.slice(0, -1)];
      })()
    : matchedModels;
  const custom = settings.apiMode === "custom";
  const activePreset = settings.presets.find((p) => p.id === settings.activePresetId);
  const keyOwner = custom ? (activePreset ? `预设「${activePreset.name}」` : "") : `官方 ${PROVIDER_LABEL[settings.provider] || settings.provider}`;

  return (
    <PageShell title="设置">
      <div className="space-y-5 pt-1">
        <SettingsDrawer title="API 入口" open>
          <div className="space-y-3">
            <div>
              <span className="mb-1.5 block text-[14px] text-mute">接口类型</span>
              <Segmented<string>
                value={settings.apiMode}
                onChange={(v) => saveApi({ apiMode: v as Settings["apiMode"] })}
                options={[
                  { value: "official", label: "官方 API" },
                  { value: "custom", label: "自定义 API" },
                ]}
              />
            </div>

            {!custom && (
              <div className="space-y-2">
                <Segmented<string>
                  value={settings.provider}
                  onChange={onProviderChange}
                  options={[
                    { value: "openai", label: "OpenAI" },
                    { value: "anthropic", label: "Claude" },
                    { value: "deepseek", label: "DeepSeek" },
                  ]}
                />
                <p className="break-all px-1 font-mono text-[12px] text-mute">{OFFICIAL_BASES[settings.provider]}</p>
              </div>
            )}

            {custom && (
              <div className="space-y-2">
                {settings.presets.length === 0 && !presetForm && (
                  <p className="rounded-2xl bg-fog px-4 py-3 text-[14px] text-mute">还没有预设，新建一个填上地址和 Key</p>
                )}
                {settings.presets.map((p) => (
                  <div key={p.id} className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 ${p.id === settings.activePresetId ? "bg-sakura/30" : "bg-fog/60"}`}>
                    <button
                      aria-pressed={p.id === settings.activePresetId}
                      onClick={() => p.id !== settings.activePresetId && saveApi({ activePresetId: p.id })}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className={`truncate text-[15px] ${p.id === settings.activePresetId ? "font-semibold text-rose" : ""}`}>{p.name}</p>
                      <p className="truncate font-mono text-[12px] text-mute">{p.url}</p>
                      <p className="text-[12px] text-mute">{p.hasKey ? `Key ${p.keyMask}` : "未填 Key"}</p>
                    </button>
                    <button onClick={() => setPresetForm({ id: p.id, name: p.name, url: p.url, apiKey: "" })} className="btn-ghost min-h-10 shrink-0 px-3 text-[13px]">编辑预设</button>
                    <button aria-label={`删除 ${p.name}`} onClick={() => removePreset(p.id, p.name)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-mute">
                      <IconClose size={14} />
                    </button>
                  </div>
                ))}
                {presetForm ? (
                  <div className="space-y-2 rounded-2xl bg-fog/60 p-3">
                    <p className="text-[14px] font-medium">{presetForm.id ? "编辑预设" : "新建预设"}</p>
                    <label className="block space-y-1 text-[13px] text-mute">预设名称
                      <input maxLength={40} value={presetForm.name} onChange={(e) => setPresetForm({ ...presetForm, name: e.target.value })} placeholder="例如 Serein" autoCapitalize="off" className="field" />
                    </label>
                    <input value={presetForm.url} onChange={(e) => setPresetForm({ ...presetForm, url: e.target.value })} placeholder="https://example.com/v1" inputMode="url" autoCapitalize="off" className="field font-mono" />
                    <input
                      type="password"
                      value={presetForm.apiKey}
                      onChange={(e) => setPresetForm({ ...presetForm, apiKey: e.target.value })}
                      placeholder={presetForm.id ? "留空表示不改 Key" : "API Key（只保存在后端）"}
                      autoComplete="off"
                      className="field"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setPresetForm(null)} className="btn-ghost flex-1 py-2.5 text-[15px]">取消</button>
                      <button onClick={submitPreset} disabled={savingPreset || !presetForm.name.trim() || (!presetForm.id && !presetForm.url.trim())} className="btn-primary flex-1 py-2.5 text-[15px] disabled:opacity-50">
                        {savingPreset ? "保存中…" : "保存预设"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setPresetForm({ id: "", name: "", url: "", apiKey: "" })} className="btn-ghost w-full py-2.5 text-[15px]">＋ 新建预设</button>
                )}
              </div>
            )}

            {(!custom || activePreset) && (
              <>
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-[14px] text-mute"><IconKey size={16} /> {keyOwner} 的 API Key</span>
                  <div className="flex gap-2">
                    <input
                      type={showKey ? "text" : "password"}
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      placeholder={keyMask ? `已设置 ${keyMask}，输入新 Key 可替换` : "sk-…（只保存在后端）"}
                      autoComplete="off"
                      className="field"
                    />
                    <button onClick={() => setShowKey((v) => !v)} className="btn-ghost shrink-0 px-4 text-[15px]">{showKey ? "隐藏" : "显示"}</button>
                  </div>
                </label>
                <button onClick={saveKey} disabled={savingKey || !keyInput.trim()} className="btn-ghost w-full py-2.5 text-[15px] disabled:opacity-40">
                  {savingKey ? "保存中…" : "保存 Key 到后端"}
                </button>
              </>
            )}
            {!ECHO_AUTH_ENABLED && !custom && <div className="flex items-center justify-between gap-3 rounded-2xl bg-fog/60 px-3 py-2.5">
              <div className="flex-1">
                <p className="text-[14px]">Key 也存本机浏览器</p>
                <p className="text-[12px] text-mute">{storeLocally ? "刷新后自动回填到输入框" : "默认只存后端，浏览器不留 Key"}</p>
              </div>
              <Toggle label="存本机浏览器" on={storeLocally} onChange={toggleStoreLocally} />
            </div>}
            {!custom && settings.provider === "anthropic" && (
              <label className="block">
                <span className="mb-1.5 block text-[14px] text-mute">Workspace ID（可选 · 未绑定工作区的 Key 才需要）</span>
                <input
                  value={settings.anthropicWorkspaceId}
                  onChange={(e) => upd({ anthropicWorkspaceId: e.target.value })}
                  placeholder="wrkspc_…（留空表示 Key 已绑定工作区）"
                  autoCapitalize="off"
                  autoComplete="off"
                  className="field font-mono"
                />
              </label>
            )}
            <div className="space-y-2 border-t border-line pt-3">
              <button onClick={testConnection} disabled={test.status === "testing"} className="btn-primary flex w-full items-center justify-center gap-2 py-3.5 text-[16px] disabled:opacity-70">
                {test.status === "testing" ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> 正在测试…</>) : "测试连接"}
              </button>
              {(test.status === "ok" || test.status === "fail") && (
                <p className={`flex animate-pop items-center gap-2 rounded-2xl px-4 py-3 text-[15px] ${test.status === "ok" ? "bg-sakura/30 text-rose" : "bg-rose/10 text-rose"}`}>
                  {test.status === "ok" ? <IconCheck size={18} /> : <IconClose size={18} />} {test.msg}
                </p>
              )}
            </div>
          </div>
        </SettingsDrawer>

        <SettingsDrawer title="聊天模型">
          <div className="space-y-2">
            <p className="break-all text-[13px] text-ink/80">
              当前聊天模型：<span className="font-mono font-semibold">{settings.model}</span>
            </p>
            <p className="text-[13px] text-mute">拉取后直接点列表里的模型即可切换。列表里找不到时，再手动添加。</p>
            <div className="flex gap-2">
              <input value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} placeholder="搜索模型…" autoCapitalize="off" className="field" />
              <button onClick={fetchModels} disabled={loadingModels} className="btn-ghost shrink-0 px-4 text-[15px] disabled:opacity-50">
                {loadingModels ? "拉取中…" : "拉取模型"}
              </button>
            </div>
            <div id="chat-model-list" aria-label="聊天模型列表" tabIndex={showAllModels ? 0 : undefined} className={`flex flex-wrap content-start gap-2 ${showAllModels ? "model-list-scroll" : ""}`}>
              {visibleModels.map((md) => (
                <span key={md} className={`flex min-w-0 max-w-full items-center gap-1 rounded-capsule py-1.5 pl-3 pr-1.5 font-mono text-[13px] ${md === settings.model ? "bg-sakura/35 text-rose" : "bg-fog text-ink/80"}`}>
                  <button aria-pressed={md === settings.model} className="min-w-0 break-all text-left" onClick={() => upd({ model: md })}>{md}</button>
                  <button
                    aria-label={`移除 ${md}`}
                    onClick={() => {
                      if (settings.models.length <= 1) return toast("至少保留一个模型");
                      const rest = settings.models.filter((x) => x !== md);
                      upd({ models: rest, model: settings.model === md ? rest[0] : settings.model });
                    }}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-mute"
                  >
                    <IconClose size={12} />
                  </button>
                </span>
              ))}
              {visibleModels.length === 0 && <p className="text-[13px] text-mute">没有匹配的模型</p>}
            </div>
            {matchedModels.length > MODEL_COLLAPSE && (
              <button aria-expanded={showAllModels} aria-controls="chat-model-list" onClick={() => setShowAllModels((v) => !v)} className="w-full rounded-2xl py-2 text-[14px] text-rose">
                {collapsed ? `查看更多（还有 ${matchedModels.length - visibleModels.length} 个）` : "收起"}
              </button>
            )}
            <div className="flex gap-2">
              <input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="添加模型名，如 gpt-4o-mini" autoCapitalize="off" className="field font-mono" />
              <button
                onClick={() => {
                  const v = newModel.trim();
                  if (!v || settings.models.includes(v)) return;
                  upd({ models: [...settings.models, v], model: v });
                  setNewModel("");
                }}
                className="btn-ghost shrink-0 px-4 text-[15px]"
              >
                手动添加
              </button>
            </div>
          </div>
        </SettingsDrawer>

        <MemoryModelSettingsSection />

        <SettingsDrawer title="动手入口">
          <div className="divide-y divide-line">
            <Row icon={<IconCode size={20} />} title="Codex" sub={settings.codexEnabled ? "已启用" : "已关闭"}>
              <Toggle label="启用 Codex" on={settings.codexEnabled} onChange={(v) => upd({ codexEnabled: v })} />
            </Row>
            <Row icon={<IconWand size={20} />} title="Claude Code" sub={settings.claudeEnabled ? "已启用" : "已关闭"}>
              <Toggle label="启用 Claude Code" on={settings.claudeEnabled} onChange={(v) => upd({ claudeEnabled: v })} />
            </Row>
            <div className="space-y-2 p-4">
              <p className="flex items-center gap-1.5 text-[14px] text-mute"><IconHand size={16} /> 当前默认动手入口</p>
              {noneEnabled ? (
                <p className="rounded-2xl bg-fog px-4 py-3 text-[15px] text-mute">两个入口都关闭了，MCP 工具全部走 API，不碰后端。</p>
              ) : (
                <Segmented<Hand>
                  value={settings.defaultHand}
                  onChange={(v) => upd({ defaultHand: v })}
                  options={[
                    { value: "codex", label: "Codex", disabled: !settings.codexEnabled },
                    { value: "claude", label: "Claude Code", disabled: !settings.claudeEnabled },
                  ]}
                />
              )}
              <p className="text-[12px] text-mute">开启任一入口后，MCP 工具自动交给后端执行；都关闭则只用 API。</p>
            </div>
          </div>
        </SettingsDrawer>

        <SettingsDrawer title="MCP 服务">
          <div className="divide-y divide-line">
            {MCP_SERVERS.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <p className="text-[16px]">{m.name}</p>
                  <p className="text-[12px] text-mute">{m.desc}</p>
                </div>
                <span className="shrink-0 rounded-capsule bg-fog px-2.5 py-0.5 text-[12px] text-mute">后期接入</span>
              </div>
            ))}
          </div>
        </SettingsDrawer>

        <SettingsDrawer title="外观">
          <div className="space-y-3">
            <div>
              <Segmented
                value={theme}
                onChange={(v) => set("theme", v)}
                options={[{ value: "light", label: "浅色" }, { value: "dark", label: "深色" }]}
              />
            </div>
            <div className="flex items-center gap-3 border-t border-line pt-3">
              <label className="flex min-w-0 flex-1 items-center justify-between gap-2 text-[15px]">
                重点色
                <input type="color" value={b.accent} onChange={(e) => setB({ accent: e.target.value })} className="h-10 w-12 cursor-pointer rounded-lg bg-transparent" />
              </label>
              <button type="button" className="btn-ghost min-h-10 shrink-0 px-3 text-[13px]" onClick={() => setB({ accent: DEFAULT_ACCENT })}>恢复默认</button>
            </div>
          </div>
        </SettingsDrawer>

        <section className="pb-4">
          {ECHO_AUTH_ENABLED && (
            <button className="btn-ghost w-full py-3" onClick={() => {
              api.logout().then(() => window.location.reload()).catch((e) => toast(e.message || "退出失败"));
            }}>
              退出登录
            </button>
          )}
          <p className="mt-3 text-center text-[12px] text-mute">echo · 聊天与记忆保存在后端，Key 不落前端</p>
        </section>
      </div>
    </PageShell>
  );
}

function Row({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="orb h-10 w-10 shrink-0">{icon}</span>
      <div className="flex-1">
        <p className="text-[16px] font-medium">{title}</p>
        <p className="text-[13px] text-mute">{sub}</p>
      </div>
      {children}
    </div>
  );
}
