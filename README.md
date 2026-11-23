# echo · 手机竖屏 PWA（前端演示版）

Next.js 14 (App Router) + Tailwind CSS，只用假数据，不接后端。数据存在浏览器 localStorage。

## 运行
```bash
npm install
npm run dev          # 开发：http://localhost:3000
npm run build && npm start   # 生产（Service Worker 只在生产模式注册）
```
手机上用 Safari 打开 → 分享 → 添加到主屏幕，即以独立 App 方式运行。

## 目录
- app/page.tsx            桌面：状态栏、echo 状态胶囊、控制中心组件、图标网格、Dock
- app/chat                聊天：逐字打出、停止生成、失败重试、轻触气泡复制/删除、「正在做…」、同意/不同意卡片
- app/workbench           工作台：四个任务卡片，一句话触发模拟任务（可 ?tool=preset|translate|media|miniapp 直达）
- app/memory              记忆本：人设 / 文字记忆 / 今日总结 / 提醒，增删改、置顶、导出 JSON 备份
- app/reminders           记事提醒：一句话解析时间（lib/parseTime.ts）
- app/settings            设置：API Key + 代理地址、Codex / Claude Code 开关与默认入口、测试连接（模拟）、浅/深色
- components/Chrome.tsx   状态栏、返回按钮、Home 指示条、底部面板、开关、分段选择
- lib/store.tsx           全局状态 + 本地持久化；lib/mock.ts 假数据与模拟回复

## 聊天里可以试的话
- 「帮我写一段文案」→ 显示「正在做…」再逐字输出
- 「删除旧文件」「运行脚本」→ 上方弹出 同意 / 不同意 卡片
- 「模拟失败」→ 失败气泡，点「重试」
- 生成过程中点黑色方块 = 停止生成

## 接真实后端时
替换 app/chat/page.tsx 里的 `run()`（改为调用 settings.proxyUrl + apiKey 的流式接口）和 settings 页的 `testConnection()` 即可。
