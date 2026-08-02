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
import { decodeTextMaterial } from "./text-reader";

export type MaterialParserProgress =
  { stage: "READING"; loadedBytes: number; totalBytes: number } | ParsingProgress;

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
        const material = decodeTextMaterial(file, bytes);
        return finishParsedMaterial(file.name, file.type, [
          { sourceLabel: "全文", text: material.text },
        ]);
      }
      case "DOCX": {
        const { parseDocx } = await import("./docx-parser");
        return parseDocx(bytes, inspected.fileName, file.type, parsingProgress);
      }
      case "PPTX": {
        const { parsePptx } = await import("./pptx-parser");
        return parsePptx(bytes, inspected.fileName, file.type, parsingProgress);
      }
      case "PDF": {
        const { parsePdf } = await import("./pdf-parser");
        return parsePdf(bytes, inspected.fileName, file.type, parsingProgress, signal);
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
      (error instanceof Error && error.name === "MaterialReadError")
    ) {
      throw error;
    }
    throw new MaterialParseError(
      "INVALID_CONTENT",
      "无法安全解析这份材料，请确认文件未损坏后重试。",
    );
  }
}
