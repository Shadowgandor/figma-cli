# figma-cli

CLI and MCP server for Figma — read files, components, styles, variables, and more from your terminal or AI agent.

## Features

- **CLI** (`figma`) — inspect Figma files, projects, components, styles, and variables from your terminal
- **MCP server** (`figma-mcp`) — expose 18 read-only Figma tools to any MCP-compatible AI agent
- Covers all Figma REST API read endpoints: files, nodes, images, versions, comments, projects, components, styles, variables, and dev resources
- Token-based auth via environment variable or config file
- Retry logic with exponential backoff and 30s timeout

## Installation

```bash
npm install -g @geeveeh/figma-cli
```

Or run without installing:

```bash
npx @geeveeh/figma-cli figma auth
```

## Authentication

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
figma auth
```

## CLI Usage

### Auth

```bash
figma auth
```

### Files

```bash
# Get file metadata and document tree
figma files get <file_key>
figma files get <file_key> --depth 2        # limit tree depth (recommended for large files)
figma files get <file_key> --json           # raw JSON output

# Get specific nodes by ID
figma files nodes <file_key> 1:2 3:4
figma files nodes <file_key> 1:2 --depth 1 --json

# Render nodes as images (returns download URLs)
figma files render <file_key> 1:2 3:4
figma files render <file_key> 1:2 --format svg
figma files render <file_key> 1:2 --format png --scale 2

# List version history
figma files versions <file_key>

# List comments
figma files comments <file_key>
```

The `file_key` is in the Figma URL: `figma.com/design/{file_key}/file-name`.

### Projects

```bash
# List projects in a team
figma projects list <team_id>

# List files in a project
figma projects files <project_id>
```

The `team_id` is in the team URL: `figma.com/files/team/{team_id}/`.

### Components

```bash
# List published components in a file
figma components list <file_key>

# Get a component by key
figma components get <component_key>

# List published component sets (variant groups)
figma components sets <file_key>
```

### Styles

```bash
# List published styles in a file
figma styles list <file_key>

# Get a style by key
figma styles get <style_key>
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

# Filter to specific nodes
figma dev-resources <file_key> --nodes 1:2,3:4
```

## MCP Server

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
| `figma_get_file` | Get a file's document tree and metadata |
| `figma_get_file_nodes` | Get specific nodes from a file by ID |
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

## Development

```bash
git clone https://github.com/Shadowgandor/figma-cli
cd figma-cli
npm install
npm run build       # compile TypeScript
npm run dev:cli     # run CLI without building
npm run dev:mcp     # run MCP server without building
```

## License

MIT
