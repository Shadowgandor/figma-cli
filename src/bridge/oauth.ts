import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createServer } from "http";
import { spawn } from "child_process";
import { randomBytes } from "crypto";
import { homedir } from "os";
import { dirname, join } from "path";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { REMOTE_URL } from "./servers.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

const AUTH_PATH = join(homedir(), ".config", "figma", "mcp-auth.json");

export const DEFAULT_CALLBACK_PORT = 47823;

interface StoredSession {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  state?: string;
  savedAt?: string;
}

type AuthStore = Record<string, StoredSession>;

function readStore(): AuthStore {
  try {
    if (!existsSync(AUTH_PATH)) return {};
    return JSON.parse(readFileSync(AUTH_PATH, "utf-8")) as AuthStore;
  } catch {
    return {};
  }
}

function writeStore(store: AuthStore): void {
  mkdirSync(dirname(AUTH_PATH), { recursive: true, mode: 0o700 });
  writeFileSync(AUTH_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
  chmodSync(AUTH_PATH, 0o600);
}

function storeKey(serverUrl: URL): string {
  return `${serverUrl.origin}${serverUrl.pathname}`;
}

export function getSession(serverUrl: URL): StoredSession | undefined {
  return readStore()[storeKey(serverUrl)];
}

export function clearSession(serverUrl: URL): boolean {
  const store = readStore();
  const key = storeKey(serverUrl);
  if (!store[key]) return false;
  delete store[key];
  writeStore(store);
  return true;
}

/**
 * File-backed OAuth provider for the remote Figma MCP server.
 * Tokens live in ~/.config/figma/mcp-auth.json (mode 0600), keyed by server URL.
 *
 * In non-interactive mode (any command other than `figma mcp login`) a needed
 * browser redirect is turned into an error telling the user to log in.
 */
export class FileOAuthProvider implements OAuthClientProvider {
  constructor(
    private readonly serverUrl: URL,
    private readonly opts: { interactive: boolean; port?: number; openBrowser?: boolean } = { interactive: false },
  ) {}

  private update(patch: Partial<StoredSession>): void {
    const store = readStore();
    const key = storeKey(this.serverUrl);
    store[key] = { ...store[key], ...patch, savedAt: new Date().toISOString() };
    writeStore(store);
  }

  get redirectUrl(): string {
    return `http://127.0.0.1:${this.opts.port ?? DEFAULT_CALLBACK_PORT}/callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "figma-cli",
      client_uri: "https://github.com/Shadowgandor/figma-cli",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "mcp:connect",
    };
  }

  state(): string {
    const state = randomBytes(16).toString("hex");
    this.update({ state });
    return state;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    // A client pre-registered with Figma takes precedence over dynamic registration
    const clientId = process.env.FIGMA_MCP_CLIENT_ID;
    if (clientId) {
      return { client_id: clientId, client_secret: process.env.FIGMA_MCP_CLIENT_SECRET };
    }
    const info = getSession(this.serverUrl)?.clientInformation;
    // Re-register if the stored registration was made for a different callback URL
    if (info && "redirect_uris" in info && Array.isArray(info.redirect_uris)
        && !info.redirect_uris.map(String).includes(this.redirectUrl)) {
      return undefined;
    }
    return info;
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    this.update({ clientInformation });
  }

  tokens(): OAuthTokens | undefined {
    return getSession(this.serverUrl)?.tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.update({ tokens });
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    if (!this.opts.interactive) {
      throw new Error(
        `Not logged in to ${this.serverUrl.href}, or the session expired.\n` +
        `Run: figma mcp login${this.serverUrl.href === REMOTE_URL ? "" : ` --server ${this.serverUrl.href}`}`,
      );
    }
    console.error(`Open this URL to authorize figma-cli:\n\n  ${authorizationUrl.href}\n`);
    if (this.opts.openBrowser !== false) openBrowser(authorizationUrl.href);
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.update({ codeVerifier });
  }

  codeVerifier(): string {
    const verifier = getSession(this.serverUrl)?.codeVerifier;
    if (!verifier) throw new Error("No PKCE code verifier saved — run `figma mcp login` again.");
    return verifier;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
    if (scope === "all") this.update({ clientInformation: undefined, tokens: undefined, codeVerifier: undefined });
    else if (scope === "client") this.update({ clientInformation: undefined });
    else if (scope === "tokens") this.update({ tokens: undefined });
    else if (scope === "verifier") this.update({ codeVerifier: undefined });
  }
}

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] :
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] :
    ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    // The URL is printed as well, so a missing opener is not fatal
  }
}

/** Wait for the OAuth redirect on the loopback callback server and return the authorization code. */
function waitForCallback(port: number, expectedState: () => string | undefined, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const finish = (status: number, message: string, result: { code?: string; error?: Error }) => {
        res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
        res.end(`<!doctype html><title>figma-cli</title><body style="font-family:system-ui;padding:2rem">${message}</body>`);
        clearTimeout(timer);
        server.close();
        if (result.code) resolve(result.code);
        else reject(result.error);
      };
      const error = url.searchParams.get("error");
      if (error) {
        const desc = url.searchParams.get("error_description");
        finish(400, "Authorization failed. You can close this tab.", { error: new Error(`Authorization failed: ${error}${desc ? ` — ${desc}` : ""}`) });
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        finish(400, "Missing authorization code.", { error: new Error("Callback did not include an authorization code") });
        return;
      }
      if (url.searchParams.get("state") !== expectedState()) {
        finish(400, "State mismatch — please retry.", { error: new Error("OAuth state mismatch; aborting login") });
        return;
      }
      finish(200, "figma-cli is authorized. You can close this tab.", { code });
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for authorization`));
    }, timeoutMs);
    server.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(err.code === "EADDRINUSE"
        ? new Error(`Callback port ${port} is in use. Retry with --port <n>.`)
        : err);
    });
    server.listen(port, "127.0.0.1");
  });
}

