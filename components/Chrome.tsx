"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconBack } from "./Icons";

/** 顶部装饰状态栏 */
export function StatusBar() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(`${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex h-11 items-center justify-between px-6 pt-[env(safe-area-inset-top)] text-[15px] font-semibold text-ink" aria-hidden>
      <span className="tabular-nums">{time}</span>
      <div className="flex items-center gap-1.5">
        {/* 信号 */}
        <div className="flex items-end gap-[2px]">
          {[5, 7, 9, 11].map((h, i) => (
            <span key={i} className={`w-[3px] rounded-sm ${i < 3 ? "bg-ink" : "bg-ink/30"}`} style={{ height: h }} />
          ))}
        </div>
        {/* 电池 */}
        <div className="ml-1 flex items-center">
          <div className="relative h-[11px] w-[22px] rounded-[3.5px] border border-ink/50 p-[1.5px]">
            <div className="h-full w-[70%] rounded-[1.5px] bg-sakura" />
          </div>
          <div className="ml-[1px] h-[4px] w-[1.5px] rounded-r bg-ink/50" />
        </div>
      </div>
    </div>
  );
}

/** 底部可点击 Home 指示条 */
export function HomeIndicator() {
  const router = useRouter();
  return (
    <button
      aria-label="回到桌面"
      onClick={() => router.push("/")}
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 4px)" }}
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-[430px] items-end justify-center pt-1.5"
    >
      <span className="mb-1 h-[5px] w-[134px] rounded-capsule bg-ink/70 transition active:scale-x-90 active:bg-rose" />
    </button>
  );
}

/** 子页面外壳：状态栏 + 左上角返回 + 标题 + Home 指示条 */
export function PageShell({
  title,
  sub,
  right,
  children,
  footer,
}: {
  title: string;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-fog">
      <div className="sticky top-0 z-30 bg-fog/85 backdrop-blur-xl">
        <StatusBar />
        <div className="flex h-12 items-center gap-3 px-4">
          <button
            aria-label="返回"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
            className="orb press h-10 w-10 shrink-0"
          >
            <IconBack size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[19px] font-semibold leading-tight">{title}</h1>
            {sub}
          </div>
          {right}
        </div>
      </div>
      <main className="flex-1 px-4 pb-14 animate-rise">{children}</main>
      {footer}
      <HomeIndicator />
    </div>
  );
}

/** 底部弹出面板 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-[430px] animate-rise rounded-t-[32px] bg-cream px-5 pb-safe pt-3 shadow-soft">
        <div className="mx-auto mb-3 h-[5px] w-10 rounded-capsule bg-ink/20" />
        {title && <h2 className="mb-3 text-[17px] font-semibold">{title}</h2>}
        {children}
        <div className="h-4" />
      </div>
    </div>
  );
}

/** iOS 风格开关 */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-capsule transition ${on ? "bg-rose" : "bg-orb/40"}`}
    >
      <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-[2px]"}`} />
    </button>
  );
}

/** 分段选择器 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="glass flex rounded-capsule p-1">
      {options.map((o) => (
        <button
          key={o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-capsule px-3 py-2 text-[15px] transition disabled:opacity-35 ${
            value === o.value ? "bg-tile font-semibold text-rose shadow-soft" : "text-ink/80"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
