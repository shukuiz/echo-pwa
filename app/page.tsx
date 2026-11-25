"use client";

// 桌面：小组件 + 图标网格 + Dock，液态玻璃 / 仿真两种风格（设置在「美化」里）
// 用到 WebGL / IndexedDB / 当前时间，只在浏览器里渲染
import dynamic from "next/dynamic";
import ReleaseNotice from "@/components/home/ReleaseNotice";

const HomeScreen = dynamic(() => import("@/components/home/HomeScreen"), {
  ssr: false,
  loading: () => <div className="min-h-dvh" />,
});

export default function Home() {
  return <><HomeScreen /><ReleaseNotice /></>;
}
