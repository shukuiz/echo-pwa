"use client";

// 设置 → 思考：每个连接单独一份。关 / 原生思考 / 强制思考（CoT）。
// 原生：看得到、改得了生成的参数（强度 / 预算）和附加参数 JSON，下面是后端算出的「最终请求附加内容」预览；
// 强制 CoT：提示词原文就在这里，可以改，可以「恢复默认」，后端原样使用。
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SettingsDrawer } from "@/components/Chrome";
import { api, type EchoSettings, type ThinkEffort, type ThinkFormat, type ThinkMode, type ThinkingPlan, type ThinkingSettings } from "@/lib/api";
import { useStore } from "@/lib/store";

export type ThinkTarget = { key: string; name: string; kind: "official" | "custom"; provider: string; id?: string; model: string; current: boolean };

const MODES: [ThinkMode, string, string][] = [
  ["off", "关", "不额外要求思考；模型自己给的思考照样会显示"],
  ["native", "原生思考", "让接口用它自带的思考能力（按接口类型加参数）"],
  ["cot", "强制思考", "用一段提示词请模型先在 <think> 里想，再回复（任何模型都能用）"],
];
const FORMATS: [ThinkFormat, string][] = [
  ["auto", "自动识别"], ["openai", "OpenAI 兼容"], ["anthropic", "Anthropic"], ["gemini", "Gemini 兼容"], ["deepseek", "DeepSeek"],
];
const FORMAT_NAME: Record<string, string> = { openai: "OpenAI 兼容", anthropic: "Anthropic", gemini: "Gemini 兼容", deepseek: "DeepSeek" };
const EFFORTS: [ThinkEffort, string][] = [["minimal", "最少"], ["low", "低"], ["medium", "中"], ["high", "高"]];
const FALLBACK: ThinkingSettings = { mode: "off", format: "auto", effort: "medium", budget: 4096, extra: "", cotPrompt: "" };

function thinkingOf(config: EchoSettings, t: ThinkTarget): ThinkingSettings {
  const raw = t.kind === "custom" ? config.presets.find((p) => p.id === t.id)?.thinking : config.officialThinking?.[t.provider];
  return { ...FALLBACK, ...(raw || {}) };
}

function extraError(text: string) {
  const t = text.trim();
  if (!t) return "";
  try {
    const v = JSON.parse(t);
    return v && typeof v === "object" && !Array.isArray(v) ? "" : "需要是一个 JSON 对象，例如 {\"top_k\": 20}";
  } catch { return "还不是合法的 JSON"; }
}

