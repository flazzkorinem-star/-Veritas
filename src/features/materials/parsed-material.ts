import { MAX_PARSED_TEXT_CHARACTERS } from "@/config/material-limits";

export interface ParsedSourceBlock {
  sourceLabel: string;
  text: string;
}

export interface ParsedMaterial {
  fileName: string;
  text: string;
  sourceBlocks: ParsedSourceBlock[];
}

export type ParsingProgress = {
  stage: "PARSING" | "OCR";
  current: number;
  total: number;
  label: string;
};

export type MaterialParseErrorCode =
  | "INVALID_CONTENT"
  | "EMPTY_TEXT"
  | "TEXT_TOO_LONG"
  | "PAGE_LIMIT"
  | "SLIDE_LIMIT"
  | "OCR_PAGE_LIMIT"
  | "PIXEL_LIMIT"
  | "CANCELLED";

export class MaterialParseError extends Error {
  constructor(
    readonly code: MaterialParseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MaterialParseError";
  }
}

export function finishParsedMaterial(
  fileName: string,
  blocks: readonly ParsedSourceBlock[],
): ParsedMaterial {
  const sourceBlocks = blocks
    .map((block) => ({ ...block, text: block.text.replace(/\r\n?/gu, "\n").trim() }))
    .filter((block) => block.text);
  const text = sourceBlocks.map((block) => block.text).join("\n\n");
  if (!text) {
    throw new MaterialParseError("EMPTY_TEXT", "材料中没有可读取的文字。 ");
  }
  if (text.length > MAX_PARSED_TEXT_CHARACTERS) {
    throw new MaterialParseError(
      "TEXT_TOO_LONG",
      "解析后的文字超过 30 万字符，请拆分材料后再上传。",
    );
  }
  return { fileName, text, sourceBlocks };
}
