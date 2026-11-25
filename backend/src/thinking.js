// 「思考」设置：关 / 原生思考 / 强制思考（CoT）
// - 原生：按接口类型往请求体里加对应参数，再合并用户的「附加参数 JSON」；上游 400 时去掉这些参数重试一次
// - 强制 CoT：在 system 末尾追加用户保存的那段提示词（原样使用），模型把思考写进 <think></think>
// - 不管哪种模式，回复正文里的 <think>…</think> 都会被拆到「思考」里，不进正文、不进下一轮上下文

export const THINK_MODES = ["off", "native", "cot"];
export const THINK_FORMATS = ["auto", "openai", "anthropic", "gemini", "deepseek"];
export const THINK_EFFORTS = ["minimal", "low", "medium", "high"];
export const MAX_COT = 4000;
const MAX_EXTRA = 4000;

export const DEFAULT_COT_PROMPT = `回复之前，请先在 <think></think> 里安静地想一想：
- 她这句话真正想说的是什么，心情怎么样
- 记忆里有没有和这件事有关的事
- 怎样回应最贴心、最自然
想好之后，在 </think> 后面写给她的回复。思考的内容她可以展开看，但不用在回复里再提一遍。`;

export const DEFAULT_THINKING = Object.freeze({
  nativeStyle: "给用户展示的思考说明请用简体中文，简短、自然。",
  mode: "off",
  format: "auto",
  effort: "medium",
  budget: 4096,
  extra: "",
  cotPrompt: DEFAULT_COT_PROMPT,
});

const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** 解析「附加参数 JSON」：空 = {}；必须是对象 */
export function parseExtra(text) {
  const t = String(text ?? "").trim();
  if (!t) return {};
  let v;
  try { v = JSON.parse(t); } catch { throw new Error("附加参数不是合法的 JSON"); }
  if (!isPlainObject(v)) throw new Error("附加参数需要是一个 JSON 对象，例如 {\"top_k\": 20}");
  for (const k of ["model", "messages", "input", "stream"]) {
    if (k in v) throw new Error(`附加参数里不能改 ${k}`);
  }
  return v;
}

/** 校验并补全一份思考设置（来自设置页）；不合法时抛带中文 message 的错误 */
export function normThinking(input, prev = DEFAULT_THINKING) {
  const base = { ...DEFAULT_THINKING, ...(isPlainObject(prev) ? prev : {}) };
  if (!isPlainObject(input)) return base;
  const next = { ...base };
  if (input.nativeStyle !== undefined) {
    if (typeof input.nativeStyle !== "string" || input.nativeStyle.length > 4000) throw new Error("风格偏好最多 4000 字");
    next.nativeStyle = input.nativeStyle;
  }
  if (input.mode !== undefined) {
    if (!THINK_MODES.includes(input.mode)) throw new Error("未知的思考模式");
    next.mode = input.mode;
  }
  if (input.format !== undefined) {
    if (!THINK_FORMATS.includes(input.format)) throw new Error("未知的接口类型");
    next.format = input.format;
  }
  if (input.effort !== undefined) {
    if (!THINK_EFFORTS.includes(input.effort)) throw new Error("思考强度只能是 minimal / low / medium / high");
    next.effort = input.effort;
  }
  if (input.budget !== undefined) {
    const n = Number(input.budget);
    if (!Number.isInteger(n) || n < 1024 || n > 128000) throw new Error("思考预算需要是 1024–128000 之间的整数");
    next.budget = n;
  }
  if (input.extra !== undefined) {
    const t = String(input.extra ?? "");
    if (t.length > MAX_EXTRA) throw new Error(`附加参数最多 ${MAX_EXTRA} 个字符`);
    parseExtra(t);
    next.extra = t.trim();
  }
  if (input.cotPrompt !== undefined) {
    const t = String(input.cotPrompt ?? "");
    if (!t.trim()) throw new Error("强制思考的提示词不能是空的，可以点「恢复默认」");
    if (t.length > MAX_COT) throw new Error(`强制思考的提示词最多 ${MAX_COT} 个字`);
    next.cotPrompt = t; // 原样保存，不做 trim 以外的任何改写
  }
  return next;
}

/** 接口类型：设成 auto 时按官方厂商 / 模型名猜 */
export function resolveFormat(thinking, { provider, model }) {
  if (thinking.format && thinking.format !== "auto") return thinking.format;
  if (provider === "anthropic") return "anthropic";
  if (provider === "deepseek") return "deepseek";
  if (provider === "openai") return "openai";
  const m = String(model || "").toLowerCase();
  if (/claude/.test(m)) return "anthropic";
  if (/gemini/.test(m)) return "gemini";
  if (/deepseek|reasoner|-r1\b/.test(m)) return "deepseek";
  return "openai";
}

