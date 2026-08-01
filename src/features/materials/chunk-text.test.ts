import { describe, expect, it } from "vitest";

import { chunkText } from "./chunk-text";

describe("文本分块", () => {
  it("按可读边界切分且不遗漏材料内容", () => {
    const text = `# 第一节\n\n${"水循环。".repeat(40)}\n\n# 第二节\n\n${"城市径流。".repeat(40)}`;
    const chunks = chunkText(text, 120);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.text.length <= 120)).toBe(true);
    expect(chunks.map((chunk) => chunk.chunkId)).toEqual(
      chunks.map((_, index) => `chunk-${index + 1}`),
    );
    expect(chunks.map((chunk) => chunk.text).join("\n")).toContain("# 第一节");
    expect(chunks.map((chunk) => chunk.text).join("\n")).toContain("# 第二节");
    expect(chunks.every((chunk) => /^字符 \d+–\d+$/.test(chunk.sourceLabel))).toBe(true);
  });

  it("拒绝空文本和非法分块大小", () => {
    expect(() => chunkText("   ")).toThrow("没有可分块的文字");
    expect(() => chunkText("内容", 0)).toThrow("分块大小无效");
  });

  it("短 Markdown 也按标题保留来源章节", () => {
    const text = `# 总标题\n\n## 第一章\n\n甲。\n\n## 第二章\n\n乙。\n\n## 第三章\n\n丙。`;

    const chunks = chunkText(text);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.text).toContain("## 第一章");
    expect(chunks[1]?.text).toContain("## 第二章");
    expect(chunks[2]?.text).toContain("## 第三章");
  });
});
