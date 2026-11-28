"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { loadActiveCss, subscribeChatCss } from "@/lib/chat-css";

const emptyCss = () => "";

export default function ChatCss() {
  const pathname = usePathname();
  const css = useSyncExternalStore(subscribeChatCss, loadActiveCss, emptyCss);

  useEffect(() => {
    if (pathname !== "/chat" || !css.trim()) return;
    const el = document.createElement("style");
    el.id = "echo-user-css";
    el.textContent = css.replace(/<\/style/gi, "<\\/style");
    document.head.appendChild(el);
    return () => el.remove();
  }, [css, pathname]);

  return (
    <style jsx global>{`
      .ec-page .ec-bubble[data-who] {
        --r: var(--ec-bubble-r, 22px);
        padding: var(--ec-bubble-py, 10px) var(--ec-bubble-px, 16px);
        font-size: var(--ec-bubble-fs, 15px);
        line-height: var(--ec-bubble-lh, 22px);
        color: var(--ec-ink, var(--g-ink, #fff));
      }
      html.th-real .ec-page .ec-bubble[data-who] {
        border-radius: var(--ec-bubble-r, 24px);
      }
      .ec-page .ec-list .ec-msg + .ec-msg {
        /* The existing message body contributes another 8px of top padding. */
        margin-top: calc(var(--ec-bubble-gap, 12px) - 8px);
      }
      .ec-page .ec-bubbles { row-gap: var(--ec-bubble-gap-in, 6px); }
      .ec-page .ec-avatar {
        width: var(--ec-avatar-size, 32px);
        height: var(--ec-avatar-size, 32px);
        border-radius: calc(var(--ec-avatar-r, 9999) * 1px);
        color: var(--ec-accent, var(--hl, #db6c94));
      }
      .ec-page .ec-input { color: var(--ec-ink, var(--g-ink, #fff)); }
      .ec-page .ec-input::placeholder,
      .ec-page .ec-nav .mute { color: var(--ec-mute, var(--g-mute, #ddd)); }
      .ec-page .ec-send[data-state="send"]:enabled {
        background-color: var(--ec-accent, var(--hl, #db6c94));
      }
    `}</style>
  );
}
