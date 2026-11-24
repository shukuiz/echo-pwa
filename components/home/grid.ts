// 桌面网格：稠密排布、翻页（手指 1:1，rAF 写 transform，松手按速度/距离吸附）、长按编辑、拖动重排、贴边翻页
// 和 v3 原型同一套算法；DOM 由 React 渲染，位置由这里直接写 style.transform（不经过 React，拖动时零重渲染）
import type { HomeItem } from "@/lib/beauty";
import { engine, Entry, Rect } from "@/components/glass/engine";

type Cell = { el: HTMLElement; g: HTMLElement; bx: number; by: number; ox: number; oy: number; w: number; h: number };
type Pos = { p: number; r: number; c: number; w: number; h: number; k: number };
type Press = { el: HTMLElement | null; id: string | null; empty: boolean; x0: number; y0: number; moved: boolean; long: boolean; t?: ReturnType<typeof setTimeout> };
type Drag = { el: HTMLElement; id: string; offX: number; offY: number; cx: number; cy: number; x: number; y: number; t: string; last: number; lastKey: string; edgeT: ReturnType<typeof setTimeout> | 0; edgeDir: number; onSettle: (() => void) | null };

export type GridCallbacks = {
  tap: (id: string) => void;
  longPress: () => void;
  emptyTap: () => void;
  commit: (items: HomeItem[]) => void;
  pageChange?: (n: number) => void;
};

// 吸附曲线：和原来 CSS 的 cubic-bezier(.22,.8,.26,1) 一样，但改成每帧由 JS 算——DOM 和玻璃在同一帧写同一个值，
// 不再从 getComputedStyle 读 CSS 过渡的"当前值"（iOS 上合成线程跑得比主线程快，读到的是旧值 → 玻璃横向落后）
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const f = (a: number, b: number, t: number) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
  return (x: number) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) { const v = f(x1, x2, t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return f(y1, y2, t);
  };
}
const SNAP_EASE = bezier(0.22, 0.8, 0.26, 1), SNAP_MS = 280;

