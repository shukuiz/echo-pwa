"use client";

// 美化页：分组收纳（风格 / 颜色 / 玻璃参数 / 字体 / 壁纸 / 外观），顶部一条实时小预览，
// 改哪一项，预览里对应的那一块会亮一下（一一对应）。改动是草稿，点右上角或底部「保存」才落盘。
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Beauty, DEFAULT_ACCENT, FCOLS, ICOLS, MES, PRESETS, SLIDERS, TINTS, useBeauty } from "@/lib/beauty";
import { useStore } from "@/lib/store";
import { delBlob, downscale, putBlob, useBlobUrl } from "@/lib/idb";
import { engine } from "@/components/glass/engine";
import { useGlassRect } from "@/components/glass/hooks";
import { GIcon, WallScreen } from "@/components/glass/Wall";
import { DEFAULT_WP } from "@/components/glass/GlassRoot";

type GroupId = "style" | "color" | "glass" | "font" | "wall" | "look";
/** 预览里会被「点亮」的部分 */
type Part = "card" | "icon" | "ai" | "me" | "accent" | "text";
const OPEN_KEY = "echo-beauty-open-v1";
const DEFAULT_OPEN: GroupId[] = ["style"];
const ACCENTS: [string, string][] = [["默认", DEFAULT_ACCENT], ["冰蓝", "#2367ad"], ["苔绿", "#41745b"], ["雾紫", "#75529c"]];

const nameOf = (list: [string, string][], c: string) => list.find(([, v]) => v.toLowerCase() === c.toLowerCase())?.[0] ?? "自定义";

function loadOpen(): Set<GroupId> {
  try {
    const raw = JSON.parse(localStorage.getItem(OPEN_KEY) || "null");
    if (Array.isArray(raw)) return new Set(raw.filter((x): x is GroupId => typeof x === "string") as GroupId[]);
  } catch {}
  return new Set(DEFAULT_OPEN);
}

