"use client";

import { useMemo, useState } from "react";
import { Reminder, uid, useStore } from "@/lib/store";
import { fmtTime, parseReminder } from "@/lib/parseTime";
import { Sheet } from "./Chrome";
import { IconBell, IconCheck, IconEdit, IconPin, IconSend, IconTrash } from "./Icons";

function toLocalInput(t: number) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 一句话设提醒 + 列表（记事提醒页、记忆本「提醒」页签共用） */
export default function ReminderList({ showPin = false }: { showPin?: boolean }) {
  const { reminders, set, toast } = useStore();
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const preview = useMemo(() => (input.trim() ? parseReminder(input) : null), [input]);

  const sorted = useMemo(() => {
    const sort = (a: Reminder, b: Reminder) => Number(b.pinned) - Number(a.pinned) || a.time - b.time;
    return {
      todo: reminders.filter((r) => !r.done).sort(sort),
      done: reminders.filter((r) => r.done).sort((a, b) => b.time - a.time),
    };
  }, [reminders]);

  function add() {
    if (!preview) return;
    set("reminders", (rs) => [...rs, { id: uid(), text: preview.text, time: preview.time, done: false, pinned: false }]);
    toast(`已设好：${fmtTime(preview.time)}`);
    setInput("");
  }
  const patch = (id: string, p: Partial<Reminder>) => set("reminders", (rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const remove = (id: string) => {
    if (confirmDel !== id) { setConfirmDel(id); setTimeout(() => setConfirmDel((c) => (c === id ? null : c)), 2500); return; }
    set("reminders", (rs) => rs.filter((r) => r.id !== id));
    setConfirmDel(null);
    toast("已删除");
  };

  const Row = ({ r }: { r: Reminder }) => {
    const overdue = !r.done && r.time < Date.now();
    return (
      <li className="flex items-center gap-3 px-4 py-3">
        <button
          aria-label={r.done ? "标为未完成" : "标为完成"}
          onClick={() => patch(r.id, { done: !r.done })}
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition ${r.done ? "border-rose bg-rose text-white" : "border-orb/50"}`}
        >
          {r.done && <IconCheck size={14} />}
        </button>
        <div className="min-w-0 flex-1" onClick={() => setEditing(r)}>
          <p className={`truncate text-[15px] ${r.done ? "text-mute line-through" : ""}`}>
            {r.pinned && <span className="mr-1 text-rose">●</span>}
            {r.text}
          </p>
          <p className={`text-[13px] ${overdue ? "text-rose" : "text-mute"}`}>{fmtTime(r.time)}{overdue && " · 已过时"}</p>
        </div>
        {showPin && (
          <button aria-label="置顶" onClick={() => patch(r.id, { pinned: !r.pinned })} className={`press grid h-9 w-9 place-items-center rounded-full ${r.pinned ? "bg-sakura/50 text-rose" : "text-mute"}`}>
            <IconPin size={18} />
          </button>
        )}
        <button aria-label="编辑" onClick={() => setEditing(r)} className="press grid h-9 w-9 place-items-center rounded-full text-mute"><IconEdit size={18} /></button>
        <button
          aria-label="删除"
          onClick={() => remove(r.id)}
          className={`press grid h-9 place-items-center rounded-full transition-all ${confirmDel === r.id ? "w-16 bg-rose text-[13px] text-white" : "w-9 text-mute"}`}
        >
          {confirmDel === r.id ? "确认" : <IconTrash size={18} />}
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {/* 一句话输入 */}
      <div className="block-white rounded-[26px] p-3">
        <div className="flex items-center gap-2">
          <span className="orb h-10 w-10 shrink-0"><IconBell size={20} /></span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()}
            placeholder="明天早上8点交设计稿"
            className="min-w-0 flex-1 bg-transparent text-input outline-none placeholder:text-mute"
          />
          <button aria-label="添加" onClick={add} disabled={!preview} className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose text-white disabled:bg-orb/40">
            <IconSend size={18} />
          </button>
        </div>
        {preview && (
          <p className="mt-2 px-1 text-[13px] text-mute">
            将在 <span className="text-rose">{fmtTime(preview.time)}</span> 提醒「{preview.text}」
            {!preview.matched && "（没听出时间，先设为 1 小时后）"}
          </p>
        )}
      </div>

      <section>
        <h2 className="mb-2 px-1 text-[15px] font-semibold text-mute">待提醒 · {sorted.todo.length}</h2>
        {sorted.todo.length ? (
          <ul className="block-white divide-y divide-line overflow-hidden rounded-[24px]">{sorted.todo.map((r) => <Row key={r.id} r={r} />)}</ul>
        ) : (
          <p className="glass rounded-[24px] px-4 py-6 text-center text-mute">没有待办，喝口水吧 ( ˘ᵕ˘ )</p>
        )}
      </section>

      {sorted.done.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-[15px] font-semibold text-mute">已完成 · {sorted.done.length}</h2>
          <ul className="glass divide-y divide-line/60 overflow-hidden rounded-[24px]">{sorted.done.map((r) => <Row key={r.id} r={r} />)}</ul>
        </section>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="编辑提醒">
        {editing && (
          <div className="space-y-3">
            <input value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} className="field" />
            <input
              type="datetime-local"
              value={toLocalInput(editing.time)}
              onChange={(e) => e.target.value && setEditing({ ...editing, time: new Date(e.target.value).getTime() })}
              className="field"
            />
            <button
              onClick={() => { patch(editing.id, { text: editing.text.trim() || "提醒", time: editing.time }); setEditing(null); toast("已保存"); }}
              className="btn-primary w-full py-3"
            >保存</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
