"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Beauty, FCOLS, ICOLS, MES, PRESETS, SLIDERS, TINTS, useBeauty } from "@/lib/beauty";
import { useStore } from "@/lib/store";
import { delBlob, downscale, putBlob, useBlobUrl } from "@/lib/idb";
import { engine } from "@/components/glass/engine";
import { useGlassRect } from "@/components/glass/hooks";
import { GIcon, WallScreen } from "@/components/glass/Wall";
import { DEFAULT_WP } from "@/components/glass/GlassRoot";

function Card({ icon, title, children, dim, id }: { icon: string; title: string; children: React.ReactNode; dim?: boolean; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  useGlassRect(ref);
  return (
    <section ref={ref} id={id} className={`g card ${dim ? "dim" : ""}`} data-glass>
      <h3><GIcon n={icon} s={16} />{title}</h3>
      {children}
    </section>
  );
}

function Swatches({ list, value, onPick, label }: { list: [string, string][]; value: string; onPick: (c: string) => void; label: string }) {
  const custom = !list.some(([, c]) => c.toLowerCase() === value.toLowerCase());
  return (
    <div className="sws" role="radiogroup" aria-label={label}>
      {list.map(([n, c]) => (
        <button key={c} role="radio" aria-checked={c.toLowerCase() === value.toLowerCase()} className={`sw ${c.toLowerCase() === value.toLowerCase() ? "on" : ""}`}
          style={{ "--c": c } as React.CSSProperties} onClick={() => onPick(c)}>
          <i />{n}
        </button>
      ))}
      <label className={`sw cus ${custom ? "on" : ""}`} style={{ "--c": custom ? value : "#fff" } as React.CSSProperties}>
        <i />自定义
        <input type="color" value={value} aria-label={`${label} 自定义颜色`} onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  );
}

function Seg<T extends string | number>({ value, opts, onChange, label }: { value: T | null; opts: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {opts.map(([v, l]) => <button key={String(v)} role="radio" aria-checked={v === value} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

function Slider({ label, value, max, onChange, wide, suffix = "" }: { label: string; value: number; max: number; onChange: (v: number) => void; wide?: boolean; suffix?: string }) {
  return (
    <div className={`brow ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <input type="range" min={0} max={max} value={value} aria-label={label} onChange={(e) => onChange(+e.target.value)} />
      <output>{value}{suffix}</output>
    </div>
  );
}

export default function BeautyPage() {
  const { b, setB } = useBeauty();
  const { theme, set, toast } = useStore();
  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);
  useGlassRect(barRef, true);
  const userWp = useBlobUrl("wp:user");
  const css = engine.cssMode, rm = engine.rm, noGL = engine.noGL;

  const P = (k: keyof Beauty["P"], v: number) => setB((p) => ({ P: { ...p.P, [k]: v }, preset: null }));

  async function upload(f: File) {
    try {
      await putBlob("wp:user", await downscale(f, 2048, 0.9));
      setB({ wp: "user" });
      toast("壁纸换好啦");
    } catch { toast("壁纸没存上，可能是空间不够 (；´д｀)"); }
  }
  async function removeUserWp() {
    await delBlob("wp:user");
    setB({ wp: "default" });
  }

  return (
    <WallScreen gl fixed className="bpage">
      <div className="top">
        <div className="hstatus" style={{ height: 48, paddingTop: 6 }} data-onwp><span /><span /></div>
        <div ref={barRef} className="g wbar" data-glass data-tint="0.08">
          <button className="back" aria-label="返回" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}><GIcon n="back" s={20} /></button>
          <b>美化</b>
        </div>
      </div>
      <div className="bscroll" data-gclip>
        <Card icon="layers" title="风格">
          <div className="opts">
            <button className={`opt ${b.theme === "glass" ? "on" : ""}`} onClick={() => setB({ theme: "glass" })}>
              <b><GIcon n="drop" s={18} />液态玻璃</b><small>会折射身后的壁纸，边缘有一道光</small>
            </button>
            <button className={`opt ${b.theme === "real" ? "on" : ""}`} onClick={() => setB({ theme: "real" })}>
              <b><GIcon n="phone" s={18} />仿真</b><small>像 iPhone 一样柔和，不用 WebGL</small>
            </button>
          </div>
          {b.theme === "real" && (
            <div style={{ marginTop: 10 }}>
              <Seg label="材质" value={b.mat} opts={[["frost", "磨砂"], ["solid", "实色"]]} onChange={(v) => setB({ mat: v })} />
              <div className="sub">图标颜色</div>
              <Swatches label="图标颜色" list={ICOLS} value={b.icon} onPick={(c) => setB({ icon: c })} />
              <div style={{ marginTop: 8 }}><Slider wide label="图标透明度" value={b.iconA} max={100} suffix="%" onChange={(v) => setB({ iconA: v })} /></div>
              <p className="hint">桌面和 Dock 的图标统一用这个颜色，图案会自己变深或变浅</p>
            </div>
          )}
        </Card>

        <Card icon="palette" title="色调">
          <Swatches label="色调" list={TINTS} value={b.tint} onPick={(c) => setB({ tint: c })} />
          <div style={{ marginTop: 8 }}><Slider label="浓度" value={b.P.tint} max={80} onChange={(v) => P("tint", v)} /></div>
          <p className="hint">玻璃染上这个颜色，{b.inkMode === "auto" ? "文字会自己挑深色或浅色，保证看得清" : "字色用你在「字体颜色」里选的"}</p>
        </Card>

        <Card icon="type2" title="字体颜色" id="inkcard">
          <Seg label="字体颜色" value={b.inkMode} opts={[["auto", "自动"], ["custom", "自定义"]]} onChange={(v) => setB({ inkMode: v })} />
          {b.inkMode === "custom" && <div style={{ marginTop: 12 }}><Swatches label="字体颜色" list={FCOLS} value={b.inkColor} onPick={(c) => setB({ inkColor: c })} /></div>}
          <p className="hint">
            {b.inkMode === "auto"
              ? "按每块玻璃身后的壁纸明暗，自动挑深色或浅色字"
              : "桌面小组件、图标名字、标题栏和聊天气泡都用这个颜色；玻璃会按字色自动压亮或提暗底色，还会补一点阴影保证看得清"}
          </p>
          <div className="sub">我方气泡字色</div>
          <Seg label="我方气泡字色" value={b.meInkMode} opts={[["follow", "跟随字体颜色"], ["custom", "单独设置"]]} onChange={(v) => setB({ meInkMode: v })} />
          {b.meInkMode === "custom" && <div style={{ marginTop: 12 }}><Swatches label="我方气泡字色" list={FCOLS} value={b.meInkColor} onPick={(c) => setB({ meInkColor: c })} /></div>}
        </Card>

        <Card icon="apps" title="小组件">
          <Slider wide label="小组件透明度" value={b.wA} max={100} suffix="%" onChange={(v) => setB({ wA: v })} />
          <p className="hint">
            {b.theme === "glass" ? "玻璃里只淡化染色和底色，折射和边缘光不变。" : "只改小组件的底板。"}照片和动图本身不会变透明。编辑模式里点一个小组件，可以单独调它
          </p>
        </Card>

        <Card icon="drop" title="玻璃" dim={b.theme === "real" || css}>
          <Seg label="玻璃预设" value={b.preset} opts={[["mist", "雾窗"], ["clear", "清透"], ["frost", "磨砂"]]} onChange={(v) => setB({ preset: v, P: { ...PRESETS[v] } })} />
          <div style={{ marginTop: 8 }}>
            {SLIDERS.map(([k, l, max]) => <Slider key={k} label={l} value={b.P[k]} max={max} onChange={(v) => P(k, v)} />)}
          </div>
        </Card>

        <Card icon="chat" title="气泡">
          <Seg label="气泡样式" value={b.bubMode} opts={[["glass", "全玻璃"], ["tint", "我方带色"]]} onChange={(v) => setB({ bubMode: v })} />
          <p className="hint" style={{ margin: "10px 0 8px" }}>我方气泡</p>
          <Swatches label="我方气泡颜色" list={MES} value={b.me} onPick={(c) => setB({ me: c, bubMode: "tint" })} />
        </Card>

        <Card icon="type" title="字体">
          <div className="opts">
            <button className={`opt ${b.font === "sys" ? "on" : ""}`} onClick={() => setB({ font: "sys" })}>
              <b>默认苹方</b><span className="smp" style={{ fontFamily: "-apple-system,'PingFang SC',system-ui,sans-serif" }}>今天也要开心</span>
            </button>
            <button className={`opt ${b.font === "song" ? "on" : ""}`} onClick={() => setB({ font: "song" })}>
              <b style={{ fontFamily: b.font === "song" ? "ZhiSong,'Songti SC',serif" : "'Songti SC',serif" }}>霞鹜新致宋</b>
              <span className="smp" style={{ fontFamily: b.font === "song" ? "ZhiSong,'Songti SC',serif" : "'Songti SC',serif" }}>今天也要开心</span>
            </button>
          </div>
          <p className="hint">全局生效：桌面、聊天、设置都会换。霞鹜新致宋约 1.2MB，第一次选它时才下载</p>
          {b.font === "song" && (
            <>
              <label className="btgl"><span>改用本机 IPA 原始字体</span><input type="checkbox" checked={b.songOrig} onChange={(e) => setB({ songOrig: e.target.checked })} /><i /></label>
              <p className="hint">霞鹜新致宋衍生自 IPA 字体，按 <a href="/fonts/LICENSE-IPA-1.0.md" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>IPA Font License 1.0</a> 授权。打开开关会改用你设备上安装的「IPAex明朝」，换回方法见 <a href="/fonts/README.md" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>说明</a></p>
            </>
          )}
        </Card>

        <Card icon="image" title="壁纸">
          <div className="wps">
            <button className={`wp ${b.wp === "default" ? "on" : ""}`} aria-label="默认壁纸" style={{ backgroundImage: `url(${DEFAULT_WP})` }} onClick={() => setB({ wp: "default" })} />
            {userWp && (
              <button className={`wp ${b.wp === "user" ? "on" : ""}`} aria-label="我的壁纸" style={{ backgroundImage: `url(${userWp})` }} onClick={() => setB({ wp: "user" })}>
                <span className="x" role="button" aria-label="删除我的壁纸" onClick={(e) => { e.stopPropagation(); removeUserWp(); }}><GIcon n="x" s={12} w={2.4} /></span>
              </button>
            )}
            <label className="wp add" aria-label="上传壁纸">
              <GIcon n="plus" s={22} />
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
            </label>
          </div>
          <p className="hint">桌面、聊天、所有玻璃共用这一张壁纸。图片只存在这台设备里</p>
        </Card>

        <Card icon="spark" title="动效">
          <Seg label="动效" value={b.motion} opts={[[1, "水波流动"], [0, "静止省电"]]} onChange={(v) => setB({ motion: v as 0 | 1 })} />
          <p className="hint">
            {rm ? "系统开了「减弱动态效果」，所以现在用的是普通毛玻璃，不跑水波。" : noGL ? "这台设备不支持 WebGL，现在用的是普通毛玻璃。" : "关掉玻璃或设备不支持 WebGL 时，自动换成普通毛玻璃，不影响阅读"}
          </p>
        </Card>

        <Card icon={theme === "dark" ? "moon" : "sun"} title="外观">
          <Seg label="浅色或深色" value={theme} opts={[["light", "浅色"], ["dark", "深色"]]} onChange={(v) => set("theme", v)} />
          <p className="hint">记忆本、设置、文件柜这些页面的浅色 / 深色</p>
        </Card>
      </div>
    </WallScreen>
  );
}
