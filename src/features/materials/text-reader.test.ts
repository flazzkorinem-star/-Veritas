import { describe, expect, it, vi } from "vitest";

import { readTextMaterial } from "./text-reader";

function textFile(content: string, name = "notes.md", type = "text/markdown") {
  return new File([content], name, { type });
}

describe("Markdown/TXT 文本读取", () => {
  it("读取 UTF-8 文本并报告真实字节进度", async () => {
    const progress = vi.fn();
    const file = textFile("# 水循环\n太阳提供能量。\n");

    await expect(readTextMaterial(file, progress)).resolves.toEqual({
      fileName: "notes.md",
      mimeType: "text/markdown",
      text: "# 水循环\n太阳提供能量。",
      sizeBytes: file.size,
    });
    expect(progress).toHaveBeenCalledWith({ loadedBytes: 0, totalBytes: file.size });
    expect(progress).toHaveBeenLastCalledWith({
      loadedBytes: file.size,
      totalBytes: file.size,
    });
  });

  it.each([
    [textFile("内容", "notes.pdf", "application/pdf"), "UNSUPPORTED_TYPE"],
    [textFile("内容", "notes.md", "application/pdf"), "MIME_MISMATCH"],
    [textFile("   ", "notes.txt", "text/plain"), "EMPTY_TEXT"],
  ] as const)("拒绝不安全或无内容的文本文件", async (file, code) => {
    await expect(readTextMaterial(file)).rejects.toMatchObject({ code });
  });

  it("在解码前拒绝超过 30MB 的文件", async () => {
    const file = new File([new Uint8Array(30 * 1024 * 1024 + 1)], "huge.txt", {
      type: "text/plain",
    });

    await expect(readTextMaterial(file)).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
  });

  it("拒绝超过 30 万字符的最终文本", async () => {
    const file = textFile("水".repeat(300_001), "long.txt", "text/plain");

    await expect(readTextMaterial(file)).rejects.toMatchObject({
      code: "TEXT_TOO_LONG",
    });
  });

  it("拒绝不是 UTF-8 的文本内容", async () => {
    const file = new File([new Uint8Array([0xff, 0xfe, 0xfd])], "broken.txt", {
      type: "text/plain",
    });

    await expect(readTextMaterial(file)).rejects.toMatchObject({
      code: "INVALID_ENCODING",
    });
  });
});
