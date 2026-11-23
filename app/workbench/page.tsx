"use client";

import { useRouter } from "next/navigation";
import { PageShell } from "@/components/Chrome";
import { IconCode, IconGlobe, IconMusic, IconWand, IconChat } from "@/components/Icons";
import { workbenchShortcuts } from "@/lib/mock";
import { useStore } from "@/lib/store";

const icons = { worldbook: IconWand, translate: IconGlobe, media: IconMusic, miniapp: IconCode } as const;

/** 工作台 = 快捷指令面板：点一下，带着预设指令回到聊天，由 echo 执行 */
export default function WorkbenchPage() {
  const router = useRouter();
  const { settings } = useStore();
  const hand = settings.defaultHand === "codex" ? "Codex" : "Claude Code";

  return (
    <PageShell title="工作台">
      <p className="mb-3 mt-1 text-mute">点一下，echo 会在聊天里直接开工 · 动手入口：<span className="text-rose">{hand}</span></p>
      <div className="grid grid-cols-2 gap-4">
        {workbenchShortcuts.map((t, i) => {
          const Icon = icons[t.id];
          const white = i === 0 || i === 3;
          return (
            <button
              key={t.id}
              onClick={() => router.push(`/chat?preset=${encodeURIComponent(t.prompt)}`)}
              className={`press flex aspect-[1/1.05] flex-col justify-between rounded-block p-4 text-left ${white ? "block-white" : "glass"}`}
            >
              <span className={`grid h-14 w-14 place-items-center rounded-full ${white ? "bg-orb text-white" : "bg-tile text-orb"}`}>
                <Icon size={26} />
              </span>
              <span>
                <span className="block text-[17px] font-semibold leading-tight">{t.title}</span>
                <span className={`mt-1 block text-[13px] ${white ? "text-mute" : "text-ink/70"}`}>{t.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="mt-6">
        <h2 className="mb-2 px-1 text-[15px] font-semibold text-mute">会带入的指令</h2>
        <div className="block-white divide-y divide-line overflow-hidden rounded-[24px]">
          {workbenchShortcuts.map((t) => (
            <button
              key={t.id}
              onClick={() => router.push(`/chat?preset=${encodeURIComponent(t.prompt)}`)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-fog"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sakura/40 text-rose"><IconChat size={16} /></span>
              <span className="min-w-0 flex-1 truncate text-[15px]">{t.prompt}</span>
            </button>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
