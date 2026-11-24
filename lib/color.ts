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
    "--g-rose": d ? "#b42652" : "#ffc6d6",
    "--g-chip": d ? "rgba(38,48,61,.09)" : "rgba(255,255,255,.2)",
    "--g-chipon": d ? DARK : "rgba(255,255,255,.92)",
    "--g-chiponink": d ? "#fff" : "#4f7393",
    "--g-tdbg": d ? "#c42d5a" : "#ffc2d3",
    "--g-tdink": d ? "#fff" : "#5a1730",
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
