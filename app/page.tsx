"use client";

import Link from "next/link";
import { StatusBar } from "@/components/Chrome";
import {
  IconBell, IconBook, IconChat, IconClover, IconFolder, IconGear, IconMoon,
  IconStar, IconSun, IconWork, IconWifi, IconBluetooth, IconPlus,
} from "@/components/Icons";
import { useStore } from "@/lib/store";
import { fmtTime } from "@/lib/parseTime";

const apps = [
  { href: "/chat", label: "聊天", Icon: IconChat },
  { href: "/memory", label: "记忆本", Icon: IconBook },
  { href: "/reminders", label: "记事提醒", Icon: IconBell },
  { href: "/files", label: "文件柜", Icon: IconFolder },
  { href: "/settings", label: "设置", Icon: IconGear },
];

const dock = [
  { href: "/chat", label: "聊天", Icon: IconChat },
  { href: "/workbench", label: "工作台", Icon: IconWork },
  { href: "/memory", label: "记忆本", Icon: IconBook },
];

export default function Home() {
  const { messages, reminders, theme, set } = useStore();
  const last = [...messages].reverse().find((m) => m.text);
  const d = new Date();
  const dateStr = `${d.getMonth() + 1}月${d.getDate()}日 周${"日一二三四五六"[d.getDay()]}`;
  const pending = reminders.filter((r) => !r.done).sort((a, b) => a.time - b.time);
  const next = pending[0];

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-[430px] overflow-hidden bg-fog">
      {/* 背景：淡淡的樱花雾 */}
      <div className="pointer-events-none absolute -left-24 top-28 h-72 w-72 rounded-full bg-sakura/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-40 h-64 w-64 rounded-full bg-cream/70 blur-3xl dark:bg-rose/10" />

      <StatusBar />

      <div className="relative space-y-4 px-4 pb-36 pt-2 animate-rise">
        {/* echo 角色状态胶囊 */}
        <Link href="/chat" className="block-white press flex items-center gap-3.5 capsule py-3 pl-3 pr-5">
          <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-sakura/35 text-rose">
            <IconStar size={30} />
            <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-tile bg-rose" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[17px] font-semibold">echo <span className="text-[13px] font-normal text-mute">· 在线</span></span>
              <span className="shrink-0 text-[13px] text-mute">{dateStr}</span>
            </div>
            <p className="mt-0.5 truncate text-[15px] text-mute">{last ? last.text.replace(/\n/g, " ") : "还没有消息哦"}</p>
          </div>
        </Link>

        {/* 控制中心风格组件区 */}
        <div className="grid grid-cols-2 gap-4">
          {/* 半透明灰块 + 4 个圆 */}
          <div className="glass grid aspect-square grid-cols-2 place-items-center rounded-block p-3">
            <button
              aria-label="切换深色模式"
              onClick={() => set("theme", theme === "dark" ? "light" : "dark")}
              className={`press grid h-[62px] w-[62px] place-items-center rounded-full ${theme === "dark" ? "bg-tile text-rose" : "bg-orb text-white"}`}
            >
              <IconMoon size={26} />
            </button>
            <Link href="/reminders" aria-label="提醒" className="orb press h-[62px] w-[62px]"><IconBell size={26} /></Link>
            <div className="grid h-[62px] w-[62px] place-items-center rounded-full bg-tile text-orb"><IconWifi size={26} /></div>
            <div className="grid grid-cols-2 gap-1.5">
              <span className="orb h-7 w-7"><IconClover size={14} /></span>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-tile text-orb"><IconBluetooth size={14} /></span>
              <Link href="/settings" aria-label="设置" className="orb h-7 w-7"><IconGear size={14} /></Link>
              <span className="orb h-7 w-7 opacity-60"><IconSun size={14} /></span>
            </div>
          </div>

          <div className="grid grid-rows-[1fr_auto] gap-4">
            <div className="grid grid-cols-2 place-items-center gap-3">
              <button
                onClick={() => set("theme", "light")}
                className={`press grid aspect-square w-full place-items-center rounded-full text-[30px] font-bold ${theme === "light" ? "bg-tile text-orb shadow-soft" : "glass text-white/80"}`}
              >天</button>
              <button
                onClick={() => set("theme", "dark")}
                className={`press grid aspect-square w-full place-items-center rounded-full text-[30px] font-bold ${theme === "dark" ? "bg-tile text-rose shadow-soft" : "glass text-white"}`}
              >夜</button>
            </div>
            <Link href="/reminders" className="block-white press capsule px-4 py-3">
              <p className="text-[13px] text-mute">下一个提醒</p>
              <p className="truncate text-[15px] font-medium">{next ? `${next.text}` : "暂无提醒 ( ˘ᵕ˘ )"}</p>
              {next && <p className="text-[13px] text-rose">{fmtTime(next.time)}</p>}
            </Link>
          </div>
        </div>

        {/* 应用图标网格 */}
        <div className="grid grid-cols-4 gap-x-3 gap-y-5 pt-2">
          {apps.map(({ href, label, Icon }) => (
            <Link key={href + label} href={href} className="press flex flex-col items-center gap-1.5">
              <span className="grid h-[62px] w-[62px] place-items-center rounded-[20px] bg-orb text-white shadow-soft">
                <Icon size={28} />
              </span>
              <span className="text-[13px] text-ink">{label}</span>
            </Link>
          ))}
          {/* 敬请期待占位 */}
          <div className="flex flex-col items-center gap-1.5 opacity-70" aria-disabled>
            <span className="grid h-[62px] w-[62px] place-items-center rounded-[20px] border-2 border-dashed border-orb/50 text-orb">
              <IconPlus size={24} />
            </span>
            <span className="text-[13px] text-mute">敬请期待</span>
          </div>
        </div>
      </div>

      {/* 底部固定 Dock */}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] px-4 pb-safe">
        <div className="glass-strong mb-1 flex items-center justify-around rounded-[34px] px-4 py-3">
          {dock.map(({ href, label, Icon }) => (
            <Link key={href} href={href} aria-label={label} className="press flex flex-col items-center gap-1">
              <span className="grid h-[58px] w-[58px] place-items-center rounded-[19px] bg-tile text-orb shadow-soft">
                <Icon size={28} />
              </span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
