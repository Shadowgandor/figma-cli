import { readFileSync } from "fs";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { parseFigmaUrl } from "../core/index.js";

/** Flags handled by the CLI itself; never forwarded to the tool. */
export const RESERVED_FLAGS = ["json", "server", "args", "out-dir", "help"] as const;

type JsonSchema = {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  default?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

export type ParamKind = "string" | "number" | "integer" | "boolean" | "array" | "object" | "any";

export interface Param {
  name: string;
  flag: string;
  kind: ParamKind;
  itemKind?: ParamKind;
  required: boolean;
  description?: string;
  enum?: unknown[];
  default?: unknown;
}

export interface ParsedInvocation {
  arguments: Record<string, unknown>;
  json: boolean;
  server?: string;
  outDir?: string;
  help: boolean;
}

export function toKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function normalize(name: string): string {
  return name.replace(/[-_]/g, "").toLowerCase();
}

function kindOf(schema: JsonSchema | undefined): ParamKind {
  if (!schema) return "any";
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) {
    const kinds = variants.map(kindOf).filter((k) => k !== "any");
    return kinds[0] ?? "any";
  }
  const types = Array.isArray(schema.type) ? schema.type.filter((t) => t !== "null") : [schema.type];
  const type = types[0];
  if (type === "string" || type === "number" || type === "integer" || type === "boolean" || type === "array" || type === "object") {
    return type;
  }
  if (schema.enum?.length) return typeof schema.enum[0] === "number" ? "number" : "string";
  return "any";
}

function arraySchema(schema: JsonSchema): JsonSchema | undefined {
  if (schema.items) return schema.items;
  return (schema.anyOf ?? schema.oneOf)?.find((s) => s.items)?.items;
}

export function toolParams(tool: Tool): Param[] {
  const schema = tool.inputSchema as JsonSchema;
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, prop]) => {
    const kind = kindOf(prop);
    return {
      name,
      flag: toKebab(name),
      kind,
      itemKind: kind === "array" ? kindOf(arraySchema(prop)) : undefined,
      required: required.has(name),
      description: prop.description,
      enum: prop.enum ?? (prop.anyOf ?? prop.oneOf)?.find((s) => s.enum)?.enum,
      default: prop.default,
    };
  });
}

function coerce(raw: string, kind: ParamKind, label: string): unknown {
  switch (kind) {
    case "number":
    case "integer": {
      const n = Number(raw);
      if (raw.trim() === "" || Number.isNaN(n)) throw new Error(`--${label} expects a number, got "${raw}"`);
      if (kind === "integer" && !Number.isInteger(n)) throw new Error(`--${label} expects an integer, got "${raw}"`);
      return n;
    }
    case "boolean":
      if (/^(true|1|yes)$/i.test(raw)) return true;
      if (/^(false|0|no)$/i.test(raw)) return false;
      throw new Error(`--${label} expects true or false, got "${raw}"`);
    case "object":
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(`--${label} expects a JSON object, got "${raw}"`);
      }
    case "any":
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    default:
      return raw;
  }
}