export function explainAuthError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (/\b403\b|forbidden/i.test(message)) {
    return new Error(
      `The remote Figma MCP server refused figma-cli (HTTP 403 Forbidden).\n\n` +
      `Figma only lets MCP clients listed in its MCP Catalog register with the remote server. Options:\n` +
      `  • Use the desktop server instead: figma mcp --server desktop ... (the default)\n` +
      `  • If Figma has issued you a client ID, set FIGMA_MCP_CLIENT_ID / FIGMA_MCP_CLIENT_SECRET`,
    );
  }
  return err instanceof Error ? err : new Error(message);
}

/** Run the interactive OAuth login against the given server and store the resulting tokens. */
export async function login(
  serverUrl: URL,
  opts: { port?: number; openBrowser?: boolean; timeoutMs?: number } = {},
): Promise<void> {
  const port = opts.port ?? DEFAULT_CALLBACK_PORT;
  const provider = new FileOAuthProvider(serverUrl, { interactive: true, port, openBrowser: opts.openBrowser });

  // Force a fresh authorization rather than silently reusing tokens
  if (getSession(serverUrl)?.tokens) provider.invalidateCredentials("tokens");

  // Start listening before the browser opens so a fast redirect can't be missed
  const callback = waitForCallback(port, () => getSession(serverUrl)?.state, opts.timeoutMs ?? 5 * 60_000);
  callback.catch(() => {});

  let result;
  try {
    result = await auth(provider, { serverUrl });
  } catch (err) {
    await closeCallback(port);
    throw explainAuthError(err);
  }
  if (result === "AUTHORIZED") {
    await closeCallback(port);
    return;
  }

  const code = await callback;
  try {
    await auth(provider, { serverUrl, authorizationCode: code });
  } catch (err) {
    throw explainAuthError(err);
  }
}

/** Unblock a pending callback listener by hitting it with an invalid request. */
async function closeCallback(port: number): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${port}/callback?error=cancelled`);
  } catch {
    // Already closed
  }
}
