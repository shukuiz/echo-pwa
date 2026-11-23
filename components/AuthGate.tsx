"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, ECHO_AUTH_ENABLED, ECHO_AUTH_REQUIRED_EVENT } from "@/lib/api";
import { waitForPrivateWorker } from "./PWARegister";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const check = useCallback(async () => {
    await waitForPrivateWorker();
    const session = await api.getSession();
    if (typeof session.authenticated !== "boolean") throw new Error("无法验证 Echo 的登录状态");
    setAuthenticated(session.authenticated);
    return session.authenticated;
  }, []);

  useEffect(() => {
    if (!ECHO_AUTH_ENABLED) return;
    const expire = () => {
      setAuthenticated(false);
      setError("请重新登录");
    };
    window.addEventListener(ECHO_AUTH_REQUIRED_EVENT, expire);
    check().catch((e) => {
      setError(e.message || "无法连接 Echo 后端");
      setAuthenticated(false);
    });
    return () => window.removeEventListener(ECHO_AUTH_REQUIRED_EVENT, expire);
  }, [check]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !password) return;
    setPending(true);
    setError("");
    setPassword("");
    try {
      await waitForPrivateWorker();
      await api.login(password);
      if (!await check()) setError("浏览器没有收到登录会话，请检查 HTTPS 连接");
    } catch (e) {
      setError((e as Error).message || "登录失败");
    } finally {
      setPending(false);
    }
  }

  if (!ECHO_AUTH_ENABLED || authenticated) return children;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center px-5">
      {authenticated === null ? (
        <p role="status" className="mx-auto text-mute">正在连接 Echo…</p>
      ) : (
        <form onSubmit={login} className="block-white w-full space-y-4 rounded-[28px] p-6">
          <h1 className="text-2xl font-semibold">登录 Echo</h1>
          <label className="block text-sm">
            登录密码
            <input className="field mt-1.5" type="password" autoComplete="current-password"
              value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error && <p role="alert" className="text-sm text-rose">{error}</p>}
          <button disabled={pending || !password} className="btn-primary w-full py-3 disabled:opacity-60">
            {pending ? "正在登录…" : "登录"}
          </button>
        </form>
      )}
    </main>
  );
}
