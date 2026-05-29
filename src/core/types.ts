export interface FigmaConfig {
  token: string;
}

export class FigmaApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public data?: unknown,
  ) {
    super(`Figma API ${statusCode}: ${message}`);
    this.name = "FigmaApiError";
  }
}
