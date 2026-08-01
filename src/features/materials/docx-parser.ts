import mammoth from "mammoth/mammoth.browser";

import { finishParsedMaterial, type ParsingProgress } from "./parsed-material";

export async function parseDocx(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
  onProgress?: (progress: ParsingProgress) => void,
) {
  onProgress?.({ stage: "PARSING", current: 0, total: 1, label: "读取 Word 正文" });
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const result = await mammoth.extractRawText({ arrayBuffer });
  if (result.messages.some((message) => message.type === "error")) {
    throw new Error("Word 文件正文提取失败。 ");
  }
  const blocks = result.value
    .split(/\n\s*\n/gu)
    .map((text, index) => ({ sourceLabel: `第 ${index + 1} 段`, text }));
  onProgress?.({ stage: "PARSING", current: 1, total: 1, label: "Word 正文已读取" });
  return finishParsedMaterial(fileName, mimeType, blocks);
}
