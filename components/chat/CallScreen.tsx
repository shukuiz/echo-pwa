"use client";
// 打电话：全屏通话页。不用按住——一直在听，她停下约 1 秒就发；echo 说话时她一开口就打断
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { stripTr } from "@/lib/echo-actions";
import { playBlob, startRecording, stopPlaying, unlockAudio, type Recorder } from "@/lib/wav";

export type CallTurn = { role: "user" | "echo"; text: string };
type Phase = "connecting" | "listening" | "thinking" | "speaking" | "muted";

const SPEAK_ON = 0.12;      // 判定「开始说话」的音量
const SPEAK_OFF = 0.06;     // 低于它算安静
const SILENCE_MS = 1000;    // 说完后安静这么久就发
const BARGE_ON = 0.28;      // echo 说话时她插话的音量（高一点，免得 echo 自己的声音触发）
const BARGE_MS = 300;
const IDLE_RESET_MS = 20_000; // 一直没人说话就重开录音，免得缓冲太大

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function CallScreen({ avatar, history, onEnd, toast }: {
  avatar?: string;
  /** 通话前的聊天（只取文字），让 echo 知道前情 */
  history: CallTurn[];
  onEnd: (r: { dur: number; turns: CallTurn[] }) => void;
  toast: (m: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [captions, setCaptions] = useState(true);
  const [muted, setMuted] = useState(false);
  const [turns, setTurns] = useState<CallTurn[]>([]);

  const alive = useRef(true);
  const phaseRef = useRef<Phase>("connecting");
  const mutedRef = useRef(false);
  const turnsRef = useRef<CallTurn[]>([]);
  const recRef = useRef<Recorder | null>(null);
  const startedAt = useRef(Date.now());
  const vad = useRef({ speaking: false, lastLoud: 0, loudSince: 0, startedAt: 0 });
  const abortRef = useRef<AbortController | null>(null);

  const ph = (): Phase => phaseRef.current;
  const go = (p: Phase) => { phaseRef.current = p; if (alive.current) setPhase(p); };
  const addTurn = (t: CallTurn) => { turnsRef.current = [...turnsRef.current, t]; setTurns(turnsRef.current); };

  /** 开一段新录音；onLevel 里做「说完了」和「插话」的判断 */
  async function listen() {
    if (!alive.current || mutedRef.current) return;
    recRef.current?.cancel();
    vad.current = { speaking: false, lastLoud: 0, loudSince: 0, startedAt: Date.now() };
    try {
      const rec = await startRecording(onLevel, () => void finishUtterance());
      if (!alive.current) { rec.cancel(); return; }
      recRef.current = rec;
      if (ph() === "connecting" || ph() === "listening") go("listening");
    } catch {
      toast("麦克风没打开");
      hangUp();
    }
  }

  function onLevel(v: number) {
    if (!alive.current) return;
    setLevel(v);
    const now = Date.now();
    const s = vad.current;
    const p = phaseRef.current;
    if (p === "speaking") {
      // 插话：持续够响就停掉 echo，转成听
      if (v > BARGE_ON) {
        if (!s.loudSince) s.loudSince = now;
        if (now - s.loudSince > BARGE_MS) {
          abortRef.current?.abort();
          stopPlaying();
          s.speaking = true; s.lastLoud = now;
          go("listening");
        }
      } else s.loudSince = 0;
      return;
    }
    if (p !== "listening") return;
    if (v > SPEAK_ON) { s.speaking = true; s.lastLoud = now; }
    else if (v > SPEAK_OFF && s.speaking) s.lastLoud = now;
    if (s.speaking && now - s.lastLoud > SILENCE_MS) void finishUtterance();
    else if (!s.speaking && now - s.startedAt > IDLE_RESET_MS) void listen();
  }

  /** 她说完一句：转文字 → 问 echo → 念出来 → 接着听 */
  async function finishUtterance() {
    if (ph() !== "listening") return;
    const rec = recRef.current;
    recRef.current = null;
    const wav = rec?.stop();
    if (!wav) { go("listening"); void listen(); return; }
    go("thinking");
    let text = "";
    try { text = (await api.transcribe(wav)).text.trim(); } catch { /* 没听清就继续听 */ }
    if (!alive.current) return;
    if (!text) { go("listening"); void listen(); return; }
    addTurn({ role: "user", text });
    void listen(); // 想和说的时候也开着麦，好让她插话
    go("thinking");
    const ac = new AbortController();
    abortRef.current = ac;
    let reply = "";
    try {
      const input = [...history.slice(-16), ...turnsRef.current].map((t) => ({ role: t.role, text: t.text }));
      await api.chatStream(input, { call: true, signal: ac.signal, onDelta: (d) => { reply += d; } });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast((e as Error).message || "echo 没接上");
    }
    reply = stripTr(reply.replace(/\[\[echo:[^\]]*\]\]/g, ""));
    if (!alive.current || ac.signal.aborted) return;
    if (!reply) { go("listening"); return; }
    addTurn({ role: "echo", text: reply });
    if (ph() !== "thinking") return; // 她已经插话了
    try {
      const blob = await api.speak(reply.slice(0, 600));
      if (!alive.current || ac.signal.aborted || ph() !== "thinking") return;
      vad.current.loudSince = 0;
      go("speaking");
      await playBlob(blob);
    } catch (e) {
      if (!ac.signal.aborted) toast((e as Error).message || "这句没念出来");
    }
    if (alive.current && ph() === "speaking") {
      // 正常说完：重开一段干净的录音，别把 echo 自己的声音录进去
      go(mutedRef.current ? "muted" : "listening");
      void listen();
    }
  }

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      recRef.current?.cancel(); recRef.current = null; setLevel(0);
      if (ph() === "listening") go("muted");
    } else {
      if (ph() === "muted") go("listening");
      void listen();
    }
  }

  function hangUp() {
    if (!alive.current) return;
    alive.current = false;
    abortRef.current?.abort();
    recRef.current?.cancel();
    stopPlaying();
    onEnd({ dur: Math.round((Date.now() - startedAt.current) / 1000), turns: turnsRef.current });
  }

  useEffect(() => {
    unlockAudio();
    startedAt.current = Date.now();
    void listen();
    const t = setInterval(() => setSecs(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
    return () => { clearInterval(t); alive.current = false; abortRef.current?.abort(); recRef.current?.cancel(); stopPlaying(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = { connecting: "正在接通…", listening: "正在听…", thinking: "echo 在想…", speaking: "echo 在说…", muted: "已静音" }[phase];
  const lastUser = [...turns].reverse().find((t) => t.role === "user");
  const lastEcho = [...turns].reverse().find((t) => t.role === "echo");
  const glow = phase === "listening" ? 1 + level * 0.35 : 1;

  return (
    <div className="ec-call" role="dialog" aria-label="和 echo 通话">
      <div className="ec-call-top">
        <b>echo</b>
        <span className="ec-call-time">{fmt(secs)}</span>
      </div>
      <div className={`ec-call-orb is-${phase}`}>
        <span className="ec-call-halo" style={{ transform: `scale(${glow})` }} />
        <span className="ec-call-halo2" />
        {avatar ? <img src={avatar} alt="echo" className="ec-call-avatar" /> : <span className="ec-call-avatar ec-call-avatar-empty">e</span>}
      </div>
      <p className="ec-call-status" aria-live="polite">{status}</p>
      {captions && (
        <div className="ec-call-captions">
          {lastUser && <p className="me">{lastUser.text}</p>}
          {lastEcho && <p>{lastEcho.text}</p>}
        </div>
      )}
      <div className="ec-call-acts">
        <button type="button" className={`ec-call-btn ${muted ? "on" : ""}`} onClick={toggleMute} aria-pressed={muted}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />{muted && <path d="M4 4l16 16" />}</svg>
          <span>{muted ? "取消静音" : "静音"}</span>
        </button>
        <button type="button" className="ec-call-btn hang" onClick={hangUp} aria-label="挂断">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12 9c-3.2 0-6.2.9-8.6 2.6-.6.4-.8 1.2-.5 1.9l1 2c.3.6 1 .9 1.7.7l2.6-.9c.6-.2 1-.8 1-1.4v-1.6c1.8-.5 3.8-.5 5.6 0v1.6c0 .6.4 1.2 1 1.4l2.6.9c.7.2 1.4-.1 1.7-.7l1-2c.3-.7.1-1.5-.5-1.9C18.2 9.9 15.2 9 12 9z" /></svg>
          <span>挂断</span>
        </button>
        <button type="button" className={`ec-call-btn ${captions ? "on" : ""}`} onClick={() => setCaptions((v) => !v)} aria-pressed={captions}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 11h4M13 11h4M7 15h7" /></svg>
          <span>字幕</span>
        </button>
      </div>
    </div>
  );
}
