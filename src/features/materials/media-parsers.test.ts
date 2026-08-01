import { afterEach, describe, expect, it, vi } from "vitest";

import { parseImage } from "./image-parser";
import type { OcrEngine } from "./ocr-engine";
import { MaterialParseError } from "./parsed-material";
import { parsePdf } from "./pdf-parser";

function imageFile() {
  return new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "map.png", {
    type: "image/png",
  });
}

function ocrEngine(text = "云由水蒸气凝结形成。") {
  return {
    recognize: vi.fn().mockResolvedValue(text),
    terminate: vi.fn().mockResolvedValue(undefined),
  } satisfies OcrEngine;
}

function pdfPage(text: string) {
  return {
    getTextContent: vi.fn().mockResolvedValue({
      items: text ? [{ str: text, hasEOL: true }] : [],
    }),
    getViewport: vi.fn().mockReturnValue({ width: 600, height: 800 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    cleanup: vi.fn(),
  };
}

function pdfLoader(pages: ReturnType<typeof pdfPage>[]) {
  const documentProxy = {
    numPages: pages.length,
    getPage: vi.fn(async (pageNumber: number) => pages[pageNumber - 1]),
  };
  const loadingTask = {
    promise: Promise.resolve(documentProxy),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  return {
    documentProxy,
    loadingTask,
    loadPdf: vi.fn(async () => loadingTask),
  };
}

describe("图片与 PDF 解析", () => {
  afterEach(() => vi.restoreAllMocks());

  it("图片在 OCR 前校验像素，并在识别后释放 Worker", async () => {
    const worker = ocrEngine();
    const result = await parseImage(imageFile(), undefined, undefined, {
      readDimensions: vi.fn().mockResolvedValue({ width: 2_000, height: 1_000 }),
      createOcr: vi.fn().mockResolvedValue(worker),
    });

    expect(result.sourceBlocks).toEqual([
      { sourceLabel: "图片文字识别结果", text: "云由水蒸气凝结形成。" },
    ]);
    expect(worker.terminate).toHaveBeenCalledOnce();

    await expect(
      parseImage(imageFile(), undefined, undefined, {
        readDimensions: vi.fn().mockResolvedValue({ width: 10_000, height: 5_000 }),
        createOcr: vi.fn().mockResolvedValue(worker),
      }),
    ).rejects.toMatchObject({ code: "PIXEL_LIMIT" });
  });

  it("图片 OCR 初始化阶段也接收取消信号", async () => {
    const controller = new AbortController();
    const pending = parseImage(imageFile(), undefined, controller.signal, {
      readDimensions: vi.fn().mockResolvedValue({ width: 1_000, height: 700 }),
      createOcr: (_progress, signal) =>
        new Promise((_, reject) =>
          signal?.addEventListener(
            "abort",
            () => reject(new MaterialParseError("CANCELLED", "已取消处理这份材料。 ")),
            { once: true },
          ),
        ),
    });
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("PDF 逐页保留来源，只对无文字页面进行 OCR", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
    const pages = [pdfPage("太阳驱动蒸发。"), pdfPage("")];
    const { loadPdf, loadingTask } = pdfLoader(pages);
    const worker = ocrEngine("水蒸气凝结成云。");

    const result = await parsePdf(
      new Uint8Array([37, 80, 68, 70, 45]),
      "lesson.pdf",
      "application/pdf",
      undefined,
      undefined,
      { loadPdf, createOcr: vi.fn().mockResolvedValue(worker) },
    );

    expect(result.sourceBlocks).toEqual([
      { sourceLabel: "第 1 页", text: "太阳驱动蒸发。" },
      { sourceLabel: "第 2 页", text: "水蒸气凝结成云。" },
    ]);
    expect(worker.recognize).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(pages.every((page) => page.cleanup.mock.calls.length === 1)).toBe(true);
    expect(loadingTask.destroy).toHaveBeenCalledOnce();
  });

  it("PDF 在昂贵解析前拒绝超过 200 页", async () => {
    const { loadPdf, documentProxy, loadingTask } = pdfLoader(
      Array.from({ length: 201 }, () => pdfPage("文字")),
    );
    await expect(
      parsePdf(
        new Uint8Array([37, 80, 68, 70, 45]),
        "huge.pdf",
        "application/pdf",
        undefined,
        undefined,
        { loadPdf },
      ),
    ).rejects.toMatchObject({ code: "PAGE_LIMIT" });
    expect(documentProxy.getPage).not.toHaveBeenCalled();
    expect(loadingTask.destroy).toHaveBeenCalledOnce();
  });

  it("扫描 PDF 最多只允许 50 个 OCR 页面", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
    const pages = Array.from({ length: 51 }, () => pdfPage(""));
    const { loadPdf, loadingTask } = pdfLoader(pages);
    const worker = ocrEngine("页面文字");
    await expect(
      parsePdf(
        new Uint8Array([37, 80, 68, 70, 45]),
        "scan.pdf",
        "application/pdf",
        undefined,
        undefined,
        { loadPdf, createOcr: vi.fn().mockResolvedValue(worker) },
      ),
    ).rejects.toMatchObject({ code: "OCR_PAGE_LIMIT" });
    expect(worker.recognize).toHaveBeenCalledTimes(50);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(loadingTask.destroy).toHaveBeenCalledOnce();
  });
});
