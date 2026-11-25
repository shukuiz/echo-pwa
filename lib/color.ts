// 颜色工具 + 自动字色（按 WCAG 对比度挑深/浅字）
export type RGB = [number, number, number];

export const hex2rgb = (h: string): RGB => {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export const lum = (rgb: RGB) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const contrast = (a: RGB, b: RGB) => { const x = lum(a) + 0.05, y = lum(b) + 0.05; return x > y ? x / y : y / x; };

export const DARK = "#26303d";
const INK_D: RGB = [38, 48, 61];
const INK_L: RGB = [251, 253, 255];

/** 跨亮暗交界的元素：按上/中/下三段分别算，挑"最差那段也最清楚"的字色 */
export function inkOfBands(bands: RGB[], glassy = false): "d" | "l" {
  const lo = (ink: RGB) => Math.min(...bands.map((b) => contrast(ink, b)));
  return lo(INK_D) >= lo(INK_L) * (glassy ? 1.15 : 1) ? "d" : "l";
}

/** 一套字色变量：深/浅字，底越透明阴影越重 */
export function inkSet(ink: "d" | "l", a: number, glassy: boolean): Record<string, string> {
  const d = ink === "d", soft = glassy || a < 0.65;
  return {
    "--g-ink": d ? DARK : "#fbfdff",
    "--g-mute": d ? "rgba(38,48,61,.66)" : "rgba(245,249,255,.82)",
    "--g-tsh": d ? (soft ? "0 0 6px rgba(255,255,255,.55)" : "none") : glassy ? "0 1px 6px rgba(20,40,70,.42)" : soft ? "0 1px 3px rgba(10,20,35,.42)" : "none",
    "--g-rose": d ? "var(--hl-text-d)" : "var(--hl-text-l)",
    "--g-chip": d ? "rgba(38,48,61,.09)" : "rgba(255,255,255,.2)",
    "--g-chipon": d ? DARK : "rgba(255,255,255,.92)",
    "--g-chiponink": d ? "#fff" : "#4f7393",
    "--g-tdbg": "var(--hl)",
    "--g-tdink": "var(--hl-ink)",
  };
}

/** 「字体颜色 · 自定义」：字就是选的颜色，阴影按它和身后底色的对比度补 */
export const isDarkInk = (hex: string) => lum(hex2rgb(hex)) < 0.2;
export function inkSetCustom(hex: string, under: RGB[], glassy: boolean): Record<string, string> {
  const c = hex2rgb(hex), d = isDarkInk(hex);
  const lo = under.length ? Math.min(...under.map((u) => contrast(c, u))) : 7;
  const weak = lo < 3, need = lo < 4.5 || glassy;
  const base = inkSet(d ? "d" : "l", 1, glassy);
  return {
    ...base,
    "--g-ink": hex,
    "--g-mute": `rgba(${c.join(",")},.74)`,
    "--g-tsh": d
      ? weak ? "0 0 4px rgba(255,255,255,.85), 0 0 10px rgba(255,255,255,.6)" : need ? "0 0 6px rgba(255,255,255,.55)" : "none"
      : weak ? "0 1px 2px rgba(10,20,35,.7), 0 0 8px rgba(10,20,35,.5)" : need ? "0 1px 6px rgba(20,40,70,.42)" : "none",
  };
}

export const WP_TSH_D = "0 0 4px rgba(255,255,255,.75), 0 0 10px rgba(255,255,255,.45)";
export const WP_TSH_L = "0 1px 2px rgba(15,30,55,.7), 0 0 8px rgba(15,30,55,.6), 0 0 16px rgba(15,30,55,.35)";

// ---------- 壁纸采样：画一次到小画布，区域平均用积分图 O(1) 取 ----------
export class Sampler {
  k = 6; W = 0; H = 0; sat: Float64Array | null = null; avg: RGB = [141, 162, 177];
  build(img: HTMLImageElement, vw: number, vh: number) {
    try {
      const k = this.k, W = Math.max(8, Math.ceil(vw / k)), H = Math.max(8, Math.ceil(vh / k));
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d", { willReadFrequently: true })!;
      const iw = img.naturalWidth, ih = img.naturalHeight, sa = W / H, ia = iw / ih;
      let sx = 0, sy = 0, sw = iw, sh = ih;
      if (sa > ia) { sh = iw / sa; sy = (ih - sh) / 2; } else { sw = ih * sa; sx = (iw - sw) / 2; } // 和 CSS cover / 着色器一样居中裁切
      x.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data, sat = new Float64Array((W + 1) * (H + 1) * 3);
      for (let yy = 1; yy <= H; yy++) {
        let r = 0, g = 0, b = 0;
        for (let xx = 1; xx <= W; xx++) {
          const i = ((yy - 1) * W + xx - 1) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2];
          const o = (yy * (W + 1) + xx) * 3, u = ((yy - 1) * (W + 1) + xx) * 3;
          sat[o] = sat[u] + r; sat[o + 1] = sat[u + 1] + g; sat[o + 2] = sat[u + 2] + b;
        }
      }
      this.W = W; this.H = H; this.sat = sat;
      this.avg = this.region(0, 0, vw, vh);
    } catch { this.sat = null; }
  }
  region(l: number, t: number, w: number, h: number): RGB {
    const s = this.sat; if (!s) return this.avg;
    const k = this.k, W = this.W, H = this.H, cl = (v: number) => Math.max(0, Math.min(W, v)), ct = (v: number) => Math.max(0, Math.min(H, v));
    let x0 = cl(Math.floor(l / k)), x1 = cl(Math.ceil((l + w) / k)), y0 = ct(Math.floor(t / k)), y1 = ct(Math.ceil((t + h) / k));
    if (x1 <= x0) { x1 = Math.min(W, x0 + 1); x0 = x1 - 1; }
    if (y1 <= y0) { y1 = Math.min(H, y0 + 1); y0 = y1 - 1; }
    const n = (x1 - x0) * (y1 - y0), at = (x: number, y: number, c: number) => s[(y * (W + 1) + x) * 3 + c];
    return [0, 1, 2].map((c) => (at(x1, y1, c) - at(x0, y1, c) - at(x1, y0, c) + at(x0, y0, c)) / n) as RGB;
  }
  bands(r: { left: number; top: number; width: number; height: number }): RGB[] {
    return [0, 1, 2].map((i) => this.region(r.left, r.top + (i * r.height) / 3, r.width, r.height / 3));
  }
}

