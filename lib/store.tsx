"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { seedFiles, seedMemory, seedMessages, seedReminders } from "./mock";
import { api, ECHO_AUTH_ENABLED } from "./api";

export type Role = "user" | "echo";
export type Card =
  | { type: "images"; items: { title: string; from: string; to: string }[] }
  | { type: "music"; tracks: { title: string; artist: string; dur: string }[] }
  | { type: "file"; fileId: string; name: string; kind: FileKind; preview: string }
  | { type: "diff"; file: string; lines: { t: "+" | "-" | " "; s: string }[] }
  | { type: "translate"; source: string; target: string };

export type Msg = {
  id: string;
  role: Role;
  text: string;
  status?: "streaming" | "done" | "error" | "stopped";
  errorMessage?: string;
  reasoning?: string;
  at: number;
  card?: Card;
  think?: { text: string; tags: { kind: "memory" | "tool" | "hand"; label: string }[] };
};

export type FileKind = "worldbook" | "preset" | "miniapp" | "script";
export type FileItem = { id: string; kind: FileKind; name: string; content: string; at: number; via: string };

export type MemoryTab = "persona" | "text" | "summary";
export type MemoryItem = {
  id: string;
  tab: MemoryTab;
  title: string;
  text: string;
  pinned: boolean;
  updatedAt: number;
};

export type Reminder = {
  id: string;
  text: string;
  time: number;
  done: boolean;
  pinned: boolean;
};

export type Hand = "codex" | "claude";
export type ApiPreset = { id: string; name: string; url: string; hasKey: boolean; keyMask: string };
export type Settings = {
  apiKey: string;
  apiMode: "official" | "custom";
  provider: string;
  presets: ApiPreset[];
  activePresetId: string;
  officialKeyMasks: Record<string, string>;
  proxyUrl: string;
  anthropicWorkspaceId: string;
  codexEnabled: boolean;
  claudeEnabled: boolean;
  defaultHand: Hand;
  model: string;
  models: string[];
  quietThink: boolean;
  showStatusBar: boolean;
  mute: boolean;
  tools: Record<string, boolean>;
};

type State = {
  theme: "light" | "dark";
  messages: Msg[];
  memory: MemoryItem[];
  reminders: Reminder[];
  settings: Settings;
  files: FileItem[];
};

const defaultState: State = {
  theme: "light",
  messages: seedMessages,
  memory: seedMemory,
  reminders: seedReminders,
  files: seedFiles,
  settings: {
    apiKey: "",
    apiMode: "official",
    provider: "openai",
    presets: [],
    activePresetId: "",
    officialKeyMasks: {},
    proxyUrl: "https://api.openai.com/v1",
    anthropicWorkspaceId: "",
    codexEnabled: true,
    claudeEnabled: true,
    defaultHand: "claude",
    model: "claude-sonnet-4-5",
    models: ["claude-sonnet-4-5", "gpt-4o", "deepseek-chat"],
    quietThink: true,
    showStatusBar: true,
    mute: false,
    tools: { translate: true, media: true, worldbook: true, miniapp: true, script: true },
  },
};

const KEY = "echo-pwa-state-v3";

type Ctx = State & {
  ready: boolean;
  set: <K extends keyof State>(key: K, value: State[K] | ((prev: State[K]) => State[K])) => void;
  toast: (text: string) => void;
  resetAll: () => void;
};

const StoreCtx = createContext<Ctx | null>(null);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(defaultState);
  const [ready, setReady] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const messageVersion = useRef(0);

  // 读取本地存储
  useEffect(() => {
    if (ECHO_AUTH_ENABLED) {
      setReady(true);
      return;
    }
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<State>;
        // 正在生成中的消息刷新后标记为已停止
        const messages = (saved.messages ?? defaultState.messages).map((m) =>
          m.status === "streaming" ? { ...m, status: "stopped" as const } : m
        );
        setState({ ...defaultState, ...saved, messages, settings: { ...defaultState.settings, ...saved.settings, tools: { ...defaultState.settings.tools, ...saved.settings?.tools } } });
      }
    } catch {}
    setReady(true);
  }, []);

  // 写入本地存储
  useEffect(() => {
    if (!ready || ECHO_AUTH_ENABLED) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state, ready]);

  // 启动时从后端拉取最新数据（后端为准），失败则保留本地缓存作为离线兜底
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const initialMessageVersion = messageVersion.current;
    (async () => {
      try {
        const [hist, mem, cfg] = await Promise.all([api.getHistory(), api.getMemory(), api.getSettings()]);
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          messages: messageVersion.current !== initialMessageVersion ? prev.messages : (hist.messages || []).map((m) => ({
            id: m.id ?? uid(),
            role: m.role,
            text: m.text ?? "",
            reasoning: typeof m.reasoning === "string" ? m.reasoning : undefined,
            status: (m.status === "streaming" ? "stopped" : m.status ?? "done") as Msg["status"],
            at: m.at ?? Date.now(),
          })),
          memory: mem.memory || [],
          reminders: mem.reminders || [],
          settings: {
            ...prev.settings,
            apiKey: "", // Key 不落前端
            apiMode: cfg.apiMode ?? prev.settings.apiMode,
            provider: cfg.provider ?? prev.settings.provider,
            presets: cfg.presets ?? prev.settings.presets,
            activePresetId: cfg.activePresetId ?? prev.settings.activePresetId,
            officialKeyMasks: cfg.officialKeyMasks ?? prev.settings.officialKeyMasks,
            proxyUrl: cfg.proxyUrl ?? prev.settings.proxyUrl,
            anthropicWorkspaceId: cfg.anthropicWorkspaceId ?? prev.settings.anthropicWorkspaceId,
            model: cfg.model ?? prev.settings.model,
            models: cfg.models ?? prev.settings.models,
            codexEnabled: cfg.codexEnabled ?? prev.settings.codexEnabled,
            claudeEnabled: cfg.claudeEnabled ?? prev.settings.claudeEnabled,
            defaultHand: cfg.defaultHand ?? prev.settings.defaultHand,
            quietThink: cfg.quietThink ?? prev.settings.quietThink,
            showStatusBar: cfg.showStatusBar ?? prev.settings.showStatusBar,
            mute: cfg.mute ?? prev.settings.mute,
            tools: cfg.tools ?? prev.settings.tools,
          },
        }));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [ready]);

  // 主题
  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", state.theme === "dark" ? "#1c1b1e" : "#e2e0df");
  }, [state.theme]);

  const set: Ctx["set"] = useCallback((key, value) => {
    if (key === "messages") messageVersion.current++;
    setState((prev) => ({
      ...prev,
      [key]: typeof value === "function" ? (value as (p: unknown) => unknown)(prev[key]) : value,
    }));
  }, []);

  const toast = useCallback((text: string) => {
    setToastText(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastText(null), 1600);
  }, []);

  const resetAll = useCallback(() => {
    messageVersion.current++;
    setState(defaultState);
  }, []);

  return (
    <StoreCtx.Provider value={{ ...state, ready, set, toast, resetAll }}>
      {children}
      {toastText && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex justify-center">
          <div className="animate-pop rounded-capsule bg-ink/85 px-4 py-2 text-[15px] text-cream shadow-soft">{toastText}</div>
        </div>
      )}
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export function exportBackup(state: Pick<State, "memory" | "reminders" | "messages" | "files">) {
  const data = { app: "echo", version: 1, exportedAt: new Date().toISOString(), ...state };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date();
  a.href = url;
  a.download = `echo-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
