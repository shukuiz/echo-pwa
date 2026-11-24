"use client";

import dynamic from "next/dynamic";

// WebGL 画布只在浏览器里挂载
const GlassRoot = dynamic(() => import("./GlassRoot"), { ssr: false });
export default function GlassMount() {
  return <GlassRoot />;
}
