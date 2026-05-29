export interface FigmaUrlParts {
  fileKey?: string;
  teamId?: string;
  projectId?: string;
  nodeId?: string;
}

export function parseFigmaUrl(input: string): FigmaUrlParts {
  let url: URL;
  try {
    url = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    return {};
  }

  const path = url.pathname;
  const result: FigmaUrlParts = {};

  // figma.com/design/{file_key}/... or /file/{file_key}/...
  const fileMatch = path.match(/\/(design|file|proto)\/([A-Za-z0-9_-]+)/);
  if (fileMatch) result.fileKey = fileMatch[2];

  // figma.com/files/team/{team_id}/...
  const teamMatch = path.match(/\/files\/team\/(\d+)/);
  if (teamMatch) result.teamId = teamMatch[1];

  // figma.com/files/project/{project_id}/...
  const projectMatch = path.match(/\/files\/project\/(\d+)/);
  if (projectMatch) result.projectId = projectMatch[1];

  // ?node-id=1-2 → "1:2"
  const nodeId = url.searchParams.get("node-id");
  if (nodeId) result.nodeId = nodeId.replace(/-/g, ":");

  return result;
}
