"use client";

// 收藏本：聊天里收藏的单条 / 多条消息
import dynamic from "next/dynamic";

const FavoritesPage = dynamic(() => import("@/components/favorites/FavoritesPage"), {
  ssr: false,
  loading: () => <div className="min-h-dvh" />,
});

export default function Page() {
  return <FavoritesPage />;
}
