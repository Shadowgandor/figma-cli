import { Command } from "commander";
import chalk from "chalk";
import { loadConfigFromEnv, FigmaClient, parseFigmaUrl } from "../core/index.js";
import { FigmaApiClient, findNodes } from "../figma/index.js";

let _client: FigmaApiClient | null = null;

function getClient(): FigmaApiClient {
  if (!_client) _client = new FigmaApiClient(new FigmaClient(loadConfigFromEnv()));
  return _client;
}

function die(err: unknown): never {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
}

export function registerFigmaCommands(program: Command): void {
  const figma = program;

  // ── Auth ─────────────────────────────────────────────────────────

  figma
    .command("auth")
    .description("Verify the Figma connection and print the current user")
    .option("--json", "Output raw JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const user = await getClient().getMe();
        if (opts.json) {
          console.log(JSON.stringify(user, null, 2));
          return;
        }
        console.log(chalk.green("Connected successfully."));
        console.log(`User:  ${user.handle} (${user.email})`);
        console.log(`ID:    ${user.id}`);
      } catch (err) {
        die(err);
      }
    });

  // ── Files ─────────────────────────────────────────────────────────

  const files = figma.command("files").description("File operations");

  files
    .command("get <file_key>")
    .description("Get a file's metadata and document tree")
    .option("--depth <n>", "Node tree depth (use small value for large files)", parseInt)
    .option("--version <id>", "Specific version ID")
    .option("--json", "Output raw JSON")
    .action(async (file_key: string, opts: { depth?: number; version?: string; json?: boolean }) => {
      try {
        const file = await getClient().getFile(file_key, { depth: opts.depth, version: opts.version });
        if (opts.json) {
          console.log(JSON.stringify(file, null, 2));
          return;
        }
        console.log(chalk.bold(file.name));
        console.log(`Last modified: ${file.lastModified}`);
        console.log(`Version:       ${file.version}`);
        console.log(`Role:          ${file.role}`);
        console.log(`Components:    ${Object.keys(file.components).length}`);
        console.log(`Styles:        ${Object.keys(file.styles).length}`);
        if (file.branches?.length) {
          console.log(`Branches:      ${file.branches.map((b) => b.name).join(", ")}`);
        }
      } catch (err) {
        die(err);
      }
    });

  files
    .command("versions <file_key>")
    .description("List file version history")
    .option("--limit <n>", "Maximum number of versions to show", parseInt)
    .option("--json", "Output raw JSON")
    .action(async (file_key: string, opts: { limit?: number; json?: boolean }) => {
      try {
        const result = await getClient().getFileVersions(file_key);
        const versions = opts.limit ? result.versions.slice(0, opts.limit) : result.versions;
        if (opts.json) {
          console.log(JSON.stringify(versions, null, 2));
          return;
        }
        if (!versions.length) {
          console.log("No versions found.");
          return;
        }
        for (const v of versions) {
          const label = v.label ? chalk.cyan(` [${v.label}]`) : "";
          const desc = v.description ? ` — ${v.description}` : "";
          console.log(`${v.created_at}${label}${desc} ${chalk.gray(`(id: ${v.id}, by: ${v.user.handle})`)}`);
        }
        if (opts.limit && result.versions.length > opts.limit) {
          console.log(chalk.gray(`… ${result.versions.length - opts.limit} more (use --limit to adjust)`));
        }
      } catch (err) {
        die(err);
      }
    });

  files
    .command("comments <file_key>")
    .description("List comments on a file")
    .option("--limit <n>", "Maximum number of comments to show", parseInt)
    .option("--json", "Output raw JSON")
    .action(async (file_key: string, opts: { limit?: number; json?: boolean }) => {
      try {
        const result = await getClient().getFileComments(file_key, { as_md: true });
        const comments = opts.limit ? result.comments.slice(0, opts.limit) : result.comments;
        if (opts.json) {
          console.log(JSON.stringify(comments, null, 2));
          return;
        }
        if (!comments.length) {
          console.log("No comments.");
          return;
        }
        for (const c of comments) {
          const resolved = c.resolved_at ? chalk.gray(` [resolved]`) : "";
          console.log(chalk.bold(`${c.user.handle}`) + chalk.gray(` · ${c.created_at}`) + resolved);
          console.log(c.message);
          console.log();
        }
        if (opts.limit && result.comments.length > opts.limit) {
          console.log(chalk.gray(`… ${result.comments.length - opts.limit} more (use --limit to adjust)`));
        }
      } catch (err) {
        die(err);
      }
    });

  files
    .command("nodes <file_key> <ids...>")
    .description("Get specific nodes from a file by ID")
    .option("--depth <n>", "Node depth", parseInt)
    .option("--json", "Output raw JSON")
    .action(async (file_key: string, ids: string[], opts: { depth?: number; json?: boolean }) => {
      try {
        const result = await getClient().getFileNodes(file_key, ids, { depth: opts.depth });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        for (const [id, node] of Object.entries(result.nodes)) {
          const doc = node.document;
          console.log(chalk.bold(`${id}: ${doc.name}`) + chalk.gray(` (${doc.type})`));
          const children = doc.children ?? [];
          if (children.length > 0) {
            const preview = children.slice(0, 5).map((c) => `${c.name} (${c.type})`).join(", ");
            const more = children.length > 5 ? ` … +${children.length - 5} more` : "";
            console.log(`  Children: ${preview}${more}`);
          }
          console.log();
        }
      } catch (err) {
        die(err);
      }
    });

  files
    .command("render <file_key> <ids...>")
    .description("Render nodes as images and print download URLs")
    .option("--format <fmt>", "Image format: jpg, png, svg, pdf (default: png)")
    .option("--scale <n>", "Scale factor 0.01-4 (default: 1)", parseFloat)
    .option("--json", "Output raw JSON")
    .action(async (file_key: string, ids: string[], opts: { format?: string; scale?: number; json?: boolean }) => {
      try {
        const result = await getClient().renderImages(file_key, ids, {
          format: opts.format as "jpg" | "png" | "svg" | "pdf" | undefined,
          scale: opts.scale,
        });
        if (result.err) {
          console.error(chalk.red(`Error: ${result.err}`));
          process.exit(1);
        }
        if (opts.json) {
          console.log(JSON.stringify(result.images, null, 2));
          return;
        }
        for (const [id, url] of Object.entries(result.images)) {
          console.log(`${chalk.bold(id)}: ${url ?? chalk.red("(failed)")}`);
        }
      } catch (err) {
        die(err);
      }
    });

  files
    .command("comment-add <file_key> <message>")
    .description("Post a comment on a file")
    .option("--node <node_id>", "Pin the comment to a specific node ID")
    .option("--reply-to <comment_id>", "Reply to an existing comment")
    .option("--json", "Output the created comment as JSON")
    .action(async (file_key: string, message: string, opts: { node?: string; replyTo?: string; json?: boolean }) => {
      try {
        const comment = await getClient().postComment(file_key, message, { nodeId: opts.node, replyTo: opts.replyTo });
        if (opts.json) {
          console.log(JSON.stringify(comment, null, 2));
          return;
        }
        console.log(chalk.green("Comment posted."));
        console.log(`ID:      ${comment.id}`);
        console.log(`Message: ${comment.message}`);
        if (comment.parent_id) console.log(`Reply to: ${comment.parent_id}`);
      } catch (err) {
        die(err);
      }
    });

  files
    .command("find-nodes <file_key>")
    .description("Search for nodes in a file by name or type")
    .option("--name <query>", "Case-insensitive name substring to match")
    .option("--type <type>", "Node type filter (e.g. FRAME, COMPONENT, TEXT, GROUP, INSTANCE)")
    .option("--depth <n>", "Tree depth to fetch (use 3-4 for large files)", parseInt)
    .option("--json", "Output raw JSON")
    .action(async (file_key: string, opts: { name?: string; type?: string; depth?: number; json?: boolean }) => {
      try {
        if (!opts.name && !opts.type) die(new Error("Provide at least --name or --type to filter nodes"));
        const file = await getClient().getFile(file_key, { depth: opts.depth });
        const matches = findNodes(file.document, opts.name, opts.type);
        if (opts.json) {
          console.log(JSON.stringify(matches, null, 2));
          return;
        }
        if (!matches.length) {
          console.log("No matching nodes found.");
          return;
        }
        for (const m of matches) {
          const children = m.childCount > 0 ? chalk.gray(` (${m.childCount} children)`) : "";
          console.log(`${chalk.cyan(m.type)}: ${chalk.bold(m.name)} ${chalk.gray(`(id: ${m.id})`)}${children}`);
        }
        console.log(chalk.gray(`\n${matches.length} match(es)`));
      } catch (err) {
        die(err);
      }
    });

  // ── Teams & Projects ──────────────────────────────────────────────

  const projects = figma.command("projects").description("Team and project operations");

  projects
    .command("list [team_id]")
    .description("List projects in a team")
    .option("--url <figma_url>", "Figma team URL to extract team ID from (figma.com/files/team/{id}/...)")
    .option("--json", "Output raw JSON")
    .action(async (team_id: string | undefined, opts: { url?: string; json?: boolean }) => {
      try {
        let id = team_id;
        if (opts.url) {
          const parts = parseFigmaUrl(opts.url);
          if (!parts.teamId) die(new Error("Could not extract team ID from URL. Expected: figma.com/files/team/{team_id}/..."));
          id = parts.teamId;
        }
        if (!id) die(new Error("team_id required. Pass it directly or via --url <figma_team_url>"));
        const result = await getClient().getTeamProjects(id);
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(chalk.bold(`Team: ${result.name}`));
        if (!result.projects.length) {
          console.log("No projects found.");
          return;
        }
        for (const p of result.projects) {
          console.log(`• ${p.name} ${chalk.gray(`(id: ${p.id})`)}`);
        }
      } catch (err) {
        die(err);
      }
    });

  projects
    .command("files <project_id>")
    .description("List files in a project")
    .option("--json", "Output raw JSON")
    .action(async (project_id: string, opts: { json?: boolean }) => {
      try {
        const result = await getClient().getProjectFiles(project_id);
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(chalk.bold(`Project: ${result.name}`));
        if (!result.files.length) {
          console.log("No files found.");
          return;
        }
        for (const f of result.files) {
          console.log(`• ${f.name} ${chalk.gray(`(key: ${f.key}, modified: ${f.last_modified})`)}`);
        }
      } catch (err) {
        die(err);
      }
    });

  // ── Components ────────────────────────────────────────────────────

  const components = figma.command("components").description("Component operations");

  components
    .command("list <file_key>")
    .description("List published components in a file")
    .option("--limit <n>", "Maximum number of components to show", parseInt)
    .option("--json", "Output raw JSON")
    .action(async (file_key: string, opts: { limit?: number; json?: boolean }) => {
      try {
        const result = await getClient().getFileComponents(file_key);
        const all = result.meta?.components ?? [];
        const items = opts.limit ? all.slice(0, opts.limit) : all;
        if (opts.json) {
          console.log(JSON.stringify(items, null, 2));
          return;
        }
        if (!all.length) {
          console.log("No components found.");
          return;
        }
        for (const c of items) {
          console.log(`${chalk.bold(c.name)} ${chalk.gray(`(key: ${c.key}, node: ${c.node_id})`)}`);
          if (c.description) console.log(`  ${c.description}`);
        }
        if (opts.limit && all.length > opts.limit) {
          console.log(chalk.gray(`… ${all.length - opts.limit} more (use --limit to adjust)`));
        }
      } catch (err) {
        die(err);
      }
    });

  components
    .command("get <key>")
    .description("Get a component by key")
    .option("--json", "Output raw JSON")
    .action(async (key: string, opts: { json?: boolean }) => {
      try {
        const result = await getClient().getComponent(key);
        const c = result.meta;
        if (opts.json) {
          console.log(JSON.stringify(c, null, 2));
          return;
        }
        console.log(chalk.bold(c.name));
        console.log(`Key:         ${c.key}`);
        console.log(`File:        ${c.file_key}`);
        console.log(`Node ID:     ${c.node_id}`);
        console.log(`Description: ${c.description || "(none)"}`);
        console.log(`Updated:     ${c.updated_at}`);
        console.log(`By:          ${c.user.handle}`);
      } catch (err) {
        die(err);
      }
    });

  components
    .command("sets <file_key>")
    .description("List published component sets in a file")
    .option("--limit <n>", "Maximum number of component sets to show", parseInt)
    .option("--json", "Output raw JSON")
    .action(async (file_key: string, opts: { limit?: number; json?: boolean }) => {
      try {
        const result = await getClient().getFileComponentSets(file_key);
        const all = result.meta?.component_sets ?? [];
        const items = opts.limit ? all.slice(0, opts.limit) : all;
        if (opts.json) {
          console.log(JSON.stringify(items, null, 2));
          return;
        }
        if (!all.length) {
          console.log("No component sets found.");
          return;
        }
        for (const s of items) {
          console.log(`${chalk.bold(s.name)} ${chalk.gray(`(key: ${s.key}, node: ${s.node_id})`)}`);
          if (s.description) console.log(`  ${s.description}`);
        }
        if (opts.limit && all.length > opts.limit) {
          console.log(chalk.gray(`… ${all.length - opts.limit} more (use --limit to adjust)`));
        }
      } catch (err) {
        die(err);
      }
    });

  // ── Styles ────────────────────────────────────────────────────────

  const styles = figma.command("styles").description("Style operations");

  styles
    .command("list <file_key>")
    .description("List published styles in a file")
    .option("--limit <n>", "Maximum number of styles to show", parseInt)
    .option("--json", "Output raw JSON")
    .action(async (file_key: string, opts: { limit?: number; json?: boolean }) => {
      try {
        const result = await getClient().getFileStyles(file_key);
        const all = result.meta?.styles ?? [];
        const items = opts.limit ? all.slice(0, opts.limit) : all;
        if (opts.json) {
          console.log(JSON.stringify(items, null, 2));
          return;
        }
        if (!all.length) {
          console.log("No styles found.");
          return;
        }
        for (const s of items) {
          console.log(`${chalk.bold(s.name)} ${chalk.cyan(`[${s.style_type}]`)} ${chalk.gray(`(key: ${s.key})`)}`);
          if (s.description) console.log(`  ${s.description}`);
        }
        if (opts.limit && all.length > opts.limit) {
          console.log(chalk.gray(`… ${all.length - opts.limit} more (use --limit to adjust)`));
        }
      } catch (err) {
        die(err);
      }
    });

  styles
    .command("get <key>")
    .description("Get a style by key")
    .option("--json", "Output raw JSON")
    .action(async (key: string, opts: { json?: boolean }) => {
      try {
        const result = await getClient().getStyle(key);
        const s = result.meta;
        if (opts.json) {
          console.log(JSON.stringify(s, null, 2));
          return;
        }
        console.log(chalk.bold(s.name));
        console.log(`Type:        ${s.style_type}`);
        console.log(`Key:         ${s.key}`);
        console.log(`File:        ${s.file_key}`);
        console.log(`Description: ${s.description || "(none)"}`);
        console.log(`Updated:     ${s.updated_at}`);
        console.log(`By:          ${s.user.handle}`);
      } catch (err) {
        die(err);
      }
    });

  // ── Variables ─────────────────────────────────────────────────────

  const variables = figma.command("variables").description("Variable operations");

  variables
    .command("local <file_key>")
    .description("List local variables in a file")
    .option("--json", "Output raw JSON")
    .action(async (file_key: string, opts: { json?: boolean }) => {
      try {
        const result = await getClient().getLocalVariables(file_key);
        if (opts.json) {
          console.log(JSON.stringify(result.meta, null, 2));
          return;
        }
        const collections = Object.values(result.meta?.variableCollections ?? {});
        const vars = Object.values(result.meta?.variables ?? {});
        if (!collections.length) {
          console.log("No variables found.");
          return;
        }
        for (const col of collections) {
          const modes = col.modes.map((m) => m.name).join(", ");
          console.log(chalk.bold(`Collection: ${col.name}`) + chalk.gray(` (modes: ${modes})`));
          const colVars = vars.filter((v) => v.variableCollectionId === col.id);
          for (const v of colVars) {
            console.log(`  ${v.name} ${chalk.cyan(`[${v.resolvedType}]`)}`);
          }
        }
      } catch (err) {
        die(err);
      }
    });

  variables
    .command("published <file_key>")
    .description("List published variables from a library file")
    .option("--json", "Output raw JSON")
    .action(async (file_key: string, opts: { json?: boolean }) => {
      try {
        const result = await getClient().getPublishedVariables(file_key);
        if (opts.json) {
          console.log(JSON.stringify(result.meta, null, 2));
          return;
        }
        const collections = Object.values(result.meta?.variableCollections ?? {});
        const vars = Object.values(result.meta?.variables ?? {});
        if (!collections.length) {
          console.log("No published variables found.");
          return;
        }
        for (const col of collections) {
          const modes = col.modes.map((m) => m.name).join(", ");
          console.log(chalk.bold(`Collection: ${col.name}`) + chalk.gray(` (modes: ${modes})`));
          const colVars = vars.filter((v) => v.variableCollectionId === col.id);
          for (const v of colVars) {
            console.log(`  ${v.name} ${chalk.cyan(`[${v.resolvedType}]`)} ${chalk.gray(`(key: ${v.key})`)}`);
          }
        }
      } catch (err) {
        die(err);
      }
    });

  // ── Dev Resources ─────────────────────────────────────────────────

  figma
    .command("dev-resources <file_key>")
    .description("List dev resources (linked code/docs) attached to a file")
    .option("--nodes <ids>", "Comma-separated node IDs to filter by")
    .option("--json", "Output raw JSON")
    .action(async (file_key: string, opts: { nodes?: string; json?: boolean }) => {
      try {
        const nodeIds = opts.nodes?.split(",").map((s) => s.trim());
        const result = await getClient().getFileDevResources(file_key, nodeIds);
        const resources = result.dev_resources ?? [];
        if (opts.json) {
          console.log(JSON.stringify(resources, null, 2));
          return;
        }
        if (!resources.length) {
          console.log("No dev resources found.");
          console.log(chalk.gray("Tip: dev resources require Dev Mode in Figma. Use `files find-nodes` to explore the file structure instead."));
          return;
        }
        for (const r of resources) {
          console.log(chalk.bold(r.name));
          console.log(`  URL:  ${r.url}`);
          console.log(`  Node: ${r.node_id} ${chalk.gray(`(id: ${r.id})`)}`);
        }
      } catch (err) {
        die(err);
      }
    });
}
