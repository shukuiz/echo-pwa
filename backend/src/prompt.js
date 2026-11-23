// 拼接 System Prompt：说明书(AGENTS/CLAUDE) + 文字记忆(about-you/about-us) + 结构化记忆(store)
import { paths, readText, readJSON, DATA_DIR } from "./storage.js";

/** 组装 system 消息内容。人设与记忆实时读取，改一条记忆下一条即生效。 */
export async function buildSystemPrompt() {
  const agents = await readText(paths.agents(DATA_DIR));
  const aboutYou = await readText(paths.aboutYou(DATA_DIR));
  const aboutUs = await readText(paths.aboutUs(DATA_DIR));
  const today = await readText(paths.today(DATA_DIR));
  const store = await readJSON(paths.store(DATA_DIR), { memory: [] });

  const byTab = (t) => (store.memory || []).filter((m) => m.tab === t);
  const fmt = (items) => items.map((m) => `- ${m.title ? m.title + "：" : ""}${m.text}`).join("\n");

  const sections = [];
  sections.push("【说明书 · 你是谁 / 怎么说话】\n" + agents.trim());

  const persona = byTab("persona");
  if (persona.length) sections.push("【人设记忆】\n" + fmt(persona));

  const text = byTab("text");
  if (text.length) sections.push("【文字记忆】\n" + fmt(text));

  // about-you/about-us/today 这类可手改的 md：只取非注释行的有效内容拼接
  const meaningful = (s) => s.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).join("\n").trim();
  const ay = meaningful(aboutYou);
  const au = meaningful(aboutUs);
  const td = meaningful(today);
  if (ay) sections.push("【关于用户】\n" + ay);
  if (au) sections.push("【关于你们】\n" + au);
  if (td) sections.push("【今天】\n" + td);

  const summary = byTab("summary");
  if (summary.length) sections.push("【今日总结记忆】\n" + fmt(summary));

  return sections.join("\n\n");
}
