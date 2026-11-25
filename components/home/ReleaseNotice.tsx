"use client";
import { useEffect, useRef } from "react";
import { release } from "@/lib/release";

export default function ReleaseNotice() {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let seen = "";
    try { seen = localStorage.getItem("echo-release-seen") || ""; } catch {}
    if (seen !== release.version) dialog.current?.showModal();
  }, []);
  return <>
    <button style={{position:"fixed",top:"max(6px, env(safe-area-inset-top))",right:12,zIndex:45,fontSize:12,borderRadius:16,padding:"4px 10px",background:"#fff",color:"#283342"}} onClick={()=>dialog.current?.showModal()}>更新公告</button>
    <dialog ref={dialog} onClose={()=>{try {localStorage.setItem("echo-release-seen",release.version);} catch {}}} style={{margin:"auto",width:"min(90vw, 24rem)",borderRadius:20,padding:24}}>
      <small>更新公告 · {release.version}</small><h2>{release.title}</h2>
      <ul>{release.changes.map(line=><li key={line} style={{margin:"12px 0"}}>{line}</li>)}</ul>
      <button onClick={()=>dialog.current?.close()}>知道了</button>
    </dialog>
  </>;
}
