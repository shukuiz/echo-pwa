"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell, Sheet } from "@/components/Chrome";
import { IconCode, IconCopy, IconTrash, IconWand, IconBook } from "@/components/Icons";
import { FileItem, FileKind, useStore } from "@/lib/store";
import { fileKindLabel } from "@/lib/mock";

type Tab = "all" | "text" | "miniapp";
const tabs: { id: Tab; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "text", label: "预设 / 世界书" },
  { id: "miniapp", label: "小应用" },
];
const inTab = (k: FileKind, t: Tab) => t === "all" || (t === "miniapp" ? k === "miniapp" : k === "preset" || k === "worldbook");
const icon = (k: FileKind) => (k === "miniapp" ? <IconCode size={20} /> : k === "preset" ? <IconBook size={20} /> : <IconWand size={20} />);

export default function FilesPage() {
  return (
    <Suspense>
      <Files />
    </Suspense>
  );
}

function Files() {
  const { files, set, toast } = useStore();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("all");
  const [open, setOpen] = useState<FileItem | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    const id = params.get("open");
    if (id) {
      const f = files.find((x) => x.id === id);
      if (f) setOpen(f);
    }
  }, [params, files]);

  const list = useMemo(() => files.filter((f) => inTab(f.kind, tab)).sort((a, b) => b.at - a.at), [files, tab]);

  return (
    <PageShell title="文件柜">
      <p className="mb-3 mt-1 text-mute">echo 写好的预设、世界书和小应用都在这里。</p>
      <div className="glass mb-4 flex rounded-capsule p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap rounded-capsule px-3 py-2 text-[15px] transition ${tab === t.id ? "bg-tile font-semibold text-rose shadow-soft" : "text-ink/75"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="glass rounded-[24px] px-4 py-10 text-center text-mute">还没有文件，去聊天里让 echo 写一个吧 ₍ᐢ•ﻌ•ᐢ₎</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {list.map((f, i) => (
            <button key={f.id} onClick={() => setOpen(f)} className={`press flex flex-col rounded-[24px] p-3.5 text-left ${i % 3 === 1 ? "glass" : "block-white"}`}>
              <div className="flex items-center justify-between">
                <span className="orb h-10 w-10">{icon(f.kind)}</span>
                <span className="rounded-capsule bg-sakura/45 px-2 py-0.5 text-[12px] text-rose">{fileKindLabel[f.kind]}</span>
              </div>
              <p className="mt-3 line-clamp-2 text-[15px] font-medium leading-5">{f.name}</p>
              <p className="mt-1 text-[12px] text-mute">
                {new Date(f.at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} · {f.via}
              </p>
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!open} onClose={() => { setOpen(null); setConfirmDel(false); }} title={open?.name}>
        {open && (
          <div className="space-y-3">
            <p className="text-[13px] text-mute">{fileKindLabel[open.kind]} · 由 {open.via} 生成</p>
            {open.kind === "miniapp" ? (
              <div className="overflow-hidden rounded-2xl border border-line">
                <div className="flex items-center gap-1.5 bg-fog px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose/60" /><span className="h-2.5 w-2.5 rounded-full bg-sakura" /><span className="h-2.5 w-2.5 rounded-full bg-orb/40" />
                  <span className="ml-2 text-[12px] text-mute">预览</span>
                </div>
                <div className="grid place-items-center gap-3 bg-gradient-to-b from-cream to-sakura/30 py-8">
                  <p className="text-[40px] font-semibold tabular-nums text-rose">25:00</p>
                  <div className="flex gap-2">
                    <span className="rounded-capsule bg-rose px-5 py-2 text-[15px] text-white">开始</span>
                    <span className="rounded-capsule bg-tile px-5 py-2 text-[15px]">重置</span>
                  </div>
                </div>
              </div>
            ) : null}
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-tile p-4 font-mono text-[13px] leading-6">{open.content}</pre>
            <div className="flex gap-2">
              <button
                onClick={async () => { try { await navigator.clipboard.writeText(open.content); toast("已复制"); } catch { toast("复制失败"); } }}
                className="btn-ghost flex flex-1 items-center justify-center gap-1.5"
              ><IconCopy size={18} /> 复制内容</button>
              <button
                onClick={() => {
                  if (!confirmDel) { setConfirmDel(true); return; }
                  set("files", (fs) => fs.filter((x) => x.id !== open.id)); setOpen(null); setConfirmDel(false); toast("已删除");
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-capsule py-2.5 ${confirmDel ? "bg-rose text-white" : "bg-rose/10 text-rose"}`}
              ><IconTrash size={18} /> {confirmDel ? "确认删除" : "删除"}</button>
            </div>
          </div>
        )}
      </Sheet>
    </PageShell>
  );
}
