"use client";

import { useMemo, useState } from "react";
import { PageShell, Sheet } from "@/components/Chrome";
import ReminderList from "@/components/ReminderList";
import { IconDownload, IconEdit, IconPin, IconPlus, IconTrash } from "@/components/Icons";
import { exportBackup, MemoryItem, MemoryTab, uid, useStore } from "@/lib/store";

type Tab = MemoryTab | "reminder";
const tabs: { id: Tab; label: string }[] = [
  { id: "persona", label: "人设" },
  { id: "text", label: "文字记忆" },
  { id: "summary", label: "今日总结" },
  { id: "reminder", label: "提醒" },
];

type Draft = { id?: string; tab: MemoryTab; title: string; text: string };

export default function MemoryPage() {
  const { memory, reminders, messages, files, set, toast } = useStore();
  const [tab, setTab] = useState<Tab>("persona");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const list = useMemo(
    () => memory.filter((m) => m.tab === tab).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt),
    [memory, tab]
  );

  function save() {
    if (!draft || !draft.text.trim()) return;
    const title = draft.title.trim() || draft.text.trim().slice(0, 10);
    if (draft.id) {
      set("memory", (ms) => ms.map((m) => (m.id === draft.id ? { ...m, title, text: draft.text.trim(), updatedAt: Date.now() } : m)));
      toast("已修改");
    } else {
      set("memory", (ms) => [{ id: uid(), tab: draft.tab, title, text: draft.text.trim(), pinned: false, updatedAt: Date.now() }, ...ms]);
      toast("已新增");
    }
    setDraft(null);
  }
  const togglePin = (m: MemoryItem) => set("memory", (ms) => ms.map((x) => (x.id === m.id ? { ...x, pinned: !x.pinned } : x)));
  const remove = (id: string) => {
    if (confirmDel !== id) { setConfirmDel(id); setTimeout(() => setConfirmDel((c) => (c === id ? null : c)), 2500); return; }
    set("memory", (ms) => ms.filter((m) => m.id !== id));
    setConfirmDel(null);
    toast("已删除");
  };

  return (
    <PageShell
      title="记忆本"
      right={
        <button
          onClick={() => { exportBackup({ memory, reminders, messages, files }); toast("备份已导出"); }}
          className="glass press flex h-10 items-center gap-1.5 rounded-capsule px-3.5 text-[15px]"
        >
          <IconDownload size={18} /> 导出
        </button>
      }
    >
      {/* 页签 */}
      <div className="glass no-scrollbar -mx-1 mb-4 mt-1 flex overflow-x-auto rounded-capsule p-1">
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

      {tab === "reminder" ? (
        <ReminderList showPin />
      ) : (
        <div className="space-y-3">
          {list.length === 0 && <p className="glass rounded-[24px] px-4 py-10 text-center text-mute">这里还是空的，点右下角 + 新增一条 ₍ᐢ•ﻌ•ᐢ₎</p>}
          {list.map((m) => (
            <article key={m.id} className="block-white animate-rise rounded-[26px] p-4">
              <div className="flex items-start gap-2">
                <h3 className="flex-1 text-[16px] font-semibold">
                  {m.pinned && <span className="mr-1.5 rounded-capsule bg-sakura/45 px-2 py-0.5 text-[12px] font-medium text-rose">置顶</span>}
                  {m.title}
                </h3>
                <span className="shrink-0 pt-0.5 text-[12px] text-mute">{new Date(m.updatedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-6 text-ink/85">{m.text}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => togglePin(m)} className={`press flex items-center gap-1 rounded-capsule px-3 py-1.5 text-[14px] ${m.pinned ? "bg-sakura/45 text-rose" : "bg-fog text-ink/80"}`}>
                  <IconPin size={16} /> {m.pinned ? "取消置顶" : "置顶"}
                </button>
                <button onClick={() => setDraft({ id: m.id, tab: m.tab, title: m.title, text: m.text })} className="press flex items-center gap-1 rounded-capsule bg-fog px-3 py-1.5 text-[14px] text-ink/80">
                  <IconEdit size={16} /> 修改
                </button>
                <button onClick={() => remove(m.id)} className={`press ml-auto flex items-center gap-1 rounded-capsule px-3 py-1.5 text-[14px] ${confirmDel === m.id ? "bg-rose text-white" : "bg-fog text-rose"}`}>
                  <IconTrash size={16} /> {confirmDel === m.id ? "确认删除" : "删除"}
                </button>
              </div>
            </article>
          ))}

          <button
            aria-label="新增"
            onClick={() => setDraft({ tab: tab as MemoryTab, title: "", text: "" })}
            className="press fixed bottom-12 right-[max(1rem,calc(50%-215px+1rem))] z-30 grid h-14 w-14 place-items-center rounded-full bg-rose text-white shadow-soft"
          >
            <IconPlus size={26} />
          </button>
        </div>
      )}

      <Sheet open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "修改记忆" : `新增${tabs.find((t) => t.id === draft?.tab)?.label ?? ""}`}>
        {draft && (
          <div className="space-y-3">
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="标题（可不填）" className="field" />
            <textarea autoFocus value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={5} placeholder="写下要记住的内容…" className="field resize-none" />
            <button onClick={save} disabled={!draft.text.trim()} className="btn-primary w-full py-3 disabled:opacity-40">保存</button>
          </div>
        )}
      </Sheet>
    </PageShell>
  );
}
