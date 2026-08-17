import { describe, expect, it } from "vitest";

import { decodeTextMaterial } from "./text-reader";

function textFile(content: string, name = "notes.md", type = "text/markdown") {
  return new File([content], name, { type });
}

async function decodeFile(file: File) {
  return decodeTextMaterial(file, new Uint8Array(await file.arrayBuffer()));
}

describe("Markdown/TXT 文本读取", () => {
  it("解码 UTF-8 文本并清理首尾空白", async () => {
    const file = textFile("# 水循环\n太阳提供能量。\n");

    await expect(decodeFile(file)).resolves.toEqual({
      fileName: "notes.md",
      mimeType: "text/markdown",
      text: "# 水循环\n太阳提供能量。",
      sizeBytes: file.size,
    });
  });

  it.each([
    [textFile("内容", "notes.pdf", "application/pdf"), "UNSUPPORTED_TYPE"],
    [textFile("内容", "notes.md", "application/pdf"), "MIME_MISMATCH"],
    [textFile("   ", "notes.txt", "text/plain"), "EMPTY_TEXT"],
  ] as const)("拒绝不安全或无内容的文本文件", async (file, code) => {
    await expect(decodeFile(file)).rejects.toMatchObject({ code });
  });

  it("拒绝超过 30 万字符的最终文本", async () => {
    const file = textFile("水".repeat(300_001), "long.txt", "text/plain");

    await expect(decodeFile(file)).rejects.toMatchObject({
      code: "TEXT_TOO_LONG",
    });
  });

  it("拒绝不是 UTF-8 的文本内容", async () => {
    const file = new File([new Uint8Array([0xff, 0xfe, 0xfd])], "broken.txt", {
      type: "text/plain",
    });

    await expect(decodeFile(file)).rejects.toMatchObject({
      code: "INVALID_ENCODING",
    });
  });
});