export default function ThinkingSettingsSection({ config, targets, onSaved }: {
  config: EchoSettings; targets: ThinkTarget[]; onSaved: (next: EchoSettings) => void;
}) {
  const { settings, set, toast } = useStore();
  const [targetKey, setTargetKey] = useState(() => targets.find((t) => t.current)?.key ?? targets[0]?.key ?? "");
  const target = targets.find((t) => t.key === targetKey) ?? targets[0];
  const savedJson = JSON.stringify(target ? thinkingOf(config, target) : FALLBACK);
  const saved = useMemo(() => JSON.parse(savedJson) as ThinkingSettings, [savedJson]);
  const tProvider = target ? (target.kind === "custom" ? "custom" : target.provider) : "";
  const tModel = target?.model ?? "";
  const [draft, setDraft] = useState<ThinkingSettings>(saved);
  const [plan, setPlan] = useState<ThinkingPlan | null>(null);
  const [planErr, setPlanErr] = useState("");
  const [status, setStatus] = useState<{ kind: "working" | "success" | "error"; text: string } | null>(null);
  const ids = { mode: useId(), fmt: useId(), eff: useId(), bud: useId(), extra: useId(), cot: useId(), tgt: useId() };
  const pvT = useRef<ReturnType<typeof setTimeout>>();

  // 切换连接 / 保存后：草稿回到已保存的值
  useEffect(() => { setDraft(saved); }, [saved]);
  useEffect(() => { setStatus(null); }, [targetKey]);
  // 当前连接变了（在上面切换了当前连接），跟着切过去
  useEffect(() => {
    const cur = targets.find((t) => t.current);
    if (cur && !targets.some((t) => t.key === targetKey)) setTargetKey(cur.key);
  }, [targets, targetKey]);

  // 预览：防抖 300ms 请求后端，看到的就是聊天时真正加进请求的东西
  useEffect(() => {
    if (!tProvider) return;
    clearTimeout(pvT.current);
    pvT.current = setTimeout(() => {
      const body = { thinking: { ...draft, extra: extraError(draft.extra) ? "" : draft.extra, cotPrompt: draft.cotPrompt.trim() ? draft.cotPrompt : "-" }, provider: tProvider, model: tModel };
      api.previewThinking(body).then((p) => { setPlan(p); setPlanErr(""); }).catch((e) => setPlanErr(e.message || "预览失败"));
    }, 300);
    return () => clearTimeout(pvT.current);
  }, [draft, tProvider, tModel]);

  // 老数据没有提示词：用默认的填上，看得到改得了
  const defaultCot = plan?.defaults.cotPrompt ?? "";
  useEffect(() => {
    if (defaultCot && !draft.cotPrompt) setDraft((d) => ({ ...d, cotPrompt: defaultCot }));
  }, [defaultCot, draft.cotPrompt]);

  if (!target) return null;
  const dirty = JSON.stringify(draft) !== JSON.stringify({ ...saved, cotPrompt: saved.cotPrompt || defaultCot });
  const exErr = extraError(draft.extra);
  const fmt = draft.format === "auto" ? plan?.format : draft.format;
  const cotEmpty = draft.mode === "cot" && !draft.cotPrompt.trim();
  const up = (p: Partial<ThinkingSettings>) => { setDraft((d) => ({ ...d, ...p })); setStatus(null); };

  async function save() {
    if (exErr) { setStatus({ kind: "error", text: "附加参数" + exErr }); return; }
    if (!draft.cotPrompt.trim()) { setStatus({ kind: "error", text: "强制思考的提示词不能是空的，可以点「恢复默认」" }); return; }
    setStatus({ kind: "working", text: "正在保存思考设置…" });
    try {
      const next = target.kind === "custom"
        ? await api.updatePreset(target.id!, { thinking: draft })
        : await api.saveSettings({ officialConnection: { provider: target.provider, model: target.model, thinking: draft } });
      onSaved(next);
      setStatus({ kind: "success", text: "思考设置已保存 ✓" });
    } catch (e) {
      setStatus({ kind: "error", text: (e as Error).message || "保存失败" });
    }
  }

  const setQuiet = (quiet: boolean) => {
    set("settings", (s) => ({ ...s, quietThink: quiet }));
    api.saveSettings({ quietThink: quiet }).catch((e) => toast(e.message || "保存失败"));
  };

  const chip = (on: boolean) => `min-h-11 flex-1 rounded-capsule px-2 text-[14px] transition ${on ? "bg-tile font-semibold text-rose shadow-soft" : "text-ink/80"}`;

  return (
    <SettingsDrawer title="思考">
      <div className="space-y-4" data-testid="thinking-settings">
        {targets.length > 1 && (
          <label htmlFor={ids.tgt} className="block space-y-1 text-[13px] text-mute">
            <span className="block">给哪个连接设置（每个连接各存一份）</span>
            <select id={ids.tgt} value={target.key} onChange={(e) => setTargetKey(e.target.value)} className="field">
              {targets.map((t) => <option key={t.key} value={t.key}>{t.name}{t.current ? "（当前）" : ""}</option>)}
            </select>
          </label>
        )}

        <div className="space-y-2">
          <p id={ids.mode} className="text-[13px] text-mute">思考方式</p>
          <div role="radiogroup" aria-labelledby={ids.mode} className="glass flex gap-1 rounded-capsule p-1">
            {MODES.map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={draft.mode === v} onClick={() => up({ mode: v })} className={chip(draft.mode === v)}>{l}</button>
            ))}
          </div>
          <p className="text-[12.5px] text-mute">{MODES.find(([v]) => v === draft.mode)?.[2]}</p>
        </div>

        {draft.mode === "native" && (
          <div className="space-y-3 rounded-2xl bg-fog/70 p-3">
            <label htmlFor={ids.fmt} className="block space-y-1 text-[13px] text-mute">
              <span className="block">接口类型{draft.format === "auto" && plan ? ` · 现在识别为 ${FORMAT_NAME[plan.format]}` : ""}</span>
              <select id={ids.fmt} value={draft.format} onChange={(e) => up({ format: e.target.value as ThinkFormat })} className="field">
                {FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            {fmt === "openai" && (
              <label htmlFor={ids.eff} className="block space-y-1 text-[13px] text-mute">
                <span className="block">思考强度 <code className="font-mono">reasoning_effort</code></span>
                <select id={ids.eff} value={draft.effort} onChange={(e) => up({ effort: e.target.value as ThinkEffort })} className="field">
                  {EFFORTS.map(([v, l]) => <option key={v} value={v}>{l} · {v}</option>)}
                </select>
              </label>
            )}
            {(fmt === "anthropic" || fmt === "gemini") && (
              <label htmlFor={ids.bud} className="block space-y-1 text-[13px] text-mute">
                <span className="block">思考预算（token）<code className="font-mono">{fmt === "anthropic" ? "budget_tokens" : "thinking_budget"}</code></span>
                <input id={ids.bud} type="number" inputMode="numeric" min={1024} max={128000} step={512} value={draft.budget}
                  onChange={(e) => up({ budget: Math.round(Number(e.target.value) || 0) })} className="field font-mono" />
              </label>
            )}
            {fmt === "deepseek" && <p className="text-[12.5px] text-mute">DeepSeek 的 reasoner 模型自己就会返回思考，不用加参数；deepseek-chat 没有思考，可以改用「强制思考」</p>}
            <label htmlFor={ids.extra} className="block space-y-1 text-[13px] text-mute">
              <span className="block">附加参数 JSON（可选，会合并进请求，同名的会覆盖上面生成的）</span>
              <textarea id={ids.extra} value={draft.extra} rows={3} spellCheck={false} autoCapitalize="none" placeholder={'{"top_k": 20}'}
                onChange={(e) => up({ extra: e.target.value })} className="field min-h-[88px] resize-y font-mono text-[14px]" aria-invalid={!!exErr} />
              {exErr && <span className="block font-medium text-rose">{exErr}</span>}
            </label>
            <div className="space-y-1">
              <p className="text-[13px] text-mute">最终加到请求里的参数</p>
              <pre className="model-list-scroll whitespace-pre-wrap break-all rounded-xl bg-tile px-3 py-2 font-mono text-[12.5px] leading-[1.55]" aria-live="polite">
                {planErr ? planErr : plan ? (Object.keys(plan.extras).length ? JSON.stringify(plan.extras, null, 2) : "（不加参数）") : "…"}
              </pre>
              <p className="text-[12px] text-mute">接口不认这些参数（返回 400）时，会自动去掉重试一次，并在那条回复下面轻轻提示</p>
            </div>
          </div>
        )}

        {draft.mode === "cot" && (
          <div className="space-y-2 rounded-2xl bg-fog/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={ids.cot} className="text-[13px] text-mute">强制思考提示词（会原样加在系统提示词最后）</label>
              <button type="button" disabled={!defaultCot || draft.cotPrompt === defaultCot} onClick={() => up({ cotPrompt: defaultCot })}
                className="btn-ghost min-h-11 shrink-0 px-3 text-[13px] disabled:opacity-45">恢复默认</button>
            </div>
            <textarea id={ids.cot} value={draft.cotPrompt} rows={7} onChange={(e) => up({ cotPrompt: e.target.value })} maxLength={4000}
              className="field min-h-[168px] resize-y text-[15px] leading-[1.6]" aria-invalid={cotEmpty} />
            <p className="flex justify-between text-[12px] text-mute">
              <span>{cotEmpty ? "提示词不能是空的" : "思考写在 <think></think> 里会自动折叠，不进正文、不进下一轮"}</span>
              <span className="font-mono">{draft.cotPrompt.length}/4000</span>
            </p>
          </div>
        )}

        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-[13px] text-mute">聊天里的思考过程</p>
          <div role="radiogroup" aria-label="思考默认展开或折叠" className="glass flex gap-1 rounded-capsule p-1">
            <button type="button" role="radio" aria-checked={!settings.quietThink} onClick={() => setQuiet(false)} className={chip(!settings.quietThink)}>默认展开</button>
            <button type="button" role="radio" aria-checked={settings.quietThink} onClick={() => setQuiet(true)} className={chip(settings.quietThink)}>默认折叠</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={!dirty || status?.kind === "working" || !!exErr || cotEmpty}
            className="btn-primary min-h-11 px-5 disabled:opacity-50">{status?.kind === "working" ? "保存中…" : "保存思考设置"}</button>
          {dirty && <button type="button" onClick={() => { setDraft({ ...saved, cotPrompt: saved.cotPrompt || defaultCot }); setStatus(null); }} className="btn-ghost min-h-11 px-4">撤销</button>}
        </div>
        <p role="status" className={`text-[13px] empty:sr-only ${status?.kind === "error" ? "font-medium text-rose" : "text-mute"}`}>{status?.text}</p>
      </div>
    </SettingsDrawer>
  );
}