const RM = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export class HomeGrid {
  items: HomeItem[] = [];
  editing = false;
  G = { W: 390, pad: 16, cg: 16, cw: 77.5, rp: 93.5, top: 6, rpp: 7, pages: 1, pos: {} as Record<string, Pos>, occ: [] as (string | null)[][], cells: [] as Cell[], px: 0, py: 48, animUntil: 0 };
  // xNow = 这一帧 .pages 实际的 translateX（玻璃就用它）；anim = JS 吸附动画
  PG = { cur: 0, x: 0, xNow: 0, want: 0 as number | null, anim: null as null | { from: number; to: number; t0: number }, sw: null as null | { x0: number; base: number; pts: [number, number][] } };
  press: Press | null = null;
  drag: Drag | null = null;
  private off: (() => void)[] = [];

  constructor(public pager: HTMLElement, public pages: HTMLElement, public dots: HTMLElement, public cb: GridCallbacks) {}

  attach() {
    const { pager, pages } = this;
    const on = <K extends keyof WindowEventMap>(t: EventTarget, ev: K | string, f: (e: never) => void, o?: AddEventListenerOptions) => {
      t.addEventListener(ev, f as EventListener, o); this.off.push(() => t.removeEventListener(ev, f as EventListener, o));
    };
    on(pager, "pointerdown", this.onDown);
    on(window, "pointermove", this.onMove, { passive: true });
    on(window, "pointerup", this.onUp);
    on(window, "pointercancel", this.onCancel);
    // 拖动/翻页时阻止 iOS 自己滚动或回弹（touch-action 在手势中途改不了，靠这里兜底）
    on(document, "touchmove", (e: TouchEvent) => { if (this.drag || this.PG.sw || (this.press && !this.press.empty && (this.press.long || this.editing))) e.preventDefault(); }, { passive: false });
    on(document, "contextmenu", (e: MouseEvent) => { if ((e.target as Element)?.closest?.(".pager")) e.preventDefault(); });
    on(window, "resize", () => this.layout(true));
    on(window, "orientationchange", () => this.layout(true));
    if (window.visualViewport) on(window.visualViewport, "resize", () => this.layout(true));
    on(window, "pageshow", () => this.layout(true));
    // 容器尺寸变了（iOS 主屏启动后视口高度会变、安全区到位）→ 重排；只在尺寸真的变时才排
    if (typeof ResizeObserver !== "undefined") {
      let w0 = -1, h0 = -1;
      const ro = new ResizeObserver(() => { const w = pager.clientWidth, h = pager.clientHeight; if (w !== w0 || h !== h0) { w0 = w; h0 = h; this.layout(true); } });
      ro.observe(pager); this.off.push(() => ro.disconnect());
    }
    // 字体到了字宽会变：等 fonts.ready / 每次字体加载完再排一次（代替原来的 300ms 定时器）
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts) {
      let alive = true; this.off.push(() => { alive = false; });
      fonts.ready.then(() => { if (alive) this.layout(true); }).catch(() => {});
      on(fonts, "loadingdone", () => this.layout(true));
    }
    this.off.push(engine.addTicker(this.tick));
    engine.setHome({ entries: this.entries, dragged: this.dragged, restRect: this.restRect, sync: this.sync });
    this.off.push(() => engine.setHome(null));
  }
  detach() { this.off.forEach((f) => f()); this.off = []; this.PG.anim = null; if (this.press?.t) clearTimeout(this.press.t); }

  private el(id: string) { return this.pages.querySelector<HTMLElement>(`.it[data-id="${CSS.escape(id)}"]`); }

  // ---------- 排布 ----------
  dims(it: HomeItem): [number, number] {
    if (it.kind === "app") return [1, 1];
    return it.size === "s" ? [2, 2] : it.size === "m" ? [4, 2] : [4, Math.min(4, this.G.rpp)];
  }
  pack(items: HomeItem[]) {
    const G = this.G, occ: (string | null)[][] = [], pos: Record<string, Pos> = {}, per = G.rpp * 4;
    for (const it of items) {
      const [w, h] = this.dims(it);
      for (let k = 0; k < 4000; k++) {
        const p = Math.floor(k / per), rem = k % per, r = Math.floor(rem / 4), c = rem % 4;
        if (c + w > 4 || r + h > G.rpp || (w === 2 && c % 2)) continue;
        const pg = occ[p] || (occ[p] = new Array(per).fill(null));
        let ok = true;
        for (let dy = 0; dy < h && ok; dy++) for (let dx = 0; dx < w; dx++) if (pg[(r + dy) * 4 + c + dx]) { ok = false; break; }
        if (!ok) continue;
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) pg[(r + dy) * 4 + c + dx] = it.id;
        pos[it.id] = { p, r, c, w, h, k }; break; // 稠密排布：后面的小件会补前面的空位
      }
    }
    return { pos, occ, pages: Math.max(1, occ.length) };
  }
  measure() {
    const G = this.G;
    G.W = this.pager.clientWidth || 390;
    const inner = G.W - G.pad * 2;
    G.cw = (inner - G.cg * 3) / 4; G.rp = G.cw + G.cg;
    const H = this.pager.clientHeight || 660;
    G.rpp = Math.max(4, Math.floor((H - G.top - 86) / G.rp) + 1);
    const pr = this.pager.getBoundingClientRect(); G.px = pr.left; G.py = pr.top;
  }
  /** 引擎重读位置前调用：重量网格原点（430 居中容器的左偏移、状态栏高度都在这里），尺寸变了就整页重排 */
  sync = () => {
    const G = this.G, pr = this.pager.getBoundingClientRect();
    if (Math.abs(pr.width - G.W) > 0.5 || this.pager.clientHeight !== this.lastH) { this.layout(true); return; }
    G.px = pr.left; G.py = pr.top;
    if (!this.drag) this.cacheCells();
  };
  private lastH = -1;
  itemBox(id: string) {
    const G = this.G, q = G.pos[id]; if (!q) return null;
    const x = q.p * G.W + G.pad + q.c * (G.cw + G.cg), y = G.top + q.r * G.rp;
    const it = this.items.find((i) => i.id === id);
    if (it?.kind === "app") return { x, y, w: G.cw, h: G.rp - 6 };
    return { x, y, w: q.w * G.cw + (q.w - 1) * G.cg, h: q.h * G.rp - G.cg };
  }
  layout(noAnim = false) {
    const G = this.G, PG = this.PG;
    this.measure(); this.lastH = this.pager.clientHeight;
    const res = this.pack(this.items); G.pos = res.pos; G.occ = res.occ; G.pages = res.pages;
    this.pages.style.width = G.pages * G.W + "px";
    for (const el of Array.from(this.pages.querySelectorAll<HTMLElement>(".it"))) {
      if (this.drag && el === this.drag.el) continue;
      const b = this.itemBox(el.dataset.id!); if (!b) continue;
      const fresh = !el.style.transform;
      if (noAnim || fresh) el.classList.add("noanim");
      el.style.width = b.w + "px"; el.style.height = b.h + "px"; el.style.transform = `translate(${b.x}px,${b.y}px)`;
      if (noAnim || fresh) { void el.offsetWidth; el.classList.remove("noanim"); }
    }
    if (PG.cur > G.pages - 1) this.goPage(G.pages - 1, true);
    else if (!PG.sw && !PG.anim) PG.want = -PG.cur * G.W;
    else if (PG.anim) PG.anim.to = -PG.cur * G.W; // 吸附途中宽度变了：终点跟着变
    if (!noAnim) G.animUntil = performance.now() + 380;
    this.cacheCells(); this.drawDots();
    engine.invalidate(); if (!noAnim) setTimeout(() => engine.invalidate(), 400); // 重排动画结束后按新位置再算一次字色
  }
  // 玻璃位置缓存：每块 = 页内格子坐标 + 玻璃在格子里的偏移（offset* 不受抖动旋转影响）
  cacheCells() {
    const G = this.G; G.cells = [];
    for (const el of Array.from(this.pages.querySelectorAll<HTMLElement>(".it"))) {
      const g = el.querySelector<HTMLElement>("[data-glass]"), b = this.itemBox(el.dataset.id!); if (!g || !b) continue;
      let ox = 0, oy = 0;
      for (let n: HTMLElement | null = g; n && n !== el; n = n.offsetParent as HTMLElement | null) { ox += n.offsetLeft; oy += n.offsetTop; }
      G.cells.push({ el, g, bx: b.x, by: b.y, ox, oy, w: g.offsetWidth, h: g.offsetHeight });
    }
  }
  drawDots() {
    const box = this.dots, G = this.G, n = G.pages > 1 ? G.pages : 0;
    if (box.children.length !== n) box.innerHTML = Array.from({ length: n }, () => "<i></i>").join("");
    Array.from(box.children).forEach((d, i) => d.classList.toggle("on", i === this.PG.cur));
  }

  // ---------- 给玻璃引擎的数据 ----------
  entries = (): Entry[] => {
    const G = this.G, PG = this.PG, out: Entry[] = [], live = performance.now() < G.animUntil, B = engine.basis, vw = B.left + (B.w || innerWidth), vh = B.top + (B.h || innerHeight);
    for (const c of G.cells) {
      if (this.drag && c.el === this.drag.el) continue;
      let x: number, y: number;
      const w = c.w, h = c.h;
      if (live) { const r = c.g.getBoundingClientRect(); x = r.left + (r.width - w) / 2; y = r.top + (r.height - h) / 2; } // 重排动画那 0.35 秒里读真实位置（这时没有在滑动）
      else { x = G.px + PG.xNow + c.bx + c.ox; y = G.py + c.by + c.oy; }
      const vis = Math.min(x + w, vw) - Math.max(x, B.left);
      if (vis <= 0 || y > vh || y + h < B.top) { c.g.removeAttribute("data-cssg"); continue; }
      out.push({ el: c.g, x, y, w, h, clip: null, vis: vis * h });
    }
    return out;
  };
  dragged = (): Entry | null => {
    const d = this.drag; if (!d) return null;
    const c = this.G.cells.find((q) => q.el === d.el); if (!c) return null;
    const sc = 1.06, G = this.G;
    const x = G.px + this.PG.xNow + d.x + c.ox - (c.w * (sc - 1)) / 2, y = G.py + d.y + c.oy - (c.h * (sc - 1)) / 2;
    c.g.removeAttribute("data-cssg");
    return { el: c.g, x, y, w: c.w * sc, h: c.h * sc, w0: c.w, clip: null };
  };
  // 元素在"它那一页摆正时"的屏幕位置：和翻页无关，所以滑动时不用重算字色
  restRect = (el: HTMLElement): Rect | null => {
    if (!this.pages.contains(el)) return null;
    const G = this.G, r = el.getBoundingClientRect(), pr = this.pages.getBoundingClientRect();
    const rx = r.left - pr.left, p = Math.max(0, Math.floor((rx + r.width / 2) / G.W));
    return { left: rx - p * G.W + G.px, top: r.top, width: r.width, height: r.height };
  };

  // ---------- 一帧：推翻页位移、钉住拖动的小组件 ----------
  tick = () => {
    const PG = this.PG; let moved = false;
    if (PG.anim) { // 吸附：这一帧的位置由曲线算出来，同时写给 DOM 和玻璃
      const a = PG.anim, k = Math.min(1, (performance.now() - a.t0) / SNAP_MS);
      PG.want = a.from + (a.to - a.from) * SNAP_EASE(k);
      if (k >= 1) { PG.want = a.to; PG.anim = null; }
      moved = true;
      if (!PG.anim) { this.setX(PG.want); PG.want = null; this.endSnap(); return true; }
    }
    if (PG.want !== null) { this.setX(PG.want); PG.want = null; moved = true; }
    if (this.drag) { this.dragTick(); moved = true; }
    if (performance.now() < this.G.animUntil) moved = true;
    return moved;
  };

  private setX(x: number) { this.pages.style.transform = `translate3d(${x}px,0,0)`; this.PG.x = x; this.PG.xNow = x; }

  goPage(n: number, instant = false) {
    const G = this.G, PG = this.PG;
    n = Math.max(0, Math.min(G.pages - 1, n));
    const changed = n !== PG.cur; PG.cur = n; this.drawDots();
    if (changed) this.cb.pageChange?.(n);
    if (instant || RM()) { PG.anim = null; PG.want = -n * G.W; engine.invalidate(); return changed; }
    PG.anim = { from: PG.xNow, to: -n * G.W, t0: performance.now() }; PG.want = null;
    engine.invalidate(); // 叫醒引擎的 rAF，动画由 tick 推
    return changed;
  }
  endSnap() {
    this.PG.anim = null;
    engine.invalidate(); // 停下来的这一帧一定重画（关了水波动画时以前会停在过渡途中的旧位置）
    if (this.drag?.onSettle) this.drag.onSettle();
  }
  private rubber = (d: number) => (1 - 1 / ((d * 0.55) / this.G.W + 1)) * this.G.W; // 边缘阻尼，越拉越沉
  swStart(e: PointerEvent, x0?: number) {
    const PG = this.PG;
    if (PG.anim) { PG.anim = null; this.setX(PG.xNow); } // 吸附中又按住：从当前位置接着拖
    PG.sw = { x0: x0 ?? e.clientX, base: PG.x, pts: [[e.timeStamp, e.clientX]] };
    try { this.pager.setPointerCapture(e.pointerId); } catch {}
  }
  swMove(e: PointerEvent) {
    const PG = this.PG, sw = PG.sw!, min = -(this.G.pages - 1) * this.G.W;
    let x = sw.base + e.clientX - sw.x0;
    if (x > 0) x = this.rubber(x); else if (x < min) x = min - this.rubber(min - x);
    PG.want = x;
    sw.pts.push([e.timeStamp, e.clientX]);
    while (sw.pts.length > 2 && e.timeStamp - sw.pts[0][0] > 100) sw.pts.shift();
  }
  swEnd(e: PointerEvent | null) {
    const PG = this.PG, sw = PG.sw; PG.sw = null; if (!sw) return;
    // 速度只看最后 100ms 的移动；手指停住超过 60ms 再抬起 = 不算轻扫
    const a = sw.pts[0], b = sw.pts[sw.pts.length - 1], dt = b[0] - a[0];
    const held = e && e.timeStamp - b[0] > 60, v = dt > 0 && !held ? (b[1] - a[1]) / dt : 0;
    const x = PG.want ?? PG.x, p = -x / this.G.W; let n: number;
    if (Math.abs(v) > 0.3) n = v < 0 ? Math.floor(p + 0.001) + 1 : Math.ceil(p - 0.001) - 1;   // 轻扫：按方向翻
    else { const d = p - PG.cur; n = d > 0.35 ? PG.cur + 1 : d < -0.35 ? PG.cur - 1 : PG.cur; } // 慢拖：过 35% 才翻
    n = Math.max(PG.cur - 1, Math.min(PG.cur + 1, n));
    this.goPage(n);
  }

  // ---------- 手势 ----------
  private onDown = (e: PointerEvent) => {
    if (e.button > 0 || !e.isPrimary) return;
    const t = e.target as Element;
    if (t.closest(".del")) return;
    const el = t.closest<HTMLElement>(".it");
    this.press = { el, id: el?.dataset.id ?? null, empty: !el, x0: e.clientX, y0: e.clientY, moved: false, long: false };
    if (this.PG.anim) { this.press.moved = true; this.swStart(e); return; } // 吸附中按住 = 接住页面
    if (el) this.press.t = setTimeout(() => {
      const p = this.press; if (!p || p.moved) return; p.long = true;
      if (!this.editing) { this.editing = true; this.cb.longPress(); try { navigator.vibrate?.(12); } catch {} }
    }, 500);
  };
  private onMove = (e: PointerEvent) => {
    if (this.drag) { this.moveDrag(e); return; }
    if (this.PG.sw) { this.swMove(e); return; }
    const p = this.press; if (!p) return;
    const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
    if (Math.hypot(dx, dy) <= 7) return;
    p.moved = true; clearTimeout(p.t);
    if (!p.empty && (this.editing || p.long)) { this.startDrag(e); return; }   // 编辑中拖小组件
    if (Math.abs(dx) > Math.abs(dy)) { this.swStart(e, p.x0); this.swMove(e); } // 横向 = 翻页，从按下点 1:1 跟手
    else this.press = null;                                                     // 竖向：主页不滚动，放掉
  };
  private onUp = (e: PointerEvent) => {
    if (this.drag) { this.endDrag(); this.press = null; return; }
    if (this.PG.sw) { this.swEnd(e); this.press = null; return; }
    const p = this.press; if (!p) return;
    clearTimeout(p.t); this.press = null;
    if (p.empty) { if (this.editing && !p.moved && (e.target as Element)?.closest?.(".pager")) this.cb.emptyTap(); return; }
    if (p.moved || p.long || !p.id) return;
    this.cb.tap(p.id);
  };
  private onCancel = () => {
    if (this.press?.t) clearTimeout(this.press.t);
    this.press = null;
    if (this.PG.sw) this.swEnd(null);
    if (this.drag) this.endDrag();
  };

  startDrag(e: PointerEvent) {
    const p = this.press!, el = p.el!, r = el.getBoundingClientRect(); // .it 本身不旋转（抖动在 .jig 上）
    this.drag = { el, id: p.id!, offX: e.clientX - r.left, offY: e.clientY - r.top, cx: e.clientX, cy: e.clientY, x: 0, y: 0, t: "", last: 0, lastKey: "", edgeT: 0, edgeDir: 0, onSettle: null };
    el.classList.add("dragging");
    this.moveDrag(e); this.dragTick();
  }
  // 每帧把拖着的小组件钉在手指下：翻页动画中页面在动，它不跟着跑
  dragTick() {
    const d = this.drag!, G = this.G;
    d.x = d.cx - G.px - this.PG.xNow - d.offX; d.y = d.cy - G.py - d.offY;
    const t = `translate(${d.x}px,${d.y}px)`; if (t !== d.t) { d.el.style.transform = t; d.t = t; }
  }
  moveDrag(e: PointerEvent) {
    const d = this.drag!, G = this.G;
    d.cx = e.clientX; d.cy = e.clientY;
    // 贴边停 0.6 秒翻到隔壁页；一直停着就继续翻
    const dir = e.clientX < G.px + 26 ? -1 : e.clientX > G.px + G.W - 26 ? 1 : 0;
    if (dir !== d.edgeDir) { clearTimeout(d.edgeT as ReturnType<typeof setTimeout>); d.edgeDir = dir; d.edgeT = dir ? setTimeout(() => this.edgeFlip(), 600) : 0; }
    this.hitTest();
  }
  edgeFlip() {
    const d = this.drag; if (!d) return; d.edgeT = 0;
    const n = this.PG.cur + d.edgeDir;
    if (n < 0 || n >= this.G.pages) {
      // 最后一页往右贴边：多开一页，把它放过去
      if (n === this.G.pages && d.edgeDir > 0) { this.G.pages++; this.pages.style.width = this.G.pages * this.G.W + "px"; this.drawDots(); }
      else return;
    }
    d.lastKey = "";
    d.onSettle = () => {
      const dd = this.drag; if (!dd) return; dd.onSettle = null; dd.lastKey = ""; dd.last = 0; this.hitTest();
      if (dd.edgeDir) dd.edgeT = setTimeout(() => this.edgeFlip(), 600);
    };
    this.goPage(n); if (!this.PG.anim) d.onSettle?.();
  }
  hitTest() {
    const d = this.drag!, G = this.G, PG = this.PG;
    const lx = d.cx - G.px + PG.cur * G.W, ly = d.cy - G.py;   // 按目标页算格子，不等动画
    const p = Math.max(0, Math.min(G.pages - 1, Math.floor(lx / G.W)));
    const c = Math.max(0, Math.min(3, Math.floor((lx - p * G.W - G.pad + G.cg / 2) / (G.cw + G.cg))));
    const r = Math.max(0, Math.min(G.rpp - 1, Math.floor((ly - G.top) / G.rp)));
    const key = `${p}-${r}-${c}`, now = performance.now();
    if (key === d.lastKey || now - d.last < 200) return;
    d.lastKey = key;
    const tgt = G.occ[p] && G.occ[p][r * 4 + c];
    const from = this.items.findIndex((i) => i.id === d.id);
    let to: number;
    if (tgt && tgt !== d.id) to = this.items.findIndex((i) => i.id === tgt);
    else if (!tgt) { // 空格：放到这格之前最后一个之后
      const L = p * G.rpp * 4 + r * 4 + c; let best = -1;
      this.items.forEach((it, i) => { const q = G.pos[it.id]; if (it.id !== d.id && q && q.p * G.rpp * 4 + q.r * 4 + q.c < L) best = Math.max(best, i); });
      to = best + (best >= from ? 0 : 1);
    } else return;
    if (to === from || to < 0) return;
    const items = this.items.slice(); const [m] = items.splice(from, 1); items.splice(to, 0, m);
    this.items = items;
    d.last = now; this.layout();
  }
  endDrag() {
    const d = this.drag!; this.drag = null; clearTimeout(d.edgeT as ReturnType<typeof setTimeout>);
    d.el.classList.remove("dragging");
    const b = this.itemBox(d.id); if (b) d.el.style.transform = `translate(${b.x}px,${b.y}px)`;
    this.layout();
    this.cb.commit(this.items);
  }
}
