/**
 * JSON.parse that also accepts JSONC: `//` and `/* *\/` comments and trailing commas
 * (OpenCode's `opencode.jsonc`, VS Code's `mcp.json`). Strict JSON parses unchanged.
 * ponytail: comments are dropped, so a rewrite loses them; the apply backup keeps the original.
 */
export function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
      out += " ";
    } else if (c === ",") {
      // Trailing comma: the next significant character (past whitespace and comments) closes.
      let j = i + 1;
      for (;;) {
        while (j < text.length && /\s/.test(text[j])) j++;
        if (text.startsWith("//", j)) j = text.indexOf("\n", j) === -1 ? text.length : text.indexOf("\n", j);
        else if (text.startsWith("/*", j)) j = text.indexOf("*/", j) === -1 ? text.length : text.indexOf("*/", j) + 2;
        else break;
      }
      if (text[j] !== "}" && text[j] !== "]") out += c;
    } else {
      out += c;
    }
  }
  return JSON.parse(out);
}
