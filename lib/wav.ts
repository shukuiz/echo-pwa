"use client";

// 浏览器录音：MediaRecorder 出的是 webm/opus，MiniMax 不认；这里直接拿 PCM 编成 16k 单声道 WAV。
// 全程不落盘，录完直接 POST 给后端。

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);   // PCM 头长度
  view.setUint16(20, 1, true);    // PCM
  view.setUint16(22, 1, true);    // 单声道
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, bytes, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

/** 线性插值重采样到 16k：语音识别不需要更高采样率，文件更小、上传更快 */
function resample(input: Float32Array, from: number, to = 16000): Float32Array {
  if (from === to || !input.length) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.round(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    out[i] = input[i0] + (input[i1] - input[i0]) * (pos - i0);
  }
  return out;
}

export type Recorder = {
  /** 停止并拿到 wav；取消则返回 null */
  stop: () => Blob | null;
  cancel: () => void;
};

/** 开始录音；onLevel 用来画音量条（0–1） */
export async function startRecording(onLevel?: (level: number) => void): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let peak = 0;
  let stopped = false;

  const close = () => {
    try { node.disconnect(); } catch {}
    try { source.disconnect(); } catch {}
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };

  node.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    let sum = 0;
    for (let i = 0; i < input.length; i += 16) sum += input[i] * input[i];
    peak = Math.max(peak * 0.9, Math.sqrt(sum / (input.length / 16)));
    onLevel?.(Math.min(1, peak * 3));
  };
  source.connect(node);
  node.connect(ctx.destination); // 某些浏览器不接输出就不跑 onaudioprocess

  return {
    stop() {
      if (stopped) return null;
      stopped = true;
      close();
      const total = chunks.reduce((n, c) => n + c.length, 0);
      if (!total) return null;
      const merged = new Float32Array(total);
      let at = 0;
      for (const c of chunks) { merged.set(c, at); at += c.length; }
      const wav = encodeWav(resample(merged, ctx.sampleRate), 16000);
      // 太短（<0.3 秒）当没录到：16k * 2 字节 * 0.3
      return wav.size < 9600 ? null : wav;
    },
    cancel() {
      stopped = true;
      close();
      chunks.length = 0;
    },
  };
}

let current: { audio: HTMLAudioElement; url: string } | null = null;

/** 播放一段音频 Blob（TTS 回来的 mp3）；同时只放一条，新的会顶掉旧的 */
export function playBlob(blob: Blob): Promise<void> {
  stopPlaying();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  current = { audio, url };
  return new Promise((resolve) => {
    const done = () => {
      if (current?.audio === audio) { URL.revokeObjectURL(url); current = null; }
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  });
}

export function stopPlaying() {
  if (!current) return;
  const { audio, url } = current;
  current = null;
  try { audio.pause(); } catch {}
  URL.revokeObjectURL(url);
}
