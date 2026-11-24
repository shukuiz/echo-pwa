"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { useWall } from "./hooks";

/** 有壁纸的页面外壳：.bty 作用域里的样式（玻璃、字色）才会生效 */
export const WallScreen = forwardRef<HTMLDivElement, { gl: boolean; fixed?: boolean; className?: string; children: React.ReactNode }>(
  function WallScreen({ gl, fixed, className = "", children }, fwd) {
    const ref = useRef<HTMLDivElement>(null);
    useImperativeHandle(fwd, () => ref.current as HTMLDivElement);
    useWall(ref, gl);
    // fixed：定位交给 className 自己的 CSS（.home / .bpage 是 position:fixed）
    return <div ref={ref} className={`bty ${className}`} style={fixed ? { zIndex: 1 } : { position: "relative", zIndex: 1 }}>{children}</div>;
  }
);

const PATHS: Record<string, string> = {
  star: '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  chat: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"/>',
  book: '<path d="M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5V19c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5zM12 6v13.5"/>',
  folder: '<path d="M3.5 7A2 2 0 0 1 5.5 5H10l2 2.5h6.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.9 1.5-1.9-.4-1.2.3-2.4 1.6-2.4h1.9a3.5 3.5 0 0 0 3.5-3.5c0-5.2-3.8-9.2-8.5-9.2z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
  tool: '<path d="M14.5 4.5a4 4 0 0 0-4.8 5.3L4 15.5 6.5 18l5.7-5.7a4 4 0 0 0 5.3-4.8l-2.4 2.4-2.3-.5-.5-2.3z"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M6 12h12"/>',
  drop: '<path d="M12 3.5c3.5 4.2 6 7.6 6 10.7a6 6 0 0 1-12 0c0-3.1 2.5-6.5 6-10.7z"/><path d="M9.2 14.5a3 3 0 0 0 2.3 2.6"/>',
  phone: '<rect x="6.5" y="2.8" width="11" height="18.4" rx="3"/><path d="M10.5 18h3"/>',
  layers: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5"/>',
  type: '<path d="M5 6.5V5h14v1.5M12 5v14M9.5 19h5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
  spark: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/><path d="M18.5 16v4M16.5 18h4"/>',
  pen: '<path d="M15.5 4.5l4 4L9 19l-5 1 1-5z"/><path d="M13.5 6.5l4 4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  cal: '<rect x="3.8" y="5" width="16.4" height="15" rx="3"/><path d="M3.8 9.5h16.4M8.5 3v4M15.5 3v4"/>',
  hour: '<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 8 4.5 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 4.5-8 8.5s8 4 8 8.5"/>',
  film: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M10 9.3v5.4l4.6-2.7z"/>',
  heart: '<path d="M12 19.5s-7.5-4.6-7.5-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3c0 5-7.5 9.6-7.5 9.6z"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7"/>',
  apps: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  moon: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  type2: '<path d="M4 19l5.5-14h1L16 19M6.2 14h7.6"/><circle cx="19" cy="17" r="2.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  retry: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4"/>',
  select: '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.2l2.6 2.6 4.9-5.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  sparkle: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2.2 2.2M14.8 14.8L17 17M7 17l2.2-2.2M14.8 9.2L17 7"/>',
  archive: '<rect x="3.5" y="4.5" width="17" height="4.5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
  pin: '<path d="M9 4.5h6l-1 5 3 3H7l3-3zM12 12.5V20"/>',
  more: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  up: '<path d="M12 19V6M6.5 11.5L12 6l5.5 5.5"/>',
  down: '<path d="M12 5v13M6.5 12.5L12 18l5.5-5.5"/>',
  jump: '<path d="M14 5h5v5M19 5l-8 8M17 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4"/>',
  brain: '<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.3A3 3 0 0 0 7 17.5a2.5 2.5 0 0 0 5 .5V5.8A2 2 0 0 0 9 4.5zM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 1.5 5.3A3 3 0 0 1 17 17.5a2.5 2.5 0 0 1-5 .5"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>',
  filter: '<path d="M4.5 6h15M7.5 12h9M10.5 18h3"/>',
};

export function GIcon({ n, s = 24, w = 1.8, className }: { n: string; s?: number; w?: number; className?: string }) {
  return (
    <svg className={`i ${className || ""}`} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: PATHS[n] || "" }} />
  );
}
