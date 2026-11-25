// 液态玻璃引擎：一张全屏 WebGL 画布画壁纸和所有玻璃块（折射、边缘光、波动、染色、逐块裁剪/透明度/字色）
// 只在浏览器里 import（GlassRoot 用 dynamic ssr:false 挂载）。
import type { Beauty } from "@/lib/beauty";
import {
  RGB, Sampler, WP_TSH_D, WP_TSH_L, contrast, hex2rgb, inkOfBands, inkSet, inkSetCustom, isDarkInk, mix,
} from "@/lib/color";

export const MAX = 16;       // 着色器一次最多 16 块
export const GRID_CAP = 12;
const MAX_DPR = 2;               // 画布最高按 2 倍像素画（以前 1.5，玻璃边缘偏糊）
const PIXEL_BUDGET = 1_800_000;  // 画布缓冲区像素上限（以前 90 万）
const TEXTURE_CAP = 2048;        // 壁纸纹理最长边（以前 1536；上传的壁纸本来就缩到 2048）  // 桌面网格/页面内容最多 12 块，其余给 Dock/标题栏（最多 4 块），超出的走 CSS 玻璃

export type Rect = { left: number; top: number; width: number; height: number };
export type Entry = { el: HTMLElement; x: number; y: number; w: number; h: number; clip?: [number, number] | null; clipX?: [number, number]; vis?: number; w0?: number };
export type HomeProvider = {
  entries: () => Entry[];             // 网格里的玻璃（位置来自缓存，滑动时不读布局）
  dragged?: () => Entry | null;        // 正在拖的那块（总是用 WebGL，画在最上面）
  restRect: (el: HTMLElement) => Rect | null; // 元素"在它那一页摆正时"的位置：字色只和这个有关
  sync?: () => void;                   // 引擎要重读位置时先让网格重量一次自己的原点（缓存的 px/py 可能过期）
};
type Reg = { chrome: boolean; rect: DOMRect | null; clip: [number, number] | null };
/** 画布的坐标基准：画布在屏幕上的位置和大小（CSS px）。所有玻璃坐标都先减掉 left/top 再送进着色器 */
export type Basis = { left: number; top: number; w: number; h: number };
type DebugRow = { id: string; gl: { x: number; y: number; w: number; h: number }; dom: { x: number; y: number; w: number; h: number } };
type ElX = HTMLElement & { _eff?: RGB };

