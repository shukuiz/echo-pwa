import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fog: v("fog"),          // 雾灰背景
        cream: v("cream"),      // 奶白
        tile: v("tile"),        // 白块
        ink: v("ink"),          // 正文
        mute: v("mute"),        // 次要文字
        orb: v("orb"),          // 灰色圆形底
        line: v("line"),        // 分割线
        sakura: "#e9b3c1",
        rose: "#b4637a",
      },
      fontSize: {
        body: ["15px", "22px"],
        input: ["16px", "22px"],
      },
      borderRadius: {
        capsule: "999px",
        block: "28px",
      },
      boxShadow: {
        soft: "0 6px 24px -10px rgba(60,55,58,0.25)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        pop: { from: { opacity: "0", transform: "scale(.92)" }, to: { opacity: "1", transform: "none" } },
        blink: { "0%,100%": { opacity: ".25" }, "50%": { opacity: "1" } },
      },
      animation: {
        rise: "rise .25s ease-out",
        pop: "pop .18s ease-out",
        blink: "blink 1.2s infinite",
      },
    },
  },
  plugins: [],
};
export default config;
