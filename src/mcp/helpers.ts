import { FigmaApiError } from "../core/index.js";

export function formatError(err: unknown): string {
  if (err instanceof FigmaApiError) {
    return `Figma API error ${err.statusCode}: ${err.message}${err.data ? "\n" + JSON.stringify(err.data, null, 2) : ""}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