function Group({ id, icon, title, summary, open, onToggle, children }: {
  id: GroupId; icon: string; title: string; summary: React.ReactNode; open: boolean; onToggle: (id: GroupId) => void; children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useGlassRect(ref);
  const bodyId = `bg-${id}`;
  return (
    <section ref={ref} className={`g card grp ${open ? "open" : ""}`} data-glass data-group={id}>
      <h3>
        <button type="button" className="grp-h" aria-expanded={open} aria-controls={bodyId} onClick={() => onToggle(id)}>
          <GIcon n={icon} s={17} />
          <span className="grp-t">{title}</span>
          <span className="grp-s">{summary}</span>
          <GIcon n="chev" s={18} w={2.2} className="grp-c" />
        </button>
      </h3>
      <div className="grp-b" id={bodyId} role="region" aria-label={title}>
        <div className="grp-in">{children}</div>
      </div>
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

/** 顶部实时小预览：一个图标 + 两个气泡 + 重点色小点和「今天」圆圈 */
function Preview({ b, hi }: { b: Beauty; hi: Part | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useGlassRect(ref);
  const on = (p: Part) => (hi === p ? " pv-hi" : "");
  const d = new Date().getDate();
  return (
    <div ref={ref} className={`g card pv${on("card")}`} data-glass data-tint="0.04" aria-label="效果预览" role="img">
      <div className={`g icn pvicn${on("icon")}`} data-cssg data-icn><GIcon n="chat" s={22} /></div>
      <div className="pvchat">
        <div className={`g bub ai pvb${on("ai")}${on("text")}`} data-cssg>今天也要好好的</div>
        <div className={`g bub me pvb${on("me")}`} data-cssg data-hue="me" data-tint="0.22">嗯 ( ˘ᵕ˘ )</div>
      </div>
      <div className={`pvacc${on("accent")}`} aria-hidden>
        <i className="pvdot" /><b className="pvtd">{d}</b>
      </div>
    </div>
  );
}

export default function BeautyPage() {
  const { b, setB, dirty, beginDraft, endDraft, save, discard } = useBeauty();
  const { theme, set, toast } = useStore();
  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [open, setOpen] = useState<Set<GroupId>>(() => new Set(DEFAULT_OPEN));
  const [hi, setHi] = useState<Part | null>(null);
  const hiT = useRef<ReturnType<typeof setTimeout>>();
  useGlassRect(barRef, true);
  useGlassRect(saveRef, true);

  // 进页面开草稿：改动立刻预览，点「保存」才落盘；没保存就离开会回到上次保存的样子
  useEffect(() => { beginDraft(); return () => endDraft(false); }, [beginDraft, endDraft]);
  // 记住哪些分组是展开的
  useEffect(() => { setOpen(loadOpen()); }, []);
  useEffect(() => () => clearTimeout(hiT.current), []);

  const toggle = useCallback((id: GroupId) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(OPEN_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
    // 展开/收起有动画：玻璃位置跟着重新量
    engine.invalidate();
    setTimeout(() => engine.invalidate(), 360);
  }, []);

  /** 改设置 + 点亮预览里受影响的那一块 */
  const upd = (patch: Partial<Beauty> | ((p: Beauty) => Partial<Beauty>), part: Part) => {
    setB(patch);
    setHi(part);
    clearTimeout(hiT.current);
    hiT.current = setTimeout(() => setHi(null), 900);
  };

  const goBack = () => (window.history.length > 1 ? router.back() : router.push("/"));
  async function doSave(thenLeave = false) {
    if (saving) return;
    setSaving(true);
    const r = await save();
    setSaving(false);
    if (!r.local) toast("没存上，可能是手机空间不够 (；´д｀)");
    else toast(r.cloud === "ok" ? "已保存 ✓" : "已保存到本机 ✓ 云端备份稍后再试");
    if (thenLeave && r.local) { setLeaving(false); goBack(); }
  }
  const userWp = useBlobUrl("wp:user");
  const rm = engine.rm, noGL = engine.noGL;
  const glass = b.theme === "glass";

  const P = (k: keyof Beauty["P"], v: number) => upd((p) => ({ P: { ...p.P, [k]: v }, preset: null }), "card");

  async function upload(f: File) {
    try {
      await putBlob("wp:user", await downscale(f, 2048, 0.9));
      upd({ wp: "user" }, "card");
      toast("壁纸换好啦");
    } catch { toast("壁纸没存上，可能是空间不够 (；´д｀)"); }
  }
  async function removeUserWp() {
    await delBlob("wp:user");
    upd({ wp: "default" }, "card");
  }

  const presetName = b.preset ? ({ mist: "雾窗", clear: "清透", frost: "磨砂" } as const)[b.preset] : "自定义";
  const dot = (c: string) => <i className="sdot" style={{ background: c }} />;

  return (
    <WallScreen gl fixed className="bpage">
      <div className="top">
        <div className="hstatus fake-sb" style={{ height: 48, paddingTop: 6 }} data-onwp><span /><span /></div>
        <div ref={barRef} className="g wbar" data-glass data-tint="0.08">
          <button className="back" aria-label="返回" onClick={() => (dirty ? setLeaving(true) : goBack())}><GIcon n="back" s={20} /></button>
          <b>美化</b>
          {dirty && <span className="unsaved" role="status"><i />未保存</span>}
          <button className={`topsave ${dirty ? "on" : ""}`} disabled={!dirty || saving} onClick={() => doSave()} aria-label="保存美化设置">
            {saving ? "保存中" : dirty ? "保存" : <><GIcon n="check" s={15} w={2.4} />已存</>}
          </button>
        </div>
        <div className="pvwrap"><Preview b={b} hi={hi} /></div>
      </div>
      <div className="bscroll" data-gclip>
        <Group id="style" icon="layers" title="风格" open={open.has("style")} onToggle={toggle}
          summary={glass ? "液态玻璃" : `仿真 · ${b.mat === "frost" ? "磨砂" : "实色"}`}>
          <div className="opts">
            <button className={`opt ${glass ? "on" : ""}`} aria-pressed={glass} onClick={() => upd({ theme: "glass" }, "card")}>
              <b><GIcon n="drop" s={18} />液态玻璃</b><small>会折射身后的壁纸，边缘有一道光</small>
            </button>
            <button className={`opt ${!glass ? "on" : ""}`} aria-pressed={!glass} onClick={() => upd({ theme: "real" }, "card")}>
              <b><GIcon n="phone" s={18} />仿真</b><small>像 iPhone 一样柔和，不用 WebGL</small>
            </button>
          </div>
          {!glass && (
            <div style={{ marginTop: 10 }}>
              <div className="sub">材质</div>
              <Seg label="材质" value={b.mat} opts={[["frost", "磨砂"], ["solid", "实色"]]} onChange={(v) => upd({ mat: v }, "card")} />
              <div className="sub">图标颜色</div>
              <Swatches label="图标颜色" list={ICOLS} value={b.icon} onPick={(c) => upd({ icon: c }, "icon")} />
              <div style={{ marginTop: 8 }}><Slider wide label="图标透明度" value={b.iconA} max={100} suffix="%" onChange={(v) => upd({ iconA: v }, "icon")} /></div>
              <p className="hint">桌面和 Dock 的图标统一用这个颜色，图案会自己变深或变浅</p>
            </div>
          )}
          <div className="sub">小组件透明度</div>
          <Slider wide label="透明度" value={b.wA} max={100} suffix="%" onChange={(v) => upd({ wA: v }, "card")} />
          <p className="hint">
            {glass ? "玻璃里只淡化染色和底色，折射和边缘光不变。" : "只改小组件的底板。"}照片和动图本身不会变透明
          </p>
        </Group>

        <Group id="color" icon="palette" title="颜色" open={open.has("color")} onToggle={toggle}
          summary={<>{dot(b.tint)}{nameOf(TINTS, b.tint)} · {dot(b.accent)}{nameOf(ACCENTS, b.accent)}</>}>
          <div className="sub" style={{ marginTop: 0 }}>色调</div>
          <Swatches label="色调" list={TINTS} value={b.tint} onPick={(c) => upd({ tint: c }, "card")} />
          <div style={{ marginTop: 8 }}><Slider label="浓度" value={b.P.tint} max={80} onChange={(v) => P("tint", v)} /></div>
          <p className="hint">玻璃染上这个颜色，{b.inkMode === "auto" ? "文字会自己挑深色或浅色，保证看得清" : "字色用下面「字体颜色」里选的"}</p>

          <div className="sub">重点色</div>
          <Swatches label="重点色" list={ACCENTS} value={b.accent} onPick={(accent) => upd({ accent }, "accent")} />
          <label className="hexrow">
            色值
            <input key={b.accent} defaultValue={b.accent} aria-label="重点色色值" maxLength={7} spellCheck={false}
              autoCapitalize="none" autoCorrect="off" className="hexin"
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              onBlur={(e) => {
                const color = e.currentTarget.value.trim().replace(/^#?/, "#").toLowerCase();
                if (/^#[\da-f]{6}$/.test(color)) { if (color !== b.accent) upd({ accent: color }, "accent"); }
                else { e.currentTarget.value = b.accent; toast("请输入六位十六进制色值"); }
              }} />
          </label>
          <p className="hint">秒针、头像星星、提醒铃铛、日历「今天」、开关和保存按钮都从这一个颜色里取深浅和邻近色</p>

          <div className="sub">字体颜色</div>
          <Seg label="字体颜色" value={b.inkMode} opts={[["auto", "自动"], ["custom", "自定义"]]} onChange={(v) => upd({ inkMode: v }, "text")} />
          {b.inkMode === "custom" && <div style={{ marginTop: 12 }}><Swatches label="字体颜色" list={FCOLS} value={b.inkColor} onPick={(c) => upd({ inkColor: c }, "text")} /></div>}
          <p className="hint">
            {b.inkMode === "auto" ? "按每块玻璃身后的壁纸明暗，自动挑深色或浅色字" : "桌面、标题栏和聊天气泡都用这个颜色，看不清时会自动补一点阴影"}
          </p>

          <div className="sub">我方气泡</div>
          <Seg label="气泡样式" value={b.bubMode} opts={[["glass", "全玻璃"], ["tint", "我方带色"]]} onChange={(v) => upd({ bubMode: v }, "me")} />
          <div style={{ marginTop: 10 }}><Swatches label="我方气泡颜色" list={MES} value={b.me} onPick={(c) => upd({ me: c, bubMode: "tint" }, "me")} /></div>
          <div className="sub">我方气泡字色</div>
          <Seg label="我方气泡字色" value={b.meInkMode} opts={[["follow", "跟随字体颜色"], ["custom", "单独设置"]]} onChange={(v) => upd({ meInkMode: v }, "me")} />
          {b.meInkMode === "custom" && <div style={{ marginTop: 12 }}><Swatches label="我方气泡字色" list={FCOLS} value={b.meInkColor} onPick={(c) => upd({ meInkColor: c }, "me")} /></div>}
        </Group>

        {glass && (
          <Group id="glass" icon="drop" title="玻璃参数" open={open.has("glass")} onToggle={toggle}
            summary={`${presetName} · ${b.motion ? "水波" : "静止"}`}>
            <Seg label="玻璃预设" value={b.preset} opts={[["mist", "雾窗"], ["clear", "清透"], ["frost", "磨砂"]]} onChange={(v) => upd({ preset: v, P: { ...PRESETS[v] } }, "card")} />
            <div style={{ marginTop: 8 }}>
              {SLIDERS.map(([k, l, max]) => <Slider key={k} label={l} value={b.P[k]} max={max} onChange={(v) => P(k, v)} />)}
            </div>
            <div className="sub">动效</div>
            <Seg label="动效" value={b.motion} opts={[[1, "水波流动"], [0, "静止省电"]]} onChange={(v) => upd({ motion: v as 0 | 1 }, "card")} />
            <p className="hint">
              {rm ? "系统开了「减弱动态效果」，所以现在用的是普通毛玻璃，不跑水波。" : noGL ? "当前设备使用低开销的毛玻璃和高光效果。" : "设备不支持 WebGL 时，自动换成普通毛玻璃，不影响阅读"}
            </p>
          </Group>
        )}

        <Group id="font" icon="type" title="字体" open={open.has("font")} onToggle={toggle}
          summary={b.font === "sys" ? "默认苹方" : b.songOrig ? "IPA 原始字体" : "霞鹜新致宋"}>
          <div className="opts">
            <button className={`opt ${b.font === "sys" ? "on" : ""}`} aria-pressed={b.font === "sys"} onClick={() => upd({ font: "sys" }, "text")}>
              <b>默认苹方</b><span className="smp" style={{ fontFamily: "-apple-system,'PingFang SC',system-ui,sans-serif" }}>今天也要开心</span>
            </button>
            <button className={`opt ${b.font === "song" ? "on" : ""}`} aria-pressed={b.font === "song"} onClick={() => upd({ font: "song" }, "text")}>
              <b style={{ fontFamily: b.font === "song" ? "ZhiSong,'Songti SC',serif" : "'Songti SC',serif" }}>霞鹜新致宋</b>
              <span className="smp" style={{ fontFamily: b.font === "song" ? "ZhiSong,'Songti SC',serif" : "'Songti SC',serif" }}>今天也要开心</span>
            </button>
          </div>
          <p className="hint">全局生效：桌面、聊天、设置都会换。霞鹜新致宋约 1.2MB，第一次选它时才下载</p>
          {b.font === "song" && (
            <>
              <label className="btgl"><span>改用本机 IPA 原始字体</span><input type="checkbox" checked={b.songOrig} onChange={(e) => upd({ songOrig: e.target.checked }, "text")} /><i /></label>
              <p className="hint">霞鹜新致宋衍生自 IPA 字体，按 <a className="lnk" href="/fonts/LICENSE-IPA-1.0.md" target="_blank" rel="noreferrer">IPA Font License 1.0</a> 授权。打开开关会改用你设备上安装的「IPAex明朝」，换回方法见 <a className="lnk" href="/fonts/README.md" target="_blank" rel="noreferrer">说明</a></p>
            </>
          )}
        </Group>

        <Group id="wall" icon="image" title="壁纸" open={open.has("wall")} onToggle={toggle}
          summary={b.wp === "user" && userWp ? "我的壁纸" : "默认壁纸"}>
          <div className="wps">
            <button className={`wp ${b.wp === "default" ? "on" : ""}`} aria-label="默认壁纸" style={{ backgroundImage: `url(${DEFAULT_WP})` }} onClick={() => upd({ wp: "default" }, "card")} />
            {userWp && (
              <button className={`wp ${b.wp === "user" ? "on" : ""}`} aria-label="我的壁纸" style={{ backgroundImage: `url(${userWp})` }} onClick={() => upd({ wp: "user" }, "card")}>
                <span className="x" role="button" aria-label="删除我的壁纸" onClick={(e) => { e.stopPropagation(); removeUserWp(); }}><GIcon n="x" s={12} w={2.4} /></span>
              </button>
            )}
            <label className="wp add" aria-label="上传壁纸">
              <GIcon n="plus" s={22} />
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
            </label>
          </div>
          <p className="hint">桌面、聊天、所有玻璃共用这一张壁纸。图片只存在这台设备里</p>
        </Group>

        <Group id="look" icon={theme === "dark" ? "moon" : "sun"} title="外观" open={open.has("look")} onToggle={toggle}
          summary={theme === "dark" ? "深色" : "浅色"}>
          <Seg label="浅色或深色" value={theme} opts={[["light", "浅色"], ["dark", "深色"]]} onChange={(v) => set("theme", v)} />
          <p className="hint">记忆本、设置、文件柜这些页面的浅色 / 深色（这一项点了就生效，不用保存）</p>
        </Group>
      </div>

      {/* 底部保存条：一直在，改过才亮 */}
      <div className="savewrap">
        <div ref={saveRef} className={`g savebar ${dirty ? "on" : ""}`} data-glass data-tint="0.1">
          <span className="st" aria-live="polite">{dirty ? <><i className="dot" />改了还没保存，现在看到的是预览</> : <><GIcon n="check" s={15} w={2.4} />都保存好啦</>}</span>
          {dirty && <button className="ghost" onClick={discard}>撤销</button>}
          <button className="save" disabled={!dirty || saving} onClick={() => doSave()}>{saving ? "保存中…" : "保存"}</button>
        </div>
      </div>

      {leaving && (
        <>
          <div className="gmask" onClick={() => setLeaving(false)} />
          <div className="gsheet on" role="dialog" aria-label="还没保存">
            <div className="grab" />
            <div className="sh-h"><b>改动还没保存</b></div>
            <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>不保存的话，离开后会回到上次保存的样子</p>
            <div className="addl">
              <button className="gbtn dark" onClick={() => doSave(true)}>保存并返回</button>
              <button className="gbtn red" onClick={() => { setLeaving(false); discard(); goBack(); }}>不保存，直接返回</button>
              <button className="gbtn" onClick={() => setLeaving(false)}>继续编辑</button>
            </div>
          </div>
        </>
      )}
    </WallScreen>
  );
}
