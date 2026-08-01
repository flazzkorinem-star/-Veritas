import { createLocalOcrEngine, type OcrEngine } from "./ocr-engine";
import {
  finishParsedMaterial,
  MaterialParseError,
  type ParsingProgress,
} from "./parsed-material";

const MAX_IMAGE_PIXELS = 40_000_000;

interface ImageParserDependencies {
  readDimensions?: (file: File) => Promise<{ width: number; height: number }>;
  createOcr?: (
    onProgress?: (progress: ParsingProgress) => void,
    signal?: AbortSignal,
  ) => Promise<OcrEngine>;
}

async function readDimensions(file: File) {
  const bitmap = await createImageBitmap(file);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

export async function parseImage(
  file: File,
  onProgress?: (progress: ParsingProgress) => void,
  signal?: AbortSignal,
  dependencies: ImageParserDependencies = {},
) {
  const dimensions = await (dependencies.readDimensions ?? readDimensions)(file);
  if (dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
    throw new MaterialParseError(
      "PIXEL_LIMIT",
      "图片超过 4000 万像素，请缩小后再上传。 ",
    );
  }
  if (signal?.aborted) {
    throw new MaterialParseError("CANCELLED", "已取消处理这份材料。 ");
  }
  const ocr = await (dependencies.createOcr ?? createLocalOcrEngine)(onProgress, signal);
  const cancel = () => void ocr.terminate();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    onProgress?.({ stage: "OCR", current: 0, total: 1, label: "识别图片文字" });
    const text = await ocr.recognize(file);
    if (signal?.aborted) {
      throw new MaterialParseError("CANCELLED", "已取消处理这份材料。 ");
    }
    onProgress?.({ stage: "OCR", current: 1, total: 1, label: "图片文字已识别" });
    return finishParsedMaterial(file.name, file.type, [
      { sourceLabel: "图片文字识别结果", text },
    ]);
  } finally {
    signal?.removeEventListener("abort", cancel);
    await ocr.terminate();
  }
}
