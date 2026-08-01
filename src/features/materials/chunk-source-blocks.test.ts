import { describe, expect, it } from "vitest";

import { chunkSourceBlocks } from "./chunk-source-blocks";

describe("多格式来源分块", () => {
  it("合并相邻短来源并保留可读范围", () => {
    expect(
      chunkSourceBlocks([
        { sourceLabel: "第 1 页", text: "太阳驱动蒸发。" },
        { sourceLabel: "第 2 页", text: "水蒸气凝结。" },
      ]),
    ).toEqual([
      {
        chunkId: "chunk-1",
        sourceLabel: "第 1 页 至 第 2 页",
        text: "太阳驱动蒸发。\n\n水蒸气凝结。",
      },
    ]);
  });

  it("长来源拆分后仍标明原始页码", () => {
    const chunks = chunkSourceBlocks([
      { sourceLabel: "第 8 页", text: "水".repeat(20_000) },
    ]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].sourceLabel).toBe("第 8 页（第 1 部分）");
    expect(chunks[1].sourceLabel).toBe("第 8 页（第 2 部分）");
  });
});
