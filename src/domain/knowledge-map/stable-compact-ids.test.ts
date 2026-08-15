import { describe, expect, it } from "vitest";

import { namespaceCompactExtraction } from "./stable-compact-ids";

describe("紧凑提取稳定 ID", () => {
  it("按分片与原始顺序重写模块、条目、主题及全部内部引用", () => {
    const extraction = {
      modules: [
        { id: "m-a", title: "动力", sourceUnitIds: ["source-1"] },
        { id: "m-b", title: "过程", sourceUnitIds: ["source-2"] },
      ],
      knowledgeItems: [
        {
          id: "i-foundation",
          moduleId: "m-a",
          title: "循环动力",
          summary: "太阳提供能量。",
          sourceUnitIds: ["source-1"],
          commonMisconceptions: [],
        },
        {
          id: "i-a",
          moduleId: "m-b",
          title: "蒸发",
          summary: "水受热蒸发。",
          sourceUnitIds: ["source-2"],
          commonMisconceptions: [],
        },
      ],
      topicDrafts: [
        {
          id: "t-a",
          moduleId: "m-b",
          title: "状态变化",
          objective: "解释蒸发。",
          knowledgeItemIds: ["i-a"],
        },
      ],
      sourceCoverage: ["source-1", "source-2"],
    };

    expect(namespaceCompactExtraction("shard-12", extraction)).toMatchObject({
      modules: [{ id: "s12-m1" }, { id: "s12-m2" }],
      knowledgeItems: [
        { id: "s12-i1", moduleId: "s12-m1" },
        { id: "s12-i2", moduleId: "s12-m2" },
      ],
      topicDrafts: [
        {
          id: "s12-t1",
          moduleId: "s12-m2",
          knowledgeItemIds: ["s12-i2"],
        },
      ],
    });
  });

  it("拒绝无效分片 ID", () => {
    expect(() =>
      namespaceCompactExtraction("chunk-1", {
        modules: [],
        knowledgeItems: [],
        topicDrafts: [],
        sourceCoverage: [],
      } as never),
    ).toThrow("分片 ID 无效");
  });
});
