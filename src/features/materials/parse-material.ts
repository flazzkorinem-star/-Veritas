import {
  inspectMaterialFile,
  MaterialFileError,
  readMaterialBytes,
} from "./material-file";
import {
  finishParsedMaterial,
  MaterialParseError,
  type ParsingProgress,
} from "./parsed-material";
import { decodeTextMaterial, MaterialReadError } from "./text-reader";

export type MaterialParserProgress =
  { stage: "READING"; loadedBytes: number; totalBytes: number } | ParsingProgress;

function markdownSourceBlocks(text: string) {
  const normalized = text.replace(/\r\n?/gu, "\n").trim();
  const headingStarts = [...normalized.matchAll(/^#{1,6}[ \t]+.+$/gmu)].map(
    ({ index }) => index,
  );
  const sectionStarts = headingStarts.slice(1);
  if (sectionStarts[0] !== undefined && headingStarts[0] !== undefined) {
    const firstHeadingEnd = normalized.indexOf("\n", headingStarts[0]);
    if (normalized.slice(firstHeadingEnd, sectionStarts[0]).trim() === "") {
      sectionStarts.shift();
    }
  }

  return [0, ...sectionStarts].flatMap((start, index, starts) => {
    const end = starts[index + 1] ?? normalized.length;
    const text = normalized.slice(start, end).trim();
    if (!text) return [];
    return [
      {
        sourceLabel:
          /^#{2,6}[ \t]+(.+)$/mu.exec(text)?.[1]?.trim().slice(0, 300) ??
          `字符 ${start + 1}–${end}`,
        text,
      },
    ];
  });
}

export async function parseMaterial(
  file: File,
  onProgress: (progress: MaterialParserProgress) => void,
  signal?: AbortSignal,
) {
  try {
    const bytes = await readMaterialBytes(
      file,
      (progress) => onProgress({ stage: "READING", ...progress }),
      signal,
    );
    const inspected = inspectMaterialFile(file, bytes);
    const parsingProgress = (progress: ParsingProgress) => onProgress(progress);
    switch (inspected.kind) {
      case "TEXT": {
        const text = decodeTextMaterial(bytes);
        const blocks = /\.md$/iu.test(inspected.fileName)
          ? markdownSourceBlocks(text)
          : [{ sourceLabel: "全文", text }];
        return finishParsedMaterial(inspected.fileName, blocks);
      }
      case "DOCX": {
        const { parseDocx } = await import("./docx-parser");
        return parseDocx(bytes, inspected.fileName, parsingProgress);
      }
      case "PPTX": {
        const { parsePptx } = await import("./pptx-parser");
        return parsePptx(bytes, inspected.fileName, parsingProgress);
      }
      case "PDF": {
        const { parsePdf } = await import("./pdf-parser");
        return parsePdf(bytes, inspected.fileName, parsingProgress, signal);
      }
      case "IMAGE": {
        const { parseImage } = await import("./image-parser");
        return parseImage(file, parsingProgress, signal);
      }
    }
  } catch (error) {
    if (
      error instanceof MaterialFileError ||
      error instanceof MaterialParseError ||
      error instanceof MaterialReadError
    ) {
      throw error;
    }
    throw new MaterialParseError(
      "INVALID_CONTENT",
      "无法安全解析这份材料，请确认文件未损坏后重试。",
    );
  }
}
