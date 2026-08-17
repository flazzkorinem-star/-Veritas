const MAX_TEXT_CHARACTERS = 300_000;

export type MaterialReadErrorCode =
  | "TEXT_TOO_LONG"
  | "EMPTY_TEXT"
  | "INVALID_ENCODING";

export class MaterialReadError extends Error {
  constructor(
    readonly code: MaterialReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MaterialReadError";
  }
}

export function decodeTextMaterial(file: File, bytes: Uint8Array, fileName: string) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/u, "")
      .trim();
  } catch {
    throw new MaterialReadError(
      "INVALID_ENCODING",
      "文本不是有效的 UTF-8 编码，请转换编码后重试。",
    );
  }
  if (!text) throw new MaterialReadError("EMPTY_TEXT", "材料中没有可读取的文字。 ");
  if (text.length > MAX_TEXT_CHARACTERS) {
    throw new MaterialReadError(
      "TEXT_TOO_LONG",
      "解析后的文字超过 30 万字符，请拆分材料后再上传。",
    );
  }
  return {
    fileName,
    mimeType: file.type,
    sizeBytes: file.size,
    text,
  };
}
