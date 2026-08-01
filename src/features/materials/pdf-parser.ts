import type { OcrEngine } from "./ocr-engine";
import { createLocalOcrEngine } from "./ocr-engine";
import {
  finishParsedMaterial,
  MaterialParseError,
  type ParsedSourceBlock,
  type ParsingProgress,
} from "./parsed-material";

const MAX_PDF_PAGES = 200;
const MAX_OCR_PAGES = 50;
const MAX_RENDER_PIXELS = 40_000_000;

interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
}

interface PdfPage {
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: object): { promise: Promise<void> };
  cleanup(): void;
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
}

interface PdfLoadingTask {
  promise: Promise<PdfDocument>;
  destroy(): Promise<void>;
}

interface PdfParserDependencies {
  loadPdf?: (bytes: Uint8Array) => Promise<PdfLoadingTask>;
  createOcr?: (
    onProgress?: (progress: ParsingProgress) => void,
    signal?: AbortSignal,
  ) => Promise<OcrEngine>;
}

async function loadPdf(bytes: Uint8Array): Promise<PdfLoadingTask> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/parser-assets/pdf.worker.min.mjs";
  return pdfjs.getDocument({
    data: bytes,
    enableXfa: false,
    maxImageSize: MAX_RENDER_PIXELS,
    stopAtErrors: true,
  }) as unknown as PdfLoadingTask;
}

function textFromPage(items: readonly PdfTextItem[]) {
  return items
    .map((item) => `${item.str ?? ""}${item.hasEOL ? "\n" : " "}`)
    .join("")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}

async function renderPage(page: PdfPage) {
  const viewport = page.getViewport({ scale: 2 });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  if (width * height > MAX_RENDER_PIXELS) {
    throw new MaterialParseError("PIXEL_LIMIT", "PDF 页面像素过大，请缩小后重试。 ");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new MaterialParseError("INVALID_CONTENT", "浏览器无法渲染 PDF 页面。 ");
  }
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas;
}

export async function parsePdf(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
  onProgress?: (progress: ParsingProgress) => void,
  signal?: AbortSignal,
  dependencies: PdfParserDependencies = {},
) {
  const loadingTask = await (dependencies.loadPdf ?? loadPdf)(bytes);
  const cancel = () => void loadingTask.destroy();
  signal?.addEventListener("abort", cancel, { once: true });
  let ocr: OcrEngine | undefined;
  let ocrPages = 0;
  try {
    const documentProxy = await loadingTask.promise;
    if (documentProxy.numPages > MAX_PDF_PAGES) {
      throw new MaterialParseError("PAGE_LIMIT", "PDF 超过 200 页，请拆分材料。 ");
    }
    const blocks: ParsedSourceBlock[] = [];
    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      if (signal?.aborted) {
        throw new MaterialParseError("CANCELLED", "已取消处理这份材料。 ");
      }
      onProgress?.({
        stage: "PARSING",
        current: pageNumber,
        total: documentProxy.numPages,
        label: `读取第 ${pageNumber} 页`,
      });
      const page = await documentProxy.getPage(pageNumber);
      try {
        let text = textFromPage((await page.getTextContent()).items);
        if (!text) {
          ocrPages += 1;
          if (ocrPages > MAX_OCR_PAGES) {
            throw new MaterialParseError(
              "OCR_PAGE_LIMIT",
              "扫描 PDF 需要识别的页面超过 50 页，请拆分材料。",
            );
          }
          ocr ??= await (dependencies.createOcr ?? createLocalOcrEngine)(
            onProgress,
            signal,
          );
          const canvas = await renderPage(page);
          try {
            onProgress?.({
              stage: "OCR",
              current: ocrPages,
              total: Math.min(documentProxy.numPages, MAX_OCR_PAGES),
              label: `识别第 ${pageNumber} 页`,
            });
            text = await ocr.recognize(canvas);
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
        }
        blocks.push({ sourceLabel: `第 ${pageNumber} 页`, text });
      } finally {
        page.cleanup();
      }
    }
    return finishParsedMaterial(fileName, mimeType, blocks);
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (ocr) await ocr.terminate();
    await loadingTask.destroy();
  }
}
