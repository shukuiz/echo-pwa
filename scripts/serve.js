// 单端口发布入口：在本机启动轻量后端 + Next 前端，公网只暴露 Next 端口。
// Next 通过 rewrites 把 /api/* 转发给本机后端，浏览器侧不接触后端地址和 Key。
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT, "backend");
const BACKEND_PORT = Number(process.env.ECHO_BACKEND_PORT || 8788);
const PUBLIC_PORT = Number(process.env.PORT || 3000);

let backend = null;
let frontend = null;
let stopping = false;

function pipe(prefix, stream, target) {
  stream.on("data", (chunk) => target.write(`[${prefix}] ${chunk}`));
}

function startBackend() {
  backend = spawn(process.execPath, [path.join(BACKEND_DIR, "server.js")], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      ECHO_PORT: String(BACKEND_PORT),
      ECHO_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipe("backend", backend.stdout, process.stdout);
  pipe("backend", backend.stderr, process.stderr);
  backend.on("exit", (code) => {
    if (!stopping) {
      console.error(`[backend] 意外退出，代码 ${code}`);
      shutdown(code || 1);
    }
  });
}

function waitHealth(retries = 50) {
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      const req = http.get(
        { host: "127.0.0.1", port: BACKEND_PORT, path: "/api/health", timeout: 1000 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else again(left);
        }
      );
      req.on("error", () => again(left));
      req.on("timeout", () => {
        req.destroy();
        again(left);
      });
      const again = (n) => {
        if (n <= 0) reject(new Error("后端健康检查超时"));
        else setTimeout(() => attempt(n - 1), 200);
      };
    };
    attempt(retries);
  });
}

function startFrontend() {
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  frontend = spawn(
    process.execPath,
    [nextBin, "start", "-p", String(PUBLIC_PORT), "-H", "0.0.0.0"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PUBLIC_PORT),
        HOSTNAME: "0.0.0.0",
        ECHO_BACKEND_PORT: String(BACKEND_PORT),
      },
      stdio: "inherit",
    }
  );
  frontend.on("exit", (code) => {
    if (!stopping) shutdown(code || 0);
  });
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  try { frontend && frontend.kill(); } catch {}
  try { backend && backend.kill(); } catch {}
  process.exit(code);
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

(async () => {
  startBackend();
  await waitHealth();
  console.log(`[serve] 后端就绪 ${BACKEND_PORT}，启动前端 ${PUBLIC_PORT}`);
  startFrontend();
})().catch((err) => {
  console.error(`[serve] 启动失败：${err.message}`);
  shutdown(1);
});
