#!/usr/bin/env node

import { Command } from "commander";
import { createRequire } from "module";
import { registerFigmaCommands } from "./figma.js";
import { registerMcpCommands } from "./mcp.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

const program = new Command()
  .name("figma")
  .description("CLI for Figma — read files, components, styles, and more, or call Figma's official MCP server (figma mcp)")
  .version(version);

registerFigmaCommands(program);
registerMcpCommands(program);

program.parse();
