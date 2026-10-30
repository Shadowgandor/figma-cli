import { Command } from "commander";
import chalk from "chalk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  resolveServer,
  withClient,
  listAllTools,
  findTool,
  login,
  clearSession,
  getSession,
  parseInvocation,
  formatToolHelp,
  toolParams,
  toKebab,
  BinaryWriter,
  defaultOutDir,
  externalizeBinary,
  renderToolResult,
  renderPrompt,
  DEFAULT_CALLBACK_PORT,
  type ServerTarget,
} from "../bridge/index.js";

function die(err: unknown): never {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
}

const SERVER_OPTION = ["--server <server>", "MCP server: desktop (default), remote, or a URL (env: FIGMA_MCP_SERVER)"] as const;

function firstLine(text: string | undefined, max = 100): string {
  const line = (text ?? "").trim().split("\n")[0];
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

async function invokeTool(toolName: string, tokens: string[], defaultServer?: string): Promise<void> {
  // --server may appear anywhere in the tool's argument list
  const serverIdx = tokens.findIndex((t) => t === "--server" || t.startsWith("--server="));
  const serverFlag = serverIdx === -1 ? undefined
    : tokens[serverIdx].includes("=") ? tokens[serverIdx].split("=").slice(1).join("=") : tokens[serverIdx + 1];
  const target = resolveServer(serverFlag ?? defaultServer);

  await withClient(target, async (client) => {
    const tool = findTool(await listAllTools(client), toolName);
    const parsed = parseInvocation(tool, tokens);
    if (parsed.help) {
      console.log(formatToolHelp(tool));
      return;
    }

    const result = (await client.callTool({ name: tool.name, arguments: parsed.arguments })) as CallToolResult;
    const writer = new BinaryWriter(parsed.outDir ?? defaultOutDir(), tool.name);

    if (parsed.json) {
      console.log(JSON.stringify(externalizeBinary(result, writer), null, 2));
    } else {
      const text = renderToolResult(result, writer);
      if (result.isError) console.error(chalk.red(text || "Tool returned an error."));
      else console.log(text);
    }
    if (result.isError) process.exitCode = 1;
  });
}

function parsePromptArgs(tokens: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      const key = token.slice(2, eq === -1 ? undefined : eq);
      const value = eq === -1 ? tokens[++i] : token.slice(eq + 1);
      if (value === undefined) throw new Error(`--${key} requires a value`);
      args[key] = value;
    } else if (token.includes("=")) {
      const [key, ...rest] = token.split("=");
      args[key] = rest.join("=");
    } else {
      throw new Error(`Unexpected argument "${token}" — use --name value or name=value`);
    }
  }
  return args;
}

async function describeServer(client: Client, target: ServerTarget) {
  const caps = client.getServerCapabilities() ?? {};
  const [tools, prompts, resources] = await Promise.all([
    listAllTools(client),
    caps.prompts ? client.listPrompts().then((r) => r.prompts) : Promise.resolve([]),
    caps.resources ? client.listResources().then((r) => r.resources) : Promise.resolve([]),
  ]);
  return {
    server: target.url.href,
    kind: target.kind,
    serverInfo: client.getServerVersion(),
    instructions: client.getInstructions(),
    tools: tools.length,
    prompts: prompts.length,
    resources: resources.length,
  };
}