// ---------- 重点色家族：一个重点色派生出一整套同色系的颜色（统一但不单调） ----------
export type HSL = [number, number, number];
export const rgb2hex = (c: RGB) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
export function rgb2hsl([r, g, b]: RGB): HSL {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}
export function hsl2rgb([h, s, l]: HSL): RGB {
  s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100; h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
/** 压在这个底色上的字：深字还是白字，挑对比度高的那个 */
export const inkOn = (c: RGB) => (contrast(c, [23, 20, 23]) >= contrast(c, [255, 255, 255]) ? "#171417" : "#ffffff");
/** 沿亮度一步步走，直到和底色对比度够（4.5:1），走到头就用最后一步 */
function reach(hsl: HSL, bg: RGB, dir: 1 | -1, target = 4.5): RGB {
  let [h, s, l] = hsl;
  for (let i = 0; i < 40; i++) {
    const c = hsl2rgb([h, s, l]);
    if (contrast(c, bg) >= target) return c;
    l += dir * 2.5;
    if (l <= 4 || l >= 97) break;
  }
  return hsl2rgb([h, s, Math.max(4, Math.min(97, l))]);
}
const LIGHT_BG: RGB = [243, 246, 250]; // 浅玻璃 / 仿真浅底
const DARK_BG: RGB = [38, 48, 61];     // 深壁纸 / 深色玻璃

/**
 * 重点色家族（CSS 变量名 → 值）：
 * --hl 本色 / --hl-deep 深一阶 / --hl-soft 浅底 / --hl-alt 邻近色相（±18°，做点变化）/ --hl-glow 阴影光晕
 * --hl-ink 等：压在对应底色上的字色；--hl-text-d / --hl-text-l：浅底、深底上当文字用时保证 4.5:1 的版本
 */
export function accentFamily(hex: string): Record<string, string> {
  const base = hex2rgb(hex), [h, s, l] = rgb2hsl(base);
  const warm = h < 60 || h >= 300; // 暖色往黄偏一点，冷色往紫偏一点，都还是同一家
  const deep = hsl2rgb([h, Math.min(100, s + 4), Math.max(Math.min(l, 12), l - 14)]);
  const soft = hsl2rgb([h, Math.min(70, s * 0.75 + 10), 92]);
  const alt = hsl2rgb([h + (warm ? 18 : -18), Math.min(100, s + 8), Math.min(76, Math.max(40, l + 6))]);
  const alt2 = hsl2rgb([h + (warm ? -16 : 16), Math.max(20, s - 6), Math.min(80, Math.max(40, l + 8))]);
  const tD = reach([h, s, Math.min(l, 60)], LIGHT_BG, -1);
  const tL = reach([h, Math.min(100, s + 6), Math.max(l, 62)], DARK_BG, 1);
  const glow = (a: number) => `rgba(${base.map(Math.round).join(",")},${a})`;
  return {
    "--hl": rgb2hex(base), "--hl-rgb": base.map(Math.round).join(" "),
    "--hl-ink": inkOn(base),
    "--hl-deep": rgb2hex(deep), "--hl-deep-ink": inkOn(deep),
    "--hl-soft": rgb2hex(soft), "--hl-soft-ink": rgb2hex(tD),
    "--hl-alt": rgb2hex(alt), "--hl-alt-ink": inkOn(alt),
    "--hl-alt2": rgb2hex(alt2), "--hl-alt2-ink": inkOn(alt2),
    "--hl-glow": glow(0.5), "--hl-glow-soft": glow(0.25),
    "--hl-text-d": rgb2hex(tD), "--hl-text-l": rgb2hex(tL),
  };
}
