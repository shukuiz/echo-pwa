"""iPhone 液态玻璃（均衡档 + 防闪退保险）自动检查：Playwright WebKit 模拟 iPhone。
用法：先 `npm run build && PORT=3100 npm run serve`（或任意 ECHO_URL），再 python3 scripts/glass-iphone-test.py
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

URL = os.environ.get("ECHO_URL", "http://localhost:3100")
SEEN = "localStorage.setItem('echo-seen-version','9.9.9');"

async def fresh(p, init=""):
    br = await p.webkit.launch()
    ctx = await br.new_context(**p.devices["iPhone 13"], service_workers="block")
    await ctx.add_init_script(SEEN + init)
    await ctx.route("**/api/auth/session", lambda r: r.fulfill(json={"authenticated": True}))
    pg = await ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    await pg.goto(URL + "/?glassdebug", wait_until="domcontentloaded")
    await pg.wait_for_function("window.__echoGlass && window.__echoGlass.imgReady", timeout=60000)
    await pg.wait_for_timeout(800)
    return br, ctx, pg, errors

STATE = """() => { const g = window.__echoGlass, c = document.getElementById('g-canvas');
  return { quality: g.quality, gl: !!g.gl, nog: document.documentElement.classList.contains('nog'), px: c.width * c.height,
    scale: g.scale[0], uploads: g.uploads, reason: g.fallbackReason, guard: JSON.parse(localStorage.getItem('echo-glass-guard') || '{}'),
    note: document.querySelector('.glass-note')?.textContent || '' }; }"""

async def main():
    ok = True
    def check(cond, msg):
        nonlocal ok
        print(("✓ " if cond else "✗ ") + msg)
        ok = ok and cond
    async with async_playwright() as p:
        # 1) 正常打开：iPhone 默认均衡档，有 WebGL，像素和倍率在预算内，壁纸只传一次；10 秒后擦掉保险标记
        br, ctx, pg, errors = await fresh(p, "localStorage.removeItem('echo-glass-guard');")
        s = await pg.evaluate(STATE)
        check(s["quality"] == "balanced", f"iPhone 默认均衡档（{s['quality']}）")
        check(s["gl"] and not s["nog"], "iPhone 恢复 WebGL 液态玻璃")
        check(s["px"] <= 1_000_000 and s["scale"] <= 1.5, f"缓冲区 {s['px']} 像素、倍率 {s['scale']:.2f}")
        check(bool(s["guard"].get("pending")), "开 WebGL 前记下防闪退标记")
        await pg.mouse.move(340, 530); await pg.mouse.down(); await pg.mouse.move(60, 530, steps=12); await pg.mouse.up()
        await pg.wait_for_timeout(10500)
        s = await pg.evaluate(STATE)
        check(s["uploads"] == 1, f"壁纸纹理只上传一次（{s['uploads']}）")
        check(not s["guard"].get("pending") and s["guard"].get("fails") == 0, "稳定 10 秒后擦掉标记")
        check(not errors, f"没有页面错误 {errors}")
        # contextlost → CSS
        await pg.evaluate("window.__echoGlass.gl.getExtension('WEBGL_lose_context').loseContext()")
        await pg.wait_for_function("document.documentElement.classList.contains('nog')")
        await pg.wait_for_timeout(900)
        s = await pg.evaluate(STATE)
        check(s["reason"] == "lost" and "停了一下" in s["note"], "WebGL 丢失后退到 CSS 并轻提示")
        await br.close()

        # 2) 上次闪退（标记还在）：这次用 CSS + 轻提示
        br, ctx, pg, errors = await fresh(p, "if(!sessionStorage.t){sessionStorage.t=1;localStorage.setItem('echo-glass-guard', JSON.stringify({pending: 1, fails: 0}));}")
        await pg.wait_for_timeout(900)
        s = await pg.evaluate(STATE)
        check(not s["gl"] and s["nog"] and s["reason"] == "crashed", "上次闪退 → 这次用 CSS")
        check("上次液态玻璃好像让 App 退出了" in s["note"], "显示轻提示")
        check(s["guard"].get("fails") == 1 and not s["guard"].get("locked"), "记一次失败")
        await br.close()

        # 3) 连续第二次闪退：保持 CSS，直到手动选画质
        br, ctx, pg, errors = await fresh(p, "if(!sessionStorage.t){sessionStorage.t=1;localStorage.setItem('echo-glass-guard', JSON.stringify({pending: 1, fails: 1}));}")
        await pg.wait_for_timeout(900)
        s = await pg.evaluate(STATE)
        check(s["guard"].get("locked") and not s["gl"] and s["reason"] == "locked", "连续两次 → 锁定 CSS")
        await pg.goto(URL + "/beauty?glassdebug"); await pg.wait_for_timeout(1500)
        s = await pg.evaluate(STATE)
        check(not s["gl"] and s["guard"].get("locked"), "重新打开仍保持 CSS")
        await br.close()
    print("PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)

asyncio.run(main())
