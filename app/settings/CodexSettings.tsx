"use client";

// 设置 → 聊天连接 → Codex（ChatGPT 订阅）：状态、登录、模型、思考强度、显示思考、新对话
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { Toggle } from "@/components/Chrome";
import { api, type CodexEffort, type CodexModel, type CodexStatus, type EchoSettings } from "@/lib/api";

export const CODEX_NAME = "Codex（ChatGPT 订阅）";
const EFFORT_NAME: Record<CodexEffort, string> = { minimal: "最少", low: "低", medium: "中", high: "高", xhigh: "超高" };
const ALL_EFFORTS: CodexEffort[] = ["minimal", "low", "medium", "high", "xhigh"];
const PLAN_NAME: Record<string, string> = { plus: "Plus", pro: "Pro", team: "Team", free: "免费版", business: "Business", enterprise: "Enterprise", edu: "Edu" };

type Feedback = { kind: "working" | "success" | "error"; message: string };
const errorMessage = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

function Dot({ tone }: { tone: "ok" | "warn" | "off" }) {
  const color = tone === "ok" ? "bg-[#34c759]" : tone === "warn" ? "bg-rose" : "bg-mute/40";
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "off" }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-1.5">
      <span className="text-[14px] text-mute">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-right text-[14px]"><Dot tone={tone} /><span className="break-all">{value}</span></span>
    </div>
  );
}

/** 只读状态：给「当前连接」下面的小卡片和编辑面板共用 */
export function useCodexStatus(enabled = true) {
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await api.codexStatus());
      setError("");
    } catch (e) {
      setError(errorMessage(e, "读不到 Codex 的状态"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (enabled) refresh(); }, [enabled, refresh]);
  return { status, error, loading, refresh };
}

export function CodexStatusList({ status, error }: { status: CodexStatus | null; error: string }) {
  if (error) return <p className="text-[13px] font-medium text-rose">{error}</p>;
  if (!status) return <p className="text-[13px] text-mute">正在看看 Codex 在不在…</p>;
  const serein = status.mcp?.serein;
  const plan = status.account?.planType ? PLAN_NAME[status.account.planType] || status.account.planType : "";
  return (
    <div className="divide-y divide-line">
      <StatusRow label="ChatGPT 登录" tone={status.loggedIn ? "ok" : "warn"}
        value={status.loggedIn ? [status.account?.email || "已登录", plan].filter(Boolean).join(" · ") : status.installed ? "还没登录" : "服务器上没装 codex"} />
      <StatusRow label="Codex 服务" tone={status.alive ? "ok" : "warn"} value={status.alive ? (status.busy ? "正在回复" : "在线") : "没在运行"} />
      <StatusRow label="Serein 记忆" tone={serein?.status === "ready" ? "ok" : serein?.status === "failed" ? "warn" : "off"}
        value={serein?.status === "ready" ? "已接上" : serein?.status === "failed" ? "连不上" : serein ? "正在连接" : "开始聊天后连接"} />
      <StatusRow label="对话" tone={status.hasThread ? "ok" : "off"}
        value={status.hasThread ? `一段对话进行中${status.threadStartedAt ? ` · ${new Date(status.threadStartedAt).toLocaleDateString("zh-CN")} 开始` : ""}` : "下一条消息开新对话"} />
      {status.error && <p className="py-2 text-[13px] font-medium text-rose">{status.error}</p>}
    </div>
  );
}

