// echo 的「小动作」：模型在回复末尾写一行暗号，前端剥掉暗号并执行
// [[echo:voice]] / [[echo:shot:mine|echo]] / [[echo:memory:kind|标题|内容]] / [[echo:file:名字]] + ```代码块```
export type EchoAction =
  | { kind: "voice" }
  | { kind: "shot"; who: "mine" | "echo"; count?: number }
  | { kind: "memory"; memKind: "scene" | "event" | "preference" | "persona"; title: string; text: string }
  | { kind: "file"; name: string; content: string };

const MEM_KINDS = ["scene", "event", "preference", "persona"] as const;
type MemKind = (typeof MEM_KINDS)[number];
const isMemKind = (v: string): v is MemKind => (MEM_KINDS as readonly string[]).includes(v);

const MARK = /^[ \t]*\[\[echo:(voice|shot|memory|file)(?::([^\]]*))?\]\][ \t]*$/;

/** 解析回复里的小动作。没有暗号时原样返回，零副作用 */
export function parseEchoActions(raw: string): { text: string; actions: EchoAction[] } {
  const src = String(raw || "");
  if (!src.includes("[[echo:")) return { text: src, actions: [] };

  const lines = src.split("\n");
  const kept: string[] = [];
  const actions: EchoAction[] = [];

  for (let i = 0; i < lines.length; i++) {
    const hit = lines[i].match(MARK);
    if (!hit) {
      kept.push(lines[i]);
      continue;
    }
    const kind = hit[1];
    const payload = (hit[2] || "").trim();

    if (kind === "voice") {
      actions.push({ kind: "voice" });
      continue;
    }
    if (kind === "shot") {
      const [rawWho, rawCount] = payload.split(":");
      const who = rawWho.trim() === "mine" ? "mine" : "echo";
      const parsedCount = rawCount === undefined ? undefined : Number.parseInt(rawCount.trim(), 10);
      const count = Number.isInteger(parsedCount) ? Math.max(1, Math.min(30, parsedCount as number)) : undefined;
      actions.push({ kind: "shot", who, ...(count === undefined ? {} : { count }) });
      continue;
    }
    if (kind === "memory") {
      const [rawKind, rawTitle, ...rest] = payload.split("|");
      const k = rawKind.trim();
      const memKind = isMemKind(k) ? k : "scene";
      const title = (rawTitle || "").trim().slice(0, 40) || "刚刚聊到的事";
      const text = rest.join("|").trim().slice(0, 800) || title;
      actions.push({ kind: "memory", memKind, title, text });
      continue;
    }
    // file：后面紧跟的第一个 ``` 代码块就是正文，没有就整条忽略
    const name = payload.replace(/[\\/:*?"<>|\s]/g, "").slice(0, 60) || "echo.md";
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (!lines[j]?.trim().startsWith("```")) continue;
    const body: string[] = [];
    let k = j + 1;
    for (; k < lines.length; k++) {
      if (lines[k].trim().startsWith("```")) break;
      body.push(lines[k]);
    }
    if (k >= lines.length) continue; // 代码块没闭合，别把后面的话吃掉
    actions.push({ kind: "file", name, content: body.join("\n") });
    i = k;
  }

  return {
    text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd(),
    actions,
  };
}
