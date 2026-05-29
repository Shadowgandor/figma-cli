# Figma Skill

Read and write Figma data using the `figma` CLI tool or MCP tools. Covers Figma REST API read endpoints — files, nodes, images, versions, comments, teams, projects, components, styles, variables, and dev resources — plus posting comments.

---

## Skill Description (for triggering)

Use this skill whenever the user wants to inspect or retrieve information from Figma. This includes reading Figma file contents or structure, listing components or styles in a design system, exploring a team's projects or files, reading variables and tokens from a library file, getting version history, reading comments, rendering node images, searching for nodes by name, or finding dev resources linked to design nodes. Triggers include mentions of 'Figma', 'design file', 'component library', 'design tokens', 'Figma variables', 'Figma styles', 'design system', or a Figma URL (`figma.com/design/...`).

---

## Prerequisites

The `figma` CLI must be installed and `FIGMA_TOKEN` must be set:

```bash
export FIGMA_TOKEN="your-personal-access-token"
```

Or set in `~/.config/figma/config.json`:

```json
{ "token": "your-personal-access-token" }
```

Generate a token at: **figma.com → Account Settings → Personal access tokens**

**Never** write the token value to any file or echo it to output.

Verify the connection before proceeding:

```bash
figma auth
# or via MCP:
figma_auth
```

---

## Key Identifiers

- **file_key** — found in the Figma URL: `figma.com/design/{file_key}/file-name`
- **team_id** — found in the team URL: `figma.com/files/team/{team_id}/`
- **project_id** — returned by `figma_get_team_projects` / `figma projects list`
- **node_id** — visible in Figma by right-clicking a layer → Copy/Paste as → Copy link (fragment after `node-id=`); or use `figma_find_nodes` to search by name
- **component_key / style_key** — returned by list commands (`figma_get_file_components`, `figma_get_file_styles`)

When you only have a Figma URL, use `figma_parse_url` (MCP) or `figma projects list --url` (CLI) to extract the relevant IDs without having to manually parse the URL.

---

## Confirmation Protocol

Most tools in this skill are **read-only** and need no confirmation. The one exception:

| Tool / Command | Effect | Confirmation required |
|---|---|---|
| `figma_post_comment` / `files comment-add` | Creates a comment on a file | Yes — confirm message, file, and target node with the user before calling |

---

## MCP Tools

### Auth

#### `figma_auth`
Verify the connection and return the current user's handle, email, and ID.

```
figma_auth()
```

---

### URL Parsing

#### `figma_parse_url`
Extract IDs from a Figma URL. Returns `file_key`, `team_id`, `project_id`, and `node_id` when present. Use this before calling other tools when you only have a URL.

