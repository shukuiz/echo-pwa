"use client";

// 设置 → 语音：MiniMax 的 Key / GroupId / 音色，试听，开关
import { useEffect, useId, useState } from "react";
import { Toggle } from "@/components/Chrome";
import { api, type EchoSettings, type VoiceSettings as VoiceCfg } from "@/lib/api";
import { playBlob, stopPlaying } from "@/lib/wav";

type Feedback = { kind: "working" | "success" | "error"; message: string };
const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

const BASES = [
  { value: "https://api.minimax.cn", label: "国内站" },
  { value: "https://api.minimax.io", label: "国际站" },
];

export default function VoiceSettings({ onChange }: { onChange?: (next: EchoSettings) => void }) {
  const [cfg, setCfg] = useState<VoiceCfg | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState(BASES[0].value);
  const [groupId, setGroupId] = useState("");
  const [voiceId, setVoiceId] = useState("female-tianmei");
  const [speed, setSpeed] = useState(1);
  const [key, setKey] = useState("");
  const [save, setSave] = useState<Feedback | null>(null);
  const [playing, setPlaying] = useState(false);
  const ids = { key: useId(), group: useId(), voice: useId(), speed: useId() };

  useEffect(() => {
    api.getVoice()
      .then((v) => {
        setCfg(v);
        setEnabled(v.enabled);
        setBaseUrl(v.baseUrl || BASES[0].value);
        setGroupId(v.groupId || "");
        setVoiceId(v.voiceId || "female-tianmei");
        setSpeed(v.speed || 1);
      })
      .catch((e) => setSave({ kind: "error", message: errMsg(e, "读不到语音设置") }));
  }, []);

  async function savePatch(extra: Record<string, unknown> = {}) {
    const next = await api.saveVoice({
      enabled, baseUrl, groupId, voiceId, speed,
      ...(key.trim() ? { apiKey: key.trim() } : {}),
      ...extra,
    });
    onChange?.(next);
    const v = await api.getVoice();
    setCfg(v);
    setKey("");
    return v;
  }

  async function submit() {
    setSave({ kind: "working", message: "正在保存…" });
    try {
      await savePatch();
      setSave({ kind: "success", message: "保存好了 ✿ 去聊天页试试「按住说话」和「朗读」" });
    } catch (e) {
      setSave({ kind: "error", message: errMsg(e, "保存失败") });
    }
  }

  async function preview() {
    if (playing) { stopPlaying(); setPlaying(false); return; }
    setSave({ kind: "working", message: "正在合成试听…" });
    try {
      if (key.trim() || !cfg?.hasKey) await savePatch({ enabled: true });
      setPlaying(true);
      setSave(null);
      await playBlob(await api.speakTest());
      setPlaying(false);
    } catch (e) {
      setPlaying(false);
      setSave({ kind: "error", message: errMsg(e, "试听失败") });
    }
  }

  const presets = cfg?.presets?.length ? cfg.presets : [{ id: "female-tianmei", name: "甜美女声" }];

  return (
    <div className="space-y-4">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px]">语音</p>
          <p className="text-[12px] text-mute">让 echo 读出回复，也能按住说话（MiniMax）</p>
        </div>
        <Toggle label="启用语音" on={enabled} onChange={(v) => { setEnabled(v); setSave(null); }} />
      </div>

      <label htmlFor={ids.key} className="block space-y-1 text-[13px] text-mute">
        <span className="block">MiniMax API Key</span>
        <input
          id={ids.key}
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => { setKey(e.target.value); setSave(null); }}
          placeholder={cfg?.hasKey ? `已保存 ${cfg.keyMask}，不填就是不改` : "在 MiniMax 控制台 → 接口密钥 里拿"}
          className="field font-mono"
        />
      </label>

      <label htmlFor={ids.group} className="block space-y-1 text-[13px] text-mute">
        <span className="block">GroupId</span>
        <input
          id={ids.group}
          value={groupId}
          onChange={(e) => { setGroupId(e.target.value); setSave(null); }}
          placeholder="控制台「账户信息」里那串数字，合成要用"
          className="field font-mono"
        />
      </label>

      <div className="space-y-1 text-[13px] text-mute">
        <span className="block">接口地址</span>
        <div className="flex gap-2">
          {BASES.map((b) => (
            <button key={b.value} type="button" onClick={() => { setBaseUrl(b.value); setSave(null); }}
              className={`min-h-10 flex-1 rounded-2xl px-3 text-[14px] transition ${baseUrl === b.value ? "bg-sakura/40 text-rose" : "bg-fog text-ink"}`}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <label htmlFor={ids.voice} className="block space-y-1 text-[13px] text-mute">
        <span className="block">音色</span>
        <select id={ids.voice} value={voiceId} onChange={(e) => { setVoiceId(e.target.value); setSave(null); }} className="field">
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          {!presets.some((p) => p.id === voiceId) && <option value={voiceId}>{voiceId}</option>}
        </select>
      </label>

      <label htmlFor={ids.speed} className="block space-y-1 text-[13px] text-mute">
        <span className="flex items-center justify-between"><span>语速</span><span className="font-mono">{speed.toFixed(1)}×</span></span>
        <input id={ids.speed} type="range" min={0.5} max={2} step={0.1} value={speed}
          onChange={(e) => { setSpeed(Number(e.target.value)); setSave(null); }} className="w-full accent-[color:var(--accent)]" />
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={submit} disabled={save?.kind === "working"} className="btn-primary min-h-11 px-4 disabled:opacity-50">
          {save?.kind === "working" ? "稍等…" : "保存"}
        </button>
        <button type="button" onClick={preview} className="btn-ghost min-h-11 px-4">{playing ? "停止" : "试听"}</button>
      </div>
      {save && (
        <p role="status" className={`text-[13px] ${save.kind === "error" ? "font-medium text-rose" : "text-mute"}`}>{save.message}</p>
      )}
      <p className="text-[12px] leading-relaxed text-mute">
        Key 只存在后端，前端只拿得到打码后的一小段。合成的音频不落盘，播完就没了。
      </p>
    </div>
  );
}
