// Only called with the separated reasoning field. No chat messages are sent.
export async function translateThought(text, env = process.env) {
  const letters = (text.match(/[a-zA-Z]/g) || []).length;
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  if (letters < 40 || letters <= chinese * 2) return null;
  if (!/[a-zA-Z]{20}|(?:[a-zA-Z]+\s+){6}/.test(text) || !env.ECHO_CF_ACCOUNT_ID || !env.ECHO_CF_TRANSLATE_TOKEN) return null;
  const pieces = text.match(/[\s\S]{1,700}(?:\s|$)|[\s\S]{1,700}/g) || [];
  if (pieces.length > 100) return null;
  const translated = [];
  for (const piece of pieces) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.ECHO_CF_ACCOUNT_ID)}/ai/run/@cf/meta/m2m100-1.2b`, {
      method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${env.ECHO_CF_TRANSLATE_TOKEN}`},
      body:JSON.stringify({text:piece,source_lang:"en",target_lang:"zh"}), signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.success || typeof data.result?.translated_text !== "string") return null;
    translated.push(data.result.translated_text);
  }
  return translated.length ? "译自英文\n" + translated.join("\n") : null;
}
