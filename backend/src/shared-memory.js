import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const shared = Boolean(process.env.ECHO_SEREIN_DATABASE);
const script = fileURLToPath(new URL("./serein-memory.py", import.meta.url));

export async function sharedMemory(operation, data = {}) {
  return new Promise((resolve, reject) => {
    const fail = () => reject(Object.assign(new Error("无法访问 Serein 记忆库"), {statusCode: 503}));
    const child = spawn(process.env.ECHO_SEREIN_PYTHON || "python3", [script, operation], {
      stdio: ["pipe", "pipe", "ignore"], timeout: 30000,
    });
    let out = "";
    child.on("error", fail);
    child.stdin.on("error", fail);
    child.stdout.setEncoding("utf8").on("data", chunk => { out += chunk; });
    child.on("close", code => {
      if (code !== 0) return fail();
      try {
        const value = JSON.parse(out);
        if (value.invalidSummary) return reject(Object.assign(new Error("Serein 无法保存这份修订，请保留原文中的来源引用"), {statusCode: 422}));
        if (value.conflict) return reject(Object.assign(new Error("这条记忆已变动，请刷新再编辑"), {statusCode: 409}));
        resolve(value);
      } catch { fail(); }
    });
    child.stdin.end(JSON.stringify(data));
  });
}
