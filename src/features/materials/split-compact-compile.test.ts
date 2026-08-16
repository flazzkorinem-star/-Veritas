import { describe, expect, it } from "vitest";

import { compactExtractionSchema } from "@/domain/knowledge-map/compact-contracts";

import type { CompactCompileShard } from "./prepare-compact-compile";
import { splitCompactCompileShard } from "./split-compact-compile";

function shard(): CompactCompileShard {
  return {
    shardId: "shard-1",
    extraction: compactExtractionSchema.parse({
      modules: [
        {
          id: "m1",
          title: "模块一",
          sourceUnitIds: ["source-1", "source-2", "source-3"],
        },
        { id: "m2", title: "模块二", sourceUnitIds: ["source-4", "source-5"] },
      ],
      knowledgeItems: [
        {
          id: "i1",
          moduleId: "m1",
          title: "一",
          summary: "一",
          sourceUnitIds: ["source-1", "source-2"],
          commonMisconceptions: [],
        },
        {
          id: "i2",
          moduleId: "m1",
          title: "二",
          summary: "二",
          sourceUnitIds: ["source-2", "source-3"],
          commonMisconceptions: [],
        },
        {
          id: "i3",
          moduleId: "m2",
          title: "三",
          summary: "三",
          sourceUnitIds: ["source-4"],
          commonMisconceptions: [],
        },
        {
          id: "i4",
          moduleId: "m2",
          title: "四",
          summary: "四",
          sourceUnitIds: ["source-5"],
          commonMisconceptions: [],
        },
      ],
      topicDrafts: [
        {
          id: "t1",
          moduleId: "m1",
          title: "主题一",
          objective: "理解一二",
          knowledgeItemIds: ["i1", "i2"],
        },
        {
          id: "t2",
          moduleId: "m2",
          title: "主题二",
          objective: "理解三四",
          knowledgeItemIds: ["i3", "i4"],
        },
      ],
      sourceCoverage: ["source-1", "source-2", "source-3", "source-4", "source-5"],
    }),
  };
}

describe("失败编译分区隔离", () => {
  it("共享来源的候选保持在同一子区且全部来源恰好覆盖一次", () => {
    const children = splitCompactCompileShard(shard());

    expect(children).not.toBeNull();
    expect(children!.map(({ shardId }) => shardId)).toEqual(["shard-1-1", "shard-1-2"]);
    expect(
      children!.flatMap(({ extraction }) => extraction.sourceCoverage).toSorted(),
    ).toEqual(["source-1", "source-2", "source-3", "source-4", "source-5"]);
    expect(
      children!.every(
        ({ extraction }) => compactExtractionSchema.safeParse(extraction).success,
      ),
    ).toBe(true);
    const ownerByItem = new Map(
      children!.flatMap(({ shardId, extraction }) =>
        extraction.knowledgeItems.map(({ id }) => [id, shardId] as const),
      ),
    );
    expect(ownerByItem.get("i1")).toBe(ownerByItem.get("i2"));
  });
});
