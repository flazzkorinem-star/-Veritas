import { describe, expect, it } from "vitest";

import { decodeTextMaterial } from "./text-reader";

function textFile(content: string, name = "notes.md", type = "text/markdown") {
  return new File([content], name, { type });
}

async function decodeFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return decodeTextMaterial(bytes);
}

describe("Markdown/TXT 文本读取", () => {
  it("解码 UTF-8 文本并清理首尾空白", async () => {
    const file = textFile("# 水循环\n太阳提供能量。\n");

    await expect(decodeFile(file)).resolves.toBe("# 水循环\n太阳提供能量。");
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
