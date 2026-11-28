import { getSkills, saveSkill } from "../skills.js";
import { paths, writeJSON, DATA_DIR } from "../storage.js";

// 技能库的列表、新建、删除接口。
export default async function skillsRoute(app) {
  app.get("/api/skills", async () => ({ skills: (await getSkills()).sort((a, b) => (b.builtin - a.builtin) || (b.at - a.at)) }));
  app.post("/api/skills", async (req, reply) => {
    try { return { skills: await saveSkill(req.body || {}) }; }
    catch (error) { reply.code(400); return { error: error.message }; }
  });
  app.delete("/api/skills/:id", async (req, reply) => {
    const skills = await getSkills();
    const index = skills.findIndex((skill) => skill.id === req.params.id);
    if (index < 0) { reply.code(404); return { error: "not_found" }; }
    if (skills[index].builtin) { reply.code(400); return { error: "内置技能只能停用，不能删" }; }
    skills.splice(index, 1);
    await writeJSON(paths.skills(DATA_DIR), { skills });
    return { ok: true };
  });
}
