import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const DESKTOP_URL = "http://127.0.0.1:3845/mcp";
export const REMOTE_URL = "https://mcp.figma.com/mcp";

export type ServerKind = "desktop" | "remote" | "custom";

export interface ServerTarget {
  kind: ServerKind;
  url: URL;
  /** Whether to attach the OAuth provider (only used if the server answers 401) */
  oauth: boolean;
}

const CONFIG_PATH = join(homedir(), ".config", "figma", "config.json");

function configuredServer(): string | undefined {
  try {
    if (!existsSync(CONFIG_PATH)) return undefined;
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as { mcpServer?: string };
    return raw.mcpServer;
  } catch {
    return undefined;
  }
}

/**
 * Resolve which official Figma MCP server to talk to.
 * Precedence: explicit flag → FIGMA_MCP_SERVER → config "mcpServer" → desktop.
 * Accepts "desktop", "remote", or a full URL.
 */
export function resolveServer(flag?: string): ServerTarget {
  const value = (flag ?? process.env.FIGMA_MCP_SERVER ?? configuredServer() ?? "desktop").trim();

  if (value === "desktop") return { kind: "desktop", url: new URL(DESKTOP_URL), oauth: false };
  if (value === "remote") return { kind: "remote", url: new URL(REMOTE_URL), oauth: true };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid MCP server "${value}". Use "desktop", "remote", or a full URL.`);
  }
  return { kind: "custom", url, oauth: true };
}
