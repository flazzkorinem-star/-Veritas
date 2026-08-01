import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

import {
  inspectMaterialFile,
  inspectZipContainer,
  readMaterialBytes,
} from "./material-file";

async function officeFile(kind: "docx" | "pptx") {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("_rels/.rels", "<Relationships/>");
  if (kind === "docx") zip.file("word/document.xml", "<w:document/>");
  else {
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    zip.file("ppt/slides/slide1.xml", "<p:sld/>");
  }
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const mime =
    kind === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new File([buffer], `lesson.${kind}`, { type: mime });
}

describe("材料文件安全入口", () => {
  it("按真实字节读取，并识别 PDF 与图片签名", async () => {
    const progress = vi.fn();
    const pdf = new File([new TextEncoder().encode("%PDF-1.7\n")], "lesson.pdf", {
      type: "application/pdf",
    });
    const bytes = await readMaterialBytes(pdf, progress);

    expect(inspectMaterialFile(pdf, bytes)).toMatchObject({ kind: "PDF" });
    expect(progress).toHaveBeenCalledWith({ loadedBytes: 0, totalBytes: pdf.size });
    expect(progress).toHaveBeenLastCalledWith({
      loadedBytes: pdf.size,
      totalBytes: pdf.size,
    });

    const png = new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      "diagram.png",
      { type: "image/png" },
    );
    expect(
      inspectMaterialFile(png, new Uint8Array(await png.arrayBuffer())),
    ).toMatchObject({ kind: "IMAGE" });
  });

  it.each([
    [new File(["%PDF-"], "lesson.exe", { type: "application/pdf" }), "UNSUPPORTED_TYPE"],
    [
      new File(["not pdf"], "lesson.pdf", { type: "application/pdf" }),
      "SIGNATURE_MISMATCH",
    ],
    [new File(["%PDF-"], "lesson.pdf", { type: "text/plain" }), "MIME_MISMATCH"],
  ] as const)("拒绝扩展名、MIME 或签名不一致", async (file, code) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    expect(() => inspectMaterialFile(file, bytes)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it("只把包含 Office 必需结构的 ZIP 识别为 DOCX/PPTX", async () => {
    for (const kind of ["docx", "pptx"] as const) {
      const file = await officeFile(kind);
      const bytes = new Uint8Array(await file.arrayBuffer());
      expect(inspectMaterialFile(file, bytes)).toMatchObject({
        kind: kind === "docx" ? "DOCX" : "PPTX",
      });
    }

    const fake = new File([new Uint8Array([80, 75, 3, 4])], "fake.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(() => inspectMaterialFile(fake, new Uint8Array([80, 75, 3, 4]))).toThrowError(
      expect.objectContaining({ code: "INVALID_CONTAINER" }),
    );
  });

  it("在解压前拒绝声明超过 200MB 的 ZIP 条目", async () => {
    const file = await officeFile("docx");
    const bytes = new Uint8Array(await file.arrayBuffer());
    for (let index = 0; index < bytes.length - 4; index += 1) {
      if (
        bytes[index] === 80 &&
        bytes[index + 1] === 75 &&
        bytes[index + 2] === 1 &&
        bytes[index + 3] === 2
      ) {
        new DataView(bytes.buffer).setUint32(index + 24, 201 * 1024 * 1024, true);
        break;
      }
    }
    expect(() => inspectZipContainer(bytes)).toThrowError(
      expect.objectContaining({ code: "RESOURCE_LIMIT" }),
    );
  });

  it("拒绝 ZIP 条目的正斜杠与反斜杠路径穿越", async () => {
    for (const name of ["../outside.xml", "..\\outside.xml"]) {
      const zip = new JSZip();
      zip.file(name, "unsafe");
      const bytes = await zip.generateAsync({ type: "uint8array" });
      expect(() => inspectZipContainer(bytes)).toThrowError(
        expect.objectContaining({ code: "INVALID_CONTAINER" }),
      );
    }
  });

  it("在读取前拒绝超过 30MB 的文件，并支持取消读取", async () => {
    const huge = new File([new Uint8Array(30 * 1024 * 1024 + 1)], "huge.pdf", {
      type: "application/pdf",
    });
    await expect(readMaterialBytes(huge)).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });

    const controller = new AbortController();
    controller.abort();
    await expect(
      readMaterialBytes(
        new File(["text"], "notes.txt", { type: "text/plain" }),
        undefined,
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });
});
