import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const files = [
  [
    "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
    "public/parser-assets/pdf.worker.min.mjs",
  ],
  [
    "node_modules/tesseract.js/dist/worker.min.js",
    "public/parser-assets/ocr/worker.min.js",
  ],
  [
    "node_modules/@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz",
    "public/parser-assets/ocr/lang/chi_sim.traineddata.gz",
  ],
  [
    "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    "public/parser-assets/ocr/lang/eng.traineddata.gz",
  ],
];

for (const name of [
  "tesseract-core.wasm",
  "tesseract-core.wasm.js",
  "tesseract-core-lstm.wasm",
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd.wasm",
  "tesseract-core-simd.wasm.js",
  "tesseract-core-simd-lstm.wasm",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd.wasm",
  "tesseract-core-relaxedsimd.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
]) {
  files.push([
    `node_modules/tesseract.js-core/${name}`,
    `public/parser-assets/ocr/core/${name}`,
  ]);
}

for (const [source, destination] of files) {
  const target = join(root, destination);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, source), target);
}
