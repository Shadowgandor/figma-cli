// ── User ─────────────────────────────────────────────────────────────

export interface FigmaUser {
  id: string;
  email: string;
  handle: string;
  img_url: string;
}

// ── Files ─────────────────────────────────────────────────────────────

export interface FigmaFile {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  role: string;
  editorType: string;
  document: FigmaNode;
  components: Record<string, FigmaComponent>;
  componentSets: Record<string, FigmaComponentSet>;
  styles: Record<string, FigmaStyle>;
  schemaVersion: number;
  mainFileKey?: string;
  branches?: FigmaBranch[];
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  [key: string]: unknown;
}

export interface FigmaFileNodesResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  role: string;
  nodes: Record<string, { document: FigmaNode; components: Record<string, FigmaComponent>; schemaVersion: number; styles: Record<string, FigmaStyle> }>;
}

export interface FigmaBranch {
  key: string;
  name: string;
  thumbnail_url: string;
  last_modified: string;
  link_access: string;
}

// ── Images ────────────────────────────────────────────────────────────

export interface FigmaImagesResponse {
  err: string | null;
  images: Record<string, string | null>;
}

export interface FigmaImageFillsResponse {
  error: boolean;
  status: number;
  meta: {
    images: Record<string, string>;
  };
}

// ── Versions ──────────────────────────────────────────────────────────

export interface FigmaVersion {
  id: string;
  created_at: string;
  label: string | null;
  description: string | null;
  user: FigmaUser;
  thumbnail_url: string;
}

export interface FigmaVersionsResponse {
  versions: FigmaVersion[];
  pagination: { prev_page?: string; next_page?: string };
}

// ── Comments ──────────────────────────────────────────────────────────

export interface FigmaComment {
  id: string;
  uuid: string;
  file_key: string;
  parent_id: string;
  user: FigmaUser;
  created_at: string;
  resolved_at: string | null;
  message: string;
  client_meta: unknown;
  order_id: string;
}

export interface FigmaCommentsResponse {
  comments: FigmaComment[];
}

export interface FigmaPostCommentBody {
  message: string;
  client_meta?: { node_id: string; node_offset: { x: number; y: number } };
  comment_id?: string;
}

// ── Projects ──────────────────────────────────────────────────────────

export interface FigmaProject {
  id: string;
  name: string;
}

export interface FigmaTeamProjectsResponse {
  name: string;
  projects: FigmaProject[];
}

export interface FigmaProjectFilesResponse {
  name: string;
  files: FigmaProjectFile[];
}

export interface FigmaProjectFile {
  key: string;
  name: string;
  thumbnail_url: string;
  last_modified: string;
}

// ── Components ────────────────────────────────────────────────────────

export interface FigmaComponent {
  key: string;
  file_key: string;
  node_id: string;
  thumbnail_url: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  user: FigmaUser;
  containing_frame: FigmaContainingFrame;
  containing_page: FigmaContainingPage;
}

export interface FigmaContainingFrame {
  nodeId?: string;
  name?: string;
  backgroundColor?: string;
  pageName?: string;
  pageId?: string;
}

export interface FigmaContainingPage {
  id?: string;
  name?: string;
}

export interface FigmaComponentSet {
  key: string;
  file_key: string;
  node_id: string;
  thumbnail_url: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  user: FigmaUser;
  containing_frame: FigmaContainingFrame;
  containing_page: FigmaContainingPage;
}

export interface FigmaFileComponentsResponse {
  error: boolean;
  status: number;
  meta: {
    components: FigmaComponent[];
    cursor?: { before?: number; after?: number };
  };
}

export interface FigmaFileComponentSetsResponse {
  error: boolean;
  status: number;
  meta: {
    component_sets: FigmaComponentSet[];
    cursor?: { before?: number; after?: number };
  };
}

export interface FigmaComponentResponse {
  error: boolean;
  status: number;
  meta: FigmaComponent;
}

export interface FigmaComponentSetResponse {
  error: boolean;
  status: number;
  meta: FigmaComponentSet;
}

// ── Styles ────────────────────────────────────────────────────────────

export interface FigmaStyle {
  key: string;
  file_key: string;
  node_id: string;
  thumbnail_url: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  user: FigmaUser;
  sort_position: string;
  style_type: string;
}

export interface FigmaFileStylesResponse {
  error: boolean;
  status: number;
  meta: {
    styles: FigmaStyle[];
    cursor?: { before?: number; after?: number };
  };
}

export interface FigmaStyleResponse {
  error: boolean;
  status: number;
  meta: FigmaStyle;
}

// ── Variables ─────────────────────────────────────────────────────────

export interface FigmaVariable {
  id: string;
  name: string;
  remote: boolean;
  key: string;
  variableCollectionId: string;
  resolvedType: string;
  description: string;
  hiddenFromPublishing: boolean;
  scopes: string[];
  codeSyntax: Record<string, string>;
  valuesByMode: Record<string, unknown>;
}

export interface FigmaVariableCollection {
  id: string;
  name: string;
  key: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  remote: boolean;
  hiddenFromPublishing: boolean;
  variableIds: string[];
}

export interface FigmaVariablesResponse {
  error: boolean;
  status: number;
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

// ── Dev Resources ─────────────────────────────────────────────────────

export interface FigmaDevResource {
  id: string;
  name: string;
  url: string;
  file_key: string;
  node_id: string;
}

export interface FigmaDevResourcesResponse {
  dev_resources: FigmaDevResource[];
}
