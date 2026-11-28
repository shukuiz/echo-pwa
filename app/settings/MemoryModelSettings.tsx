"use client";
import { SettingsDrawer } from "@/components/Chrome";
export default function MemoryModelSettingsSection({sereinSettingsUrl}: {owner?: "echo" | "serein"; sereinSettingsUrl?: string}) {
  return <SettingsDrawer title="记忆检索"><p>聊天记忆检索统一在 Serein 配置。</p>{sereinSettingsUrl && <a href={sereinSettingsUrl} target="_blank" rel="noreferrer">打开 Serein 设置</a>}</SettingsDrawer>;
}