function LoginBox({ status, onDone }: { status: CodexStatus; onDone: () => void }) {
  const [login, setLogin] = useState(status.login);
  const [state, setState] = useState<Feedback | null>(null);
  async function start() {
    setState({ kind: "working", message: "正在向 ChatGPT 要登录码…" });
    try {
      const res = await api.codexLogin();
      if (res.loggedIn) { onDone(); return; }
      setLogin({ loginId: res.loginId || "", url: res.url || "", code: res.code || "", startedAt: Date.now() });
      setState(null);
    } catch (e) {
      setState({ kind: "error", message: errorMessage(e, "没要到登录码") });
    }
  }
  async function cancel() {
    await api.codexCancelLogin().catch(() => {});
    setLogin(null);
  }
  return (
    <div className="space-y-3 rounded-2xl bg-fog p-4">
      {login?.code ? (
        <>
          <p className="text-[14px]">在手机浏览器打开下面的网址，登录 ChatGPT 后输入这个码：</p>
          <p className="select-all text-center font-mono text-[26px] font-semibold tracking-[0.12em]">{login.code}</p>
          <div className="flex flex-wrap gap-2">
            <a href={login.url} target="_blank" rel="noreferrer" className="btn-primary inline-flex min-h-11 items-center px-4">打开登录网址</a>
            <button type="button" className="btn-ghost min-h-11 px-4" onClick={() => navigator.clipboard?.writeText(login.code).catch(() => {})}>复制码</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost min-h-11 px-4" onClick={onDone}>我登好了</button>
            <button type="button" className="btn-ghost min-h-11 px-4 text-mute" onClick={cancel}>取消</button>
          </div>
          <p className="text-[12px] text-mute">登录码十几分钟内有效。登录用的是 Codex 自己的设备码流程，密码不经过 echo。</p>
        </>
      ) : (
        <>
          <p className="text-[14px]">用 ChatGPT 订阅聊天，需要先让服务器上的 Codex 登录一次 ( ˘ᵕ˘ )</p>
          <button type="button" className="btn-primary min-h-11 px-4" onClick={start} disabled={state?.kind === "working"}>
            {state?.kind === "working" ? "请稍等…" : "登录 ChatGPT"}
          </button>
        </>
      )}
      {state?.kind === "error" && <p role="status" className="text-[13px] font-medium text-rose">{state.message}</p>}
    </div>
  );
}

