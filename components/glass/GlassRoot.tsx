"use client";

// 全局只挂一份：CSS 壁纸底 + WebGL 画布，跟着美化设置和壁纸走。
// 由 layout 通过 dynamic(ssr:false) 引入，服务端不会碰 WebGL / IndexedDB。
import { useEffect, useRef } from "react";
import { useBeauty } from "@/lib/beauty";
import { blobUrl, useBlobUrl } from "@/lib/idb";
import { engine } from "./engine";

export const DEFAULT_WP = "/wallpapers/default.jpg";

export default function GlassRoot() {
  const ref = useRef<HTMLCanvasElement>(null);
  const wall = useRef<HTMLDivElement>(null);
  const { b, ready } = useBeauty();
  const userWp = useBlobUrl(ready && b.wp === "user" ? "wp:user" : undefined);

  useEffect(() => { if (ref.current && wall.current) engine.init(ref.current, wall.current); }, []);
  useEffect(() => { if (ready) engine.setLook(b); }, [b, ready]);
  useEffect(() => {
    if (!ready) return;
    if (b.wp === "user") {
      if (userWp) engine.setWallpaper(userWp);
      else blobUrl("wp:user").then((u) => { if (!u) engine.setWallpaper(DEFAULT_WP); });
    } else engine.setWallpaper(DEFAULT_WP);
  }, [b.wp, userWp, ready]);
  // 霞鹜新致宋只在选中时才下载
  useEffect(() => {
    if (!ready || b.font !== "song" || b.songOrig || document.getElementById("zhisong-face")) return;
    const st = document.createElement("style");
    st.id = "zhisong-face";
    st.textContent = `@font-face{font-family:"ZhiSong";src:url("/fonts/zhisong.woff2") format("woff2");font-display:swap;}`;
    document.head.appendChild(st);
    // 字体到了之后字形宽度会变，重新算一次布局相关的东西
    (document as Document & { fonts?: FontFaceSet }).fonts?.load('16px "ZhiSong"').then(() => engine.invalidate()).catch(() => {});
  }, [b.font, b.songOrig, ready]);

  return (
    <>
      <div id="g-wall" ref={wall} aria-hidden />
      <canvas id="g-canvas" ref={ref} aria-hidden />
    </>
  );
}
