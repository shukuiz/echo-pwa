"use client";

import { PageShell, Segmented, SettingsDrawer, Toggle } from "@/components/Chrome";
import { IconChevron, IconCode, IconHand, IconWand } from "@/components/Icons";
import { Hand, useStore } from "@/lib/store";
import { api, ECHO_AUTH_ENABLED } from "@/lib/api";
import { DEFAULT_ACCENT, useBeauty } from "@/lib/beauty";
import ChatConnectionSettings from "./ChatConnectionSettings";
import ReplyTimeoutSettings from "./ReplyTimeoutSettings";
import VoiceSettings from "./VoiceSettings";
import { openUpdateNotes } from "@/components/UpdateNotes";
import Link from "next/link";
import { APP_VERSION } from "@/lib/version";
import { squareImage } from "@/lib/image";

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

        <ReplyTimeoutSettings />

        <SettingsDrawer title="语音">
          <VoiceSettings />
        </SettingsDrawer>

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

        <SettingsDrawer title="思考翻译">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px]">展开思考框时翻成中文</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-mute">
                  模型用英文思考时，展开那一下自动翻成中文，用的是免费翻译接口，不花 token。不展开就不翻；翻不出来就照旧显示原文。
                </p>
              </div>
              <Toggle label="思考翻译" on={settings.thinkTranslate !== false} onChange={(v) => set("settings", (s) => ({ ...s, thinkTranslate: v }))} />
            </div>
          </div>
        </SettingsDrawer>

        <SettingsDrawer title="翻译显示">
          <Segmented
            value={settings.translateShow ?? "below"}
            onChange={(v) => upd({ translateShow: v })}
            options={[{ value: "below", label: "气泡下小字" }, { value: "tap", label: "点开才看" }, { value: "off", label: "不显示" }]}
          />
        </SettingsDrawer>

        <SettingsDrawer title="头像">
          <div className="grid grid-cols-2 gap-4 p-4">
            <AvatarPicker label="我的头像" value={settings.avatarMe} onChange={(v) => set("settings", (s) => ({ ...s, avatarMe: v }))} />
            <AvatarPicker label="echo 的头像" value={settings.avatarEcho} onChange={(v) => set("settings", (s) => ({ ...s, avatarEcho: v }))} />
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

function AvatarPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="text-center">
    <label className="block cursor-pointer">
      {value ? <img src={value} alt={label} className="mx-auto h-20 w-20 rounded-full object-cover" /> : <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-sakura/30 text-[12px] text-mute">选图</div>}
      <span className="mt-2 block text-[13px]">{label}</span>
      <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; onChange(await squareImage(file, 256)); e.currentTarget.value = ""; }} />
    </label>
    {value && <button type="button" className="mt-1 text-[12px] text-mute underline" onClick={() => onChange("")}>清除</button>}
  </div>;
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
