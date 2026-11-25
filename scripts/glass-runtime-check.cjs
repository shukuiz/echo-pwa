// Run against a local Echo server. Point ECHO_PLAYWRIGHT at Playwright if it is not installed here.
const assert = require("node:assert/strict");
const { chromium, devices } = require(process.env.ECHO_PLAYWRIGHT || "playwright");

const url = (process.env.ECHO_URL || "http://localhost:3100") + "/?glassdebug";

// iPhone 的均衡档 / 防闪退保险由 scripts/glass-iphone-test.py（WebKit）检查

async function desktopRecovery(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block" });
  try {
    await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true } }));
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForFunction(() => window.__echoGlass?.debugSnap?.rows.length > 0);
    const measure = () => page.evaluate(() => {
      const { basis, rows } = window.__echoGlass.debugSnap;
      return {
        pixels: basis.bufW * basis.bufH,
        worst: Math.max(...rows.flatMap(({ gl, dom }) =>
          ["x", "y", "w", "h"].map((key) => Math.abs(gl[key] - dom[key])))),
      };
    });
    await page.mouse.move(332, 580);
    await page.mouse.down();
    await page.mouse.move(167, 580, { steps: 9 });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const moving = await measure();
    await page.mouse.up();
    await page.setViewportSize({ width: 390, height: 760 });
    await page.waitForFunction(() => window.__echoGlass?.debugSnap?.basis.h === 760);
    const resized = await measure();
    assert.ok(Math.max(moving.worst, resized.worst) <= 1, "glass must stay aligned to its DOM element");
    assert.ok(moving.pixels <= 1_800_000 && resized.pixels <= 1_800_000, "rasterization must stay within its original budget");
    await page.evaluate(() => window.__echoGlass.gl.getExtension("WEBGL_lose_context").loseContext());
    await page.waitForFunction(() => document.documentElement.matches(".th-glass.nog"));
    assert.equal(await page.locator("#g-canvas").evaluate((canvas) => canvas.width * canvas.height), 1);
    assert.deepEqual(errors, []);
    console.log(`Desktop: swipe offset ${moving.worst.toFixed(2)}px, resize offset ${resized.worst.toFixed(2)}px, CSS fallback after context loss`);
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.ECHO_BROWSER,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  try {
    await desktopRecovery(browser);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
