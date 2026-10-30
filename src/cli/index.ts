#!/usr/bin/env node

import { Command } from "commander";
import { registerFigmaCommands } from "./figma.js";
import { registerMcpCommands } from "./mcp.js";

const program = new Command()
  .name("figma")
  .description("CLI for Figma — read files, components, styles, and more, or call Figma's official MCP server (figma mcp)")
  .version("0.1.0");

registerFigmaCommands(program);
registerMcpCommands(program);

program.parse();
