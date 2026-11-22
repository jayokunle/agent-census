import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { nativePaths, stableStringify } from "@semantik-tech/adapters-shared";
import {
  loadFixtureJson,
  loadSkillPackDir,
  markDirect,
  DEMO_PACK_ROOT,
  DIRECT_URL,
  PROXY_CASES,
} from "@semantik-tech/adapters-shared/test/helpers.js";
import { antigravityAdapter, parseAntigravityConfig, renderAntigravityConfig } from "../src/index.js";

const OSS = ["macos", "windows"] as const;
type Out = { mcpServers: Record<string, Record<string, unknown>> };

for (const os of OSS) {
  test(`antigravity ${os}: native round-trip matches fixture`, async () => {
    const native = (await loadFixtureJson("antigravity", os)) as Record<string, unknown>;
    const fragments = antigravityAdapter.parseMcpServers({ ...nativePaths("antigravity", os), mcpConfig: native });
    assert.equal(fragments.length, 2);
    assert.equal(stableStringify(renderAntigravityConfig(native, fragments)), stableStringify(native));
  });

  test(`antigravity ${os}: managed servers render serverUrl through the proxy`, async () => {
    const native = (await loadFixtureJson("antigravity", os)) as Record<string, unknown>;
    for (const { ctx, proxied } of PROXY_CASES) {
      const plan = antigravityAdapter.renderMcpServers(parseAntigravityConfig(native), {
        ...ctx,
        targetOs: os,
        existingConfig: native,
      });
      assert.ok(plan.files[0].path.endsWith(join(".gemini", "config", "mcp_config.json")));
      const out = JSON.parse(plan.files[0].content) as Out;
      assert.equal(out.mcpServers["org-proxy-example"].serverUrl, proxied("org-proxy-example"));
      assert.equal(out.mcpServers["org-proxy-example"].httpUrl, undefined);
      assert.deepEqual(out.mcpServers["org-proxy-example"].disabledTools, ["delete_file"]);
    }
  });

  test(`antigravity ${os}: proxy: false keeps the direct URL, other servers still proxied`, async () => {
    const native = (await loadFixtureJson("antigravity", os)) as Record<string, unknown>;
    for (const { ctx, proxied } of PROXY_CASES) {
      const plan = antigravityAdapter.renderMcpServers(markDirect(parseAntigravityConfig(native)), {
        ...ctx,
        targetOs: os,
        existingConfig: native,
      });
      const out = JSON.parse(plan.files[0].content) as Out;
      assert.equal(out.mcpServers["org-proxy-example"].serverUrl, DIRECT_URL);
      assert.equal(out.mcpServers["org-proxy-example"].proxy, undefined);
      assert.equal(out.mcpServers["filesystem-spike"].serverUrl, proxied("filesystem-spike"));
    }
  });
}

test("antigravity: reads legacy url as a remote server", () => {
  const [fragment] = parseAntigravityConfig({ mcpServers: { r: { url: "https://x.example/mcp" } } });
  assert.equal(fragment.transport, "http");
  assert.equal(fragment.url, "https://x.example/mcp");
});

test("antigravity: materializes demo pack into the shared skills folder", async () => {
  const files = await loadSkillPackDir(DEMO_PACK_ROOT);
  const plan = antigravityAdapter.materializeSkillPack(
    { slug: "demo-pack", skillPackId: "demo-pack", version: 1, files },
    { proxyMode: "cloud_gateway", orgSlug: "acme", targetOs: "macos" },
  );
  assert.ok(plan.files.some((file) => file.path.includes(join(".gemini", "config", "skills", "demo-pack"))));
});
