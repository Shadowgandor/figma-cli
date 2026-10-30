import { createRequire } from "module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FileOAuthProvider, explainAuthError } from "./oauth.js";
import { DESKTOP_URL, type ServerTarget } from "./servers.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

const CLIENT_INFO = { name: "figma-cli", version };

function isConnectionRefused(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } })?.cause;
  const text = err instanceof Error ? err.message : String(err);
  return cause?.code === "ECONNREFUSED" || /ECONNREFUSED|fetch failed/i.test(text);
}

function connectionError(target: ServerTarget, err: unknown): Error {
  if (err instanceof UnauthorizedError) {
    return new Error(`Not authorized for ${target.url.href}. Run: figma mcp login${target.kind === "custom" ? ` --server ${target.url.href}` : ""}`);
  }
  if (target.oauth && /\b403\b|forbidden/i.test(err instanceof Error ? err.message : String(err))) {
    return explainAuthError(err);
  }
  if (target.kind === "desktop" && isConnectionRefused(err)) {
    return new Error(
      `Could not reach the Figma desktop MCP server at ${DESKTOP_URL}.\n\n` +
      `  1. Open the Figma desktop app (latest version) and open a Design file\n` +
      `  2. Switch to Dev Mode (Shift+D) and enable the desktop MCP server in the inspect panel\n\n` +
      `Or use the remote server: figma mcp login, then pass --server remote`,
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** Connect to an official Figma MCP server. The caller must close() the returned client. */
export async function connect(target: ServerTarget): Promise<Client> {
  const authProvider = target.oauth ? new FileOAuthProvider(target.url) : undefined;
  const client = new Client(CLIENT_INFO, { capabilities: {} });

  try {
    await client.connect(new StreamableHTTPClientTransport(target.url, { authProvider }));
    return client;
  } catch (err) {
    // Older/third-party servers may only speak SSE; the official ones speak Streamable HTTP
    if (target.kind !== "custom" || err instanceof UnauthorizedError || isConnectionRefused(err)) {
      throw connectionError(target, err);
    }
  }

  const sseClient = new Client(CLIENT_INFO, { capabilities: {} });
  try {
    await sseClient.connect(new SSEClientTransport(target.url, { authProvider }));
    return sseClient;
  } catch (err) {
    throw connectionError(target, err);
  }
}

/** Connect, run fn, and always close the connection. */
export async function withClient<T>(target: ServerTarget, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(target);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

/** List all tools, following pagination cursors. */
export async function listAllTools(client: Client): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  return tools;
}

export function findTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((t) => t.name === name)
    ?? tools.find((t) => t.name === name.replace(/-/g, "_"));
  if (tool) return tool;
  const close = tools
    .map((t) => t.name)
    .filter((n) => n.includes(name.replace(/-/g, "_")) || name.includes(n));
  throw new Error(
    `Unknown tool "${name}".${close.length ? ` Did you mean: ${close.join(", ")}?` : ""}\n` +
    `Run \`figma mcp tools\` to list the tools this server exposes.`,
  );
}
