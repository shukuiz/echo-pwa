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
        width: var(--ec-avatar-size, 36px);
        height: var(--ec-avatar-size, 36px);
        border-radius: calc(var(--ec-avatar-r, 9999) * 1px);
        color: var(--ec-accent, var(--hl, #db6c94));
      }
      .ec-page .chat-group-time {
        margin: 10px 0 2px;
        text-align: center;
        color: var(--ec-mute, var(--g-mute, #aaa));
        font-size: 12px;
        line-height: 18px;
      }
      .ec-page .ec-input { color: var(--ec-ink, var(--g-ink, #fff)); }
      .ec-page .ec-input::placeholder,
      .ec-page .ec-nav .mute { color: var(--ec-mute, var(--g-mute, #ddd)); }
      .ec-page .ec-send[data-state="send"]:enabled {
        background-color: var(--ec-accent, var(--hl, #db6c94));
      }
      .ec-page .voice-bar { display:flex; align-items:center; gap:8px; min-height:44px; }
      .ec-page .voice-play { display:grid; place-items:center; width:44px; height:44px; border-radius:999px; flex:none; }
      .ec-page .voice-peaks { display:flex; align-items:center; justify-content:center; gap:2px; min-width:0; flex:1; height:44px; padding:0 2px; }
      .ec-page .voice-peaks i, .ec-page .voice-pending i { display:block; width:3px; min-height:5px; border-radius:999px; background:#d5d0d2; }
      .ec-page .voice-peaks i.played { background:var(--rose, #c95b84); }
      .ec-page .voice-jump { animation:echo-voice-jump .65s ease-in-out infinite alternate; }
      .ec-page .voice-transcript { min-height:44px; padding:0 4px; color:var(--g-mute,#888); font-size:13px; }
      .ec-page .voice-pending { gap:2px; padding-left:1px; opacity:.7; animation:echo-voice-breathe 1.4s ease-in-out infinite; }
      @keyframes echo-voice-jump { to { transform:scaleY(1.18); } }
      @keyframes echo-voice-breathe { 50% { opacity:.4; } }
      @media (prefers-reduced-motion: reduce) { .ec-page .voice-jump, .ec-page .voice-pending { animation:none; } }
    `}</style>
  );
}
