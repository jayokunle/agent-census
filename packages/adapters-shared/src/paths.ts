import { homedir } from "node:os";
import { join } from "node:path";
import type { ClientTarget, NativePaths, TargetOs } from "./types.js";

export function resolveHome(os: TargetOs): string {
  if (os === "windows") {
    return process.env.USERPROFILE ?? "C:\\Users\\Public";
  }
  return homedir();
}

export function nativePaths(clientTarget: ClientTarget, os: TargetOs): NativePaths {
  const home = resolveHome(os);

  switch (clientTarget) {
    case "cursor":
      return {
        os,
        home,
        mcpConfigFile: join(home, ".cursor", "mcp.json"),
        skillsRoot: join(home, ".cursor", "skills"),
      };
    case "claude-code":
      return {
        os,
        home,
        mcpConfigFile: join(home, ".claude.json"),
        skillsRoot: join(home, ".claude", "skills"),
      };
    case "gemini-cli":
      return {
        os,
        home,
        mcpConfigFile: join(home, ".gemini", "settings.json"),
        skillsRoot: join(home, ".gemini", "skills"),
      };
    case "antigravity":
      // Shared by the Antigravity IDE, App and CLI (https://antigravity.google/docs/mcp, /docs/skills).
      return {
        os,
        home,
        mcpConfigFile: join(home, ".gemini", "config", "mcp_config.json"),
        skillsRoot: join(home, ".gemini", "config", "skills"),
      };
    case "vscode":
      return {
        os,
        home,
        mcpConfigFile: vscodeMcpConfigFile(home, os),
        skillsRoot: join(home, ".copilot", "skills"),
      };
    case "copilot-cli":
      return {
        os,
        home,
        mcpConfigFile: join(home, ".copilot", "mcp-config.json"),
        skillsRoot: join(home, ".copilot", "skills"),
      };
    case "codex":
      return {
        os,
        home,
        mcpConfigFile: join(home, ".codex", "config.toml"),
        skillsRoot: join(home, ".agents", "skills"),
      };
    case "opencode":
      // https://opencode.ai/docs/config/ — `opencode.json(c)`; OpenCode merges both if present.
      // ponytail: XDG-style ~/.config on Windows too (OpenCode resolves it with xdg-basedir; the
      // docs give no Windows path). Servers a member keeps in opencode.jsonc are not inventoried.
      return {
        os,
        home,
        mcpConfigFile: join(home, ".config", "opencode", "opencode.json"),
        skillsRoot: join(home, ".config", "opencode", "skills"),
      };
    default:
      throw new Error(`Client Target adapter not implemented: ${clientTarget}`);
  }
}

function vscodeMcpConfigFile(home: string, os: TargetOs): string {
  if (os === "windows") {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    return join(appData, "Code", "User", "mcp.json");
  }
  return join(home, "Library", "Application Support", "Code", "User", "mcp.json");
}

export function npxCommand(os: TargetOs): string {
  return os === "windows" ? "npx.cmd" : "npx";
}
