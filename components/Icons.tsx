// 白色线条图标（stroke=currentColor），放在灰色圆形底上使用
type P = { className?: string; size?: number };
const base = (size = 22) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const IconChat = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12Z" /><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" /></svg>
);
export const IconWork = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><rect x="3.5" y="7" width="17" height="12.5" rx="3" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" /></svg>
);
export const IconBook = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M5 4.5h10.5A3.5 3.5 0 0 1 19 8v11.5H8.5A3.5 3.5 0 0 1 5 16V4.5Z" /><path d="M5 16a3.5 3.5 0 0 1 3.5-3.5H19M9 8h6" /></svg>
);
export const IconBell = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
);
export const IconGear = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
);
export const IconBack = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M15 5l-7 7 7 7" /></svg>
);
export const IconPlus = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconSend = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);
export const IconStop = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /></svg>
);
export const IconCopy = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" /></svg>
);
export const IconTrash = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l.8 12h9.4l.8-12M10 11v5M14 11v5" /></svg>
);
export const IconPin = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M9 4h6l-1 6 3 3H7l3-3-1-6ZM12 13v7" /></svg>
);
export const IconEdit = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4Z" /><path d="M13.5 6.5l4 4" /></svg>
);
export const IconRetry = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /></svg>
);
export const IconDownload = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></svg>
);
export const IconCheck = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const IconClose = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconMoon = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
);
export const IconSun = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>
);
export const IconKey = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l2 2M14 9l1.5 1.5" /></svg>
);
export const IconHand = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3 15.5a1.5 1.5 0 0 1 2.3-2L8 16" /></svg>
);
export const IconWand = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M4 20 15 9M14 4v2M19 9h2M17.5 5.5 16 7M19 3l-1 1" /></svg>
);
export const IconGlobe = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5a13 13 0 0 1 0 17M12 3.5a13 13 0 0 0 0 17" /></svg>
);
export const IconMusic = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M9 18V5.5l10-2V16" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></svg>
);
export const IconCode = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" /></svg>
);
export const IconStar = ({ className, size }: P) => (
  <svg {...base(size)} className={className} fill="currentColor" stroke="none"><path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.6 6.7 19.4l1.1-5.9L3.5 9.4l5.9-.8L12 3.2Z" /></svg>
);
export const IconClover = ({ className, size }: P) => (
  <svg {...base(size)} className={className} fill="currentColor" stroke="none"><circle cx="9" cy="9" r="3.6" /><circle cx="15" cy="9" r="3.6" /><circle cx="9" cy="15" r="3.6" /><circle cx="15" cy="15" r="3.6" /><path d="M12 12c1 3 2.5 6 5 8.5" stroke="currentColor" strokeWidth="1.6" fill="none" /></svg>
);
export const IconWifi = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.7 15.8a5 5 0 0 1 6.6 0" /><circle cx="12" cy="19" r=".8" fill="currentColor" /></svg>
);
export const IconBluetooth = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M7 7.5l10 9-5 4.5V3l5 4.5-10 9" /></svg>
);
export const IconFolder = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10Z" /><path d="M3.5 10.5h17" /></svg>
);

export const IconClip = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.3-8.3a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5" /></svg>
);
export const IconMic = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></svg>
);
export const IconChevron = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M6 9.5l6 6 6-6" /></svg>
);
export const IconClock = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></svg>
);
export const IconSpark = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8Z" /></svg>
);
export const IconTool = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 1-2-2Z" /></svg>
);
export const IconImage = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><rect x="4" y="5" width="16" height="14" rx="3" /><path d="M4.5 16l4.5-4.5 4 4 2.5-2.5 4 4" /><circle cx="15.5" cy="9.5" r="1.3" /></svg>
);