/** 原生思考按接口类型生成的参数（还没合并附加参数） */
export function nativeParams(format, thinking) {
  switch (format) {
    case "anthropic":
      return { thinking: { type: "enabled", budget_tokens: thinking.budget } };
    case "gemini":
      return { extra_body: { google: { thinking_config: { include_thoughts: true, thinking_budget: thinking.budget } } } };
    case "deepseek":
      return {}; // deepseek-reasoner 自己就会返回 reasoning_content，不用额外参数
    default:
      return { reasoning_effort: thinking.effort };
  }
}

/** 深合并：附加参数里的对象会合并进生成的参数，标量直接覆盖 */
export function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

/**
 * 这次请求要加什么：{ mode, format, extras（并进 chat/completions 请求体）, systemAppend（追加到 system 末尾）}
 * 设置页的「最终请求预览」也用这个，保证看到的就是发出去的
 */
export function planThinking(thinking, ctx) {
  const t = { ...DEFAULT_THINKING, ...(isPlainObject(thinking) ? thinking : {}) };
  const format = resolveFormat(t, ctx);
  if (t.mode === "native") {
    let extra = {};
    try { extra = parseExtra(t.extra); } catch {}
    return { mode: t.mode, format, extras: deepMerge(nativeParams(format, t), extra), systemAppend: t.nativeStyle || "" };
  }
  if (t.mode === "cot") return { mode: t.mode, format, extras: {}, systemAppend: t.cotPrompt };
  return { mode: "off", format, extras: {}, systemAppend: "" };
}

// ---------- <think> 拆分：标签可能被切在两段流里；回复可能一开头就是没闭合的 <think> ----------
const OPEN = "<think>";
const CLOSE = "</think>";

/** buf 末尾有多长可能是 tag 的开头（要先留着，等下一段再判断） */
function partialTail(buf, tag) {
  const max = Math.min(buf.length, tag.length - 1);
  for (let n = max; n > 0; n--) if (tag.startsWith(buf.slice(-n))) return n;
  return 0;
}

export class ThinkSplitter {
  constructor() {
    this.buf = "";
    this.inThink = false;
    this.started = false;   // 已经输出过正文
    this.sawThink = false;
  }
  /** 喂一段正文增量，返回 { content, thought } */
  push(chunk) {
    this.buf += chunk;
    let content = "", thought = "";
    for (;;) {
      if (!this.inThink) {
        // 正文开头的空白先不急着发：后面可能紧跟 <think>
        if (!this.started && !this.buf.trim()) break;
        const i = this.buf.indexOf(OPEN);
        const j = this.buf.indexOf(CLOSE);
        if (j !== -1 && (i === -1 || j < i)) {
          // 没有开头只有结尾的 </think>（有些网关会吞掉开头那个）：开头之前没发过正文就当思考，否则只去掉标签
          const before = this.buf.slice(0, j);
          if (!this.started) thought += before; else content += before;
          this.buf = this.buf.slice(j + CLOSE.length).replace(/^\s+/, "");
          this.sawThink = true;
          continue;
        }
        if (i !== -1) {
          const before = this.buf.slice(0, i);
          if (this.started || before.trim()) { content += before; if (before.trim()) this.started = true; }
          this.buf = this.buf.slice(i + OPEN.length);
          this.inThink = true;
          this.sawThink = true;
          continue;
        }
        const keep = Math.max(partialTail(this.buf, OPEN), partialTail(this.buf, CLOSE));
        const out = this.buf.slice(0, this.buf.length - keep);
        if (out) {
          content += this.started ? out : out.replace(/^\s+/, "");
          if (out.trim()) this.started = true;
        }
        this.buf = this.buf.slice(this.buf.length - keep);
        break;
      } else {
        const j = this.buf.indexOf(CLOSE);
        if (j !== -1) {
          thought += this.buf.slice(0, j);
          this.buf = this.buf.slice(j + CLOSE.length).replace(/^\s+/, "");
          this.inThink = false;
          continue;
        }
        const keep = partialTail(this.buf, CLOSE);
        thought += this.buf.slice(0, this.buf.length - keep);
        this.buf = this.buf.slice(this.buf.length - keep);
        break;
      }
    }
    return { content, thought };
  }
  /** 流结束：把留着的尾巴吐出来 */
  flush() {
    const rest = this.buf;
    this.buf = "";
    if (this.inThink) return { content: "", thought: rest, unclosed: true };
    return { content: this.started ? rest : rest.replace(/^\s+/, ""), thought: "", unclosed: false };
  }
}

/** 一整段文字里去掉 <think>…</think>（历史消息、旧数据里的思考不再发回给模型） */
export function stripThink(text) {
  const s = String(text ?? "");
  if (!s.includes("<think>") && !s.includes("</think>")) return s;
  const sp = new ThinkSplitter();
  const a = sp.push(s), b = sp.flush();
  return a.content + b.content;
}

/** 上游 400 是不是在说「不认识这个参数」：只要请求里带了思考参数，400 就去掉重试一次 */
export function shouldRetryWithoutThinking(status, plan) {
  return status === 400 && plan.mode === "native" && Object.keys(plan.extras).length > 0;
}
