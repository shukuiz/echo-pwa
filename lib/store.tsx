"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { seedFiles, seedMemory, seedMessages, seedReminders } from "./mock";

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
export type Settings = {
  apiKey: string;
  proxyUrl: string;
  codexEnabled: boolean;
  claudeEnabled: boolean;
  defaultHand: Hand;
  model: string;
  models: string[];
  quietThink: boolean;
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
    proxyUrl: "https://api.example.com/v1",
    codexEnabled: true,
    claudeEnabled: true,
    defaultHand: "claude",
    model: "claude-sonnet-4-5",
    models: ["claude-sonnet-4-5", "gpt-4o", "deepseek-chat"],
    quietThink: true,
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

  // 读取本地存储
  useEffect(() => {
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
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state, ready]);

  // 主题
  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", state.theme === "dark" ? "#1c1b1e" : "#e2e0df");
  }, [state.theme]);

  const set: Ctx["set"] = useCallback((key, value) => {
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
