export type MaterialReadErrorCode = "INVALID_ENCODING";

export class MaterialReadError extends Error {
  constructor(
    readonly code: MaterialReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MaterialReadError";
  }
}

export function decodeTextMaterial(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/u, "")
      .trim();
  } catch {
    throw new MaterialReadError(
      "INVALID_ENCODING",
      "文本不是有效的 UTF-8 编码，请转换编码后重试。",
    );
  }
}
