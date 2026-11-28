import { paths, readJSON, writeJSON, uid, DATA_DIR } from "./storage.js";

// 内置技能及技能库的读写。
const defaults = [
  ["write-world", "写预设 / 世界书", "帮她写人设、世界观、条目", "帮她写人设、世界观、条目，先问清楚题材和想要的氛围，再给可以直接用的成稿。"],
  ["translate", "翻译总结", "翻译并总结内容", "把用户给的内容翻译成中文（或指定语言），翻完再用两三句话总结要点。"],
  ["find-media", "找图找歌", "按氛围推荐图片和歌单", "根据她描述的氛围推荐图片方向 / 歌单，给出可搜的关键词和理由。"],
  ["mini-app", "写小应用", "写单文件 HTML 小工具", "写一个单文件 HTML 小工具，能直接打开就用，样式跟 echo 一致（圆角、奶油底、玫红点缀）。"],
  ["summarize-chat", "总结这段聊天", "压缩最近聊天重点", "把最近的聊天压缩成「发生了什么 / 她的状态 / 我答应过什么」三小段。"],
];

// 读取技能，不存在时写入内置初始技能。
export async function getSkills(dir = DATA_DIR) {
  const file = paths.skills(dir);
  const data = await readJSON(file, null);
  if (data && Array.isArray(data.skills)) return data.skills;
  const skills = defaults.map(([id, name, desc, prompt], i) => ({ id, name, desc, prompt, builtin: true, enabled: true, at: Date.now() - i }));
  await writeJSON(file, { skills });
  return skills;
}

// 新建或更新一条技能。
export async function saveSkill(input, dir = DATA_DIR) {
  const skills = await getSkills(dir);
  const clean = { name: String(input.name || "").slice(0, 20), desc: String(input.desc || "").slice(0, 40), prompt: String(input.prompt || "").slice(0, 4000), enabled: input.enabled !== false };
  if (input.id) {
    const index = skills.findIndex((skill) => skill.id === input.id);
    if (index < 0) throw Error("技能不存在");
    skills[index] = { ...skills[index], ...clean, at: Date.now() };
  } else skills.push({ id: uid(), ...clean, builtin: false, at: Date.now() });
  await writeJSON(paths.skills(dir), { skills });
  return skills;
}
