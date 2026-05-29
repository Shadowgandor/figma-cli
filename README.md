# figma-cli

CLI and MCP server for Figma — read files, components, styles, variables, and more from your terminal or AI agent.

## Features

- **CLI** (`figma`) — inspect Figma files, projects, components, styles, and variables from your terminal
- **MCP server** (`figma-mcp`) — expose 21 Figma tools to any MCP-compatible AI agent
- Covers Figma REST API read endpoints: files, nodes, images, versions, comments, projects, components, styles, variables, and dev resources
- Write support: post comments (optionally pinned to a node or as a reply)
- URL parsing — extract file/team/project IDs directly from Figma URLs
- Node search — find layers by name or type when dev resources aren't maintained
- `--json` flag on every command for consistent scripted use
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
