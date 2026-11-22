import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { nativePaths, parseJsonc, stableStringify } from "@semantik-tech/adapters-shared";
import {
  fixturePath,
  loadFixtureText,
  loadSkillPackDir,
  markDirect,
  DEMO_PACK_ROOT,
  DIRECT_URL,
  PROXY_CASES,
} from "@semantik-tech/adapters-shared/test/helpers.js";
import { opencodeAdapter, parseOpenCodeConfig, renderOpenCodeConfig } from "../src/index.js";

const OSS = ["macos", "windows"] as const;
type Out = { model?: string; mcp: { timeout?: unknown; servers: Record<string, Record<string, unknown>> } };
const load = async (os: (typeof OSS)[number]) =>
  parseJsonc(await loadFixtureText("opencode", os)) as Record<string, unknown>;

for (const os of OSS) {
  test(`opencode ${os}: JSONC fixture round-trips to the same config`, async () => {
    assert.ok(fixturePath("opencode", os).endsWith(join("opencode", os, "opencode.json")));
    const native = await load(os);
    const fragments = opencodeAdapter.parseMcpServers({ ...nativePaths("opencode", os), mcpConfig: native });
    assert.equal(fragments.length, 2);
    assert.equal(stableStringify(renderOpenCodeConfig(native, fragments)), stableStringify(native));
  });

  test(`opencode ${os}: managed servers render remote through the proxy, settings kept`, async () => {
    const native = await load(os);
    for (const { ctx, proxied } of PROXY_CASES) {
      const plan = opencodeAdapter.renderMcpServers(parseOpenCodeConfig(native), {
        ...ctx,
        targetOs: os,
        existingConfig: native,
      });
      assert.ok(plan.files[0].path.endsWith(join(".config", "opencode", "opencode.json")));
      const out = JSON.parse(plan.files[0].content) as Out;
      assert.equal(out.model, "anthropic/claude-sonnet-5-5");
      assert.deepEqual(out.mcp.timeout, { startup: 30000 });
      assert.deepEqual(out.mcp.servers["filesystem-spike"], { type: "remote", url: proxied("filesystem-spike") });
      assert.equal(out.mcp.servers["org-proxy-example"].url, proxied("org-proxy-example"));
    }
  });

  test(`opencode ${os}: proxy: false keeps the direct URL`, async () => {
    const native = await load(os);
    for (const { ctx } of PROXY_CASES) {
      const plan = opencodeAdapter.renderMcpServers(markDirect(parseOpenCodeConfig(native)), {
        ...ctx,
        targetOs: os,
        existingConfig: native,
      });
      const out = JSON.parse(plan.files[0].content) as Out;
      assert.equal(out.mcp.servers["org-proxy-example"].url, DIRECT_URL);
      assert.equal(out.mcp.servers["org-proxy-example"].proxy, undefined);
    }
  });
}

test("opencode: reads the deprecated flat mcp.<name> form and renders it as V2", () => {
  const legacy = {
    mcp: { old: { type: "local", command: ["node", "s.js"], enabled: false, timeout: 5000 } },
  };
  const fragments = parseOpenCodeConfig(legacy);
  assert.deepEqual(fragments, [
    { id: "old", transport: "stdio", command: "node", args: ["s.js"], env: undefined, nativeExtras: { disabled: true } },
  ]);
  assert.deepEqual(renderOpenCodeConfig(legacy, fragments), {
    mcp: { servers: { old: { type: "local", command: ["node", "s.js"], disabled: true } } },
  });
});

test("opencode: materializes demo pack", async () => {
  const files = await loadSkillPackDir(DEMO_PACK_ROOT);
  const plan = opencodeAdapter.materializeSkillPack(
    { slug: "demo-pack", skillPackId: "demo-pack", version: 1, files },
    { proxyMode: "cloud_gateway", orgSlug: "acme", targetOs: "macos" },
  );
  assert.ok(plan.files.some((file) => file.path.includes(join(".config", "opencode", "skills", "demo-pack"))));
});
