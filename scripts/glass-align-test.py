# 液态玻璃对齐测试：WebGL 画出来的玻璃块 vs DOM 元素的真实位置，误差必须 ≤ 1px（x/y/w/h 都比）
# 用法：先 `npm run build && npx next start -p 3100`，再
#   LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu python3 scripts/glass-align-test.py [输出目录] [--baseline]
# 原理：打开 /?glassdebug，引擎每画一帧都会把"这一帧画进画布的每块玻璃（换算成屏幕坐标）"和"同一时刻 DOM 的 getBoundingClientRect"
# 一起记到 window.__echoGlass.debugSnap 里；测试在各种场景下读它比对。
# --baseline：旧代码没有 debugSnap，改为从 rectF + 画布尺寸反推屏幕位置，按尺寸匹配 DOM 元素（只用来出"修之前"的数字和截图）
import asyncio, json, os, sys
from playwright.async_api import async_playwright

B = os.environ.get("ECHO_URL", "http://localhost:3100")
args = [a for a in sys.argv[1:] if not a.startswith("--")]
OUT = args[0] if args else "/tmp/glass-align"
BASELINE = "--baseline" in sys.argv
os.makedirs(OUT, exist_ok=True)
TOL = 1.0
fails, logs = [], []

# 在页面里算：每块已画玻璃的屏幕位置 vs DOM
MEASURE = r"""() => {
  const e = window.__echoGlass; if (!e) return {err: 'no engine'};
  const pg = document.querySelector('.pages'), pgx = pg ? new DOMMatrix(getComputedStyle(pg).transform).m41 : null;
  if (e.debugSnap) return {frame: e.debugSnap.frame, rows: e.debugSnap.rows, basis: e.debugSnap.basis, pagesX: pgx};
  // 旧代码：rectF 里是 innerWidth/innerHeight 坐标，着色器按 uDpr = canvas.width / innerWidth 换算
  const cv = document.getElementById('g-canvas'), cr = cv.getBoundingClientRect();
  const uDpr = cv.width / innerWidth, kx = cr.width / cv.width, ky = cr.height / cv.height;
  const n = e.lastN ?? 16, drawn = [];
  for (let i = 0; i < n; i++) { const r = e.rectF.slice(i*4, i*4+4); if (!r[2]) continue;
    drawn.push({x: cr.left + r[0]*uDpr*kx, y: cr.top + r[1]*uDpr*ky, w: r[2]*uDpr*kx, h: r[3]*uDpr*ky}); }
  const rows = [];
  for (const el of document.querySelectorAll('.bty .g[data-glass]')) {
    if (el.hasAttribute('data-cssg')) continue;
    const d = el.getBoundingClientRect(); if (!d.width || d.bottom < 0 || d.top > innerHeight || d.right < 0 || d.left > innerWidth) continue;
    let best = null, bd = 1e9;
    for (const q of drawn) { const dd = Math.abs(q.w - d.width) + Math.abs(q.h - d.height) + Math.abs(q.x - d.left)*0.01 + Math.abs(q.y-d.top)*0.01; if (dd < bd) { bd = dd; best = q; } }
    if (best) rows.push({id: el.closest('.it')?.dataset.id || el.className, gl: best, dom: {x: d.left, y: d.top, w: d.width, h: d.height}});
  }
  return {rows, basis: {innerW: innerWidth, innerH: innerHeight, cssW: cr.width, cssH: cr.height, bufW: cv.width, bufH: cv.height}};
}"""

async def settle(pg, ms=250):
    await pg.wait_for_timeout(ms)
    # 等引擎至少再画一帧
    await pg.evaluate("() => new Promise(r => { const e = window.__echoGlass; const f0 = e ? e.frames : 0; e && e.invalidate && e.invalidate(); let n = 0; const t = () => { if (!e || e.frames > f0 || ++n > 60) r(); else requestAnimationFrame(t); }; requestAnimationFrame(t); })")

