import type { FigmaNode } from "./types.js";

export interface NodeMatch {
  id: string;
  name: string;
  type: string;
  childCount: number;
}

export function findNodes(
  node: FigmaNode,
  nameQuery?: string,
  typeFilter?: string,
  results: NodeMatch[] = [],
): NodeMatch[] {
  const nameMatch = !nameQuery || node.name.toLowerCase().includes(nameQuery.toLowerCase());
  const typeMatch = !typeFilter || node.type === typeFilter.toUpperCase();
  if (nameMatch && typeMatch && node.type !== "DOCUMENT") {
    results.push({ id: node.id, name: node.name, type: node.type, childCount: node.children?.length ?? 0 });
  }
  for (const child of node.children ?? []) {
    findNodes(child, nameQuery, typeFilter, results);
  }
  return results;
}
