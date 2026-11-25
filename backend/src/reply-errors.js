// 回复出错时说人话：按原因分类，并告诉前端可以做什么（重试 / 去设置 / 重新登录）
// kind: login | quota | network | param | timeout | busy | other
// actions: retry（重试）/ settings（去设置）/ relogin（重新登录）/ continue（接着说）

const ACTIONS = {
  login: ["relogin", "settings"],
  quota: ["settings", "retry"],
  network: ["retry"],
  param: ["settings", "retry"],
  timeout: ["retry", "settings"],
  busy: ["retry"],
  other: ["retry", "settings"],
};

/**
 * @param {{status?: number, message?: string, via?: "api"|"codex", timeout?: "first"|"stall"|"total", seconds?: number}} e
 */
export function classifyReplyError(e = {}) {
  const status = Number(e.status) || 0;
  const raw = String(e.message || "");
  const codex = e.via === "codex";
  let kind = "other";
  let message;
  if (e.timeout) {
    kind = "timeout";
    const s = e.seconds ? `${e.seconds} 秒` : "";
    message = e.timeout === "first" ? `等了${s}还没收到第一个字，先停下了` :
      e.timeout === "stall" ? `回复中途卡住超过${s}，先停下了，已经写出的字都留着` :
        `这条回复写了太久（超过${s}），先停下了，已经写出的字都留着`;
  } else if (/codex_busy|上一条还在回复中/.test(raw) || status === 409 && /busy/i.test(raw)) {
    kind = "busy"; message = "上一条还在回复中，等它说完再发吧";
  } else if (status === 401 || status === 403 || /not logged in|unauthori[sz]ed|invalid api key|incorrect api key|authentication|登录过期|没登录|token.*(expired|revoked)/i.test(raw)) {
    kind = "login";
    message = codex ? "Codex 的 ChatGPT 登录过期了，重新登录一下就好" : "接口说 Key 不对或登录过期了，去设置里检查一下连接";
  } else if (status === 429 || status === 402 || /usage limit|rate limit|quota|insufficient|余额|额度|billing|credit/i.test(raw)) {
    kind = "quota";
    message = codex ? "ChatGPT 订阅这阵子的额度用完啦，等它恢复，或先切到别的连接" : "这个接口的额度用完了或者被限流了，稍等一下，或者去设置换个连接";
  } else if (status === 400 || status === 404 || status === 413 || status === 422 || /invalid|unsupported|not supported|unknown parameter|does not exist|model_not_found|context_length|too many tokens|参数/i.test(raw)) {
    kind = "param";
    message = /context_length|too many tokens|413/.test(raw) || status === 413 ? "这次要带的内容太长了，接口收不下；可以换窗或删掉几条再试" :
      "接口不接受这次的请求参数（可能是模型名或思考参数），去设置里看看";
  } else if (status === 0 || status === 502 || status === 503 || status === 504 || status === 520 || status === 522 || status === 524 ||
    /fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket|network|tunnel|连不上|Backend unavailable|terminated|other side closed/i.test(raw)) {
    kind = "network";
    message = "网络或隧道断开了，模型那边没接上；稍后重试就好";
  }
  if (!message) message = "回复出了点状况" + (raw ? "：" + raw.slice(0, 160) : "");
  return { kind, message, actions: ACTIONS[kind], detail: raw.slice(0, 300) };
}
