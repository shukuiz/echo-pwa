import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import PWARegister from "@/components/PWARegister";

export const metadata: Metadata = {
  title: "echo",
  description: "echo · 雾灰奶白的小助手",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "echo", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
            __html: `try{var s=JSON.parse(localStorage.getItem('echo-pwa-state-v3')||'{}');if(s.theme==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body>
        <StoreProvider>{children}</StoreProvider>
        <PWARegister />
      </body>
    </html>
  );
}
