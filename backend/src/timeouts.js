// 回复等待时间（秒）：首字（普通接口 / Codex）、中途卡住、总时长上限。设置 → 回复等待 里可以改
export const DEFAULT_TIMEOUTS = Object.freeze({ firstToken: 60, codexFirstToken: 90, stall: 60, total: 600 });
const LIMITS = { firstToken: [10, 600], codexFirstToken: [10, 900], stall: [10, 600], total: [60, 3600] };

/** 设置里的超时（秒）：只收范围内的整数 */
export function normTimeouts(input, prev = DEFAULT_TIMEOUTS, { lenient = false } = {}) {
  const next = { ...DEFAULT_TIMEOUTS, ...(prev || {}) };
  if (!input || typeof input !== "object") return next;
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    if (input[k] === undefined) continue;
    const v = Number(input[k]);
    if (lenient) { if (Number.isFinite(v)) next[k] = Math.round(Math.min(hi, Math.max(lo, v))); continue; }
    if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`超时设置不对：${k} 要在 ${lo}–${hi} 秒之间`);
    next[k] = v;
  }
  return next;
}

