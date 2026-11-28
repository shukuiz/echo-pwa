"use client";

// 设置 → 语音：MiniMax 的 Key / GroupId / 音色 / 模型 / 语种 / 朗读风格，试听，开关
import { useEffect, useId, useState } from "react";
import { Toggle } from "@/components/Chrome";
import { api, type EchoSettings, type VoiceSettings as VoiceCfg } from "@/lib/api";
import { playBlob, stopPlaying } from "@/lib/wav";
import { useStore } from "@/lib/store";

type Feedback = { kind: "working" | "success" | "error"; message: string };
const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

const BASES = [
  { value: "https://api.minimax.cn", label: "国内站" },
  { value: "https://api.minimax.io", label: "国际站" },
];

// 后端没返回可选项时的兜底，保证下拉永远是空的也能用
const FALLBACK_TTS = [
  { id: "speech-2.8-turbo", name: "2.8 极速" },
  { id: "speech-2.8-hd", name: "2.8 高保真" },
];
const FALLBACK_ASR = [{ id: "asr-1.0", name: "ASR 1.0" }];
const FALLBACK_LANG = [
  { id: "auto", name: "自动识别" },
  { id: "Chinese", name: "中文普通话" },
  { id: "English", name: "英语" },
];

export default function VoiceSettings({ onChange }: { onChange?: (next: EchoSettings) => void }) {
  const [cfg, setCfg] = useState<VoiceCfg | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState(BASES[0].value);
  const [groupId, setGroupId] = useState("");
  const [voiceId, setVoiceId] = useState("female-tianmei");
  const [customVoice, setCustomVoice] = useState("");
  const [ttsModel, setTtsModel] = useState("speech-2.8-turbo");
  const [asrModel, setAsrModel] = useState("asr-1.0");
  const [language, setLanguage] = useState("auto");
  const [ttsPrompt, setTtsPrompt] = useState("");
  const [speed, setSpeed] = useState(1);
  const [key, setKey] = useState("");
  const [save, setSave] = useState<Feedback | null>(null);
  const [playing, setPlaying] = useState(false);
  const { settings, set } = useStore();
  const ids = {
    key: useId(), group: useId(), voice: useId(), customVoice: useId(),
    ttsModel: useId(), asrModel: useId(), language: useId(), ttsPrompt: useId(), speed: useId(),
  };

  useEffect(() => {
    api.getVoice()
      .then((v) => {
        setCfg(v);
        setEnabled(v.enabled);
        setBaseUrl(v.baseUrl || BASES[0].value);
        setGroupId(v.groupId || "");
        setVoiceId(v.voiceId || "female-tianmei");
        setCustomVoice(v.presets?.some((p) => p.id === v.voiceId) ? "" : (v.voiceId || ""));
        setTtsModel(v.ttsModel || "speech-2.8-turbo");
        setAsrModel(v.asrModel || "asr-1.0");
        setLanguage(v.language || "auto");
        setTtsPrompt(v.ttsPrompt || "");
        setSpeed(v.speed || 1);
      })
      .catch((e) => setSave({ kind: "error", message: errMsg(e, "读不到语音设置") }));
  }, []);

  async function savePatch(extra: Record<string, unknown> = {}) {
    const next = await api.saveVoice({
      enabled, baseUrl, groupId, voiceId: customVoice.trim() || voiceId, speed,
      ttsModel, asrModel, language, ttsPrompt: ttsPrompt.trim(),
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
  const ttsModels = cfg?.ttsModels?.length ? cfg.ttsModels : FALLBACK_TTS;
  const asrModels = cfg?.asrModels?.length ? cfg.asrModels : FALLBACK_ASR;
  const languages = cfg?.languages?.length ? cfg.languages : FALLBACK_LANG;

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
          placeholder={cfg?.hasKey ? `已保存 ${cfg.keyMask}，不填就是不改` : "在 MiniMax 控制台 → 接口密钥 里拿整串，别带前面的 - [ ]"}
          className="field font-mono"
        />
        <span className="block text-[12px]">直接粘贴整串即可，前后多的空格和复选框符号会自动去掉</span>
      </label>

      <label htmlFor={ids.group} className="block space-y-1 text-[13px] text-mute">
        <span className="block">GroupId（可选）</span>
        <input
          id={ids.group}
          value={groupId}
          onChange={(e) => { setGroupId(e.target.value); setSave(null); }}
          placeholder="可选，新版 Key 不用填；老 Key 才需要（控制台「账户信息」里的数字）"
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

      <label htmlFor={ids.ttsModel} className="block space-y-1 text-[13px] text-mute">
        <span className="block">朗读模型</span>
        <select id={ids.ttsModel} value={ttsModel} onChange={(e) => { setTtsModel(e.target.value); setSave(null); }} className="field">
          {ttsModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          {!ttsModels.some((m) => m.id === ttsModel) && <option value={ttsModel}>{ttsModel}（自定义）</option>}
        </select>
      </label>

      <label htmlFor={ids.asrModel} className="block space-y-1 text-[13px] text-mute">
        <span className="block">识别模型</span>
        <select id={ids.asrModel} value={asrModel} onChange={(e) => { setAsrModel(e.target.value); setSave(null); }} className="field">
          {asrModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          {!asrModels.some((m) => m.id === asrModel) && <option value={asrModel}>{asrModel}（自定义）</option>}
        </select>
      </label>

      <label htmlFor={ids.language} className="block space-y-1 text-[13px] text-mute">
        <span className="block">语种</span>
        <select id={ids.language} value={language} onChange={(e) => { setLanguage(e.target.value); setSave(null); }} className="field">
          {languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          {!languages.some((l) => l.id === language) && <option value={language}>{language}（自定义）</option>}
        </select>
        <span className="block text-[12px]">朗读和按住说话都用这个；不确定就选自动识别</span>
      </label>

      <label htmlFor={ids.voice} className="block space-y-1 text-[13px] text-mute">
        <span className="block">音色</span>
        <select id={ids.voice} value={customVoice ? "" : voiceId} onChange={(e) => { setVoiceId(e.target.value); setCustomVoice(""); setSave(null); }} className="field">
          {customVoice && <option value="">使用自定义</option>}
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label htmlFor={ids.customVoice} className="block space-y-1 pt-2">
          <span className="block">自定义音色 ID</span>
          <input id={ids.customVoice} value={customVoice} onChange={(e) => { setCustomVoice(e.target.value); setSave(null); }} placeholder="例如 moss_audio_xxx" className="field font-mono" />
        </label>
        {customVoice.trim() && <p className="text-[12px] text-rose">已用自定义音色：{customVoice.trim()}</p>}
      </label>

      <label htmlFor={ids.ttsPrompt} className="block space-y-1 text-[13px] text-mute">
        <span className="block">朗读风格提示词（可选）</span>
        <textarea
          id={ids.ttsPrompt}
          value={ttsPrompt}
          onChange={(e) => { setTtsPrompt(e.target.value); setSave(null); }}
          placeholder="例如：温柔一点，慢一点，带点笑意"
          rows={2}
          className="field resize-y"
        />
        <span className="block text-[12px]">会随每次合成一起传给 MiniMax；不支持该字段的模型会自动忽略，不影响出声</span>
      </label>

      <label htmlFor={ids.speed} className="block space-y-1 text-[13px] text-mute">
        <span className="flex items-center justify-between"><span>语速</span><span className="font-mono">{speed.toFixed(1)}×</span></span>
        <input id={ids.speed} type="range" min={0.5} max={2} step={0.1} value={speed}
          onChange={(e) => { setSpeed(Number(e.target.value)); setSave(null); }} className="w-full accent-[color:var(--accent)]" />
      </label>

      <div className="flex items-start justify-between gap-3 border-t border-line pt-3">
        <div className="min-w-0">
          <p className="text-[15px]">让 echo 偶尔主动发语音</p>
          <p className="mt-1 text-[12px] text-mute">聊天里它觉得合适的时候，会自己念一句给你听</p>
        </div>
        <Toggle label="主动语音" on={settings.proactiveVoice !== false} onChange={(v) => set("settings", (s) => ({ ...s, proactiveVoice: v }))} />
      </div>

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
        Key 只存在后端，前端只拿得到打码后的一小段。合成的音频不落盘，播完就没了。自定义音色填的是 MiniMax 控制台里那段 voice_id，克隆出来的音色也能用。
      </p>
    </div>
  );
}
