# figma-cli

CLI and MCP server for Figma — read files, components, styles, variables, and more from your terminal or AI agent, and call Figma's official MCP server (design-to-code, screenshots, Code Connect) from the command line.

## Features

- **CLI** (`figma`) — inspect Figma files, projects, components, styles, and variables from your terminal
- **MCP server** (`figma-mcp`) — expose 21 Figma tools to any MCP-compatible AI agent
- Covers Figma REST API read endpoints: files, nodes, images, versions, comments, projects, components, styles, variables, and dev resources
- **Official Figma MCP bridge** (`figma mcp …`) — call every tool, prompt, and resource of Figma's own MCP server (desktop app or remote) from the terminal, with flags generated from each tool's input schema
- Write support: post comments (optionally pinned to a node or as a reply)
- URL parsing — extract file/team/project IDs directly from Figma URLs
- Node search — find layers by name or type when dev resources aren't maintained
- `--json` flag on every command for consistent scripted use
- Token-based auth via environment variable or config file; OAuth login for MCP servers that need it
- REST calls retry with exponential backoff and time out after 30s

## Installation

```bash
npm install -g @geeveeh/figma-cli
```

Or run without installing:

```bash
npx @geeveeh/figma-cli figma auth
```

## Authentication

The REST-based commands (`figma files`, `figma components`, …) and the `figma-mcp` server need a Figma Personal Access Token. `figma mcp` does **not** use this token: the desktop server needs no auth, and other servers use OAuth (see [Official Figma MCP Server](#official-figma-mcp-server-figma-mcp)).

You need a Figma Personal Access Token. Generate one at **figma.com → Account Settings → Personal access tokens**.

**Option 1 — environment variable (recommended):**

```bash
export FIGMA_TOKEN="your-personal-access-token"
```

**Option 2 — config file** at `~/.config/figma/config.json`:

```json
{
  "token": "your-personal-access-token"
}
```

Verify your connection:

```bash
figma auth          # REST API token
figma mcp status    # official Figma MCP server
```

### Config file reference

`~/.config/figma/config.json` accepts:

| Key | Used by | Description |
|---|---|---|
| `token` | REST commands, `figma-mcp` | Personal access token (`FIGMA_TOKEN` takes precedence) |
| `mcpServer` | `figma mcp` | Default server: `desktop`, `remote`, or a URL (`FIGMA_MCP_SERVER` takes precedence) |

Environment variables used by `figma mcp`: `FIGMA_MCP_SERVER`, plus `FIGMA_MCP_CLIENT_ID` / `FIGMA_MCP_CLIENT_SECRET` for a pre-registered OAuth client. OAuth tokens are stored separately in `~/.config/figma/mcp-auth.json`.

## CLI Usage

### Auth

```bash
figma auth
figma auth --json
```

### Files

```bash
# Get file metadata and document tree
figma files get <file_key>
figma files get <file_key> --depth 2        # recommended for large files
figma files get <file_key> --json           # raw JSON output

# Get specific nodes by ID
figma files nodes <file_key> 1:2 3:4
figma files nodes <file_key> 1:2 --depth 1 --json

# Search for nodes by name or type
figma files find-nodes <file_key> --name "Button"
figma files find-nodes <file_key> --type COMPONENT
figma files find-nodes <file_key> --name "Header" --type FRAME --depth 3 --json

# Render nodes as images (returns download URLs)
figma files render <file_key> 1:2 3:4
figma files render <file_key> 1:2 --format svg
figma files render <file_key> 1:2 --format png --scale 2 --json

# List version history
figma files versions <file_key>
figma files versions <file_key> --limit 10 --json

# List comments
figma files comments <file_key>
figma files comments <file_key> --limit 20 --json

# Post a comment
figma files comment-add <file_key> "Looks good to me"
figma files comment-add <file_key> "Check this node" --node 1:2
figma files comment-add <file_key> "Agreed" --reply-to <comment_id>
figma files comment-add <file_key> "Done" --json
```

The `file_key` is in the Figma URL: `figma.com/design/{file_key}/file-name`.

### Projects

```bash
# List projects in a team — pass the team ID or a Figma team URL
figma projects list <team_id>
figma projects list --url "https://www.figma.com/files/team/123456789/My-Team"
figma projects list <team_id> --json

# List files in a project
figma projects files <project_id>
figma projects files <project_id> --json
```

The `team_id` is in the team URL: `figma.com/files/team/{team_id}/`.

### Components

```bash
# List published components in a file
figma components list <file_key>
figma components list <file_key> --limit 50 --json

# Get a component by key
figma components get <component_key> --json

# List published component sets (variant groups)
figma components sets <file_key>
figma components sets <file_key> --limit 20 --json
```

### Styles

```bash
# List published styles in a file
figma styles list <file_key>
figma styles list <file_key> --limit 50 --json

# Get a style by key
figma styles get <style_key> --json
```

### Variables

```bash
# List local variables (requires Dev Mode / editor access)
figma variables local <file_key>
figma variables local <file_key> --json

# List published variables from a library file
figma variables published <file_key>
figma variables published <file_key> --json
```

### Dev Resources

```bash
# List dev resources (linked code/docs) attached to a file
figma dev-resources <file_key>
figma dev-resources <file_key> --json

# Filter to specific nodes
figma dev-resources <file_key> --nodes 1:2,3:4
```

> **Tip:** Dev resources require Figma Dev Mode. If none are found, use `files find-nodes` to explore the file structure instead.

## Official Figma MCP Server (`figma mcp`)

`figma mcp` wraps Figma's official MCP server — the one that provides `get_design_context`, `get_screenshot`, `get_variable_defs`, `get_metadata`, Code Connect, `use_figma`, and so on. The CLI asks the server for its tool list at runtime, so every tool it exposes (including ones Figma adds later) is callable without a figma-cli update.

### Choosing a server

| Server | URL | Auth |
|---|---|---|
| `desktop` (default) | `http://127.0.0.1:3845/mcp` | None — open the Figma desktop app, open a Design file, switch to Dev Mode and enable the MCP server |
| `remote` | `https://mcp.figma.com/mcp` | OAuth via `figma mcp login` |
| any URL | e.g. a proxy | OAuth if the server asks for it |

Select one with `--server <desktop|remote|url>`, the `FIGMA_MCP_SERVER` environment variable, or `"mcpServer"` in `~/.config/figma/config.json`.

> **Remote server note:** Figma only lets clients listed in its MCP Catalog register with `mcp.figma.com`, and at the moment it refuses figma-cli with HTTP 403. Use the desktop server. If Figma issues you a client ID, set `FIGMA_MCP_CLIENT_ID` (and `FIGMA_MCP_CLIENT_SECRET`) and `figma mcp login` will use it. OAuth tokens are stored in `~/.config/figma/mcp-auth.json` (mode 0600).

### Usage

```bash
figma mcp status                  # which server, server name/version, tool count
figma mcp tools                   # list tools (--json for full input schemas)
figma mcp describe get_screenshot # options generated from the tool's schema
figma mcp get_screenshot --help   # same

# Call any tool: figma mcp <tool> [options]
figma mcp get_design_context "https://www.figma.com/design/abc123/App?node-id=1-2"
figma mcp get_design_context --file-key abc123 --node-id 1:2 --client-frameworks react
figma mcp get_screenshot --node-id 1:2 --out-dir ./shots
figma mcp get_variable_defs --node-id 1:2 --json
figma mcp download_assets --file-key abc123 --node-ids 1:2 --node-ids 3:4 --default-format SVG
figma mcp use_figma --args @args.json
figma mcp --server remote whoami

# Prompts and resources
figma mcp prompts
figma mcp prompt create_design_system_rules --client-languages typescript
figma mcp resources
figma mcp resource <uri>

# Remote server auth
figma mcp login [--port 47823] [--no-open]
figma mcp logout
```

How tool arguments map to the CLI:

| Input | Becomes |
|---|---|
| `--node-id 1:2`, `--nodeId=1:2` | `{"nodeId": "1:2"}` (camelCase/snake_case → `--kebab-case`; the original name works too) |
| `--force-code` / `--no-force-code` / `--force-code=false` | booleans |
| `--node-ids a --node-ids b` or `--node-ids '["a","b"]'` | arrays |
| `--options '{"k":1}'` | objects (JSON) |
| a Figma URL | fills `fileKey` / `nodeId` (or `nodeIds`) |
| other bare values | fill required parameters in schema order |
| `--args '<json>'`, `--args @file.json`, `--args -` (stdin) | base arguments; flags override |

Values are type-checked against the schema (numbers, integers, enums, required fields) before the call. Images and other binary content are saved to `--out-dir` (default: `$TMPDIR/figma-cli`) and the file path is printed instead of base64. With `--json`, the raw tool result is printed, with binary payloads replaced by a `path` field. A tool that returns an error exits with status 1.

If a tool name ever collides with a subcommand (`status`, `tools`, …), call it with `figma mcp call <tool> …`.

## MCP Server

`figma-mcp` is figma-cli's own MCP server, backed by the Figma REST API and your personal access token. It is separate from Figma's official MCP server, which the `figma mcp` CLI command talks to. You can configure both in the same agent.

Add the MCP server to your Claude Code or Claude Desktop config:

**Claude Code** (`~/.claude/claude_code_config.json` or project `.claude/mcp.json`):

```json
{
  "mcpServers": {
    "figma": {
      "command": "figma-mcp",
      "env": {
        "FIGMA_TOKEN": "your-personal-access-token"
      }
    }
  }
}
```

Or if running from source:

```json
{
  "mcpServers": {
    "figma": {
      "command": "node",
      "args": ["/path/to/figma-cli/dist/mcp/index.js"],
      "env": {
        "FIGMA_TOKEN": "your-personal-access-token"
      }
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `figma_auth` | Verify connection and return current user |
| `figma_parse_url` | Extract file/team/project/node IDs from a Figma URL |
| `figma_post_comment` | Post a comment on a file (write) |
| `figma_get_file` | Get a file's document tree and metadata |
| `figma_get_file_nodes` | Get specific nodes from a file by ID |
| `figma_find_nodes` | Search nodes in a file by name or type |
| `figma_render_images` | Render nodes as images, return download URLs |
| `figma_get_image_fills` | Get download URLs for image fills in a file |
| `figma_get_file_versions` | Get version history of a file |
| `figma_get_file_comments` | Get all comments on a file |
| `figma_get_team_projects` | List all projects in a team |
| `figma_get_project_files` | List all files in a project |
| `figma_get_file_components` | Get published components in a file |
| `figma_get_component` | Get a component by key |
| `figma_get_file_component_sets` | Get published component sets in a file |
| `figma_get_component_set` | Get a component set by key |
| `figma_get_file_styles` | Get published styles in a file |
| `figma_get_style` | Get a style by key |
| `figma_get_local_variables` | Get local variables in a file |
| `figma_get_published_variables` | Get published variables from a library file |
| `figma_get_dev_resources` | Get dev resources attached to a file |

## Agent Skills

Two Agent Skills teach an AI agent how to use this package. Install the one that matches how your agent reaches Figma, not both:

| Skill | For agents that… | Covers |
|---|---|---|
| [`skills/figma-cli`](skills/figma-cli/SKILL.md) | run shell commands with the `figma` CLI installed | Every `figma` command, including `figma mcp` |
| [`skills/figma-mcp`](skills/figma-mcp/SKILL.md) | have the `figma-mcp` server connected | The `figma_*` MCP tools |

Install a skill by copying its folder into your agent's skills directory, e.g. for Claude Code:

```bash
cp -r skills/figma-cli ~/.claude/skills/
# or, from the installed npm package:
cp -r "$(npm root -g)/@geeveeh/figma-cli/skills/figma-cli" ~/.claude/skills/
```

## Development

```bash
git clone https://github.com/Shadowgandor/figma-cli
cd figma-cli
npm install
npm run build       # compile TypeScript
npm run dev:cli     # run CLI without building
npm run dev:mcp     # run MCP server without building
```

Source layout:

| Path | Contents |
|---|---|
| `src/core` | Config, token auth, HTTP client, URL parsing |
| `src/figma` | Figma REST API client and types |
| `src/mcp` | `figma-mcp` server (REST-backed tools) |
| `src/bridge` | Client for Figma's official MCP server: server selection, OAuth, schema → CLI option parsing, output rendering |
| `src/cli` | Commander CLI (`figma.ts` for REST commands, `mcp.ts` for `figma mcp`) |

To work on `figma mcp` without the Figma desktop app, point it at any MCP server: `figma mcp tools --server http://127.0.0.1:<port>/mcp`.

## License

MIT
