import { FigmaClient } from "../core/client.js";
import {
  FigmaUser,
  FigmaFile,
  FigmaFileNodesResponse,
  FigmaImagesResponse,
  FigmaImageFillsResponse,
  FigmaVersionsResponse,
  FigmaComment,
  FigmaCommentsResponse,
  FigmaPostCommentBody,
  FigmaTeamProjectsResponse,
  FigmaProjectFilesResponse,
  FigmaFileComponentsResponse,
  FigmaFileComponentSetsResponse,
  FigmaComponentResponse,
  FigmaComponentSetResponse,
  FigmaFileStylesResponse,
  FigmaStyleResponse,
  FigmaVariablesResponse,
  FigmaDevResourcesResponse,
} from "./types.js";

export class FigmaApiClient {
  constructor(private readonly http: FigmaClient) {}

  // ── User ────────────────────────────────────────────────────────────

  getMe(): Promise<FigmaUser> {
    return this.http.request<FigmaUser>("/v1/me");
  }

  // ── Files ───────────────────────────────────────────────────────────

  getFile(
    fileKey: string,
    opts?: { version?: string; ids?: string[]; depth?: number; geometry?: string; branch_data?: boolean },
  ): Promise<FigmaFile> {
    return this.http.request<FigmaFile>(`/v1/files/${fileKey}`, opts as Record<string, string | number | boolean | string[]>);
  }

  getFileNodes(
    fileKey: string,
    ids: string[],
    opts?: { version?: string; depth?: number; geometry?: string },
  ): Promise<FigmaFileNodesResponse> {
    return this.http.request<FigmaFileNodesResponse>(`/v1/files/${fileKey}/nodes`, {
      ids: ids.join(","),
      ...opts,
    } as Record<string, string | number | boolean | string[]>);
  }

  renderImages(
    fileKey: string,
    ids: string[],
    opts?: { scale?: number; format?: "jpg" | "png" | "svg" | "pdf"; version?: string; use_absolute_bounds?: boolean },
  ): Promise<FigmaImagesResponse> {
    return this.http.request<FigmaImagesResponse>(`/v1/images/${fileKey}`, {
      ids: ids.join(","),
      ...opts,
    } as Record<string, string | number | boolean | string[]>);
  }

  getImageFills(fileKey: string): Promise<FigmaImageFillsResponse> {
    return this.http.request<FigmaImageFillsResponse>(`/v1/files/${fileKey}/images`);
  }

  getFileVersions(fileKey: string): Promise<FigmaVersionsResponse> {
    return this.http.request<FigmaVersionsResponse>(`/v1/files/${fileKey}/versions`);
  }

  getFileComments(fileKey: string, opts?: { as_md?: boolean }): Promise<FigmaCommentsResponse> {
    return this.http.request<FigmaCommentsResponse>(
      `/v1/files/${fileKey}/comments`,
      opts as Record<string, string | number | boolean | string[]>,
    );
  }

  postComment(
    fileKey: string,
    message: string,
    opts?: { nodeId?: string; replyTo?: string },
  ): Promise<FigmaComment> {
    const body: FigmaPostCommentBody = { message };
    if (opts?.nodeId) body.client_meta = { node_id: opts.nodeId, node_offset: { x: 0, y: 0 } };
    if (opts?.replyTo) body.comment_id = opts.replyTo;
    return this.http.request<FigmaComment>(`/v1/files/${fileKey}/comments`, undefined, { method: "POST", body });
  }

  // ── Teams & Projects ────────────────────────────────────────────────

  getTeamProjects(teamId: string): Promise<FigmaTeamProjectsResponse> {
    return this.http.request<FigmaTeamProjectsResponse>(`/v1/teams/${teamId}/projects`);
  }

  getProjectFiles(projectId: string): Promise<FigmaProjectFilesResponse> {
    return this.http.request<FigmaProjectFilesResponse>(`/v1/projects/${projectId}/files`);
  }

  // ── Components ──────────────────────────────────────────────────────

  getFileComponents(fileKey: string): Promise<FigmaFileComponentsResponse> {
    return this.http.request<FigmaFileComponentsResponse>(`/v1/files/${fileKey}/components`);
  }

  getComponent(key: string): Promise<FigmaComponentResponse> {
    return this.http.request<FigmaComponentResponse>(`/v1/components/${key}`);
  }

  getFileComponentSets(fileKey: string): Promise<FigmaFileComponentSetsResponse> {
    return this.http.request<FigmaFileComponentSetsResponse>(`/v1/files/${fileKey}/component_sets`);
  }

  getComponentSet(key: string): Promise<FigmaComponentSetResponse> {
    return this.http.request<FigmaComponentSetResponse>(`/v1/component_sets/${key}`);
  }

  // ── Styles ──────────────────────────────────────────────────────────

  getFileStyles(fileKey: string): Promise<FigmaFileStylesResponse> {
    return this.http.request<FigmaFileStylesResponse>(`/v1/files/${fileKey}/styles`);
  }

  getStyle(key: string): Promise<FigmaStyleResponse> {
    return this.http.request<FigmaStyleResponse>(`/v1/styles/${key}`);
  }

  // ── Variables ───────────────────────────────────────────────────────

  getLocalVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    return this.http.request<FigmaVariablesResponse>(`/v1/files/${fileKey}/variables/local`);
  }

  getPublishedVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    return this.http.request<FigmaVariablesResponse>(`/v1/files/${fileKey}/variables/published`);
  }

  // ── Dev Resources ───────────────────────────────────────────────────

  getFileDevResources(fileKey: string, nodeIds?: string[]): Promise<FigmaDevResourcesResponse> {
    const params = nodeIds?.length ? { node_ids: nodeIds.join(",") } : undefined;
    return this.http.request<FigmaDevResourcesResponse>(`/v1/files/${fileKey}/dev_resources`, params);
  }
}
