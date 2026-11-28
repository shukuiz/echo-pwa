// 把一段聊天画成一张图（纯 canvas，不引第三方库）：相册里存的「聊天截图」就是它
export type ShotMsg = { role: "user" | "echo"; text: string; at?: number };

import { inlineTr } from "./echo-actions";

const W = 750; // 画布宽（2x 屏，导出后看着清楚）
const PAD = 40;
const MAX_BUBBLE = 520;
const LINE = 46;
const FONT = '28px -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';

/** 按字符累积宽度换行：中文没有空格，只能自己量 */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of String(text || "").split("\n")) {
    let line = "";
    for (const ch of para) {
      const next = line + ch;
      if (ctx.measureText(next).width > maxWidth && line) {
        out.push(line);
        line = ch;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out.length ? out : [""];
}

/** 生成 PNG dataURL。messages 最多取最后 30 条，整图最高 4000px */
export function renderChatShot(messages: ShotMsg[], opts: { title?: string } = {}): string {
  const rows = messages.map((m) => ({ ...m, text: inlineTr(m.text) })).filter((m) => String(m.text || "").trim()).slice(-30);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画布不可用");

  // 先量一遍排版，才能定画布高度
  ctx.font = FONT;
  const laid = rows.map((m) => ({ m, lines: wrap(ctx, m.text, MAX_BUBBLE - 40) }));
  const bodyH = laid.reduce((sum, v) => sum + v.lines.length * LINE + 32 + 22, 0);
  const height = Math.min(4000, 120 + bodyH + 70);

  canvas.width = W;
  canvas.height = height;

  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, 0, W, height);

  // 顶部标题 + 日期
  ctx.fillStyle = "#222222";
  ctx.font = 'bold 26px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(opts.title || "和 echo 的聊天", PAD, 48);
  ctx.fillStyle = "#777777";
  ctx.font = '18px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(new Date().toLocaleDateString("zh-CN"), PAD, 76);

  let y = 112;
  ctx.font = FONT;
  for (const { m, lines } of laid) {
    if (y > height - 60) break;
    const textW = Math.max(...lines.map((s) => ctx.measureText(s).width), 0);
    const bw = Math.min(MAX_BUBBLE, textW + 40);
    const bh = lines.length * LINE + 28;
    const bx = m.role === "user" ? W - PAD - bw : PAD;

    ctx.beginPath();
    ctx.roundRect(bx, y, bw, bh, 26);
    ctx.fillStyle = m.role === "user" ? "#111111" : "#ffffff";
    ctx.fill();
    if (m.role === "echo") {
      ctx.strokeStyle = "#c9c9c9";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = m.role === "user" ? "#ffffff" : "#111111";
    lines.forEach((s, i) => ctx.fillText(s, bx + 20, y + 38 + i * LINE));
    y += bh + 22;
  }

  ctx.fillStyle = "#777777";
  ctx.font = '16px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText("echo", W - PAD - 34, height - 26);
  return canvas.toDataURL("image/png");
}
