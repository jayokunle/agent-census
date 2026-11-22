import {
  applyProxyToFragments,
  listInstalledSkillPacks,
  materializeSkillPackWritePlan,
  nativePaths,
  resolveTargetOs,
  stableStringify,
  type ClientTargetAdapter,
  type ExtractedSkillPack,
  type McpServerFragment,
  type NativePathsContent,
  type RenderContext,
  type WritePlan,
} from "@semantik-tech/adapters-shared";

/** One `mcpServers` entry in Antigravity's `mcp_config.json` (https://antigravity.google/docs/mcp). */
type AntigravityServerEntry = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** Streamable HTTP only; Antigravity rejects legacy HTTP+SSE and `httpUrl`. */
  serverUrl?: string;
  url?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
};

interface AntigravityConfig {
  mcpServers?: Record<string, AntigravityServerEntry>;
  [key: string]: unknown;
}

/** Native fields kept opaque so a parse → render round-trip leaves the entry intact. */
const EXTRA_KEYS = [
  "timeoutSeconds",
  "disabled",
  "enabledTools",
  "disabledTools",
  "tools",
  "authProviderType",
  "oauth",
] as const;

export function parseAntigravityConfig(native: AntigravityConfig): McpServerFragment[] {
  return Object.entries(native.mcpServers ?? {}).map(([id, entry]) => {
    const nativeExtras: Record<string, unknown> = {};
    for (const key of EXTRA_KEYS) if (entry[key] !== undefined) nativeExtras[key] = entry[key];
    const url = entry.serverUrl ?? entry.url;
    if (url) {
      return {
        id,
        transport: "http",
        url,
        headers: entry.headers,
        nativeExtras: Object.keys(nativeExtras).length ? nativeExtras : undefined,
      };
    }
    if (entry.cwd) nativeExtras.cwd = entry.cwd;
    return {
      id,
      transport: "stdio",
      command: entry.command,
      args: entry.args,
      env: entry.env,
      nativeExtras: Object.keys(nativeExtras).length ? nativeExtras : undefined,
    };
  });
}

export function renderAntigravityConfig(
  existing: Record<string, unknown>,
  fragments: McpServerFragment[],
): Record<string, unknown> {
  const mcpServers: Record<string, Record<string, unknown>> = {};
  for (const fragment of fragments) {
    const extras = fragment.nativeExtras ?? {};
    // ponytail: sse renders as serverUrl too. Proxied servers are always Streamable HTTP;
    // a proxy: false SSE upstream will not connect, since Antigravity has no SSE transport.
    mcpServers[fragment.id] =
      fragment.transport === "http" || fragment.transport === "sse"
        ? { serverUrl: fragment.url, ...(fragment.headers ? { headers: fragment.headers } : {}), ...extras }
        : {
            command: fragment.command,
            args: fragment.args,
            ...(fragment.env !== undefined ? { env: fragment.env } : {}),
            ...extras,
          };
  }
  return { ...existing, mcpServers };
}

export const antigravityAdapter: ClientTargetAdapter = {
  clientTarget: "antigravity",

  parseMcpServers(paths: NativePathsContent): McpServerFragment[] {
    return parseAntigravityConfig((paths.mcpConfig ?? {}) as AntigravityConfig);
  },

  listInstalledSkillPacks(paths: NativePathsContent) {
    return listInstalledSkillPacks(paths);
  },

  renderMcpServers(fragments: McpServerFragment[], ctx: RenderContext): WritePlan {
    const paths = nativePaths("antigravity", resolveTargetOs(ctx));
    const existing = (ctx.existingConfig ?? {}) as Record<string, unknown>;
    const rendered = renderAntigravityConfig(existing, applyProxyToFragments(fragments, ctx));
    return {
      files: [
        {
          path: paths.mcpConfigFile,
          content: stableStringify(rendered),
          strategy: "json-merge",
          backup: true,
        },
      ],
    };
  },

  materializeSkillPack(pack: ExtractedSkillPack, ctx: RenderContext): WritePlan {
    return materializeSkillPackWritePlan(nativePaths("antigravity", resolveTargetOs(ctx)), pack, ctx);
  },
};