/** Read a value that may be inline JSON, @path to a file, or - for stdin. */
function readJsonArg(raw: string): Record<string, unknown> {
  const text = raw === "-" ? readFileSync(0, "utf-8") : raw.startsWith("@") ? readFileSync(raw.slice(1), "utf-8") : raw;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    throw new Error(`--args is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("--args must be a JSON object");
  return value as Record<string, unknown>;
}

function isFigmaUrl(value: string): boolean {
  return /(^|\/\/|\.)figma\.com\//i.test(value);
}

/**
 * Apply a Figma URL to the tool's file/node parameters (fileKey, nodeId, or
 * their snake_case variants). Returns false if the tool has no such params.
 */
function applyFigmaUrl(url: string, params: Param[], args: Record<string, unknown>): boolean {
  const parts = parseFigmaUrl(url);
  let applied = false;
  for (const p of params) {
    const n = normalize(p.name);
    if (n === "url" || n === "figmaurl" || n === "link") {
      args[p.name] ??= url;
      applied = true;
    } else if (n === "filekey" && parts.fileKey) {
      args[p.name] ??= parts.fileKey;
      applied = true;
    } else if (n === "nodeid" && parts.nodeId) {
      args[p.name] ??= parts.nodeId;
      applied = true;
    } else if (n === "nodeids" && parts.nodeId) {
      args[p.name] ??= [parts.nodeId];
      applied = true;
    }
  }
  return applied;
}

/**
 * Turn CLI tokens (everything after the tool name) into MCP tool arguments,
 * using the tool's JSON input schema for flag names and value types.
 *
 *   --node-id 1:2 / --nodeId=1:2      string/number params
 *   --flag / --no-flag / --flag=false  booleans
 *   --ids a --ids b / --ids '["a"]'    arrays (repeat the flag or pass JSON)
 *   --opts '{"k":1}'                   objects (JSON)
 *   <figma url>                        fills fileKey / nodeId from the URL
 *   <value>                            fills the next unset required param
 *   --args '<json>' | @file | -        base arguments as JSON (flags override)
 */
export function parseInvocation(tool: Tool, tokens: string[]): ParsedInvocation {
  const params = toolParams(tool);
  const byFlag = new Map<string, Param>();
  for (const p of params) {
    byFlag.set(p.flag, p);
    byFlag.set(p.name, p);
    byFlag.set(normalize(p.name), p);
  }

  const result: ParsedInvocation = { arguments: {}, json: false, help: false };
  const args: Record<string, unknown> = {};
  const positionals: string[] = [];
  let base: Record<string, unknown> = {};

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === "--") {
      positionals.push(...tokens.slice(i + 1));
      break;
    }
    if (!token.startsWith("-") || token === "-" || /^-\d/.test(token)) {
      positionals.push(token);
      continue;
    }
    if (token === "-h") {
      result.help = true;
      continue;
    }
    if (!token.startsWith("--")) throw new Error(`Unknown option ${token} — use long --options`);

    const eq = token.indexOf("=");
    const name = token.slice(2, eq === -1 ? undefined : eq);
    let inline = eq === -1 ? undefined : token.slice(eq + 1);
    const takeValue = (label: string): string => {
      if (inline !== undefined) return inline;
      const next = tokens[i + 1];
      if (next === undefined) throw new Error(`--${label} requires a value`);
      i++;
      return next;
    };

    // CLI-level flags
    if (name === "help") { result.help = true; continue; }
    if (name === "json") { result.json = true; continue; }
    if (name === "server") { result.server = takeValue(name); continue; }
    if (name === "out-dir") { result.outDir = takeValue(name); continue; }
    if (name === "args") { base = readJsonArg(takeValue(name)); continue; }

    let param = byFlag.get(name) ?? byFlag.get(normalize(name));
    let negated = false;
    if (!param && name.startsWith("no-")) {
      const target = byFlag.get(name.slice(3)) ?? byFlag.get(normalize(name.slice(3)));
      if (target?.kind === "boolean") {
        param = target;
        negated = true;
      }
    }
    if (!param) {
      const known = params.map((p) => `--${p.flag}`).join(", ") || "(none)";
      throw new Error(`Unknown option --${name} for ${tool.name}. Accepted: ${known}`);
    }

    if (param.kind === "boolean") {
      if (negated) {
        args[param.name] = false;
      } else if (inline !== undefined) {
        args[param.name] = coerce(inline, "boolean", param.flag);
      } else if (/^(true|false)$/i.test(tokens[i + 1] ?? "")) {
        args[param.name] = coerce(tokens[++i], "boolean", param.flag);
      } else {
        args[param.name] = true;
      }
      continue;
    }

    const raw = takeValue(param.flag);
    inline = undefined;
    if (param.kind === "array") {
      if (raw.trim().startsWith("[")) {
        args[param.name] = coerce(raw, "object", param.flag);
      } else {
        const list = Array.isArray(args[param.name]) ? (args[param.name] as unknown[]) : [];
        list.push(coerce(raw, param.itemKind ?? "string", param.flag));
        args[param.name] = list;
      }
    } else {
      args[param.name] = coerce(raw, param.kind, param.flag);
    }
  }

  // Positionals: Figma URLs fill file/node params; other values fill required params in order
  for (const value of positionals) {
    if (isFigmaUrl(value) && applyFigmaUrl(value, params, args)) continue;
    const next = params.find((p) => p.required && args[p.name] === undefined && base[p.name] === undefined);
    if (!next) throw new Error(`Unexpected argument "${value}" for ${tool.name}`);
    args[next.name] = next.kind === "array"
      ? [coerce(value, next.itemKind ?? "string", next.flag)]
      : coerce(value, next.kind, next.flag);
  }

  result.arguments = { ...base, ...args };
  if (result.help) return result;

  const missing = params.filter((p) => p.required && result.arguments[p.name] === undefined);
  if (missing.length) {
    throw new Error(
      `Missing required option(s) for ${tool.name}: ${missing.map((p) => `--${p.flag}`).join(", ")}\n` +
      `Run \`figma mcp describe ${tool.name}\` for details.`,
    );
  }
  for (const p of params) {
    const value = result.arguments[p.name];
    if (p.enum && value !== undefined && !p.enum.includes(value)) {
      throw new Error(`--${p.flag} must be one of: ${p.enum.join(", ")}`);
    }
  }
  return result;
}

