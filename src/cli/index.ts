#!/usr/bin/env node

import { Command } from "commander";
import { registerFigmaCommands } from "./figma.js";

const program = new Command()
  .name("figma")
  .description("CLI for Figma — read files, components, styles, and more")
  .version("0.1.0");

registerFigmaCommands(program);

program.parse();
