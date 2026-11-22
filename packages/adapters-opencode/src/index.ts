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

/** One MCP server in `opencode.json` (https://opencode.ai/docs/mcp-servers/, schema https://opencode.ai/config.json). */
type OpenCodeServerEntry = {
  type?: "local" | "remote";
  /** Executable followed by its arguments. */
  command?: string[];
  environment?: Record<string, string>;
  cwd?: string;
  /** Streamable HTTP endpoint. */
  url?: string;
  headers?: Record<string, string>;
  /** Legacy (flat `mcp.<name>`) entries only; V2 uses `disabled`. */
  enabled?: boolean;
  [key: string]: unknown;
};

interface OpenCodeConfig {
  mcp?: {
    servers?: Record<string, OpenCodeServerEntry>;
    timeout?: unknown;
    [legacyName: string]: unknown;
  };
  [key: string]: unknown;
}

/** V2 fields kept opaque so a parse → render round-trip leaves the entry intact. */
const EXTRA_KEYS = ["disabled", "codemode", "timeout", "protocol", "pool", "oauth"] as const;

/**
 * Reads V2 `mcp.servers.<name>` and the deprecated flat `mcp.<name>` form (V2 wins on a clash).
 * Legacy-only fields (`enabled`, a numeric `timeout`) are translated or dropped, so a render is always V2.
 */
export function parseOpenCodeConfig(native: OpenCodeConfig): McpServerFragment[] {
  const { servers = {}, timeout: _timeout, ...legacy } = native.mcp ?? {};
  const entries = { ...(legacy as Record<string, OpenCodeServerEntry>), ...servers };
  return Object.entries(entries)
    .filter(([, entry]) => entry && typeof entry === "object" && (entry.command || entry.url))
    .map(([id, entry]) => {
      const nativeExtras: Record<string, unknown> = {};
      for (const key of EXTRA_KEYS) if (entry[key] !== undefined) nativeExtras[key] = entry[key];
      if (typeof nativeExtras.timeout === "number") delete nativeExtras.timeout;
      if (entry.enabled === false) nativeExtras.disabled = true;
      const remote = entry.type === "remote" || (!entry.command && entry.url);
      if (!remote && entry.cwd) nativeExtras.cwd = entry.cwd;
      const extras = Object.keys(nativeExtras).length ? nativeExtras : undefined;
      if (remote) return { id, transport: "http", url: entry.url, headers: entry.headers, nativeExtras: extras };
      const [command, ...args] = entry.command ?? [];
      return {
        id,
        transport: "stdio",
        command,
        args,
        env: entry.environment,
        nativeExtras: extras,
      };
    });
}

/** Replaces the managed server set in `mcp.servers`; keeps `mcp.timeout` and every non-MCP setting. */
export function renderOpenCodeConfig(
  existing: Record<string, unknown>,
  fragments: McpServerFragment[],
): Record<string, unknown> {
  const servers: Record<string, Record<string, unknown>> = {};
  for (const fragment of fragments) {
    const extras = fragment.nativeExtras ?? {};
    // ponytail: sse renders as remote too. Proxied servers are always Streamable HTTP; a
    // proxy: false SSE upstream will not connect, since OpenCode has no SSE transport.
    servers[fragment.id] =
      fragment.transport === "http" || fragment.transport === "sse"
        ? { type: "remote", url: fragment.url, ...(fragment.headers ? { headers: fragment.headers } : {}), ...extras }
        : {
            type: "local",
            command: [fragment.command, ...(fragment.args ?? [])],
            ...(fragment.env !== undefined ? { environment: fragment.env } : {}),
            ...extras,
          };
  }
  // Legacy flat entries are dropped: single managed configuration (ADR-0001).
  const timeout = (existing.mcp as { timeout?: unknown } | undefined)?.timeout;
  return { ...existing, mcp: { ...(timeout !== undefined ? { timeout } : {}), servers } };
}

export const opencodeAdapter: ClientTargetAdapter = {
  clientTarget: "opencode",

  parseMcpServers(paths: NativePathsContent): McpServerFragment[] {
    return parseOpenCodeConfig((paths.mcpConfig ?? {}) as OpenCodeConfig);
  },

  listInstalledSkillPacks(paths: NativePathsContent) {
    return listInstalledSkillPacks(paths);
  },

  renderMcpServers(fragments: McpServerFragment[], ctx: RenderContext): WritePlan {
    const paths = nativePaths("opencode", resolveTargetOs(ctx));
    const existing = (ctx.existingConfig ?? {}) as Record<string, unknown>;
    const rendered = renderOpenCodeConfig(existing, applyProxyToFragments(fragments, ctx));
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
    return materializeSkillPackWritePlan(nativePaths("opencode", resolveTargetOs(ctx)), pack, ctx);
  },
};
