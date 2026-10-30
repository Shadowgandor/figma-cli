---
name: figma-mcp
description: Read Figma files, nodes, components, styles, variables, comments, projects and dev resources, and post comments, through the figma_* MCP tools of the figma-mcp server. Use whenever the user mentions Figma, a design file, component library, design tokens, Figma variables or styles, a design system, or shares a Figma URL (figma.com/design/...), and the figma_* tools are available.
---

# Figma MCP Skill

Work with Figma through the `figma_*` MCP tools provided by the `figma-mcp` server. They wrap the Figma REST API. Every action in this skill is a tool call.

---

## Prerequisites

The `figma-mcp` server must be configured in the MCP client with a Figma personal access token, either `FIGMA_TOKEN` in the server's environment or `~/.config/figma/config.json`. Verify before other calls:

```
figma_auth()
```

If it reports a missing or invalid token, ask the user to fix the server configuration. They generate a token at **figma.com → Account Settings → Personal access tokens**. **Never** ask for the token value in chat or write it anywhere.

---

## Key Identifiers

- **file_key**: in the URL `figma.com/design/{file_key}/file-name`
- **node_id**: the `node-id=` URL parameter, written `1:2` (URLs use `1-2`); or find it with `figma_find_nodes`
- **team_id**: in the team URL `figma.com/files/team/{team_id}/`
- **project_id**: from `figma_get_team_projects`, or in `figma.com/files/project/{project_id}/`
- **component_key / style_key**: from `figma_get_file_components` / `figma_get_file_styles`

When you only have a Figma URL, call `figma_parse_url` first. It returns every ID in the URL, with `node_id` already converted to `1:2` form.

---

## Confirmation Protocol

All tools are read-only except one:

| Tool | Effect | Confirmation required |
|---|---|---|
| `figma_post_comment` | Posts a comment on the file, visible to everyone with access | Yes. Confirm the message, file, and target node with the user before calling |

---

## Tools

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

## Error Handling

Tools return an error result with the Figma API status:

- **401**: invalid or expired token. Ask the user to regenerate it and update the server configuration.
- **403**: the token's owner has no access to this file or team.
- **404**: wrong key or ID. Re-check the URL with the user.
- **429**: rate limited. The server already retries with backoff (up to 3 attempts), so wait before trying again.

---

## Tips

- Start with `figma_auth` to confirm the connection.
- Use `figma_parse_url` whenever the user gives you a URL.
- Use `depth: 2` (or `3`) with `figma_get_file` on unknown files. Full document trees can be very large.
- `figma_get_file_nodes` is much cheaper than `figma_get_file` when you know the node IDs.
- Use `figma_find_nodes` to locate components, frames, or text by name when you don't have node IDs or dev resources.
- Discovery path from a team: `figma_get_team_projects` → `figma_get_project_files`.
- Discover keys with `figma_get_file_components` / `figma_get_file_styles`, then fetch details with `figma_get_component` / `figma_get_style`.
- Variables need Dev Mode or editor access on the file. `figma_get_published_variables` works for consumers of a library.
- `figma_render_images` returns temporary S3 URLs. Use them promptly.
