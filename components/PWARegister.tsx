"use client";
import { useEffect } from "react";

const WORKER_URL = "/sw.js?v=4";

export async function waitForPrivateWorker() {
  if (!("serviceWorker" in navigator)) return;
  const workers = navigator.serviceWorker;
  const isSafe = () => !workers.controller || new URL(workers.controller.scriptURL).search === "?v=4";
  if (isSafe()) return;

  await workers.register(WORKER_URL);
  if (isSafe()) return;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      workers.removeEventListener("controllerchange", changed);
      reject(new Error("Echo 正在更新，请重新打开页面再登录"));
    }, 10_000);
    function changed() {
      if (!isSafe()) return;
      window.clearTimeout(timer);
      workers.removeEventListener("controllerchange", changed);
      resolve();
    }
    workers.addEventListener("controllerchange", changed);
    changed();
  });
}

export default function PWARegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register(WORKER_URL).catch(() => {});
    }
  }, []);
  return null;
}
