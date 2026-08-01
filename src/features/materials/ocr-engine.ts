import type { ParsingProgress } from "./parsed-material";
import { MaterialParseError } from "./parsed-material";

export interface OcrEngine {
  recognize(image: File | HTMLCanvasElement): Promise<string>;
  terminate(): Promise<void>;
}

export async function createLocalOcrEngine(
  onProgress?: (progress: ParsingProgress) => void,
  signal?: AbortSignal,
): Promise<OcrEngine> {
  if (signal?.aborted) {
    throw new MaterialParseError("CANCELLED", "已取消处理这份材料。 ");
  }
  const { createWorker, OEM } = await import("tesseract.js");
  const workerPromise = createWorker(["chi_sim", "eng"], OEM.LSTM_ONLY, {
    workerPath: "/ocr-worker.js",
    corePath: "/parser-assets/ocr/core",
    langPath: "/parser-assets/ocr/lang",
    workerBlobURL: false,
    logger: ({ progress, status }) =>
      onProgress?.({
        stage: "OCR",
        current: Math.round(progress * 100),
        total: 100,
        label: status === "recognizing text" ? "识别图片文字" : "准备文字识别",
      }),
  });
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(new MaterialParseError("CANCELLED", "已取消处理这份材料。 "));
    signal?.addEventListener("abort", abort, { once: true });
  });
  let worker: Awaited<typeof workerPromise>;
  try {
    worker = signal ? await Promise.race([workerPromise, aborted]) : await workerPromise;
  } catch (error) {
    if (signal?.aborted) {
      void workerPromise.then(
        (createdWorker) => createdWorker.terminate(),
        () => undefined,
      );
    }
    throw error;
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
  }
  let terminated = false;
  return {
    async recognize(image) {
      const result = await worker.recognize(image);
      return result.data.text;
    },
    async terminate() {
      if (terminated) return;
      terminated = true;
      await worker.terminate();
    },
  };
}
