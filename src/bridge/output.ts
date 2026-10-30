import { mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import type { CallToolResult, GetPromptResult } from "@modelcontextprotocol/sdk/types.js";

type ContentBlock = CallToolResult["content"][number];

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

export function defaultOutDir(): string {
  return join(tmpdir(), "figma-cli");
}

/** Saves base64 payloads to disk so they never get dumped into a terminal or an agent's context. */
export class BinaryWriter {
  private count = 0;
  readonly saved: string[] = [];

  constructor(private readonly dir: string, private readonly prefix: string) {}

  save(base64: string, mimeType: string | undefined): string {
    mkdirSync(this.dir, { recursive: true });
    const ext = (mimeType && EXTENSIONS[mimeType]) ?? mimeType?.split("/")[1]?.replace(/[^a-z0-9]/gi, "") ?? "bin";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = resolve(this.dir, `${this.prefix}-${stamp}-${++this.count}.${ext}`);
    writeFileSync(path, Buffer.from(base64, "base64"));
    this.saved.push(path);
    return path;
  }
}

/** Replace base64 payloads with saved file paths, for --json output. */
export function externalizeBinary(result: CallToolResult, writer: BinaryWriter): CallToolResult {
  const content = result.content.map((block): ContentBlock => {
    if (block.type === "image" || block.type === "audio") {
      const { data, ...rest } = block;
      return { ...rest, path: writer.save(data, block.mimeType) } as unknown as ContentBlock;
    }
    if (block.type === "resource" && "blob" in block.resource) {
      const { blob, ...rest } = block.resource;
      return { ...block, resource: { ...rest, path: writer.save(blob, rest.mimeType) } } as unknown as ContentBlock;
    }
    return block;
  });
  return { ...result, content };
}

/** Human-readable rendering of a tool result. Binary content is saved to disk and its path printed. */
export function renderToolResult(result: CallToolResult, writer: BinaryWriter): string {
  const parts: string[] = [];
  for (const block of result.content) {
    switch (block.type) {
      case "text":
        parts.push(block.text);
        break;
      case "image":
      case "audio":
        parts.push(`[${block.type} saved: ${writer.save(block.data, block.mimeType)}]`);
        break;
      case "resource":
        if ("text" in block.resource) parts.push(block.resource.text);
        else parts.push(`[resource ${block.resource.uri} saved: ${writer.save(block.resource.blob, block.resource.mimeType)}]`);
        break;
      case "resource_link":
        parts.push(`[resource link] ${block.name ? `${block.name}: ` : ""}${block.uri}`);
        break;
      default:
        parts.push(JSON.stringify(block, null, 2));
    }
  }
  if (!parts.length && result.structuredContent) {
    parts.push(JSON.stringify(result.structuredContent, null, 2));
  }
  return parts.join("\n\n");
}

export function renderPrompt(result: GetPromptResult, writer: BinaryWriter): string {
  const parts: string[] = [];
  if (result.description) parts.push(result.description);
  for (const message of result.messages) {
    const body = renderToolResult({ content: [message.content] } as CallToolResult, writer);
    parts.push(`── ${message.role} ──\n${body}`);
  }
  return parts.join("\n\n");
}
