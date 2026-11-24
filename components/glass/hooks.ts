"use client";

import { useEffect, useLayoutEffect } from "react";
import { engine } from "./engine";

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** 把一个元素交给 WebGL 画玻璃（chrome = 标题栏/Dock/输入栏这类常驻条）。位置有缓存，滚动/尺寸变化时才重读 */
export function useGlassRect(ref: React.RefObject<HTMLElement>, chrome = false, enabled = true) {
  useIso(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    engine.register(el, chrome);
    return () => engine.unregister(el);
  }, [ref, chrome, enabled]);
}

/** 当前页面要显示壁纸（gl = 这一页用 WebGL 画玻璃）；同时监听内容变化重算字色 */
export function useWall(ref: React.RefObject<HTMLElement>, gl: boolean) {
  useIso(() => {
    engine.enterWall(gl);
    return () => engine.leaveWall(gl);
  }, [gl]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mo = new MutationObserver(() => { engine.invalidate(); });
    mo.observe(el, { childList: true, subtree: true });
    engine.invalidate();
    return () => mo.disconnect();
  }, [ref]);
}
