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
      .ec-callbtn { width:40px; height:40px; padding:0; display:grid; place-items:center; margin-right:6px; }
      .ec-callpill { display:inline-flex; align-items:center; gap:6px; min-height:44px; padding:0 16px; border-radius:22px; background:var(--tile,#fff); font-size:15px; box-shadow:0 1px 0 rgba(0,0,0,.04); }
      .ec-calllog { max-height:60vh; overflow-y:auto; padding:0 18px 18px; display:flex; flex-direction:column; gap:10px; font-size:15px; line-height:22px; }
      .ec-calllog b { display:block; font-size:12px; color:var(--g-mute,#888); font-weight:500; }
      .ec-calllog p.me { text-align:right; }
      .ec-call { position:fixed; inset:0; z-index:80; display:flex; flex-direction:column; align-items:center; padding:calc(env(safe-area-inset-top) + 28px) 24px calc(env(safe-area-inset-bottom) + 28px); background:radial-gradient(120% 80% at 50% 30%, #2b2430 0%, #141117 70%); color:#f6f1f3; }
      .ec-call-top { display:flex; flex-direction:column; align-items:center; gap:4px; }
      .ec-call-top b { font-size:22px; font-weight:600; }
      .ec-call-time { font-size:15px; opacity:.7; font-variant-numeric:tabular-nums; }
      .ec-call-orb { position:relative; width:200px; height:200px; margin-top:9vh; display:grid; place-items:center; }
      .ec-call-halo, .ec-call-halo2 { position:absolute; inset:-30px; border-radius:50%; background:radial-gradient(circle, rgba(255,182,210,.55) 0%, rgba(201,91,132,.25) 45%, transparent 70%); transition:transform .12s linear; animation:ec-breathe 3.2s ease-in-out infinite; }
      .ec-call-halo2 { inset:-6px; background:radial-gradient(circle, rgba(255,255,255,.18) 0%, transparent 70%); animation-delay:-1.6s; }
      .ec-call-orb.is-listening .ec-call-halo { background:radial-gradient(circle, rgba(170,210,255,.5) 0%, rgba(90,140,220,.22) 45%, transparent 70%); }
      .ec-call-orb.is-thinking .ec-call-halo { animation-duration:1.4s; }
      .ec-call-orb.is-speaking .ec-call-halo { animation:ec-talk .5s ease-in-out infinite alternate; }
      .ec-call-orb.is-muted .ec-call-halo { opacity:.35; animation:none; }
      .ec-call-avatar { position:relative; width:150px; height:150px; border-radius:50%; object-fit:cover; box-shadow:0 0 0 3px rgba(255,255,255,.12); }
      .ec-call-avatar-empty { display:grid; place-items:center; background:#3a3140; font-size:48px; }
      .ec-call-status { margin-top:34px; font-size:15px; opacity:.8; }
      .ec-call-captions { margin-top:18px; width:100%; max-width:360px; display:flex; flex-direction:column; gap:8px; font-size:15px; line-height:22px; text-align:center; opacity:.9; max-height:22vh; overflow:hidden; }
      .ec-call-captions p.me { opacity:.6; }
      .ec-call-acts { margin-top:auto; display:flex; gap:34px; align-items:flex-start; }
      .ec-call-btn { display:flex; flex-direction:column; align-items:center; gap:8px; font-size:12px; color:#f6f1f3; }
      .ec-call-btn svg { box-sizing:content-box; width:26px; height:26px; padding:19px; border-radius:50%; background:rgba(255,255,255,.14); }
      .ec-call-btn.on svg { background:#f6f1f3; color:#141117; }
      .ec-call-btn.hang svg { width:30px; height:30px; padding:17px; background:#e5484d; color:#fff; }
      @keyframes ec-breathe { 0%,100% { opacity:.65; scale:1; } 50% { opacity:1; scale:1.08; } }
      @keyframes ec-talk { from { scale:1; opacity:.8; } to { scale:1.16; opacity:1; } }
      @media (prefers-reduced-motion: reduce) { .ec-call-halo, .ec-call-halo2 { animation:none !important; } }
      @media (prefers-reduced-motion: reduce) { .ec-page .voice-jump, .ec-page .voice-pending { animation:none; } }
    `}</style>
  );
}
