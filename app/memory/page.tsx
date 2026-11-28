"use client";

// 记忆本：对齐 Serein 的场景 / 事件 / 喜好 + 人设，列表、筛选、搜索、编辑、召回测试
import dynamic from "next/dynamic";

const MemoryBook = dynamic(() => import("@/components/memory/MemoryBook"), {
  ssr: false,
  loading: () => <div className="min-h-dvh" />,
});

export default function Page() {
  return <MemoryBook />;
}
