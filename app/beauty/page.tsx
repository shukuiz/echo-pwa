"use client";

// 美化：风格、色调、字体颜色、小组件、玻璃、气泡、字体、壁纸、动效
import dynamic from "next/dynamic";

const BeautyPage = dynamic(() => import("@/components/beauty/BeautyPage"), {
  ssr: false,
  loading: () => <div className="min-h-dvh" />,
});

export default function Page() {
  return <BeautyPage />;
}
