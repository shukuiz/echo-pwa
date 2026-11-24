import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./beauty.css";
import { StoreProvider } from "@/lib/store";
import PWARegister from "@/components/PWARegister";
import AuthGate from "@/components/AuthGate";
import { BeautyProvider, BeautySync } from "@/lib/beauty";
import GlassMount from "@/components/glass/GlassMount";

export const metadata: Metadata = {
  title: "echo",
  description: "echo · 雾灰奶白的小助手",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "echo", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#e2e0df",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 首屏前读取主题，避免闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=JSON.parse(localStorage.getItem('echo-pwa-state-v3')||'{}');if(s.theme==='dark')document.documentElement.classList.add('dark')}catch(e){}try{var b=JSON.parse(localStorage.getItem('echo-beauty-v1')||'{}'),c=document.documentElement.classList;c.add(b.theme==='real'?'th-real':'th-glass');if(b.font==='song')c.add(b.songOrig?'f-ipa':'f-song')}catch(e){}`,
          }}
        />
      </head>
      <body>
        <BeautyProvider>
          <GlassMount />
          <AuthGate><StoreProvider><BeautySync />{children}</StoreProvider></AuthGate>
        </BeautyProvider>
        <PWARegister />
      </body>
    </html>
  );
}
