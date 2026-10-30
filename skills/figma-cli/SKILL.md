---
name: figma-cli
description: Read Figma files, components, styles, variables, comments and projects, and get design-to-code context and screenshots, by running the `figma` command-line tool in the shell. Use whenever the user mentions Figma, a design file, component library, design tokens, Figma variables or styles, a design system, or shares a Figma URL (figma.com/design/...), and the `figma` CLI is installed.
---

# Figma CLI Skill

Work with Figma by running the `figma` command in the shell. Everything in this skill is a shell command. There are no tools to call other than the shell.

The CLI has two halves:

| Commands | Talks to | Auth | Use for |
|---|---|---|---|
| `figma auth`, `files`, `projects`, `components`, `styles`, `variables`, `dev-resources` | Figma REST API | `FIGMA_TOKEN` | File trees, nodes, rendering, versions, comments, projects, components, styles, variables |
| `figma mcp …` | Figma's own design-to-code server (Figma desktop app) | None (desktop app must be running) | Generated code for a design, screenshots, variable definitions for a selection, Code Connect, writing to the canvas |

`figma mcp` is just a CLI subcommand. It is still run in the shell like every other command.

---

## Prerequisites

Check that the CLI is installed:

```bash
figma --version
```

If it's missing, ask the user to install it: `npm install -g @geeveeh/figma-cli`.

### REST commands

They need a Figma personal access token, either in `FIGMA_TOKEN` or in `~/.config/figma/config.json` as `{ "token": "..." }`. Verify with:

```bash
figma auth
```

If the token is missing, the command explains how to set it. Ask the user to set it. They generate one at **figma.com → Account Settings → Personal access tokens**. **Never** ask for the token value in chat, write it to a file, or echo it.

### `figma mcp` commands

They need the Figma desktop app open on a Design file, in Dev Mode, with the MCP server enabled. They don't use `FIGMA_TOKEN`. Verify with:

```bash
figma mcp status
```

---

## Identifiers and URLs

| ID | Where to find it |
|---|---|
| `file_key` | `figma.com/design/{file_key}/...` (also `/file/` and `/proto/` URLs) |
| `node_id` | `node-id=` query parameter in a URL. **Convert `1-2` to `1:2`** for the REST commands |
| `team_id` | `figma.com/files/team/{team_id}/...` |
| `project_id` | `figma.com/files/project/{project_id}/...`, or from `figma projects list` |
| `component_key` / `style_key` | From `figma components list` / `figma styles list` |

When the user gives you a URL:
- REST commands: extract the IDs yourself using the table above. `figma projects list --url <team url>` accepts a team URL directly.
- `figma mcp` commands: pass the URL as-is. It fills in the file key and node ID automatically.

---

## Confirmation Protocol

Most commands are read-only and need no confirmation. These change things and need the user's explicit approval first:

| Command | Effect |
|---|---|
| `figma files comment-add` | Posts a comment on the file, visible to everyone with access. Confirm the message, file, and node. |
| `figma mcp <write tool>`, e.g. `use_figma`, `generate_figma_design`, `create_new_file`, `upload_assets`, `add_code_connect_map`, `send_code_connect_mappings`, any `create_*` / `update_*`, `weave_run_*` | Changes the user's Figma files or spends credits. Describe what will change. |

---

## REST Commands

Every command accepts `--json` for complete, machine-readable output. **Without `--json` most commands print a short summary.** Use `--json` whenever you need properties, not just names and IDs.

### Auth

```bash
figma auth                     # current user; verifies the token
```

### Files

```bash
figma files get <file_key> --depth 2 --json        # document tree (start with depth 2)
figma files get <file_key>                         # metadata summary only, no tree
figma files get <file_key> --version <version_id> --depth 2 --json

figma files nodes <file_key> 1:2 3:4 --json        # full properties of specific nodes
figma files nodes <file_key> 1:2 --depth 1         # name, type, child preview

figma files find-nodes <file_key> --name "Button"              # case-insensitive substring
figma files find-nodes <file_key> --type COMPONENT
figma files find-nodes <file_key> --name "Header" --type FRAME --depth 3 --json

figma files render <file_key> 1:2 3:4                          # PNG download URLs
figma files render <file_key> 1:2 --format svg
figma files render <file_key> 1:2 --format png --scale 2

figma files versions <file_key> --limit 10
figma files comments <file_key> --limit 20

# Write: confirm with the user first
figma files comment-add <file_key> "Message"
figma files comment-add <file_key> "Message" --node 1:2
figma files comment-add <file_key> "Message" --reply-to <comment_id>
```

- `find-nodes` needs at least one of `--name` or `--type`. Types include `FRAME`, `COMPONENT`, `COMPONENT_SET`, `INSTANCE`, `TEXT`, `GROUP`, `CANVAS` (pages).
- `render` returns temporary S3 URLs. Download them promptly (e.g. `curl -o out.png "<url>"`) if you need the image.

### Projects

```bash
figma projects list <team_id>
figma projects list --url "https://www.figma.com/files/team/123456789/Team"
figma projects files <project_id>             # file names, keys, last modified
```

