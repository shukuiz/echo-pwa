// 从一句中文里解析提醒时间（前端模拟用，覆盖常见说法）
// 支持：3分钟后 / 2小时后 / 今天 今晚 明天 后天 / 周五 星期三 / 早上 上午 中午 下午 晚上 / 8点 8点半 8:30 / 21:00

const CN: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function cnToNum(s: string): number {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s === "十") return 10;
  if (s.startsWith("十")) return 10 + (CN[s[1]] ?? 0);
  if (s.includes("十")) {
    const [a, b] = s.split("十");
    return (CN[a] ?? 1) * 10 + (b ? CN[b] ?? 0 : 0);
  }
  return CN[s] ?? NaN;
}

const NUM = "(\\d{1,2}|[零一二两三四五六七八九十]{1,3})";

export function parseReminder(input: string, base = new Date()): { time: number; text: string; matched: boolean } {
  let text = input.trim();
  const d = new Date(base);
  let matched = false;

  // 相对时间
  const rel = text.match(new RegExp(`${NUM}\\s*(分钟|小时|个小时)后`));
  if (rel) {
    const n = cnToNum(rel[1]);
    const ms = rel[2] === "分钟" ? n * 60_000 : n * 3600_000;
    text = text.replace(rel[0], "");
    return { time: base.getTime() + ms, text: clean(text), matched: true };
  }

  // 日期
  let dayOffset = 0;
  if (/后天/.test(text)) { dayOffset = 2; matched = true; }
  else if (/明天|明早|明晚/.test(text)) { dayOffset = 1; matched = true; }
  else if (/今天|今晚|今早/.test(text)) { matched = true; }
  const wk = text.match(/(周|星期|礼拜)([一二三四五六日天])/);
  if (wk) {
    const target = "日一二三四五六".indexOf(wk[2] === "天" ? "日" : wk[2]);
    let diff = (target - d.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    dayOffset = diff;
    matched = true;
  }
  d.setDate(d.getDate() + dayOffset);

  // 时段
  let period: "am" | "pm" | "noon" | null = null;
  if (/下午|晚上|今晚|明晚|傍晚|夜里/.test(text)) period = "pm";
  else if (/中午/.test(text)) period = "noon";
  else if (/早上|上午|早晨|明早|今早|凌晨/.test(text)) period = "am";

  // 钟点
  let hour: number | null = null;
  let minute = 0;
  const colon = text.match(/(\d{1,2})[:：](\d{2})/);
  const dian = text.match(new RegExp(`${NUM}\\s*[点時时](半|${NUM}分?)?`));
  if (colon) {
    hour = parseInt(colon[1], 10);
    minute = parseInt(colon[2], 10);
  } else if (dian) {
    hour = cnToNum(dian[1]);
    if (dian[2] === "半") minute = 30;
    else if (dian[3]) minute = cnToNum(dian[3]);
  }

  if (hour !== null && !Number.isNaN(hour)) {
    matched = true;
    if (period === "pm" && hour < 12) hour += 12;
    if (period === "noon" && hour < 6) hour += 12;
    d.setHours(hour, minute, 0, 0);
  } else if (matched) {
    // 只说了日期/时段，给一个默认钟点
    d.setHours(period === "pm" ? 20 : period === "noon" ? 12 : 9, 0, 0, 0);
  }

  if (!matched) {
    // 未识别：默认 1 小时后
    return { time: base.getTime() + 3600_000, text: clean(text), matched: false };
  }
  // 如果是今天且已过，顺延到明天
  if (dayOffset === 0 && d.getTime() < base.getTime()) d.setDate(d.getDate() + 1);

  text = text
    .replace(/(今天|今晚|今早|明天|明早|明晚|后天|(周|星期|礼拜)[一二三四五六日天])/g, "")
    .replace(/(早上|上午|早晨|中午|下午|晚上|傍晚|夜里|凌晨)/g, "")
    .replace(/(\d{1,2})[:：](\d{2})/g, "")
    .replace(new RegExp(`${NUM}\\s*[点時时](半|${NUM}分?)?`, "g"), "");
  return { time: d.getTime(), text: clean(text), matched: true };
}

function clean(s: string) {
  return s.replace(/^(提醒我|叫我|记得|帮我|要|去)+/g, "").replace(/^[\s,，的]+|[\s,，。]+$/g, "") || "提醒";
}

export function fmtTime(t: number) {
  const d = new Date(t);
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (same(d, today)) return `今天 ${hm}`;
  if (same(d, tomorrow)) return `明天 ${hm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 周${"日一二三四五六"[d.getDay()]} ${hm}`;
}
