import { describe, expect, it, vi } from "vitest";

import { parseMaterial } from "./parse-material";

describe("材料统一解析", () => {
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
});
