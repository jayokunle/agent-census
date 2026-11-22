export const CLIENT_TARGET_IDS = [
  "cursor",
  "claude-code",
  /** Deprecated: Google ended consumer Gemini CLI on 2026-06-18; prefer `antigravity`. */
  "gemini-cli",
  "antigravity",
  "vscode",
  "copilot-cli",
  "codex",
  "opencode",
] as const;

export type ClientTarget = (typeof CLIENT_TARGET_IDS)[number];