### Components

```bash
figma components list <file_key> --limit 50   # published components: name, key, node ID
figma components get <component_key>
figma components sets <file_key>              # published component sets (variant groups)
```

### Styles

```bash
figma styles list <file_key>                  # name, type (FILL/TEXT/EFFECT/GRID), key
figma styles get <style_key>
```

### Variables

```bash
figma variables local <file_key> --json       # needs editor access / Dev Mode on the file
figma variables published <file_key> --json   # variables published from a library file
```

### Dev Resources

```bash
figma dev-resources <file_key>
figma dev-resources <file_key> --nodes 1:2,3:4
```

Dev resources are links added by hand in Dev Mode and are often empty. If they are, explore the file with `files find-nodes` instead.

Not available in the CLI: image-fill download URLs, and looking up a single component set by key. Don't invent commands for them. Use `figma files render` for images instead.

---

## `figma mcp` Commands (design-to-code)

`figma mcp` forwards to Figma's own MCP server running inside the Figma desktop app. The available tools come from that server and change over time, so **discover them first**:

```bash
figma mcp status                   # connection check, server version, tool count
figma mcp tools                    # list tools with one-line descriptions
figma mcp <tool> --help            # options for one tool, from its schema
```

Then call a tool as `figma mcp <tool> [options]`:

```bash
figma mcp get_design_context "https://www.figma.com/design/abc123/App?node-id=1-2"
figma mcp get_design_context --node-id 1:2 --client-frameworks react
figma mcp get_metadata --node-id 0:1           # light outline: IDs, names, sizes
figma mcp get_screenshot --node-id 1:2         # saves a PNG and prints its path
figma mcp get_variable_defs --node-id 1:2 --json
figma mcp get_code_connect_map --node-id 1:2
figma mcp prompt create_design_system_rules
```

How options work:
- Option names are the tool's parameter names in kebab-case (`nodeId` → `--node-id`). `figma mcp <tool> --help` shows them, including which are required.
- A bare Figma URL fills `fileKey` and `nodeId`.
- Arrays: repeat the option (`--node-ids 1:2 --node-ids 3:4`) or pass JSON (`--node-ids '["1:2","3:4"]'`).
- Booleans: `--flag`, `--no-flag`.
- Complex input: `--args '{"key": "value"}'`, `--args @file.json`, or `--args -` to read stdin.
- Images are saved to disk (`--out-dir <dir>`, default `$TMPDIR/figma-cli`) and only the path is printed. Open the file if you need to look at it.
- With the desktop server, omitting `--node-id` usually means "the user's current selection in Figma".

Remote server: `--server remote` targets `mcp.figma.com` after `figma mcp login`. Figma currently refuses figma-cli there (HTTP 403, client allowlist), so use the desktop server.

---

## Choosing the Right Command

| Goal | Command |
|---|---|
| Implement a design in code | `figma mcp get_design_context <url>` |
| Look at a frame | `figma mcp get_screenshot <url>`, or `figma files render` (no desktop app needed) |
| Find a layer by name | `figma files find-nodes <file_key> --name ...` |
| Outline a page or large frame | `figma mcp get_metadata`, or `figma files get --depth 2 --json` |
| Design tokens | `figma variables local/published --json`, or `figma mcp get_variable_defs` for a selection |
| Inventory a design system | `figma components list`, `figma components sets`, `figma styles list` |
| Find a file from a team | `figma projects list` → `figma projects files` |
| Read feedback | `figma files comments` |

If the desktop app isn't available, fall back to the REST commands.

---

## Error Handling

REST commands:
- **401**: invalid or expired token. Ask the user to regenerate it.
- **403**: the token's owner has no access to this file or team.
- **404**: wrong key or ID. Re-check the URL with the user.
- **429**: rate limited. The CLI already retries with backoff, so wait before trying again.

`figma mcp`:
- **"Could not reach the Figma desktop MCP server"**: ask the user to open the Figma desktop app and a Design file, switch to Dev Mode, and enable the MCP server. Or use the REST commands.
- **"refused figma-cli (HTTP 403 Forbidden)"**: the remote server's client allowlist. Don't retry. Use the desktop server.
- **"Not logged in to …"**: the user must run `figma mcp login` themselves (it opens a browser).
- **"Unknown option" / "Missing required option(s)"**: run `figma mcp <tool> --help` and fix the options.
- **"Unknown tool"**: run `figma mcp tools`. The server may not offer that tool, e.g. some tools are remote-only.
- Any other error message comes from Figma's server. Read it before retrying.

---

## Tips

- On unknown files, start with `--depth 2`. Full document trees can be enormous.
- `figma files nodes` is much cheaper than `figma files get` when you know the node IDs.
- Use `--limit` on list commands (`versions`, `comments`, `components`, `sets`, `styles`) to keep output short.
- Pipe `--json` output to `jq` to pick out fields instead of reading huge JSON.
- For a big frame, run `figma mcp get_metadata` first to find the child node you need, then `get_design_context` on that node.
