"use client";

// 设置 → 回复等待：首字超时（普通接口 / Codex）、中途卡住、总时长上限。到点自动结束，已写出的字都留着
import { useEffect, useState } from "react";
import { SettingsDrawer } from "@/components/Chrome";
import { api, type ReplyTimeouts } from "@/lib/api";
import { useStore } from "@/lib/store";

const FALLBACK: ReplyTimeouts = { firstToken: 60, codexFirstToken: 90, stall: 60, total: 600 };
const ROWS: { k: keyof ReplyTimeouts; t: string; d: string; min: number; max: number; step: number }[] = [
  { k: "firstToken", t: "等第一个字", d: "普通接口多久没开口就先停下", min: 10, max: 600, step: 10 },
  { k: "codexFirstToken", t: "等第一个字 · Codex", d: "Codex 会先查记忆、调工具，实测要 40 秒左右", min: 10, max: 900, step: 10 },
  { k: "stall", t: "中途卡住", d: "写到一半多久没动静算卡住", min: 10, max: 600, step: 10 },
  { k: "total", t: "最长写多久", d: "一条回复的总时长上限", min: 60, max: 3600, step: 60 },
];
const fmt = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} 分钟` : `${s} 秒`);

export default function ReplyTimeoutSettings() {
  const { ready, toast } = useStore();
  const [saved, setSaved] = useState<ReplyTimeouts | null>(null);
  const [draft, setDraft] = useState<ReplyTimeouts>(FALLBACK);
  const [defaults, setDefaults] = useState<ReplyTimeouts>(FALLBACK);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!ready) return;
    api.getSettings().then((cfg) => {
      const t = { ...FALLBACK, ...(cfg.timeouts || {}) };
      setSaved(t); setDraft(t); setDefaults({ ...FALLBACK, ...(cfg.defaultTimeouts || {}) });
    }).catch(() => setSaved(FALLBACK));
  }, [ready]);
  const dirty = !!saved && ROWS.some((r) => draft[r.k] !== saved[r.k]);

  async function save(next = draft) {
    setBusy(true);
    try {
      const cfg = await api.saveSettings({ timeouts: next });
      const t = { ...FALLBACK, ...(cfg.timeouts || next) };
      setSaved(t); setDraft(t); toast("回复等待时间存好啦");
    } catch (e) { toast((e as Error).message || "没存上"); }
    finally { setBusy(false); }
  }

  return (
    <SettingsDrawer title="回复等待">
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-mute">回复太久没动静就自动结束，不让你干等；已经写出的字都会留着，可以重试或接着聊。</p>
        {ROWS.map((r) => (
          <label key={r.k} className="block">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-[15px]">{r.t}</span>
              <output className="tabular-nums text-[14px] text-rose">{fmt(draft[r.k])}</output>
            </span>
            <span className="block text-[12px] text-mute">{r.d}</span>
            <input type="range" className="mt-1 h-11 w-full accent-[color:var(--hl)]" aria-label={r.t}
              min={r.min} max={r.max} step={r.step} value={draft[r.k]} disabled={!saved || busy}
              onChange={(e) => setDraft((d) => ({ ...d, [r.k]: +e.target.value }))} />
          </label>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary min-h-11 px-5 disabled:opacity-40" disabled={!dirty || busy} onClick={() => save()}>保存</button>
          <button type="button" className="btn-ghost min-h-11 px-4 disabled:opacity-40" disabled={busy || !saved || ROWS.every((r) => saved[r.k] === defaults[r.k])}
            onClick={() => save(defaults)}>恢复默认</button>
        </div>
      </div>
    </SettingsDrawer>
  );
}
