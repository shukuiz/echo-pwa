"use client";

import dynamic from "next/dynamic";

const ChatCssPage = dynamic(() => import("@/components/beauty/ChatCssPage"), {
  ssr: false,
  loading: () => <div className="min-h-dvh" />,
});

export default function Page() {
  return <ChatCssPage />;
}