async def check(pg, name, shot=True, m=None):
    m = m or await pg.evaluate(MEASURE)
    rows = m.get("rows", [])
    worst = 0; bad = []
    for r in rows:
        g, d = r["gl"], r["dom"]
        dev = max(abs(g["x"] - d["x"]), abs(g["y"] - d["y"]), abs(g["w"] - d["w"]), abs(g["h"] - d["h"]))
        worst = max(worst, dev)
        if dev > TOL: bad.append((r["id"], round(g["x"] - d["x"], 1), round(g["y"] - d["y"], 1), round(g["w"] - d["w"], 1), round(g["h"] - d["h"], 1)))
    ok = len(rows) > 0 and not bad
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {len(rows)} 块, 最大偏差 {worst:.2f}px, pagesX={m.get('pagesX')}" + (f", 超差 {bad[:6]}" if bad else "") + f"  basis={m.get('basis')}")
    if not ok: fails.append(name)
    if shot:
        try: await pg.screenshot(path=f"{OUT}/{name}.png", timeout=40000)
        except Exception as ex: print("  (截图超时，跳过)", str(ex)[:80])
    return m

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = await br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                   user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
        await ctx.add_init_script("try{localStorage.setItem('echo-beauty-v1',JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('echo-beauty-v1')||'{}'),{motion:0})))}catch(e){}")
        pg = await ctx.new_page(); pg.set_default_timeout(15000)
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        await pg.goto(B + "/?glassdebug"); await pg.wait_for_timeout(3000)
        st = await pg.evaluate("() => { const e = window.__echoGlass; return {frames: e.frames, css: e.cssMode, img: e.imgReady, vh100: (()=>{const d=document.createElement('div');d.style.cssText='position:fixed;height:100vh;width:100vw';document.body.appendChild(d);const r=d.getBoundingClientRect();d.remove();return [r.width,r.height]})(), inner: [innerWidth, innerHeight], vv: window.visualViewport ? [visualViewport.width, visualViewport.height, visualViewport.offsetLeft, visualViewport.offsetTop, visualViewport.scale] : null} }")
        print("state", st)
        await settle(pg)
        await check(pg, "01-initial")

        # 1) iOS 情况：innerHeight/innerWidth 和真实的 fixed 盒子（100vh/100vw）不一致，再触发 resize
        await pg.evaluate("""() => { const h = innerHeight, w = innerWidth;
          Object.defineProperty(window, 'innerHeight', {configurable: true, get: () => h - 59});
          Object.defineProperty(window, 'innerWidth', {configurable: true, get: () => w - 12});
          window.dispatchEvent(new Event('resize')); }""")
        await settle(pg, 400)
        await check(pg, "02-inner-mismatch")

        # 2) 真的改视口（工具栏出现/收起）
        await pg.set_viewport_size({"width": 390, "height": 760}); await settle(pg, 500)
        await check(pg, "03-viewport-shrink")
        await pg.set_viewport_size({"width": 390, "height": 844}); await settle(pg, 500)
        await check(pg, "04-viewport-restore")

        # 3) 宽屏：430 居中容器的左偏移
        await pg.set_viewport_size({"width": 600, "height": 844}); await settle(pg, 500)
        await check(pg, "05-wide-centered")
        await pg.set_viewport_size({"width": 390, "height": 844}); await settle(pg, 500)

        # 4) 翻页：手指拖到一半（未松手）、松手吸附中、吸附结束
        y = 600
        await pg.mouse.move(330, y); await pg.mouse.down()
        for i in range(1, 7): await pg.mouse.move(330 - i * 22, y); await pg.wait_for_timeout(20)
        await settle(pg, 80)
        await check(pg, "06-mid-swipe")
        for i in range(7, 12): await pg.mouse.move(330 - i * 22, y); await pg.wait_for_timeout(16)
        await pg.mouse.up()
        # 吸附动画中：等到 .pages 停在两页之间、且引擎在那之后画过一帧，同一个 rAF 里读
        mid = await pg.evaluate("(M) => new Promise(r => { const W = document.querySelector('.pager').clientWidth; let n = 0; const t = () => { const m = (0, eval)('(' + M + ')')(); const k = Math.abs(m.pagesX / W); if ((k > 0.05 && k < 0.95) || ++n > 200) r(m); else requestAnimationFrame(t); }; requestAnimationFrame(t); })", MEASURE)
        await check(pg, "07-mid-snap", m=mid)
        await settle(pg, 700)
        await check(pg, "08-after-swipe")
        # 翻回来
        await pg.mouse.move(60, y); await pg.mouse.down()
        for i in range(1, 12): await pg.mouse.move(60 + i * 25, y); await pg.wait_for_timeout(16)
        await pg.mouse.up(); await settle(pg, 700)
        await check(pg, "09-swipe-back")

        # 5) 换字体（霞鹜新致宋）：在美化页点，再回主页
        await pg.goto(B + "/beauty?glassdebug"); await pg.wait_for_timeout(1500)
        await pg.get_by_text("霞鹜新致宋").first.click(); await pg.wait_for_timeout(1500)
        await settle(pg, 200)
        await check(pg, "10-beauty-song")
        await pg.go_back(); await pg.wait_for_timeout(2500); await settle(pg, 300)
        await check(pg, "11-home-song")
        await pg.goto(B + "/beauty?glassdebug"); await pg.wait_for_timeout(1200)
        await pg.get_by_text("默认苹方").first.click(); await pg.wait_for_timeout(600)
        await pg.go_back(); await pg.wait_for_timeout(2000); await settle(pg, 300)
        await check(pg, "12-home-sys-font")

        print("console:", logs[:10])
        print("RESULT:", "ALL PASS" if not fails else f"FAILED {fails}")
        await br.close()
        sys.exit(1 if fails else 0)

asyncio.run(main())
