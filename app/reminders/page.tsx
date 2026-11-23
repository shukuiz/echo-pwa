"use client";

import { PageShell } from "@/components/Chrome";
import ReminderList from "@/components/ReminderList";

export default function RemindersPage() {
  return (
    <PageShell title="记事提醒">
      <p className="mb-3 mt-1 text-mute">说一句话就能设好时间，比如「3分钟后喝水」「周五下午3点半开会」。</p>
      <ReminderList />
    </PageShell>
  );
}
