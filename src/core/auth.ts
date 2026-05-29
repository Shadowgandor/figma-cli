import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { FigmaConfig } from "./types.js";

const CONFIG_PATH = join(homedir(), ".config", "figma", "config.json");

interface ConfigFile {
  token?: string;
}

function readConfigFile(): ConfigFile {
  try {
    if (!existsSync(CONFIG_PATH)) return {};
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as ConfigFile;
  } catch {
    return {};
  }
}

function detectProfilePath(): string {
  const shell = process.env.SHELL ?? "";
  const home = homedir();

  if (shell.endsWith("zsh")) return join(home, ".zshrc");
  if (shell.endsWith("fish")) return join(home, ".config/fish/config.fish");
  if (shell.endsWith("bash")) {
    const bashProfile = join(home, ".bash_profile");
    return existsSync(bashProfile) ? bashProfile : join(home, ".bashrc");
  }
  return join(home, ".profile");
}

export function loadConfigFromEnv(): FigmaConfig {
  const file = readConfigFile();
  const token = process.env.FIGMA_TOKEN ?? file.token;

  if (token) return { token };

  const profile = detectProfilePath();
  throw new Error(
    `Missing required environment variable: FIGMA_TOKEN\n\n` +
    `  FIGMA_TOKEN = (not set)\n\n` +
    `Option 1 — add to ${profile}:\n\n` +
    `  export FIGMA_TOKEN="your-personal-access-token"\n\n` +
    `Option 2 — create ${CONFIG_PATH}:\n\n` +
    `  {\n    "token": "your-personal-access-token"\n  }\n\n` +
    `Generate a token at: https://www.figma.com/settings (Account > Personal access tokens)`,
  );
}
