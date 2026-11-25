# 美化页保存回归测试（重点：选「仿真」后能存住，重开、换一份全新本地存储后也还在）
# 用法：
#   npm run build
#   ECHO_DATA_DIR=$(mktemp -d) node backend/server.js &      # 后端 8787（用一份临时数据，别碰真数据）
#   npx next start -p 3100 &
#   python3 scripts/beauty-save-test.py [截图目录] [--webkit]
# 退出码 0 = 全部通过
import asyncio, json, os, sys, urllib.request
from playwright.async_api import async_playwright

B = os.environ.get("ECHO_URL", "http://localhost:3100")
API = os.environ.get("ECHO_API", "http://localhost:8787")
args = [a for a in sys.argv[1:] if not a.startswith("--")]
OUT = args[0] if args else "/tmp/beauty-save"
WEBKIT = "--webkit" in sys.argv
os.makedirs(OUT, exist_ok=True)
fails = []
TH = "JSON.parse(localStorage.getItem('echo-beauty-v1')||'{}').theme"
CLS = "document.documentElement.className"
VIEW = {"width": 393, "height": 852}


def ok(cond, msg):
    print(("  ✓ " if cond else "  ✗ ") + msg)
    if not cond:
        fails.append(msg)


def cloud_theme():
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(API + "/api/beauty", timeout=5) as r:
            return (json.load(r).get("beauty") or {}).get("theme")
    except Exception as e:
        return f"err {e}"


async def new_page(br, **kw):
    ctx = await br.new_context(viewport=VIEW, device_scale_factor=2, **kw)
    pg = await ctx.new_page()
    pg.on("pageerror", lambda e: fails.append(f"page error: {e}"))
    return ctx, pg


async def open_beauty(pg):
    await pg.goto(B + "/beauty")
    await pg.wait_for_selector(".grp-h", timeout=20000)
    await pg.wait_for_timeout(800)


async def pick(pg, name):
    await pg.click(f"button.opt:has-text('{name}')")
    await pg.wait_for_timeout(300)


async def main():
    async with async_playwright() as p:
        if WEBKIT:
            br = await p.webkit.launch(proxy={"server": "http://127.0.0.1:9", "bypass": "localhost,127.0.0.1"})
        else:
            br = await p.chromium.launch(args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])

        print("0) 起点：先存成液态玻璃")
        ctx, pg = await new_page(br)
        await open_beauty(pg)
        await pick(pg, "液态玻璃")
        if await pg.is_enabled(".savebar .save"):
            await pg.click(".savebar .save")
            await pg.wait_for_timeout(800)
        ok(await pg.evaluate(TH) in ("glass", None), "起点是液态玻璃")

        print("1) 分组：默认只展开「风格」，摘要对得上")
        await pg.evaluate("localStorage.removeItem('echo-beauty-open-v1')")
        await pg.reload(); await pg.wait_for_selector(".grp-h"); await pg.wait_for_timeout(600)
        opened = await pg.eval_on_selector_all(".grp", "els => els.filter(e => e.classList.contains('open')).map(e => e.dataset.group)")
        ok(opened == ["style"], f"只展开风格（实际 {opened}）")
        ok((await pg.inner_text(".grp[data-group=style] .grp-s")).strip() == "液态玻璃", "风格摘要 = 液态玻璃")
        ok(await pg.locator(".grp[data-group=glass]").count() == 1, "液态玻璃下能看到「玻璃参数」")
        await pg.screenshot(path=f"{OUT}/beauty-collapsed.png")

        print("2) 选仿真 → 标记未保存 → 右上角保存 → 刷新还是仿真")
        await pick(pg, "仿真")
        ok("未保存" in await pg.inner_text(".wbar"), "切到仿真后标题栏显示「未保存」")
        ok(await pg.is_enabled(".topsave"), "右上角保存可点")
        ok(await pg.locator(".grp[data-group=glass]").count() == 0, "仿真下「玻璃参数」整组隐藏")
        ok((await pg.inner_text(".grp[data-group=style] .grp-s")).strip() == "仿真 · 磨砂", "风格摘要 = 仿真 · 磨砂")
        await pg.click(".topsave")
        await pg.wait_for_timeout(1000)
        ok(await pg.evaluate(TH) == "real", "localStorage 里 theme = real")
        ok(cloud_theme() == "real", "云端备份 theme = real")
        await pg.reload(); await pg.wait_for_selector(".grp-h"); await pg.wait_for_timeout(800)
        cls = await pg.evaluate(CLS)
        ok("th-real" in cls and "th-glass" not in cls, f"刷新后 html 是 th-real（{cls}）")
        ok("已存" in await pg.inner_text(".topsave"), "刷新后没有未保存的改动")
        await pg.screenshot(path=f"{OUT}/beauty-real-saved.png")

        print("3) 展开状态会记住")
        await pg.click(".grp[data-group=color] .grp-h")
        await pg.wait_for_timeout(400)
        await pg.reload(); await pg.wait_for_selector(".grp-h"); await pg.wait_for_timeout(600)
        opened = await pg.eval_on_selector_all(".grp", "els => els.filter(e => e.classList.contains('open')).map(e => e.dataset.group)")
        ok("color" in opened and "style" in opened, f"刷新后风格+颜色仍展开（{opened}）")
        await ctx.close()

        print("4) 全新本地存储（像重新添加到主屏幕）→ 从云端恢复仿真")
        ctx, pg = await new_page(br)
        await pg.goto(B + "/")
        await pg.wait_for_timeout(3500)
        ok(await pg.evaluate(TH) == "real", "云端恢复后 localStorage theme = real")
        ok("th-real" in await pg.evaluate(CLS), "云端恢复后 html 是 th-real")
        await pg.reload(); await pg.wait_for_timeout(1500)
        ok("th-real" in await pg.evaluate(CLS), "再刷新：开机脚本直接读到 th-real")

        print("5) 改了再撤销 / 返回时保存")
        await open_beauty(pg)
        await pick(pg, "液态玻璃")
        ok(await pg.is_enabled(".savebar .save"), "切回液态玻璃 = 有改动")
        await pg.click(".savebar .ghost")
        await pg.wait_for_timeout(400)
        ok("th-real" in await pg.evaluate(CLS), "撤销后回到仿真")
        await pick(pg, "液态玻璃"); await pick(pg, "仿真")
        ok(not await pg.is_enabled(".savebar .save"), "切走再切回 = 没有改动")
        await pick(pg, "液态玻璃")
        await pg.click(".back"); await pg.wait_for_selector("text=保存并返回")
        await pg.click("text=保存并返回"); await pg.wait_for_timeout(1200)
        ok(await pg.evaluate(TH) == "glass", "「保存并返回」存上了液态玻璃")
        await pg.goto(B + "/"); await pg.wait_for_timeout(1500)
        ok("th-glass" in await pg.evaluate(CLS), "回桌面刷新是液态玻璃")
        await ctx.close()
        await br.close()

    print("\n" + ("全部通过 ✓" if not fails else f"失败 {len(fails)} 项：\n- " + "\n- ".join(fails)))
    sys.exit(1 if fails else 0)


asyncio.run(main())
