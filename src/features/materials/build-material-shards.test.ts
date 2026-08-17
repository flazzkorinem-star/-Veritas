import { describe, expect, it } from "vitest";

import { buildMaterialShards } from "./build-material-shards";

describe("材料自适应分片", () => {
  it("按原始顺序生成稳定来源单元，并让每个来源单元只出现一次", () => {
    const shards = buildMaterialShards(
      [
        { sourceLabel: "第 1 页", text: "甲".repeat(18) },
        { sourceLabel: "第 2 页", text: "乙".repeat(4) },
      ],
      { maxSourceUnitBytes: 24, maxShardBytes: 220 },
    );

    const units = shards.flatMap((shard) => shard.sourceUnits);
    expect(units.map(({ id }) => id)).toEqual([
      "source-1",
      "source-2",
      "source-3",
      "source-4",
    ]);
    expect(units.map(({ sourceLabel }) => sourceLabel)).toEqual([
      "第 1 页（第 1 部分）",
      "第 1 页（第 2 部分）",
      "第 1 页（第 3 部分）",
      "第 2 页",
    ]);
    expect(
      units
        .slice(0, 3)
        .map(({ text }) => text)
        .join(""),
    ).toBe("甲".repeat(18));
    expect(new Set(units.map(({ id }) => id)).size).toBe(units.length);
  });

  it("按 UTF-8 请求字节预算分片，而不是按字符数误判中文大小", () => {
    const shards = buildMaterialShards(
      Array.from({ length: 4 }, (_, index) => ({
        sourceLabel: `第 ${index + 1} 段`,
        text: "水循环".repeat(8),
      })),
      { maxSourceUnitBytes: 96, maxShardBytes: 260 },
    );

    expect(shards.length).toBeGreaterThan(1);
    expect(
      shards.every(
        ({ sourceUnits }) =>
          new TextEncoder().encode(JSON.stringify({ sourceUnits })).byteLength <= 260,
      ),
    ).toBe(true);
  });

  it("很多短段落也不会超过 Agent 单片来源数量契约", () => {
    const shards = buildMaterialShards(
      Array.from({ length: 5 }, (_, index) => ({
        sourceLabel: `第 ${index + 1} 段`,
        text: "短段落",
      })),
      { maxSourceUnitBytes: 9, maxSourceUnits: 2 },
    );

    expect(shards.map(({ sourceUnits }) => sourceUnits.length)).toEqual([2, 2, 1]);
  });

  it("相邻短段落先合并为来源范围，避免数百个微小来源单元", () => {
    const shards = buildMaterialShards(
      Array.from({ length: 20 }, (_, index) => ({
        sourceLabel: `第 ${index + 1} 段`,
        text: `短段落 ${index + 1}`,
      })),
      { maxSourceUnitBytes: 120 },
    );

    const units = shards.flatMap(({ sourceUnits }) => sourceUnits);
    expect(units.length).toBeLessThan(10);
    expect(units[0]!.sourceLabel).toMatch(/^第 1 段 至 第 \d+ 段$/u);
    expect(units.map(({ text }) => text).join("\n\n")).toContain("短段落 20");
  });

  it("包含 Markdown 标题的块不与相邻主题合并", () => {
    const units = buildMaterialShards([
      { sourceLabel: "第一章", text: "## 第一章\n正文" },
      { sourceLabel: "第二章", text: "## 第二章\n正文" },
    ]).flatMap(({ sourceUnits }) => sourceUnits);

    expect(units).toHaveLength(2);
  });

  it("来源单元超过单片预算时直接拒绝无效配置", () => {
    expect(() =>
      buildMaterialShards([{ sourceLabel: "正文", text: "材料" }], {
        maxSourceUnitBytes: 200,
        maxShardBytes: 100,
      }),
    ).toThrow("来源单元字节预算不能大于分片字节预算");
  });
});
