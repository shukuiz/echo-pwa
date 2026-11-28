"use client";

// 相册：我的 / echo 的，两个分开的册子。我的这本 echo 看不到图，只知道我截图了
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/Chrome";
import { IconTrash } from "@/components/Icons";
import { albumDelete, albumFileUrl, albumList, type AlbumItem } from "@/lib/api";

type Who = "mine" | "echo";

/** 存到手机：能系统分享就分享（iOS 可直接存进相册），否则逐张下载 */
async function saveToPhone(items: AlbumItem[], toast: (t: string) => void) {
  try {
    const files: File[] = [];
    for (const it of items) {
      const res = await fetch(albumFileUrl(it.id));
      const blob = await res.blob();
      files.push(new File([blob], `${it.title || "echo"}-${it.id}.png`, { type: blob.type || "image/png" }));
    }
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files })) {
      await nav.share({ files });
      return;
    }
    for (const f of files) {
      const url = URL.createObjectURL(f);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    toast("已经导出到下载了");
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return;
    toast("存到手机没成功，再试一次");
  }
}

export default function AlbumPage() {
  const [who, setWho] = useState<Who>("mine");
  const [items, setItems] = useState<AlbumItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<AlbumItem | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const toast = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(null), 1800);
  };

  const load = useCallback(() => {
    setLoading(true);
    albumList(who)
      .then((r) => setItems(r.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [who]);

  useEffect(load, [load]);

  const remove = async (ids: string[]) => {
    try {
      await Promise.all(ids.map((id) => albumDelete(id)));
      setItems((x) => x.filter((i) => !ids.includes(i.id)));
      toast(`删掉 ${ids.length} 张`);
    } catch {
      toast("没删掉，等下再试");
    }
    setSel([]);
    setPick(null);
  };

  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const picked = items.filter((i) => sel.includes(i.id));

  return (
    <PageShell
      title="相册"
      right={
        <button
          type="button"
          className="press rounded-capsule px-3 py-1.5 text-[14px] text-rose"
          onClick={() => { setSelecting((v) => !v); setSel([]); }}
        >
          {selecting ? "完成" : "选择"}
        </button>
      }
    >
      <div className="glass mb-3 mt-1 flex rounded-capsule p-1">
        {([["mine", "我"], ["echo", "echo"]] as [Who, string][]).map(([v, label]) => (
          <button
            key={v}
            onClick={() => { setWho(v); setSel([]); }}
            className={`flex-1 rounded-capsule px-3 py-2 text-[15px] transition ${who === v ? "bg-tile font-semibold text-rose shadow-soft" : "text-ink/75"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mb-3 text-[12.5px] leading-relaxed text-mute">
        {who === "mine"
          ? "这个相册 echo 看不到里面的图，只知道你截了图。多选可以再存一份到手机相册。"
          : "echo 自己存进来的截图，它也能看到。"}
      </p>

      {loading ? (
        <p className="py-20 text-center text-mute">正在翻开相册…</p>
      ) : items.length === 0 ? (
        <p className="rounded-[24px] bg-tile/70 px-4 py-16 text-center text-[14px] leading-relaxed text-mute">
          还没有图。<br />聊天里长按一条消息 → 「截成图片」，就会存进来
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => (selecting ? toggle(it.id) : setPick(it))}
              className="relative aspect-square overflow-hidden rounded-2xl bg-tile"
            >
              {/* 图片要带登录 cookie，所以走同一个域名 */}
              <img src={albumFileUrl(it.id)} alt={it.title || "相册图片"} className="h-full w-full object-cover" loading="lazy" />
              {sel.includes(it.id) && (
                <span className="absolute inset-0 grid place-items-center bg-ink/35 text-[22px] text-white">✓</span>
              )}
            </button>
          ))}
        </div>
      )}

      {selecting && picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] border-t border-line bg-cream/95 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <button onClick={() => saveToPhone(picked, toast)} className="btn-primary min-h-11 flex-1">
              存到手机（{picked.length}）
            </button>
            <button onClick={() => remove(sel)} className="btn-ghost flex min-h-11 items-center gap-1 px-4 text-rose">
              <IconTrash size={16} /> 删除
            </button>
          </div>
        </div>
      )}

      {pick && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/95">
          <div className="flex items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top)+12px)] text-white">
            <span className="text-[14px] opacity-70">{new Date(pick.at).toLocaleString("zh-CN")}</span>
            <button onClick={() => setPick(null)} className="rounded-capsule px-3 py-1.5 text-[15px]">关闭</button>
          </div>
          <img src={albumFileUrl(pick.id)} alt="相册图片" className="m-auto max-h-[76vh] w-full object-contain" />
          <div className="flex items-center justify-center gap-3 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-3">
            <button onClick={() => saveToPhone([pick], toast)} className="rounded-capsule bg-white px-5 py-2.5 text-[15px] text-ink">存到手机</button>
            <button onClick={() => remove([pick.id])} className="rounded-capsule bg-white/15 px-5 py-2.5 text-[15px] text-white">删除</button>
          </div>
        </div>
      )}

      {note && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center">
          <span className="animate-pop rounded-capsule bg-ink/85 px-4 py-2 text-[14px] text-cream">{note}</span>
        </div>
      )}
    </PageShell>
  );
}
