"use client";

// 有壁纸 + 玻璃标题栏的子页面外壳（记忆本、收藏本）：和美化页一样的 .bpage 结构，
// 顶部让出 iOS 安全区，标题栏交给 WebGL 画，列表卡片用 CSS 玻璃（不占 WebGL 名额，滚动不重画）
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useGlassRect } from "./hooks";
import { GIcon, WallScreen } from "./Wall";

export default function GlassPage({ title, sub, right, children, footer, className = "", onBack }: {
  title: string; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; className?: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);
  useGlassRect(barRef, true);
  const back = onBack ?? (() => (window.history.length > 1 ? router.back() : router.push("/")));
  return (
    <WallScreen gl fixed className={`bpage gpage ${className}`}>
      <div className="top">
        <div ref={barRef} className="g wbar" data-glass data-tint="0.08">
          <button className="back" aria-label="返回" onClick={back}><GIcon n="back" s={20} /></button>
          <div className="ttl"><b>{title}</b>{sub}</div>
          {right}
        </div>
      </div>
      <div className="bscroll" data-gclip>{children}</div>
      {footer}
    </WallScreen>
  );
}
