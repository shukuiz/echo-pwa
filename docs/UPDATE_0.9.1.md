# 0.9.1 接入

Cloudflare Workers AI 使用免费计划。后端环境设置 ECHO_CF_ACCOUNT_ID 和 ECHO_CF_TRANSLATE_TOKEN，Token 只需调用 Workers AI 的权限。接通前核对账号处于 Free 计划，避免付费计划的超额费用。免费额度失败时保留原文。设置 → 思考 显示是否已配置。只发送从上游拆出的 reasoning 字段，聊天正文不会传入翻译。

Echo 会话文件保存在 ECHO_DATA_DIR/auth-sessions.json，只存会话散列。部署应保留同一个数据目录。退出会使对应会话失效，修改密码会使之前的会话失效。浏览器仍需保留 Cookie。

Serein 补丁以 Yinglianchun/Serein 43dfa5b 为基础，在实际运行目录备份 web/server/webAuth.mjs 后应用 scripts/serein-web-session.patch。原有 Basic 调用保持兼容，网页登录保存 30 天 Cookie，POST /auth/logout 可退出设备。凭据重置会使 Cookie 失效。固定域名的具体配置取决于 Cloudflare 账号已有的域名，临时隧道换地址后需要重新登录。