```
figma_parse_url(url)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | **Required.** Any Figma URL |

**Example output:**
```
file_key: ABC123xyz
node_id: 1:2
```

---

### Comments (write)

#### `figma_post_comment`
Post a comment on a Figma file. Confirm the message and file key with the user before calling.

```
figma_post_comment(file_key, message, node_id?, reply_to?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `file_key` | string | **Required.** The Figma file key |
| `message` | string | **Required.** The comment text |
| `node_id` | string | Pin the comment to this node ID |
| `reply_to` | string | Comment ID to reply to (from `figma_get_file_comments`) |

---

### Files

#### `figma_get_file`
Get a file's full document tree and metadata. Always start with `depth=2` for an overview on unknown files; fetch deeper only as needed.

```
figma_get_file(file_key, depth?, version?, ids?, branch_data?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `file_key` | string | **Required.** The Figma file key |
| `depth` | number | Node tree depth. Use `2` for an overview of large files |
| `version` | string | Specific version ID (from `figma_get_file_versions`) |
| `ids` | string[] | Limit response to these node IDs |
| `branch_data` | boolean | Include branch metadata |

#### `figma_get_file_nodes`
Get specific nodes from a file by their node IDs.

```
figma_get_file_nodes(file_key, ids, depth?, version?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `file_key` | string | **Required.** The Figma file key |
| `ids` | string[] | **Required.** Node IDs to retrieve (e.g. `["1:2", "3:4"]`) |
| `depth` | number | Tree depth per node |
| `version` | string | Specific version ID |

#### `figma_find_nodes`
Search for nodes in a file by name or type. Use this when dev resources are unavailable or you need to locate components, frames, or text layers by name. Start with `depth=3` for large files.

```
figma_find_nodes(file_key, name?, type?, depth?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `file_key` | string | **Required.** The Figma file key |
| `name` | string | Case-insensitive name substring to match |
| `type` | string | Node type filter: `FRAME`, `COMPONENT`, `TEXT`, `GROUP`, `INSTANCE`, `CANVAS`, etc. |
| `depth` | number | Tree depth to fetch. Use `3` for large files |

At least one of `name` or `type` is required.

#### `figma_render_images`
Render nodes as images and return S3 download URLs. URLs expire after a short time.

```
figma_render_images(file_key, ids, format?, scale?, version?, use_absolute_bounds?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `file_key` | string | **Required.** |
| `ids` | string[] | **Required.** Node IDs to render |
| `format` | `jpg` \| `png` \| `svg` \| `pdf` | Default: `png` |
| `scale` | number | Scale factor 0.01–4. Default: `1` |
| `version` | string | Specific file version |
| `use_absolute_bounds` | boolean | Include effects in bounds |

#### `figma_get_image_fills`
Get download URLs for all images used as fills in a file (photos, raster assets embedded in the design).

```
figma_get_image_fills(file_key)
```

#### `figma_get_file_versions`
Get version history of a file, including named versions and their authors.

```
figma_get_file_versions(file_key)
```

#### `figma_get_file_comments`
Get all comments on a file, including replies, resolved status, and authors.

```
figma_get_file_comments(file_key, as_md?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `file_key` | string | **Required.** |
| `as_md` | boolean | Return comment text as Markdown |

---

### Teams & Projects

#### `figma_get_team_projects`
List all projects in a Figma team. Returns project names and IDs. The `team_id` is the numeric ID in `figma.com/files/team/{team_id}/` — use `figma_parse_url` to extract it from a URL.

```
figma_get_team_projects(team_id)
```

#### `figma_get_project_files`
List all files in a project. Returns file names, keys, and last-modified dates. Use `figma_parse_url` or `figma_get_team_projects` to obtain the `project_id`.

```
figma_get_project_files(project_id)
```

---

### Components

#### `figma_get_file_components`
Get all published components in a file. Returns name, key, node ID, and description.

```
figma_get_file_components(file_key)
```

#### `figma_get_component`
Get full details for a specific component by its key.

```
figma_get_component(key)
```

#### `figma_get_file_component_sets`
Get all published component sets (variant groups) in a file.

```
figma_get_file_component_sets(file_key)
```

#### `figma_get_component_set`
Get full details for a specific component set by its key.

```
figma_get_component_set(key)
```

---

### Styles

#### `figma_get_file_styles`
Get all published styles in a file. Includes color, text, effect, and grid styles.

```
figma_get_file_styles(file_key)
```

#### `figma_get_style`
Get full details for a specific style by its key.

```
figma_get_style(key)
```

---

### Variables

#### `figma_get_local_variables`
Get all local variables and variable collections defined in a file. Requires Dev Mode or editor access.

```
figma_get_local_variables(file_key)
```

Returns collections (with modes) and variables (with resolved type).

#### `figma_get_published_variables`
Get all variables published from a library file, available for use in other files.

```
figma_get_published_variables(file_key)
```

---

### Dev Resources

#### `figma_get_dev_resources`
Get dev resources (linked code or documentation URLs) attached to a file or specific nodes. Dev resources require Figma Dev Mode to be enabled and links added manually. If none are found, use `figma_find_nodes` to explore the file structure instead.

```
figma_get_dev_resources(file_key, node_ids?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `file_key` | string | **Required.** |
| `node_ids` | string[] | Filter to specific nodes |

---

## CLI Commands

### Auth

```bash
figma auth
figma auth --json
```

### Files

```bash
figma files get <file_key>
figma files get <file_key> --depth 2          # recommended for large files
figma files get <file_key> --json

figma files nodes <file_key> <id> [<id> ...]
figma files nodes <file_key> 1:2 --depth 1 --json

# Search nodes by name or type
figma files find-nodes <file_key> --name "Button"
figma files find-nodes <file_key> --type COMPONENT
figma files find-nodes <file_key> --name "Header" --type FRAME --depth 3 --json

figma files render <file_key> <id> [<id> ...]
figma files render <file_key> 1:2 --format svg
figma files render <file_key> 1:2 --format png --scale 2 --json

figma files versions <file_key>
figma files versions <file_key> --limit 10 --json

figma files comments <file_key>
figma files comments <file_key> --limit 20 --json

# Post a comment (write — confirm with user first)
figma files comment-add <file_key> "Looks good to me"
figma files comment-add <file_key> "Check this" --node 1:2
figma files comment-add <file_key> "Agreed" --reply-to <comment_id>
figma files comment-add <file_key> "Done" --json
```

### Projects

```bash
# By team ID
figma projects list <team_id>

# By URL (extracts team ID automatically)
figma projects list --url "https://www.figma.com/files/team/123456789/My-Team"

figma projects list <team_id> --json
figma projects files <project_id>
figma projects files <project_id> --json
```

### Components

```bash
figma components list <file_key>
figma components list <file_key> --limit 50 --json
figma components get <component_key> --json
figma components sets <file_key>
figma components sets <file_key> --limit 20 --json
```

### Styles

```bash
figma styles list <file_key>
figma styles list <file_key> --limit 50 --json
figma styles get <style_key> --json
```

### Variables

```bash
figma variables local <file_key>
figma variables local <file_key> --json

figma variables published <file_key>
figma variables published <file_key> --json
```

### Dev Resources

```bash
figma dev-resources <file_key>
figma dev-resources <file_key> --json
figma dev-resources <file_key> --nodes 1:2,3:4
```

---

## Error Handling

The CLI and MCP tools return clear error messages on failure:

- **401** — Invalid or expired token. Ask the user to regenerate their token at figma.com/settings.
- **403** — Insufficient permissions. The token owner may not have access to this file or team.
- **404** — File, component, style, or resource not found. Confirm the key or ID with the user.
- **429** — Rate limited. The client retries automatically with backoff (up to 3 attempts).

---

## Tips

- Always start with `figma_auth` to confirm the connection before other calls.
- Use `figma_parse_url` when you only have a Figma URL — it extracts all relevant IDs in one call.
- Use `depth: 2` or `depth: 3` with `figma_get_file` on large design files — the full document tree can be very large.
- `figma_get_file_nodes` is more efficient than `figma_get_file` when you only need a few specific layers.
- Use `figma_find_nodes` to locate components or frames by name when you don't have node IDs or dev resources.
- `figma_get_team_projects` → `figma_get_project_files` is the discovery path when you have a team ID but not a file key.
- Use `figma_get_file_components` to discover component keys, then `figma_get_component` for details.
- Use `figma_get_file_styles` to discover style keys, then `figma_get_style` for details.
- Variables require Dev Mode or editor-level access on the file — `figma_get_published_variables` works for consumers of a library file.
- `figma_render_images` returns temporary S3 URLs; download or display them promptly.
- Use `--json` on any CLI command for raw output suitable for scripting or piping to `jq`.
- Use `--limit` on list commands (versions, comments, components, sets, styles) to cap output on large files.