const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
const FS = `
precision highp float;
uniform sampler2D uTex; uniform vec2 uRes; uniform vec2 uImg; uniform vec2 uScale; uniform float uTime;
uniform vec4 uRect[${MAX}]; uniform vec4 uOpt[${MAX}]; uniform vec4 uClip[${MAX}]; uniform vec2 uPageClip; uniform int uN;
uniform float uRefract, uTint, uBlur, uEdge, uShine, uWobble;
uniform vec3 uTintCol, uMeCol;
vec2 coverUV(vec2 px){
  vec2 s = uRes / uScale; float sa = s.x/s.y, ia = uImg.x/uImg.y;
  vec2 uv = px / s;
  if (sa > ia) { float k = ia/sa; uv.y = uv.y*k + (1.-k)*.5; } else { float k = sa/ia; uv.x = uv.x*k + (1.-k)*.5; }
  return clamp(uv, .001, .999);
}
float roundBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.)) + min(max(q.x,q.y),0.) - r; }
vec3 tap(vec2 px, float bl){
  if (bl < .5) return texture2D(uTex, coverUV(px)).rgb;
  vec3 c = vec3(0.);
  for (int i=0;i<9;i++){ float a = float(i)*2.399; float rr = sqrt(float(i)/9.)*bl; c += texture2D(uTex, coverUV(px + vec2(cos(a),sin(a))*rr)).rgb; }
  return c/9.;
}
void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale; // 画布 CSS 像素，原点 = 画布左上角
  vec3 col = vec3(0.); bool glassPixel = false;
  float shadow = 0.;
  for (int i=0;i<${MAX};i++){
    if (i >= uN) break;
    vec4 R = uRect[i]; vec4 O = uOpt[i];          // O: 圆角, 额外染色, 我方气泡, 只画边框
    vec4 C = uClip[i]; if (px.y < C.x || px.y > C.y) continue; // C: 竖向裁剪上/下, 底板不透明度, 深色字
    if (O.w > 1.5 && (px.x < uPageClip.x || px.x > uPageClip.y)) continue;
    vec2 hb = R.zw*.5; vec2 c = R.xy + hb; vec2 lp = px - c;
    float r = min(O.x, min(hb.x,hb.y));
    float d = roundBox(lp, hb, r);
    if (d > 0.) { shadow = max(shadow, exp(-pow(d/7.,2.)) * .10 * smoothstep(-hb.y*.5, hb.y*.3, lp.y)); continue; }
    float inner = -d; float m = min(hb.x,hb.y);
    if (mod(O.w, 2.) > .5 && inner > 6.5) { shadow = 0.; continue; } // 照片/动图：内容不折射，只留边框和光
    float t = clamp(inner / min(m, 36.), 0., 1.);
    float e = 1.5;
    vec2 g = vec2(roundBox(lp+vec2(e,0.),hb,r)-roundBox(lp-vec2(e,0.),hb,r), roundBox(lp+vec2(0.,e),hb,r)-roundBox(lp-vec2(0.,e),hb,r));
    g = length(g) > 0. ? normalize(g) : vec2(0.);
    float bend = (uRefract * pow(1.-t, 2.2) + uRefract*.12*(1.-t)) * clamp(m/38., .45, 1.);
    vec2 off = -g * bend;
    float w = uWobble * .06 * (.35 + .65*(1.-t));
    off += vec2(sin(lp.y*.045 + uTime*.9 + R.x*.01), cos(lp.x*.05 - uTime*.7 + R.y*.01)) * w * 3.;
    vec3 gc = tap(px + off, uBlur * mix(1., .65, t));
    float op = C.z;                                  // 透明度只缩放染色/补偿，不动折射
    gc = mix(gc, uTintCol, clamp((uTint*.01 + O.y) * op, 0., .95));
    if (O.z > .5) gc = mix(gc, uMeCol, .62);
    float lum = dot(gc, vec3(.299,.587,.114));
    if (C.w < .5) gc = mix(gc, gc*vec3(.70,.78,.88), smoothstep(.55, .90, lum) * .85 * op); // 浅色字：压亮部
    else gc = mix(gc, gc*.55 + vec3(.45), smoothstep(.55, .20, lum) * .8 * op);             // 深色字：提暗部
    float ang = atan(lp.y, lp.x);
    float upperLeft = exp(-pow((ang + 2.38) / .60, 2.));
    float lowerRight = exp(-pow((ang - .76) / .62, 2.));
    gc += vec3(1.) * exp(-inner/14.) * upperLeft * uShine * .012;
    float hairline = exp(-pow((d + .55) / .62, 2.)) + exp(-pow((d + 1.6)/1.4, 2.))*.35;
    float edgeGlint = hairline * (upperLeft*.66 + lowerRight*.48) * uEdge * .04;
    gc = mix(gc, vec3(1.), clamp(edgeGlint, 0., .76));
    gc = mix(gc, vec3(1.), exp(-pow((d+.6)/.8,2.)) * .10);
    col = gc; glassPixel = true; shadow = 0.;
  }
  col *= 1. - shadow;
  gl_FragColor = glassPixel ? vec4(col, 1.) : vec4(0., 0., 0., shadow);
}`;

