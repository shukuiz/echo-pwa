# echo · 手机竖屏 PWA

Next.js 14 (App Router) + Tailwind CSS。P0 已接入轻量后端（`backend/`）：聊天真转发、记忆与聊天记录存后端，Key 只存后端。

## 运行
```bash
npm install
npm run dev          # 开发：http://localhost:3000
npm run build && npm start   # 生产（Service Worker 只在生产模式注册）
```
手机上用 Safari 打开 → 分享 → 添加到主屏幕，即以独立 App 方式运行。

## 后端（P0）
见 [`backend/README.md`](backend/README.md)。启动后端后，在设置页填 API Key（或本地代理地址）即可真聊天；记忆本新增/改/删/置顶都落到后端。

## 目录
- app/page.tsx            桌面：小组件 + 图标网格（长按编辑、拖动重排、翻页）+ Dock，见 components/home/
- app/beauty              美化：液态玻璃 / 仿真、色调、字体颜色、小组件透明度、玻璃参数、气泡、字体、壁纸、动效
- app/chat                聊天：流式逐字、停止生成、失败重试；长按（桌面右键）气泡弹玻璃菜单：复制 / 记住 / 收藏 / 多选 / 从这句以后 / 重新生成本轮 / 删除；
                          多选模式底部有 删除 / 收藏 / 记住，「从这句以前 / 以后」一键勾一段，删除会同步删后端 chat.json
- app/favorites           收藏本：收藏的单条或多条消息（一次收藏 = 一个条目），搜索、复制、删除、回到聊天（/api/favorites）
- app/workbench           工作台（P1 接入工具，P0 未动）
- app/memory              记忆本（对齐 Serein）：场景 / 事件 / 喜好 / 人设，搜索、筛选、排序、编辑（cues、重要度、分类、日期、归档、收藏、置顶）、
                          召回测试（POST /api/memory/recall，没配置模型时提示去设置）、导出 JSON 备份。网关接口约定见 docs/MEMORY_GATEWAY.md
- app/reminders           记事提醒：一句话解析时间（lib/parseTime.ts）
- app/settings            设置：API Key + 代理地址（只存后端）、Codex / Claude Code 开关、测试连接（真实请求）、浅/深色
- components/Chrome.tsx   状态栏、返回按钮、Home 指示条、底部面板、开关、分段选择
- lib/api.ts              后端 API 封装（聊天流式 / 记忆 / 文件 / 设置）
- lib/store.tsx           全局状态；启动时从后端拉取，localStorage 作离线兜底
- components/glass/       液态玻璃：全屏 WebGL 引擎（engine.ts）、useGlassRect、有壁纸的页面外壳
- lib/beauty.tsx          美化设置（localStorage `echo-beauty-v1`，逐字段校验迁移；保存时备份到后端 /api/beauty）
- lib/memory.ts           记忆本数据层（以后换网关只改这里）；lib/favorites.ts 收藏本数据层
- lib/idb.ts              壁纸、照片、动图存 IndexedDB（`echo-media`）
- backend/                轻量后端（Fastify，4 GiB 常开）

## 美化 / 液态玻璃
- 液态玻璃：一张全屏 WebGL 画布画壁纸和所有玻璃（折射、边缘光、波动、染色），每页最多 12 块内容 + 4 块标题栏/Dock，多出来的自动换 CSS 毛玻璃。
- 没有 WebGL、或系统开了「减弱动态效果」时，全部用 CSS 毛玻璃；「仿真」风格不用 WebGL。
- 字色默认「自动」：按每块玻璃身后的壁纸明暗挑深/浅；也可以在「字体颜色」里自定义（我方气泡可单独设）。
- 壁纸、照片、动图只存在这台设备的 IndexedDB 里，不上传后端；默认壁纸是生成的中性渐变（public/wallpapers/default.jpg）。
- 霞鹜新致宋：public/fonts/zhisong.woff2 是 GB2312 子集，按 IPA Font License 1.0 授权（不是 OFL），见 public/fonts/README.md；只在选中时下载。
- `npm run lint` / `npm run typecheck` 检查代码。

## 美化页的保存
- 美化页里的改动立刻预览，点底部「保存」才落盘；标题栏会显示「有改动未保存」，没保存就返回会问一下。
- 保存同时写本机 localStorage 和后端 `/api/beauty`（只存设置，不含壁纸 / 照片）。iOS 每次「添加到主屏幕」都是一份全新的本地存储，
  所以重新添加后会自动从后端取回美化设置；自定义壁纸图片存在设备里，需要重新选一次。
- 桌面编辑（拖动、增删小组件）和设置页的重点色仍是自动保存。

## P0 验收
1. 后端跑起来，手机浏览器能打开小手机，填 Key 后能真聊天。
2. 改一条记忆，下一条回复就用上；刷新/重启后端不丢，可导出备份。