function typeLabel(p: Param): string {
  if (p.enum) return p.enum.join("|");
  if (p.kind === "array") return `${p.itemKind ?? "value"}...`;
  if (p.kind === "object") return "json";
  return p.kind;
}

/** Usage text for a tool, derived from its input schema. */
export function formatToolHelp(tool: Tool): string {
  const params = toolParams(tool);
  const lines: string[] = [];
  const title = tool.annotations?.title ?? tool.title;
  lines.push(`Usage: figma mcp ${tool.name} [options]${title ? `   (${title})` : ""}`);
  lines.push("");
  if (tool.description) lines.push(tool.description.trim(), "");

  if (params.length) {
    lines.push("Options:");
    const left = params.map((p) => `  --${p.flag} ${p.kind === "boolean" ? "" : `<${typeLabel(p)}>`}`.trimEnd());
    const width = Math.min(Math.max(...left.map((l) => l.length)) + 2, 44);
    params.forEach((p, i) => {
      const tags = [p.required ? "required" : "", p.default !== undefined ? `default: ${JSON.stringify(p.default)}` : ""]
        .filter(Boolean).join(", ");
      const desc = [p.description?.replace(/\s+/g, " ").trim(), tags ? `(${tags})` : ""].filter(Boolean).join(" ");
      const pad = left[i].length >= width ? `\n${" ".repeat(width)}` : " ".repeat(width - left[i].length);
      lines.push(`${left[i]}${pad}${desc}`.trimEnd());
    });
    lines.push("");
  } else {
    lines.push("This tool takes no arguments.", "");
  }

  const reservedClash = params.filter((p) => (RESERVED_FLAGS as readonly string[]).includes(p.flag));
  lines.push("Common options:");
  lines.push("  <figma url>               Fill file/node parameters from a Figma link");
  lines.push("  --args <json|@file|->     Pass arguments as a JSON object (flags override)");
  lines.push("  --server <desktop|remote|url>");
  lines.push("  --out-dir <dir>           Where to save images/binary output");
  lines.push("  --json                    Print the raw tool result as JSON");
  if (reservedClash.length) {
    lines.push("", `Note: ${reservedClash.map((p) => p.name).join(", ")} clash with CLI options — pass them via --args.`);
  }
  return lines.join("\n");
}