class GlassEngine {
  canvas: HTMLCanvasElement | null = null;
  private wall: HTMLDivElement | null = null;
  gl: WebGLRenderingContext | null = null;
  prog: WebGLProgram | null = null;
  tex: WebGLTexture | null = null;
  U: Record<string, WebGLUniformLocation | null> = {};
  noGL = true;
  rm = false;                 // prefers-reduced-motion：用 CSS 毛玻璃，不跑着色器
  img: HTMLImageElement | null = null;
  imgReady = false;
  wpUrl = "";
  sampler = new Sampler();
  look: Beauty | null = null;
  regs = new Map<HTMLElement, Reg>();
  home: HomeProvider | null = null;
  tickers = new Set<() => boolean | void>();
  walls = 0; glWalls = 0;
  rectsDirty = true; needDraw = true;
  raf = 0; adaptT = 0; lastCheck = 0;
  basis: Basis = { left: 0, top: 0, w: 0, h: 0 };
  scale: [number, number] = [1, 1]; // 缓冲区像素 / CSS 像素，横竖各算各的（不再假设 100vh == innerHeight）
  lastN = 0;
  private textureSize = { width: 1, height: 1 };
  debug = false;                    // ?glassdebug 或开发模式：每帧记录"画的位置 vs DOM 位置"给自动化测试
  debugSnap: { frame: number; basis: Basis & { bufW: number; bufH: number; canvas: Rect }; rows: DebugRow[] } | null = null;
  rad = new WeakMap<HTMLElement, number>();
  t0 = performance.now();
  frames = 0;                 // 测试用：画了多少帧
  rectF = new Float32Array(MAX * 4); optF = new Float32Array(MAX * 4); clipF = new Float32Array(MAX * 4);
  // 登记可能早于 init（子组件的 layout effect 先跑），所以观察器一开始就建好
  private ro: ResizeObserver | null = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.invalidate()) : null;

  private lastPaint = -Infinity;
  private moving = false;          // 这一帧有翻页 / 拖动在动
  private settleUntil = 0;         // 滚动、尺寸变化后的一小段时间里每帧都重读位置（惯性滚动、过渡动画）
  private lastRead = 0;
  private adaptDelay = 0;

  init(canvas: HTMLCanvasElement, wall: HTMLDivElement) {
    if (this.canvas === canvas) return;
    this.canvas = canvas;
    this.wall = wall;
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    this.rm = !!mq?.matches;
    mq?.addEventListener?.("change", (e) => { this.rm = e.matches; this.applyClasses(); this.invalidate(); });
    let gl: WebGLRenderingContext | null = null;
    // Keep the iOS glass in the same compositor layer as the element that moves.
    // iPad may identify itself as a Mac, including in an installed PWA.
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!ios) {
      try { gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, alpha: true, powerPreference: "low-power" }); } catch {}
    }
    if (gl) {
      try {
        const sh = (type: number, src: string) => {
          const s = gl!.createShader(type)!; gl!.shaderSource(s, src); gl!.compileShader(s);
          if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s) || "shader");
          return s;
        };
        const prog = gl.createProgram()!;
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
        gl.useProgram(prog);
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        for (const n of ["uTex", "uRes", "uImg", "uScale", "uTime", "uRect", "uOpt", "uClip", "uPageClip", "uN", "uRefract", "uTint", "uBlur", "uEdge", "uShine", "uWobble", "uTintCol", "uMeCol"]) this.U[n] = gl.getUniformLocation(prog, n);
        this.tex = gl.createTexture();
        this.gl = gl; this.prog = prog; this.noGL = false;
      } catch (e) {
        console.warn("WebGL 着色器失败，改用 CSS 玻璃", e);
        this.gl = null; this.noGL = true;
      }
    }
    canvas.addEventListener("webglcontextlost", () => this.useCssFallback());
    this.ro?.observe(wall);
    try { this.debug = process.env.NODE_ENV !== "production" || new URLSearchParams(location.search).has("glassdebug"); } catch {}
    this.resize();
    window.addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onResize);
    window.visualViewport?.addEventListener("resize", this.onResize);
    window.visualViewport?.addEventListener("scroll", this.onResize);
    window.addEventListener("pageshow", this.onResize);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.onResize(); });
    window.addEventListener("scroll", this.onScroll, { capture: true, passive: true });
    document.addEventListener("load", this.onAsset, true); // 图片/字体加载完，内容可能挪了
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(() => this.invalidate()).catch(() => {});
    fonts?.addEventListener?.("loadingdone", () => this.invalidate());
    this.applyClasses();
    if (this.wpUrl && !this.imgReady) this.setWallpaper(this.wpUrl, true);
    (window as unknown as { __echoGlass?: GlassEngine }).__echoGlass = this; // 调试/自动化测试用：读帧数、模式
  }

  /** CSS 模式：没有 WebGL、减弱动态效果、或仿真风格都不跑着色器 */
  get cssMode() { return this.noGL || this.rm; }

  private useCssFallback() {
    this.gl = null;
    this.tex = null;
    this.prog = null;
    this.noGL = true;
    this.applyClasses();
    this.resize();
    this.schedAdapt();
  }

  private settle() { this.settleUntil = performance.now() + 180; }
  private onResize = () => this.onScroll();
  private onScroll = () => { this.rectsDirty = true; this.needDraw = true; this.settle(); this.schedAdapt(120); this.requestFrame(); };
  private onAsset = (e: Event) => { const t = e.target as Element | null; if (t && t.tagName === "IMG" && t.closest?.(".bty")) this.invalidate(); };
  /** 用实际画布的屏幕坐标对齐玻璃，限制缓冲区像素数。 */
  private resize() {
    const cv = this.canvas, wall = this.wall;
    if (!cv || !wall) return false;
    const r = wall.getBoundingClientRect();
    const w = r.width || document.documentElement.clientWidth || innerWidth, h = r.height || document.documentElement.clientHeight || innerHeight;
    const b = this.basis, changed = b.w !== w || b.h !== h || b.left !== r.left || b.top !== r.top;
    // 清晰度：最高 2 倍、缓冲区约 180 万像素封顶（iPhone 393×852 正好跑满 2 倍 ≈ 134 万像素；大屏按预算往下缩）
    const d = this.drawable() ? Math.min(window.devicePixelRatio || 1, MAX_DPR, Math.sqrt(PIXEL_BUDGET / (w * h))) : 0;
    const bw = Math.max(1, Math.floor(w * d)), bh = Math.max(1, Math.floor(h * d));
    if (changed || cv.width !== bw || cv.height !== bh) {
      this.basis = { left: r.left, top: r.top, w, h };
      if (cv.width !== bw) cv.width = bw;
      if (cv.height !== bh) cv.height = bh;
      this.scale = [bw / w, bh / h];
      if (this.img && this.imgReady && (b.w !== w || b.h !== h)) this.sampler.build(this.img, w, h);
      this.rectsDirty = true; this.needDraw = true;
      return true;
    }
    return false;
  }
  /** 屏幕坐标（getBoundingClientRect）→ 画布坐标 */
  local(r: Rect): Rect { return { left: r.left - this.basis.left, top: r.top - this.basis.top, width: r.width, height: r.height }; }

  // ---------- 外观 ----------
  setLook(b: Beauty) {
    const prev = this.look; this.look = b;
    this.applyClasses();
    const R = document.documentElement.style, tint = hex2rgb(b.tint), me = hex2rgb(b.me);
    R.setProperty("--g-tint", tint.join(",")); R.setProperty("--g-amt", (b.P.tint * 0.01).toFixed(3)); R.setProperty("--g-me", me.join(","));
    R.setProperty("--g-fallback-blur", `${Math.min(6, b.P.blur * 1.5)}px`);
    R.setProperty("--g-icon", hex2rgb(b.icon).join(",")); R.setProperty("--g-ica", (b.iconA / 100).toFixed(2));
    R.setProperty("--g-meink", contrast([38, 48, 61], me) >= contrast([255, 255, 255], me) ? "#26303d" : "#fff");
    // 根上的值只是兜底（面板、没算到的元素）；每个元素自己的字色在 adapt() 里按它身后的实际颜色算
    const eff = mix(this.sampler.avg, tint, 0.5), glassy = b.theme === "glass";
    const set = b.inkMode === "custom" ? inkSetCustom(b.inkColor, [eff], glassy) : inkSet(inkOfBands([eff], glassy), 1, glassy);
    for (const k in set) R.setProperty(k, set[k]);
    if (!prev || prev.theme !== b.theme || prev.mat !== b.mat) this.rad = new WeakMap();
    this.needDraw = true; this.rectsDirty = true;
    this.schedAdapt(); this.schedAdapt(60);
    this.kick();
  }
  applyClasses() {
    const h = document.documentElement.classList, b = this.look;
    if (b) {
      h.toggle("th-glass", b.theme === "glass"); h.toggle("th-real", b.theme === "real");
      h.toggle("mat-solid", b.mat === "solid"); h.toggle("tintme", b.bubMode === "tint");
      h.toggle("f-song", b.font === "song" && !b.songOrig); h.toggle("f-ipa", b.font === "song" && b.songOrig);
      h.toggle("ink-custom", b.inkMode === "custom");
    }
    h.toggle("nog", this.cssMode);
    h.toggle("wall-on", this.walls > 0);
    h.toggle("wall-gl", this.glWalls > 0 && this.imgReady && !this.cssMode && b?.theme === "glass");
  }

  setWallpaper(url: string, force = false) {
    if (url === this.wpUrl && !force && this.imgReady) return;
    this.wpUrl = url;
    document.documentElement.style.setProperty("--g-wpimg", `url("${url}")`);
    if (!this.canvas) return; // init 之后再加载
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (this.wpUrl !== url) return;
      this.img = img; this.imgReady = true;
      this.resize();
      this.sampler.build(img, this.basis.w || innerWidth, this.basis.h || innerHeight);
      if (this.look) this.setLook(this.look);
      const gl = this.gl;
      if (gl && this.tex) {
        gl.bindTexture(gl.TEXTURE_2D, this.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const longest = Math.max(img.naturalWidth, img.naturalHeight);
        const limit = Math.min(TEXTURE_CAP, gl.getParameter(gl.MAX_TEXTURE_SIZE));
        let source: HTMLImageElement | HTMLCanvasElement = img;
        if (longest > limit) {
          const thumbnail = document.createElement("canvas");
          const ratio = limit / longest;
          thumbnail.width = Math.max(1, Math.round(img.naturalWidth * ratio));
          thumbnail.height = Math.max(1, Math.round(img.naturalHeight * ratio));
          const context = thumbnail.getContext("2d");
          if (!context) { this.useCssFallback(); return; }
          context.imageSmoothingQuality = "high";
          context.drawImage(img, 0, 0, thumbnail.width, thumbnail.height);
          source = thumbnail;
        }
        this.textureSize = { width: source instanceof HTMLImageElement ? source.naturalWidth : source.width, height: source instanceof HTMLImageElement ? source.naturalHeight : source.height };
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        if (gl.getError() !== gl.NO_ERROR) this.useCssFallback();
      }
      this.needDraw = true; this.schedAdapt(); this.kick();
    };
    img.onerror = () => console.warn("壁纸加载失败", url);
    img.src = url;
  }

  // ---------- 登记 ----------
  register(el: HTMLElement, chrome: boolean) {
    this.regs.set(el, { chrome, rect: null, clip: null });
    this.ro?.observe(el);
    this.invalidate();
  }
  unregister(el: HTMLElement) {
    this.regs.delete(el); this.ro?.unobserve(el);
    el.removeAttribute("data-cssg");
    this.needDraw = true;
    this.kick();
  }
  setHome(p: HomeProvider | null) { this.home = p; this.invalidate(); }
  addTicker(f: () => boolean | void) { this.tickers.add(f); this.kick(); return () => { this.tickers.delete(f); }; }
  enterWall(gl: boolean) { this.walls++; if (gl) this.glWalls++; this.applyClasses(); this.needDraw = true; this.kick(); this.schedAdapt(); }
  leaveWall(gl: boolean) { this.walls = Math.max(0, this.walls - 1); if (gl) this.glWalls = Math.max(0, this.glWalls - 1); this.applyClasses(); this.kick(); }
  invalidate() { this.rectsDirty = true; this.needDraw = true; this.settle(); this.schedAdapt(); this.kick(); }

  // ---------- 一帧只有一个 rAF：先跑翻页/拖动，再画玻璃 ----------
  requestFrame() { this.kick(); }
  private kick() { if (!this.raf && typeof window !== "undefined" && !document.hidden) this.raf = requestAnimationFrame(this.frame); }
  private frame = () => {
    this.raf = 0;
    if (document.hidden) return;
    let moving = false;
    this.tickers.forEach((f) => { if (f()) moving = true; });
    if (moving) this.needDraw = true;
    this.moving = moving;
    const drawing = this.drawable();
    const now = performance.now();
    const settling = now < this.settleUntil;
    if (drawing) {
      if (!moving && now - this.lastCheck > 500) { this.lastCheck = now; if (this.resize()) this.home?.sync?.(); }
      if (this.needDraw || settling || (this.look?.motion && now - this.lastPaint >= 33)) {
        this.needDraw = false;
        this.lastPaint = now;
        this.draw();
      }
    } else if (this.needDraw) {
      this.needDraw = false;
      this.resize();
    }
    if (moving || (drawing && (settling || this.look?.motion))) this.kick();
  };
  private drawable() {
    return !!(this.gl && this.imgReady && this.glWalls > 0 && this.look?.theme === "glass" && !this.cssMode);
  }

  private readRegs() {
    // Read positions in the same frame as movement, including compositor scroll settling.
    const now = performance.now();
    const recheck = this.moving || now < this.settleUntil || now - this.lastRead > 250;
    if (!this.rectsDirty && !recheck) return;
    this.rectsDirty = false;
    this.lastRead = now;
    this.resize();
    this.home?.sync?.();
    this.regs.forEach((r, el) => {
      r.rect = el.getBoundingClientRect();
      const ce = el.closest<HTMLElement>("[data-gclip]");
      if (ce) { const cr = ce.getBoundingClientRect(); r.clip = [cr.top, cr.bottom]; } else r.clip = null;
    });
  }
  private setCss(el: HTMLElement, on: boolean) {
    if (el.hasAttribute("data-cssg") !== on) { el.toggleAttribute("data-cssg", on); this.schedAdapt(); }
  }
  private radOf(el: HTMLElement) {
    let r = this.rad.get(el);
    if (r == null) { r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0; this.rad.set(el, r); }
    return r;
  }

  private draw() {
    const gl = this.gl!, cv = this.canvas!, b = this.look!;
    this.readRegs();
    // 下面所有 x/y 都是屏幕坐标（getBoundingClientRect 那套），写进着色器前统一减掉画布原点
    const B = this.basis, ox = B.left, oy = B.top, vw = B.w, vh = B.h, list: Entry[] = [], chrome: Entry[] = [];
    let grid: Entry[] = [];
    this.regs.forEach((r, el) => {
      const q = r.rect; if (!q || !q.width) return;
      const top = Math.max(q.top, r.clip ? r.clip[0] : -1e9), bot = Math.min(q.bottom, r.clip ? r.clip[1] : 1e9);
      const visible = bot > oy && top < oy + vh && q.right > ox && q.left < ox + vw && bot > top;
      if (!visible) { if (!r.chrome) this.setCss(el, false); return; }
      const e: Entry = { el, x: q.left, y: q.top, w: q.width, h: q.height, clip: r.clip, vis: (bot - top) * (Math.min(q.right, ox + vw) - Math.max(q.left, ox)) };
      (r.chrome ? chrome : grid).push(e);
    });
    if (this.home) grid = grid.concat(this.home.entries());
    const dragged = this.home?.dragged?.() || null;
    chrome.sort((a, z) => z.w * z.h - a.w * a.h); // 外框（Dock）先画，里面的图标后画：着色器里后面的块盖住前面的
    const chromeN = Math.min(chrome.length, MAX - GRID_CAP); // 标题栏/Dock 最多 4 块
    const room = Math.max(0, Math.min(GRID_CAP, MAX - chromeN - (dragged ? 1 : 0)));
    if (grid.length > room) grid.sort((a, z) => (z.vis || 0) - (a.vis || 0)); // 露出最多的先用 WebGL，剩下的走 CSS 玻璃
    grid.forEach((c, i) => this.setCss(c.el, i >= room));
    chrome.forEach((c, i) => this.setCss(c.el, i >= chromeN));
    list.push(...chrome.slice(0, chromeN), ...grid.slice(0, room));
    if (dragged) list.push(dragged);

    let n = 0;
    const { rectF, optF, clipF } = this;
    for (const c of list) {
      if (n >= MAX) break;
      const el = c.el, isMe = el.dataset.hue === "me";
      const tint = (+(el.dataset.tint || 0)) * (isMe && b.bubMode === "glass" ? 0.3 : 1);
      clipF.set([c.clip ? c.clip[0] - oy : -1e4, c.clip ? c.clip[1] - oy : 1e4, +(el.dataset.wa ?? 1), el.dataset.ink === "d" ? 1 : 0], n * 4);
      rectF.set([c.x - ox, c.y - oy, c.w, c.h], n * 4);
      const flags = Number(el.hasAttribute("data-rim")) + (c.clipX ? 2 : 0);
      optF.set([this.radOf(el) * (c.w / (c.w0 || c.w)), tint, isMe && b.bubMode === "tint" ? 1 : 0, flags], n * 4);
      n++;
    }
    const tint = hex2rgb(b.tint).map((v) => v / 255), me = hex2rgb(b.me).map((v) => v / 255);
    gl.viewport(0, 0, cv.width, cv.height);
    const U = this.U;
    const pageClip = list.find((entry) => entry.clipX)?.clipX;
    if (pageClip) gl.uniform2f(U.uPageClip, pageClip[0] - ox, pageClip[1] - ox);
    gl.uniform1i(U.uTex, 0); gl.uniform2f(U.uRes, cv.width, cv.height); gl.uniform2f(U.uImg, this.textureSize.width, this.textureSize.height);
    gl.uniform2f(U.uScale, this.scale[0], this.scale[1]); gl.uniform1f(U.uTime, b.motion ? (performance.now() - this.t0) / 1000 : 0);
    gl.uniform4fv(U.uRect, rectF); gl.uniform4fv(U.uOpt, optF); gl.uniform4fv(U.uClip, clipF); gl.uniform1i(U.uN, n);
    gl.uniform1f(U.uRefract, b.P.refract); gl.uniform1f(U.uTint, b.P.tint); gl.uniform1f(U.uBlur, b.P.blur);
    gl.uniform1f(U.uEdge, b.P.edge); gl.uniform1f(U.uShine, b.P.shine); gl.uniform1f(U.uWobble, b.P.wobble);
    gl.uniform3fv(U.uTintCol, tint); gl.uniform3fv(U.uMeCol, me);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.frames++; this.lastN = n;
    if (this.debug) this.snapshot(list.slice(0, n));
  }
  /** 调试：按"画布在屏幕上的真实位置 × 缓冲区换算"反推每块玻璃画在了屏幕哪里，和同一时刻的 DOM 位置放一起 */
  private snapshot(list: Entry[]) {
    const cv = this.canvas!, cr = cv.getBoundingClientRect(), kx = cr.width / cv.width, ky = cr.height / cv.height;
    const [sx, sy] = this.scale, rows: DebugRow[] = [];
    list.forEach((c, i) => {
      const f = this.rectF.subarray(i * 4, i * 4 + 4), d = c.el.getBoundingClientRect();
      const dom = { x: d.left, y: d.top, w: d.width, h: d.height }; // 拖动时 .jig 的 scale(1.06) 已经算在 DOM 框里
      rows.push({
        id: c.el.closest<HTMLElement>(".it")?.dataset.id || c.el.getAttribute("aria-label") || c.el.className,
        gl: { x: cr.left + f[0] * sx * kx, y: cr.top + f[1] * sy * ky, w: f[2] * sx * kx, h: f[3] * sy * ky },
        dom,
      });
    });
    this.debugSnap = { frame: this.frames, basis: { ...this.basis, bufW: cv.width, bufH: cv.height, canvas: { left: cr.left, top: cr.top, width: cr.width, height: cr.height } }, rows };
  }

  // ---------- 自动字色：每个元素按"底色×不透明度 叠在它身后那块壁纸上"的亮度挑深浅 ----------
  schedAdapt(delay?: number) {
    if (typeof window === "undefined") return;
    if (delay) {
      window.clearTimeout(this.adaptDelay);
      this.adaptDelay = window.setTimeout(() => this.schedAdapt(), delay);
      return;
    }
    if (!this.adaptT) this.adaptT = requestAnimationFrame(() => { this.adaptT = 0; this.adapt(); });
  }
  private shellOf(el: HTMLElement) {
    const b = this.look!, real = b.theme === "real", amt = b.P.tint * 0.01, op = +(el.dataset.wa ?? 1);
    const tint = hex2rgb(b.tint), me = hex2rgb(b.me), meOn = el.dataset.hue === "me" && b.bubMode === "tint";
    if (el.hasAttribute("data-solid")) return { col: hex2rgb(el.dataset.sbg || "#ffe3ea"), a: op, glassy: false, me: false };
    if (real && el.hasAttribute("data-icn")) return { col: hex2rgb(b.icon), a: b.iconA / 100, glassy: false, me: false };
    if (real) return meOn ? { col: me, a: 1, glassy: false, me: false } : { col: tint, a: (b.mat === "solid" ? 1 : 0.5 + amt * 0.45) * op, glassy: false, me: false };
    if (this.cssMode || el.hasAttribute("data-cssg") || !this.gl) return meOn ? { col: me, a: 0.72, glassy: false, me: false } : { col: tint, a: (0.16 + amt * 0.9) * op, glassy: true, me: false };
    const extra = (+(el.dataset.tint || 0)) * (el.dataset.hue === "me" && !meOn ? 0.3 : 1);
    return { col: tint, a: Math.min(0.95, amt + extra) * op, glassy: true, me: meOn };
  }
  private restRect(el: HTMLElement): Rect {
    return this.home?.restRect(el) || el.getBoundingClientRect();
  }
  adapt() {
    const b = this.look;
    if (!b || !this.walls || !this.sampler.sat) return;
    const real = b.theme === "real", meRGB = hex2rgb(b.me), vh = this.basis.h || innerHeight;
    for (const el of Array.from(document.querySelectorAll<ElX>(".bty .g"))) {
      if (el.hasAttribute("data-rim")) continue;
      const r = this.local(this.restRect(el)); if (!r.width || r.top > vh + 200 || r.top + r.height < -200) continue;
      const parent = el.parentElement?.closest(".g") as ElX | null;
      const unders = real && parent && parent._eff ? [parent._eff] : this.sampler.bands(r);
      const sh = this.shellOf(el);
      const effs = unders.map((u) => { const e = mix(u, sh.col, sh.a); return sh.me ? mix(e, meRGB, 0.62) : e; });
      el._eff = effs.reduce<RGB>((a, e) => [a[0] + e[0] / effs.length, a[1] + e[1] / effs.length, a[2] + e[2] / effs.length], [0, 0, 0]);
      const custom = el.dataset.hue === "me" && b.meInkMode === "custom" ? b.meInkColor : b.inkMode === "custom" ? b.inkColor : null;
      let ink: "d" | "l", vars: Record<string, string>;
      if (custom) { ink = isDarkInk(custom) ? "d" : "l"; vars = inkSetCustom(custom, effs, sh.glassy); }
      else { ink = inkOfBands(effs, sh.glassy); vars = inkSet(ink, sh.a, sh.glassy); }
      for (const k in vars) el.style.setProperty(k, vars[k]);
      if (el.dataset.ink !== ink) { el.dataset.ink = ink; this.needDraw = true; this.kick(); }
    }
    // 直接压在壁纸上的字：状态栏、图标名、时间、翻页点
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(".bty [data-onwp]"))) {
      const r = this.local(this.restRect(el)); if (!r.width) continue;
      const pg = el.parentElement?.closest(".g") as ElX | null;
      const unders = pg && pg._eff ? [pg._eff] : this.sampler.bands(r);
      let ink: string, tsh: string;
      if (b.inkMode === "custom") {
        const c = hex2rgb(b.inkColor), d = isDarkInk(b.inkColor), lo = Math.min(...unders.map((u) => contrast(c, u)));
        ink = b.inkColor; tsh = d ? (lo < 4.5 ? WP_TSH_D : "0 0 3px rgba(255,255,255,.4)") : lo < 4.5 ? WP_TSH_L : "0 1px 2px rgba(15,30,55,.45)";
      } else {
        const d = inkOfBands(unders) === "d";
        ink = d ? "#26303d" : "#fff"; tsh = d ? WP_TSH_D : WP_TSH_L;
      }
      el.style.setProperty("--g-wpink", ink); el.style.setProperty("--g-wptsh", tsh);
    }
  }
}

export const engine = new GlassEngine();