export function CodexEditor({ config, activate, onClose, onSaved }: {
  config: EchoSettings;
  activate: boolean;
  onClose: () => void;
  onSaved: (next: EchoSettings, message: string) => void;
}) {
  const saved = config.codex ?? { model: "", effort: "medium" as CodexEffort, showThinking: true };
  const isCurrent = config.apiMode === "codex";
  const { status, error, refresh } = useCodexStatus();
  const [models, setModels] = useState<CodexModel[]>([]);
  const [modelError, setModelError] = useState("");
  const [model, setModel] = useState(saved.model);
  const [effort, setEffort] = useState<CodexEffort>(saved.effort);
  const [showThinking, setShowThinking] = useState(saved.showThinking);
  const [save, setSave] = useState<Feedback | null>(null);
  const [reset, setReset] = useState<Feedback | null>(null);
  const ids = { model: useId(), effort: useId() };

  useEffect(() => {
    if (!status?.loggedIn) return;
    api.codexModels().then((r) => { setModels(r.models); setModelError(""); })
      .catch((e) => setModelError(errorMessage(e, "读不到模型列表")));
  }, [status?.loggedIn]);

  const picked = models.find((m) => m.id === model) ?? (model ? undefined : models.find((m) => m.isDefault));
  const efforts = picked?.efforts.length ? picked.efforts : ALL_EFFORTS.filter((e) => e !== "minimal");
  useEffect(() => {
    if (models.length && !efforts.includes(effort)) setEffort(efforts.includes("medium") ? "medium" : efforts[0]);
  }, [models.length, efforts, effort]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSave({ kind: "working", message: "正在保存…" });
    try {
      const next = await api.saveSettings({ codex: { model, effort, showThinking }, ...(activate || isCurrent ? { apiMode: "codex" } : {}) });
      onSaved(next, activate && !isCurrent ? `已把 ${CODEX_NAME} 设为当前连接。` : "已保存 Codex 设置。");
    } catch (e) {
      setSave({ kind: "error", message: errorMessage(e, "保存失败") });
    }
  }

  async function newThread() {
    setReset({ kind: "working", message: "正在开新对话…" });
    try {
      await api.codexResetThread();
      setReset({ kind: "success", message: "新对话开好了，之前聊的我都带着 ✿" });
      refresh();
    } catch (e) {
      setReset({ kind: "error", message: errorMessage(e, "没能开新对话") });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-semibold">{CODEX_NAME}</p>
        <button type="button" className="btn-ghost min-h-11 px-3 text-[13px]" onClick={refresh}>刷新状态</button>
      </div>
      <p className="text-[13px] leading-relaxed text-mute">
        用你的 ChatGPT 订阅聊天：服务器上的 Codex 只读运行，自己记着这段对话的上下文，每次只把新的一句话交给它。
        它的人设读的是 <Link href="/settings/manual" className="text-rose underline-offset-2 hover:underline">说明书</Link>，记忆通过 Serein 查和写。
      </p>
      <CodexStatusList status={status} error={error} />
      {status && !status.loggedIn && status.installed && <LoginBox status={status} onDone={refresh} />}
      {status?.agentsChanged && (
        <p className="rounded-2xl bg-fog px-4 py-3 text-[13px]">说明书改过了，Codex 要开新对话才会读到新版 ₍ᐢ•ﻌ•ᐢ₎</p>
      )}

      <label htmlFor={ids.model} className="block space-y-1 text-[13px] text-mute">
        <span className="block">模型</span>
        <select id={ids.model} value={model} onChange={(e) => { setModel(e.target.value); setSave(null); }} className="field font-mono">
          <option value="">跟随 Codex 默认{models.find((m) => m.isDefault) ? `（${models.find((m) => m.isDefault)?.name}）` : ""}</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          {model && !models.some((m) => m.id === model) && <option value={model}>{model}</option>}
        </select>
      </label>
      {picked?.description && <p className="-mt-2 text-[12px] text-mute">{picked.description}</p>}
      {modelError && <p className="text-[13px] font-medium text-rose">{modelError}</p>}

      <label htmlFor={ids.effort} className="block space-y-1 text-[13px] text-mute">
        <span className="block">思考强度</span>
        <select id={ids.effort} value={effort} onChange={(e) => { setEffort(e.target.value as CodexEffort); setSave(null); }} className="field">
          {efforts.map((e) => <option key={e} value={e}>{EFFORT_NAME[e]}</option>)}
        </select>
      </label>
      <p className="-mt-2 text-[12px] text-mute">越高想得越久、回得越慢，也更耗订阅额度。日常聊天「低」或「中」就够啦。</p>

      <div className="flex min-h-11 items-center justify-between gap-3">
        <div>
          <p className="text-[15px]">显示思考</p>
          <p className="text-[12px] text-mute">把 Codex 的思考摘要放进回复上方的「思考」里</p>
        </div>
        <Toggle label="显示思考" on={showThinking} onChange={(v) => { setShowThinking(v); setSave(null); }} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={save?.kind === "working"} className="btn-primary min-h-11 px-4 disabled:opacity-50">
          {save?.kind === "working" ? "保存中…" : activate && !isCurrent ? "保存并设为当前" : "保存"}
        </button>
        <button type="button" onClick={onClose} className="btn-ghost min-h-11 px-4">取消</button>
      </div>
      {save?.kind === "error" && <p role="status" className="text-[13px] font-medium text-rose">{save.message}</p>}

      <div className="space-y-2 border-t border-line pt-4">
        <button type="button" onClick={newThread} disabled={reset?.kind === "working"} className="btn-ghost min-h-11 w-full disabled:opacity-50">新对话</button>
        <p role="status" className={`text-[12px] ${reset?.kind === "error" ? "font-medium text-rose" : "text-mute"}`}>
          {reset?.message || "Codex 会一直接着同一段对话聊。想让它从头开始、或者改了说明书，就点这里。"}
        </p>
      </div>
    </form>
  );
}
