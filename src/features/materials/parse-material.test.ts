import { describe, expect, it, vi } from "vitest";

import { parseMaterial } from "./parse-material";

describe("材料统一解析", () => {
  it("拒绝没有内容的文本文件", async () => {
    await expect(
      parseMaterial(new File(["   "], "notes.txt", { type: "text/plain" }), vi.fn()),
    ).rejects.toMatchObject({ code: "EMPTY_TEXT" });
  });

  it("拒绝超过 30 万字符的最终文本", async () => {
    await expect(
      parseMaterial(
        new File(["水".repeat(300_001)], "long.txt", { type: "text/plain" }),
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: "TEXT_TOO_LONG" });
  });

  it("Markdown 按二级标题保留来源结构，而不是退化为全文单块", async () => {
    const text = `# 城市里的水循环

## 1. 自然水循环

太阳驱动蒸发。

## 2. 城市化影响

硬化地表增加径流。

## 3. 海绵城市

透水铺装存在容量边界。`;

    const material = await parseMaterial(
      new File([text], "water.md", { type: "text/markdown" }),
      vi.fn(),
    );

    expect(material.sourceBlocks).toHaveLength(3);
    expect(material.sourceBlocks.map(({ sourceLabel }) => sourceLabel)).toEqual([
      "1. 自然水循环",
      "2. 城市化影响",
      "3. 海绵城市",
    ]);
    expect(material.sourceBlocks.map(({ text }) => text)).toEqual([
      expect.stringContaining("## 1. 自然水循环"),
      expect.stringContaining("## 2. 城市化影响"),
      expect.stringContaining("## 3. 海绵城市"),
    ]);
  });

  it("Markdown 章节超过 40 个时仍保留全部标题边界", async () => {
    const sections = Array.from(
      { length: 41 },
      (_, index) => `## 第 ${index + 1} 章\n\n正文 ${index + 1}。`,
    );
    const material = await parseMaterial(
      new File([`# 总标题\n\n${sections.join("\n\n")}`], "large.md", {
        type: "text/markdown",
      }),
      vi.fn(),
    );

    expect(material.sourceBlocks).toHaveLength(41);
    expect(material.sourceBlocks.map(({ sourceLabel }) => sourceLabel)).toEqual(
      sections.map((_, index) => `第 ${index + 1} 章`),
    );
  });

  it("解析阶段不再按字符容量二次切分同一 Markdown 章节", async () => {
    const material = await parseMaterial(
      new File([`## 长章节\n\n${"水循环。".repeat(4_000)}`], "long.md", {
        type: "text/markdown",
      }),
      vi.fn(),
    );

    expect(material.sourceBlocks).toHaveLength(1);
    expect(material.sourceBlocks[0]?.sourceLabel).toBe("长章节");
  });

  it("保留原有的 H1 章节边界语义", async () => {
    const material = await parseMaterial(
      new File(["# 第一节\n\n甲。\n\n# 第二节\n\n乙。"], "chapters.md", {
        type: "text/markdown",
      }),
      vi.fn(),
    );

    expect(material.sourceBlocks).toHaveLength(2);
    expect(material.sourceBlocks[0]?.text).toContain("# 第一节");
    expect(material.sourceBlocks[1]?.text).toContain("# 第二节");
  });
});
