const KEY = "echo-chat-css-v1";

export type ChatCssPreset = { id: string; name: string; css: string; at: number };
export type ChatCssStore = {
  activeId: string | null;
  draft: string;
  presets: ChatCssPreset[];
};

export const DEFAULT_CHAT_CSS: ChatCssStore = { activeId: null, draft: "", presets: [] };
const listeners = new Set<() => void>();

export function loadChatCss(): ChatCssStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CHAT_CSS;
    const data = JSON.parse(raw) as Partial<ChatCssStore> | null;
    const presets = Array.isArray(data?.presets)
      ? data.presets.filter((p) => p && typeof p.id === "string" && typeof p.name === "string" &&
          typeof p.css === "string" && typeof p.at === "number")
      : [];
    const active = presets.find((p) => p.id === data?.activeId);
    return {
      activeId: active?.id ?? null,
      draft: typeof data?.draft === "string" ? data.draft : "",
      presets,
    };
  } catch {
    return DEFAULT_CHAT_CSS;
  }
}

export function loadActiveCss() {
  return loadChatCss().draft;
}

export function subscribeChatCss(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

type ChatCssAction =
  | { type: "apply"; css: string }
  | { type: "save"; name: string; overwrite: boolean }
  | { type: "select"; id: string }
  | { type: "delete"; id: string }
  | { type: "disable" };

export function updateChatCss(action: ChatCssAction): ChatCssStore {
  const current = loadChatCss();
  let next: ChatCssStore;
  switch (action.type) {
    case "apply":
      next = { ...current, draft: action.css };
      break;
    case "save": {
      const existing = current.presets.find((p) => p.name === action.name);
      if (existing && !action.overwrite) return current;
      const preset = { id: existing?.id ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(36)).join("-"), name: action.name, css: current.draft, at: Date.now() };
      const presets = existing ? current.presets.map((p) => p.id === preset.id ? preset : p) : [...current.presets, preset];
      next = { ...current, presets };
      break;
    }
    case "select": {
      const preset = current.presets.find((p) => p.id === action.id);
      if (!preset) return current;
      next = { ...current, activeId: preset.id, draft: preset.css };
      break;
    }
    case "delete":
      next = {
        ...current,
        activeId: current.activeId === action.id ? null : current.activeId,
        presets: current.presets.filter((p) => p.id !== action.id),
      };
      break;
    case "disable":
      next = { ...current, activeId: null, draft: "" };
      break;
  }
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
  return next;
}
