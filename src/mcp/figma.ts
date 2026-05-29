import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfigFromEnv, FigmaClient, parseFigmaUrl } from "../core/index.js";
import { FigmaApiClient, findNodes } from "../figma/index.js";
import { formatError } from "./helpers.js";

let _client: FigmaApiClient | null = null;

function getClient(): FigmaApiClient {
  if (!_client) _client = new FigmaApiClient(new FigmaClient(loadConfigFromEnv()));
  return _client;
}

export function registerFigmaTools(server: McpServer): void {
  // ── Auth ──────────────────────────────────────────────────────────

  server.tool(
    "figma_auth",
    "Verify the Figma connection and return the current user's info",
    {},
    async () => {
      try {
        const user = await getClient().getMe();
        const text = [
          "Connected successfully.",
          `User: ${user.handle} (${user.email})`,
          `ID: ${user.id}`,
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  // ── URL Parsing ───────────────────────────────────────────────────

  server.tool(
    "figma_parse_url",
    "Extract IDs from a Figma URL. Returns file_key, team_id, project_id, and node_id when present. Use this before calling other tools when you only have a URL.",
    {
      url: z.string().describe(
        "A Figma URL, e.g. https://www.figma.com/design/{file_key}/..., https://www.figma.com/files/team/{team_id}/..., or https://www.figma.com/files/project/{project_id}/...",
      ),
    },
    async ({ url }) => {
      const parts = parseFigmaUrl(url);
      if (!parts.fileKey && !parts.teamId && !parts.projectId) {
        return {
          content: [{
            type: "text",
            text: `Could not extract any IDs from: ${url}\nExpected patterns:\n- figma.com/design/{file_key}/...\n- figma.com/files/team/{team_id}/...\n- figma.com/files/project/{project_id}/...`,
          }],
          isError: true,
        };
      }
      const lines: string[] = [];
      if (parts.fileKey) lines.push(`file_key: ${parts.fileKey}`);
      if (parts.teamId) lines.push(`team_id: ${parts.teamId}`);
      if (parts.projectId) lines.push(`project_id: ${parts.projectId}`);
      if (parts.nodeId) lines.push(`node_id: ${parts.nodeId}`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  // ── Files ─────────────────────────────────────────────────────────

  server.tool(
    "figma_get_file",
    "Get a Figma file's document tree and metadata by its file key (the key is in the URL: figma.com/design/{file_key}/...). Always pass depth=2 first to get an overview, then fetch deeper as needed.",
    {
      file_key: z.string().describe("The Figma file key"),
      depth: z.number().optional().describe("Node tree depth to return — use 2 for an overview, omit only for small files"),
      version: z.string().optional().describe("Specific version ID to retrieve"),
      ids: z.array(z.string()).optional().describe("Specific node IDs to include (limits the response)"),
      branch_data: z.boolean().optional().describe("Include branch metadata in the response"),
    },
    async ({ file_key, depth, version, ids, branch_data }) => {
      try {
        const file = await getClient().getFile(file_key, { depth, version, ids, branch_data });
        const text = [
          `Name: ${file.name}`,
          `Last modified: ${file.lastModified}`,
          `Version: ${file.version}`,
          `Role: ${file.role}`,
          `Editor type: ${file.editorType}`,
          `Components: ${Object.keys(file.components).length}`,
          `Styles: ${Object.keys(file.styles).length}`,
          ...(file.branches?.length ? [`Branches: ${file.branches.map((b) => b.name).join(", ")}`] : []),
          "",
          "--- Document root ---",
          JSON.stringify(file.document, null, 2),
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "figma_get_file_nodes",
    "Get specific nodes from a Figma file by their node IDs",
    {
      file_key: z.string().describe("The Figma file key"),
      ids: z.array(z.string()).describe("Node IDs to retrieve (e.g. ['1:2', '3:4'])"),
      depth: z.number().optional().describe("Node tree depth to return"),
      version: z.string().optional().describe("Specific version ID"),
    },
    async ({ file_key, ids, depth, version }) => {
      try {
        const result = await getClient().getFileNodes(file_key, ids, { depth, version });
        const entries = Object.entries(result.nodes).map(([id, node]) => {
          return `Node ${id} (${node.document.name}, type: ${node.document.type}):\n${JSON.stringify(node.document, null, 2)}`;
        });
        const text = entries.length ? entries.join("\n\n") : "No nodes found.";
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "figma_render_images",
    "Render Figma nodes as images and return their download URLs",
    {
      file_key: z.string().describe("The Figma file key"),
      ids: z.array(z.string()).describe("Node IDs to render"),
      format: z.enum(["jpg", "png", "svg", "pdf"]).optional().describe("Image format (default: png)"),
      scale: z.number().optional().describe("Scale factor 0.01–4 (default: 1)"),
      version: z.string().optional().describe("Specific file version"),
      use_absolute_bounds: z.boolean().optional().describe("Use absolute bounding box (includes effects)"),
    },
    async ({ file_key, ids, format, scale, version, use_absolute_bounds }) => {
      try {
        const result = await getClient().renderImages(file_key, ids, { format, scale, version, use_absolute_bounds });
        if (result.err) {
          return { content: [{ type: "text", text: `Error: ${result.err}` }], isError: true };
        }
        const lines = Object.entries(result.images).map(([id, url]) =>
          url ? `${id}: ${url}` : `${id}: (failed to render)`,
        );
        return { content: [{ type: "text", text: lines.join("\n") || "No images rendered." }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "figma_get_image_fills",
    "Get download URLs for all images used as fills in a Figma file",
    { file_key: z.string().describe("The Figma file key") },
    async ({ file_key }) => {
      try {
        const result = await getClient().getImageFills(file_key);
        const images = result.meta?.images ?? {};
        const lines = Object.entries(images).map(([ref, url]) => `${ref}: ${url}`);
        return { content: [{ type: "text", text: lines.join("\n") || "No image fills found." }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "figma_get_file_versions",
    "Get the version history of a Figma file",
    { file_key: z.string().describe("The Figma file key") },
    async ({ file_key }) => {
      try {
        const result = await getClient().getFileVersions(file_key);
        if (!result.versions.length) {
          return { content: [{ type: "text", text: "No versions found." }] };
        }
        const text = result.versions.map((v) => {
          const label = v.label ? ` [${v.label}]` : "";
          const desc = v.description ? ` — ${v.description}` : "";
          return `${v.created_at}${label}${desc} (id: ${v.id}, by: ${v.user.handle})`;
        }).join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "figma_get_file_comments",
    "Get all comments on a Figma file",
    {
      file_key: z.string().describe("The Figma file key"),
      as_md: z.boolean().optional().describe("Return comment text as Markdown"),
    },
    async ({ file_key, as_md }) => {
      try {
        const result = await getClient().getFileComments(file_key, { as_md });
        if (!result.comments.length) {
          return { content: [{ type: "text", text: "No comments." }] };
        }
        const text = result.comments.map((c) => {
          const resolved = c.resolved_at ? ` [resolved: ${c.resolved_at}]` : "";
          const parent = c.parent_id ? ` (reply to ${c.parent_id})` : "";
          return `[${c.user.handle} · ${c.created_at}${resolved}${parent}]\n${c.message}`;
        }).join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  // ── Teams & Projects ──────────────────────────────────────────────

  server.tool(
    "figma_get_team_projects",
    "List all projects in a Figma team. The team_id is the numeric ID in the team URL: figma.com/files/team/{team_id}/... — use figma_parse_url to extract it from a URL.",
    { team_id: z.string().describe("The Figma team ID (numeric, found in figma.com/files/team/{team_id}/...)") },
    async ({ team_id }) => {
      try {
        const result = await getClient().getTeamProjects(team_id);
        if (!result.projects.length) {
          return { content: [{ type: "text", text: "No projects found." }] };
        }
        const text = [
          `Team: ${result.name}`,
          ...result.projects.map((p) => `• ${p.name} (id: ${p.id})`),
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "figma_get_project_files",
    "List all files in a Figma project",
    { project_id: z.string().describe("The Figma project ID (from figma_get_team_projects or figma_parse_url)") },
    async ({ project_id }) => {
      try {
        const result = await getClient().getProjectFiles(project_id);
        if (!result.files.length) {
          return { content: [{ type: "text", text: "No files found." }] };
        }
        const text = [
          `Project: ${result.name}`,
          ...result.files.map((f) => `• ${f.name} (key: ${f.key}, last modified: ${f.last_modified})`),
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  // ── Components ────────────────────────────────────────────────────

  server.tool(
    "figma_get_file_components",
    "Get all published components in a Figma file",
    { file_key: z.string().describe("The Figma file key") },
    async ({ file_key }) => {
      try {
        const result = await getClient().getFileComponents(file_key);
        const components = result.meta?.components ?? [];
        if (!components.length) {
          return { content: [{ type: "text", text: "No components found." }] };
        }
        const text = components.map((c) =>
          `${c.name} (key: ${c.key}, node: ${c.node_id}${c.description ? `, desc: ${c.description}` : ""})`,
        ).join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "figma_get_component",
    "Get a specific Figma component by its key",
    { key: z.string().describe("The component key (from figma_get_file_components)") },
    async ({ key }) => {
      try {
        const result = await getClient().getComponent(key);
        const c = result.meta;
        const text = [
          `Name: ${c.name}`,
          `Key: ${c.key}`,
          `File: ${c.file_key}`,
          `Node ID: ${c.node_id}`,
          `Description: ${c.description || "(none)"}`,
          `Created: ${c.created_at}`,
          `Updated: ${c.updated_at}`,
          `By: ${c.user.handle}`,
          ...(c.containing_frame.name ? [`Frame: ${c.containing_frame.name} (page: ${c.containing_frame.pageName ?? "—"})`] : []),
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "figma_get_file_component_sets",
    "Get all published component sets (variant groups) in a Figma file",
    { file_key: z.string().describe("The Figma file key") },
    async ({ file_key }) => {
      try {
        const result = await getClient().getFileComponentSets(file_key);
        const sets = result.meta?.component_sets ?? [];
        if (!sets.length) {
          return { content: [{ type: "text", text: "No component sets found." }] };
        }
        const text = sets.map((s) =>
          `${s.name} (key: ${s.key}, node: ${s.node_id}${s.description ? `, desc: ${s.description}` : ""})`,
        ).join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "figma_get_component_set",
    "Get a specific Figma component set by its key",
    { key: z.string().describe("The component set key (from figma_get_file_component_sets)") },
    async ({ key }) => {
      try {
        const result = await getClient().getComponentSet(key);
        const s = result.meta;
        const text = [
          `Name: ${s.name}`,
          `Key: ${s.key}`,
          `File: ${s.file_key}`,
          `Node ID: ${s.node_id}`,
          `Description: ${s.description || "(none)"}`,
          `Created: ${s.created_at}`,
          `Updated: ${s.updated_at}`,
          `By: ${s.user.handle}`,
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  // ── Styles ────────────────────────────────────────────────────────

  server.tool(
    "figma_get_file_styles",
    "Get all published styles in a Figma file",
    { file_key: z.string().describe("The Figma file key") },
    async ({ file_key }) => {
      try {
        const result = await getClient().getFileStyles(file_key);
        const styles = result.meta?.styles ?? [];
        if (!styles.length) {
          return { content: [{ type: "text", text: "No styles found." }] };
        }
        const text = styles.map((s) =>
          `${s.name} [${s.style_type}] (key: ${s.key}${s.description ? `, desc: ${s.description}` : ""})`,
        ).join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "figma_get_style",
    "Get a specific Figma style by its key",
    { key: z.string().describe("The style key (from figma_get_file_styles)") },
    async ({ key }) => {
      try {
        const result = await getClient().getStyle(key);
        const s = result.meta;
        const text = [
          `Name: ${s.name}`,
          `Key: ${s.key}`,
          `Type: ${s.style_type}`,
          `File: ${s.file_key}`,
          `Node ID: ${s.node_id}`,
          `Description: ${s.description || "(none)"}`,
          `Created: ${s.created_at}`,
          `Updated: ${s.updated_at}`,
          `By: ${s.user.handle}`,
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  // ── Variables ─────────────────────────────────────────────────────

  server.tool(
    "figma_get_local_variables",
    "Get all local variables and variable collections in a Figma file (requires Dev Mode / full access)",
    { file_key: z.string().describe("The Figma file key") },
    async ({ file_key }) => {
      try {
        const result = await getClient().getLocalVariables(file_key);
        const collections = Object.values(result.meta?.variableCollections ?? {});
        const variables = Object.values(result.meta?.variables ?? {});

        if (!collections.length && !variables.length) {
          return { content: [{ type: "text", text: "No variables found." }] };
        }

        const collectionLines = collections.map((c) => {
          const modes = c.modes.map((m) => m.name).join(", ");
          return `Collection: ${c.name} (id: ${c.id}, modes: ${modes}, ${c.variableIds.length} vars)`;
        });

        const variableLines = variables.map((v) =>
          `  ${v.name} [${v.resolvedType}] (id: ${v.id}, collection: ${v.variableCollectionId})`,
        );

        return { content: [{ type: "text", text: [...collectionLines, ...variableLines].join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  server.tool(
    "figma_get_published_variables",
    "Get all published variables from a Figma library file",
    { file_key: z.string().describe("The Figma file key") },
    async ({ file_key }) => {
      try {
        const result = await getClient().getPublishedVariables(file_key);
        const collections = Object.values(result.meta?.variableCollections ?? {});
        const variables = Object.values(result.meta?.variables ?? {});

        if (!collections.length && !variables.length) {
          return { content: [{ type: "text", text: "No published variables found." }] };
        }

        const collectionLines = collections.map((c) => {
          const modes = c.modes.map((m) => m.name).join(", ");
          return `Collection: ${c.name} (id: ${c.id}, modes: ${modes}, ${c.variableIds.length} vars)`;
        });

        const variableLines = variables.map((v) =>
          `  ${v.name} [${v.resolvedType}] (id: ${v.id}, key: ${v.key})`,
        );

        return { content: [{ type: "text", text: [...collectionLines, ...variableLines].join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  // ── Dev Resources ─────────────────────────────────────────────────

  server.tool(
    "figma_get_dev_resources",
    "Get dev resources (linked code/docs URLs) attached to a Figma file or specific nodes. Dev resources require Figma Dev Mode; if none are found, use figma_find_nodes to locate components by name instead.",
    {
      file_key: z.string().describe("The Figma file key"),
      node_ids: z.array(z.string()).optional().describe("Filter to specific node IDs"),
    },
    async ({ file_key, node_ids }) => {
      try {
        const result = await getClient().getFileDevResources(file_key, node_ids);
        const resources = result.dev_resources ?? [];
        if (!resources.length) {
          return {
            content: [{
              type: "text",
              text: "No dev resources found. Dev resources require Figma Dev Mode to be enabled and links added manually. Use figma_find_nodes to explore the file structure by name instead.",
            }],
          };
        }
        const text = resources.map((r) =>
          `${r.name}\n  URL: ${r.url}\n  Node: ${r.node_id} (id: ${r.id})`,
        ).join("\n\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );

  // ── Node Search ───────────────────────────────────────────────────

  server.tool(
    "figma_find_nodes",
    "Search for nodes in a Figma file by name or type. Use this when dev resources are unavailable to locate components, frames, or text layers. Start with depth=3 for large files.",
    {
      file_key: z.string().describe("The Figma file key"),
      name: z.string().optional().describe("Case-insensitive name substring to match"),
      type: z.string().optional().describe("Node type to filter (e.g. FRAME, COMPONENT, TEXT, GROUP, INSTANCE, CANVAS)"),
      depth: z.number().optional().describe("Tree depth to fetch — use 3 for large files, omit for small files"),
    },
    async ({ file_key, name, type, depth }) => {
      try {
        if (!name && !type) {
          return { content: [{ type: "text", text: "Provide at least one of: name, type" }], isError: true };
        }
        const file = await getClient().getFile(file_key, { depth });
        const matches = findNodes(file.document, name, type);
        if (!matches.length) {
          return { content: [{ type: "text", text: "No matching nodes found." }] };
        }
        const text = [
          `${matches.length} match(es):`,
          ...matches.map((m) =>
            `${m.type}: ${m.name} (id: ${m.id}${m.childCount > 0 ? `, ${m.childCount} children` : ""})`,
          ),
        ].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return { content: [{ type: "text", text: formatError(err) }], isError: true };
      }
    },
  );
}
