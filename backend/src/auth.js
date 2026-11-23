import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE = "__Host-echo-session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_WINDOW_MS = 60_000;
const MAX_LOGIN_ATTEMPTS = 12;
const MAX_SESSIONS = 16;
const READ_METHODS = new Set(["GET", "HEAD"]);

function passwordHash(value) {
  return createHash("sha256").update(value).digest();
}

function sessionCookie(value, seconds) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Strict`;
}

export function installAuth(app, env = process.env) {
  const origin = env.ECHO_AUTH_ORIGIN;
  const password = env.ECHO_AUTH_PASSWORD;
  if (origin === undefined && password === undefined) return false;
  const url = URL.canParse(origin) ? new URL(origin) : null;
  if (!url || url.protocol !== "https:" || url.origin !== origin || !password || password.length < 20) {
    throw new Error("Echo 登录需设置 HTTPS 来源和至少 20 个字符的独立密码");
  }

  const expectedPassword = passwordHash(password);
  const sessions = new Map();
  let loginAttempts = 0;
  let loginWindowEnd = 0;

  function sessionId(req) {
    const value = req.headers.cookie?.split(";").map((item) => item.trim())
      .find((item) => item.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
    return /^[0-9a-f]{64}$/.test(value ?? "") ? value : "";
  }

  function authenticated(req) {
    const id = sessionId(req);
    const expires = sessions.get(id);
    if (expires > Date.now()) return true;
    sessions.delete(id);
    return false;
  }

  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0];
    if (!path.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    if (!READ_METHODS.has(req.method) && req.headers.origin !== origin) {
      return reply.code(403).send({ message: "请求来源不受信任" });
    }
    if (path === "/api/health" || path === "/api/auth/session" || path === "/api/auth/login") return;
    if (!authenticated(req)) return reply.code(401).send({ message: "请登录 Echo" });
  });

  app.get("/api/auth/session", async (req) => ({ authenticated: authenticated(req) }));

  app.post("/api/auth/login", { bodyLimit: 4096 }, async (req, reply) => {
    const now = Date.now();
    if (now >= loginWindowEnd) {
      loginAttempts = 0;
      loginWindowEnd = now + LOGIN_WINDOW_MS;
    }
    if (++loginAttempts > MAX_LOGIN_ATTEMPTS) {
      return reply.header("Retry-After", Math.ceil((loginWindowEnd - now) / 1000))
        .code(429).send({ message: "尝试次数过多，请稍后再试" });
    }
    const input = req.body?.password;
    if (typeof input !== "string" || !timingSafeEqual(passwordHash(input), expectedPassword)) {
      return reply.code(401).send({ message: "密码不正确" });
    }

    loginAttempts = 0;
    sessions.delete(sessionId(req));
    for (const [id, expires] of sessions) {
      if (expires <= now) sessions.delete(id);
    }
    if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
    const id = randomBytes(32).toString("hex");
    sessions.set(id, now + SESSION_SECONDS * 1000);
    return reply.header("Set-Cookie", sessionCookie(id, SESSION_SECONDS)).send({ ok: true });
  });

  app.post("/api/auth/logout", async (req, reply) => {
    sessions.delete(sessionId(req));
    return reply.header("Set-Cookie", sessionCookie("", 0)).send({ ok: true });
  });

  return true;
}
