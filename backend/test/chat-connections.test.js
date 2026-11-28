import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

test("chat connections retain their own model and never reuse a Key at a changed endpoint", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "echo-chat-connections-"));
  process.env.ECHO_DATA_DIR = directory;
  try {
    const { applySettingsPatch, chatModelUpstream, createPreset, getRawConfig, publicConfig, updatePreset } = await import("../src/config.js");
    const { DATA_DIR, paths, writeJSON } = await import("../src/storage.js");
    await writeJSON(paths.config(DATA_DIR), { proxyUrl: "https://legacy.example/v1", model: "legacy-model" });
    const legacyId = publicConfig(await getRawConfig()).activePresetId;
    assert.equal((await updatePreset(legacyId, { model: "edited-legacy" })).model, "edited-legacy");
    await applySettingsPatch({ apiMode: "official", provider: "openai" });

    const preset = await createPreset({
      name: "Relay", url: "https://relay.example/v1", apiKey: "abc", model: "relay-model", activate: false,
    });
    const id = preset.presets[1].id;
    assert.equal(preset.apiMode, "official");
    assert.equal(publicConfig(preset).presets[1].keyMask, "****");
    assert.equal(publicConfig(preset).presets[1].model, "relay-model");
    assert.equal((await chatModelUpstream({ provider: "custom", presetId: id, url: "https://relay.example/v1/" })).apiKey, "abc");
    assert.equal((await chatModelUpstream({ provider: "custom", presetId: id, url: "https://relay.example/v2" })).apiKey, "");
    await applySettingsPatch({ officialConnection: { provider: "openai", model: "official-model" } });
    assert.equal((await applySettingsPatch({ apiMode: "custom", activePresetId: id })).model, "relay-model");
    assert.equal((await applySettingsPatch({ apiMode: "official", provider: "openai" })).model, "official-model");
    await Promise.all([
      updatePreset(id, { url: "https://relay.example/v2", model: "replacement-model" }),
      applySettingsPatch({ mute: true }),
    ]);
    const finalConfig = await getRawConfig();
    assert.equal(finalConfig.presets[1].apiKey, "");
    assert.equal(finalConfig.mute, true);
    assert.equal((await applySettingsPatch({ apiMode: "custom", activePresetId: id })).model, "replacement-model");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Serein ownership requires the reserved name and a trusted address", async () => {
  const { publicConfig } = await import("../src/config.js");
  const base = {
    apiMode: "custom", activePresetId: "test", officialKeys: {}, model: "chat", models: ["chat"],
  };
  function config(name, url) {
    return publicConfig({ ...base, presets: [{ id: "test", name, url }] });
  }
  assert.equal(config("Serein", "http://127.0.0.1:18217/v1/").memoryOwner, "serein");
  assert.equal(config("Serein", "https://relay.example/v1").memoryOwner, "echo");
  assert.equal(config("Relay", "http://127.0.0.1:18217/v1").memoryOwner, "echo");
});
