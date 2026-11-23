"use client";

import { useEffect, useState } from "react";
import { PageShell, Segmented, Toggle } from "@/components/Chrome";
import { IconCheck, IconClose, IconCode, IconHand, IconKey, IconMoon, IconSun, IconWand } from "@/components/Icons";
import { Hand, useStore } from "@/lib/store";
import { chatTools } from "@/lib/mock";
import { api } from "@/lib/api";

type TestState = { status: "idle" | "testing" | "ok" | "fail"; msg?: string };

export default function SettingsPage() {
  const { settings, set, theme, toast } = useStore();
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [keyMask, setKeyMask] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [newModel, setNewModel] = useState("");

  // 从后端读取已保存的 Key 状态（脱敏）
  useEffect(() => {
    api.getSettings().then((cfg) => {
      if (cfg.hasKey) setKeyMask(cfg.apiKeyMask || "已设置");
    }).catch(() => {});
  }, []);

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

  // 保存 API Key：只写后端，前端不落任何 Key
  async function saveKey() {
    const k = keyInput.trim();
    if (!k) return toast("请输入 API Key");
    setSavingKey(true);
    try {
      const cfg = await api.saveSettings({ apiKey: k });
      setKeyMask(cfg.apiKeyMask || "已设置");
      setKeyInput("");
      toast("API Key 已保存到后端");
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

  const noneEnabled = !settings.codexEnabled && !settings.claudeEnabled;

  return (
    <PageShell title="设置">
      <div className="space-y-5 pt-1">
        {/* API 入口 */}
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[15px] font-semibold text-mute">API 入口</h2>
            <span className="rounded-capsule bg-sakura/45 px-2.5 py-0.5 text-[12px] font-medium text-rose">常开</span>
          </div>
          <div className="block-white space-y-3 rounded-[26px] p-4">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-[14px] text-mute"><IconKey size={16} /> API Key</span>
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
            <p className="text-[12px] text-mute">Key 只存在后端，不进前端代码、不进备份文件。</p>
            <label className="block">
              <span className="mb-1.5 block text-[14px] text-mute">自定义代理地址（支持 http / 内网地址）</span>
              <input
                value={settings.proxyUrl}
                onChange={(e) => upd({ proxyUrl: e.target.value })}
                placeholder="http://192.168.1.10:8080/v1"
                inputMode="url"
                autoCapitalize="off"
                className="field"
              />
            </label>
          </div>
        </section>

        {/* 模型 */}
        <section>
          <h2 className="mb-2 px-1 text-[15px] font-semibold text-mute">模型</h2>
          <div className="block-white space-y-2 rounded-[26px] p-4">
            <p className="text-[13px] text-mute">聊天底栏会显示当前模型，点一下就能切换</p>
            <div className="flex flex-wrap gap-2">
              {settings.models.map((md) => (
                <span key={md} className={`flex items-center gap-1 rounded-capsule py-1.5 pl-3 pr-1.5 font-mono text-[13px] ${md === settings.model ? "bg-sakura/35 text-rose" : "bg-fog text-ink/80"}`}>
                  <button onClick={() => upd({ model: md })}>{md}</button>
                  <button
                    aria-label={`移除 ${md}`}
                    onClick={() => {
                      if (settings.models.length <= 1) return toast("至少保留一个模型");
                      const rest = settings.models.filter((x) => x !== md);
                      upd({ models: rest, model: settings.model === md ? rest[0] : settings.model });
                    }}
                    className="grid h-5 w-5 place-items-center rounded-full text-mute"
                  >
                    <IconClose size={12} />
                  </button>
                </span>
              ))}
            </div>
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
                添加
              </button>
            </div>
          </div>
        </section>

        {/* 动手入口 */}
        <section>
          <h2 className="mb-2 px-1 text-[15px] font-semibold text-mute">动手入口</h2>
          <div className="block-white divide-y divide-line overflow-hidden rounded-[26px]">
            <Row icon={<IconCode size={20} />} title="Codex" sub={settings.codexEnabled ? "已启用" : "已关闭"}>
              <Toggle label="启用 Codex" on={settings.codexEnabled} onChange={(v) => upd({ codexEnabled: v })} />
            </Row>
            <Row icon={<IconWand size={20} />} title="Claude Code" sub={settings.claudeEnabled ? "已启用" : "已关闭"}>
              <Toggle label="启用 Claude Code" on={settings.claudeEnabled} onChange={(v) => upd({ claudeEnabled: v })} />
            </Row>
            <div className="space-y-2 p-4">
              <p className="flex items-center gap-1.5 text-[14px] text-mute"><IconHand size={16} /> 当前默认动手入口</p>
              {noneEnabled ? (
                <p className="rounded-2xl bg-fog px-4 py-3 text-[15px] text-mute">两个入口都关闭了，echo 只聊天不动手。</p>
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
            </div>
          </div>
        </section>

        {/* MCP 工具（P0 仅占位，P1 接入） */}
        <section>
          <h2 className="mb-2 px-1 text-[15px] font-semibold text-mute">MCP 工具 · 三个入口共用（P1 接入）</h2>
          <div className="block-white divide-y divide-line overflow-hidden rounded-[26px]">
            {chatTools.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <p className="text-[16px]">{t.label}</p>
                  <p className="text-[12px] text-mute">{t.via === "API" ? "默认走 API" : "默认交给动手入口"}</p>
                </div>
                <Toggle
                  label={`启用${t.label}`}
                  on={settings.tools[t.id] !== false}
                  onChange={(v) => upd({ tools: { ...settings.tools, [t.id]: v } })}
                />
              </div>
            ))}
          </div>
        </section>

        {/* 测试连接 */}
        <section className="space-y-2">
          <button onClick={testConnection} disabled={test.status === "testing"} className="btn-primary flex w-full items-center justify-center gap-2 py-3.5 text-[16px] disabled:opacity-70">
            {test.status === "testing" ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> 正在测试…</>) : "测试连接"}
          </button>
          {(test.status === "ok" || test.status === "fail") && (
            <p className={`flex animate-pop items-center gap-2 rounded-2xl px-4 py-3 text-[15px] ${test.status === "ok" ? "bg-sakura/30 text-rose" : "bg-rose/10 text-rose"}`}>
              {test.status === "ok" ? <IconCheck size={18} /> : <IconClose size={18} />} {test.msg}
            </p>
          )}
        </section>

        {/* 主题 */}
        <section>
          <h2 className="mb-2 px-1 text-[15px] font-semibold text-mute">外观</h2>
          <div className="block-white flex items-center gap-3 rounded-[26px] p-3">
            <span className="orb h-10 w-10 shrink-0">{theme === "dark" ? <IconMoon size={20} /> : <IconSun size={20} />}</span>
            <div className="flex-1">
              <Segmented
                value={theme}
                onChange={(v) => set("theme", v)}
                options={[{ value: "light", label: "浅色" }, { value: "dark", label: "深色" }]}
              />
            </div>
          </div>
        </section>

        <section className="pb-4">
          <p className="mt-3 text-center text-[12px] text-mute">echo · P0 · 聊天与记忆保存在后端，Key 不落前端</p>
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