export function registerMcpCommands(program: Command): void {
  program.enablePositionalOptions();

  const mcp = program
    .command("mcp")
    .description("Use Figma's official MCP server (desktop app or remote) from the command line")
    .argument("[tool]", "Name of a tool exposed by the Figma MCP server (see `figma mcp tools`)")
    .argument("[args...]", "Tool arguments as --flags derived from the tool's input schema")
    .option(...SERVER_OPTION)
    .allowUnknownOption()
    .allowExcessArguments()
    .passThroughOptions()
    .addHelpText("after", `
Any tool the server exposes can be called directly. Flags come from the tool's input schema
(camelCase → --kebab-case), and a Figma URL argument fills fileKey/nodeId:

  figma mcp tools
  figma mcp get_design_context "https://www.figma.com/design/abc123/App?node-id=1-2"
  figma mcp get_screenshot --node-id 1:2 --out-dir ./shots
  figma mcp get_variable_defs --file-key abc123 --node-id 1:2 --json
  figma mcp get_metadata --help
  figma mcp --server remote whoami

Servers: "desktop" = Figma desktop app at http://127.0.0.1:3845/mcp (no login),
         "remote"  = https://mcp.figma.com/mcp (run \`figma mcp login\` first).`)
    .action(async (tool: string | undefined, args: string[]) => {
      if (!tool) return mcp.help();
      try {
        await invokeTool(tool, args, mcp.opts().server);
      } catch (err) {
        die(err);
      }
    });

  // ── Connection ───────────────────────────────────────────────────

  mcp
    .command("status")
    .description("Show which Figma MCP server is used, and check the connection")
    .option(...SERVER_OPTION)
    .option("--json", "Output raw JSON")
    .action(async (opts: { server?: string; json?: boolean }) => {
      try {
        const target = resolveServer(opts.server ?? mcp.opts().server);
        const info = await withClient(target, (client) => describeServer(client, target));
        const session = target.oauth ? getSession(target.url) : undefined;
        const loggedIn = target.oauth ? Boolean(session?.tokens) : undefined;
        if (opts.json) {
          console.log(JSON.stringify({ ...info, loggedIn }, null, 2));
          return;
        }
        console.log(chalk.green("Connected successfully."));
        console.log(`Server:    ${info.server} (${info.kind})`);
        if (info.serverInfo) console.log(`Name:      ${info.serverInfo.name} ${info.serverInfo.version}`);
        console.log(`Tools:     ${info.tools}`);
        console.log(`Prompts:   ${info.prompts}`);
        console.log(`Resources: ${info.resources}`);
        if (info.instructions) console.log(`\n${chalk.gray(info.instructions.trim())}`);
      } catch (err) {
        die(err);
      }
    });

  mcp
    .command("login")
    .description("Authorize figma-cli with the remote Figma MCP server (OAuth in your browser)")
    .option(SERVER_OPTION[0], "Server to log in to (default: remote)")
    .option("--port <n>", `Local callback port (default: ${DEFAULT_CALLBACK_PORT})`, parseInt)
    .option("--no-open", "Print the authorization URL instead of opening a browser")
    .action(async (opts: { server?: string; port?: number; open: boolean }) => {
      try {
        const explicit = opts.server ?? mcp.opts().server;
        let target = resolveServer(explicit);
        if (!target.oauth) {
          if (explicit) die(new Error(`${target.url.href} does not use OAuth — no login needed.`));
          target = resolveServer("remote");
        }
        await login(target.url, { port: opts.port, openBrowser: opts.open });
        console.log(chalk.green(`Logged in to ${target.url.href}`));
        if (target.kind === "remote" && resolveServer().kind !== "remote") {
          console.log(chalk.gray(`Use it with --server remote, or set FIGMA_MCP_SERVER=remote.`));
        }
      } catch (err) {
        die(err);
      }
    });

  mcp
    .command("logout")
    .description("Remove stored OAuth credentials for a Figma MCP server")
    .option(SERVER_OPTION[0], "Server to log out of (default: remote)")
    .action((opts: { server?: string }) => {
      try {
        const target = resolveServer(opts.server ?? mcp.opts().server ?? "remote");
        console.log(clearSession(target.url) ? `Logged out of ${target.url.href}` : `No stored credentials for ${target.url.href}`);
      } catch (err) {
        die(err);
      }
    });

  // ── Tools ────────────────────────────────────────────────────────

  mcp
    .command("tools")
    .description("List the tools the Figma MCP server exposes")
    .option(...SERVER_OPTION)
    .option("--json", "Output the full tool definitions (including input schemas) as JSON")
    .action(async (opts: { server?: string; json?: boolean }) => {
      try {
        const tools = await withClient(resolveServer(opts.server ?? mcp.opts().server), listAllTools);
        if (opts.json) {
          console.log(JSON.stringify(tools, null, 2));
          return;
        }
        const width = Math.max(...tools.map((t) => t.name.length)) + 2;
        for (const t of tools) {
          const readOnly = t.annotations?.readOnlyHint ? "" : t.annotations?.destructiveHint ? chalk.red(" [writes]") : "";
          console.log(`${chalk.cyan(t.name.padEnd(width))}${firstLine(t.description)}${readOnly}`);
        }
        console.log(chalk.gray(`\n${tools.length} tool(s). Run \`figma mcp <tool> --help\` for options.`));
      } catch (err) {
        die(err);
      }
    });

  mcp
    .command("describe <tool>")
    .description("Show a tool's description and the CLI options derived from its input schema")
    .option(...SERVER_OPTION)
    .option("--json", "Output the raw tool definition as JSON")
    .action(async (name: string, opts: { server?: string; json?: boolean }) => {
      try {
        const tool = await withClient(resolveServer(opts.server ?? mcp.opts().server), async (c) => findTool(await listAllTools(c), name));
        if (opts.json) {
          console.log(JSON.stringify({ ...tool, cliOptions: toolParams(tool) }, null, 2));
          return;
        }
        console.log(formatToolHelp(tool));
      } catch (err) {
        die(err);
      }
    });

  mcp
    .command("call <tool> [args...]")
    .description("Call a tool (same as `figma mcp <tool>`; use this if a tool name clashes with a subcommand)")
    .allowUnknownOption()
    .allowExcessArguments()
    .passThroughOptions()
    .helpOption(false)
    .action(async (tool: string, args: string[]) => {
      try {
        await invokeTool(tool, args, mcp.opts().server);
      } catch (err) {
        die(err);
      }
    });

  // ── Prompts ──────────────────────────────────────────────────────

  mcp
    .command("prompts")
    .description("List the prompts the Figma MCP server exposes")
    .option(...SERVER_OPTION)
    .option("--json", "Output raw JSON")
    .action(async (opts: { server?: string; json?: boolean }) => {
      try {
        const prompts = await withClient(resolveServer(opts.server ?? mcp.opts().server), async (c) => (await c.listPrompts()).prompts);
        if (opts.json) {
          console.log(JSON.stringify(prompts, null, 2));
          return;
        }
        if (!prompts.length) {
          console.log("No prompts found.");
          return;
        }
        for (const p of prompts) {
          const args = (p.arguments ?? []).map((a) => (a.required ? `--${toKebab(a.name)} <value>` : `[--${toKebab(a.name)} <value>]`));
          console.log(`${chalk.cyan(p.name)} ${chalk.gray(args.join(" "))}`);
          if (p.description) console.log(`  ${firstLine(p.description, 120)}`);
        }
      } catch (err) {
        die(err);
      }
    });

  mcp
    .command("prompt <name> [args...]")
    .description("Get a prompt from the Figma MCP server (arguments as --name value or name=value)")
    .option(...SERVER_OPTION)
    .option("--json", "Output raw JSON")
    .option("--out-dir <dir>", "Where to save images/binary content")
    .allowUnknownOption()
    .allowExcessArguments()
    .action(async (name: string, tokens: string[], opts: { server?: string; json?: boolean; outDir?: string }) => {
      try {
        const raw = parsePromptArgs(tokens);
        const result = await withClient(resolveServer(opts.server ?? mcp.opts().server), async (c) => {
          const prompt = (await c.listPrompts()).prompts.find((p) => p.name === name || p.name === name.replace(/-/g, "_"));
          if (!prompt) throw new Error(`Unknown prompt "${name}". Run \`figma mcp prompts\` to list them.`);
          // Accept --kebab-case flags for camelCase/snake_case argument names
          const args: Record<string, string> = {};
          for (const [key, value] of Object.entries(raw)) {
            const match = prompt.arguments?.find((a) => a.name === key || toKebab(a.name) === key);
            args[match?.name ?? key] = value;
          }
          return c.getPrompt({ name: prompt.name, arguments: args });
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(renderPrompt(result, new BinaryWriter(opts.outDir ?? defaultOutDir(), name)));
      } catch (err) {
        die(err);
      }
    });

  // ── Resources ────────────────────────────────────────────────────

  mcp
    .command("resources")
    .description("List the resources and resource templates the Figma MCP server exposes")
    .option(...SERVER_OPTION)
    .option("--json", "Output raw JSON")
    .action(async (opts: { server?: string; json?: boolean }) => {
      try {
        const data = await withClient(resolveServer(opts.server ?? mcp.opts().server), async (c) => {
          if (!c.getServerCapabilities()?.resources) return { resources: [], resourceTemplates: [] };
          const [resources, templates] = await Promise.all([
            c.listResources().then((r) => r.resources),
            c.listResourceTemplates().then((r) => r.resourceTemplates).catch(() => []),
          ]);
          return { resources, resourceTemplates: templates };
        });
        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        if (!data.resources.length && !data.resourceTemplates.length) {
          console.log("No resources found.");
          return;
        }
        for (const r of data.resources) {
          console.log(`${chalk.cyan(r.uri)} ${chalk.gray(r.mimeType ?? "")}`);
          if (r.name || r.description) console.log(`  ${firstLine(r.description ?? r.name, 120)}`);
        }
        for (const t of data.resourceTemplates) {
          console.log(`${chalk.cyan(t.uriTemplate)} ${chalk.gray("(template)")}`);
          if (t.name || t.description) console.log(`  ${firstLine(t.description ?? t.name, 120)}`);
        }
      } catch (err) {
        die(err);
      }
    });

  mcp
    .command("resource <uri>")
    .description("Read a resource from the Figma MCP server")
    .option(...SERVER_OPTION)
    .option("--json", "Output raw JSON (binary content is saved to disk and replaced by its path)")
    .option("--out-dir <dir>", "Where to save binary content")
    .action(async (uri: string, opts: { server?: string; json?: boolean; outDir?: string }) => {
      try {
        const result = await withClient(resolveServer(opts.server ?? mcp.opts().server), (c) => c.readResource({ uri }));
        const writer = new BinaryWriter(opts.outDir ?? defaultOutDir(), "resource");
        const blocks = result.contents.map((resource) => ({ type: "resource" as const, resource }));
        const asTool = { content: blocks } as CallToolResult;
        if (opts.json) {
          console.log(JSON.stringify(externalizeBinary(asTool, writer).content.map((b) => (b as { resource: unknown }).resource), null, 2));
          return;
        }
        console.log(renderToolResult(asTool, writer));
      } catch (err) {
        die(err);
      }
    });
}
