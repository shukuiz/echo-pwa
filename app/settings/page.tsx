"use client";

import { PageShell, Segmented, SettingsDrawer, Toggle } from "@/components/Chrome";
import { IconChevron, IconCode, IconHand, IconWand } from "@/components/Icons";
import { Hand, useStore } from "@/lib/store";
import { api, ECHO_AUTH_ENABLED } from "@/lib/api";
import { DEFAULT_ACCENT, useBeauty } from "@/lib/beauty";
import ChatConnectionSettings from "./ChatConnectionSettings";
import { openUpdateNotes } from "@/components/UpdateNotes";
import Link from "next/link";
import { APP_VERSION } from "@/lib/version";

// 计划接入的 MCP 服务（与后端 /api/tools 一致），后期接入
const MCP_SERVERS = [
  { id: "amap", name: "高德地图", desc: "地点搜索、路线规划、周边、天气" },
  { id: "mcdonalds", name: "麦当劳", desc: "门店、菜单、优惠券、点餐" },
];

export default function SettingsPage() {
  const { settings, set, theme, toast } = useStore();
  const { b, setB } = useBeauty();

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

  const noneEnabled = !settings.codexEnabled && !settings.claudeEnabled;

  return (
    <PageShell title="设置">
      <div className="space-y-5 pt-1">
        <ChatConnectionSettings />

        <Link href="/settings/manual" className="block-white press flex min-h-14 items-center justify-between gap-3 rounded-[24px] px-4 py-3">
          <span className="min-w-0">
            <span className="block font-semibold">说明书</span>
            <span className="block truncate text-[13px] text-mute">echo 是谁、怎么说话（AGENTS.md），随时改</span>
          </span>
          <IconChevron size={18} className="-rotate-90 shrink-0 text-mute" />
        </Link>

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

        <SettingsDrawer title="开发">
          <Link href="/settings/code-rules" className="press flex min-h-14 items-center justify-between gap-3 rounded-[20px] px-1 py-2">
            <span className="min-w-0">
              <span className="block font-semibold">代码规矩</span>
              <span className="block truncate text-[13px] text-mute">给写代码的 AI 看，不是 echo 人设（仓库 AGENTS.md）</span>
            </span>
            <IconChevron size={18} className="-rotate-90 shrink-0 text-mute" />
          </Link>
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

        <SettingsDrawer title="关于">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 text-[15px]">
              <span>版本</span>
              <span className="font-mono text-mute">v{APP_VERSION}</span>
            </div>
            <button type="button" className="btn-ghost min-h-11 w-full" onClick={openUpdateNotes}>更新公告</button>
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
