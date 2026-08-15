import { describe, expect, it } from "vitest";

import {
  assembleCompactMerge,
  compactMergeSchema,
  CompactMergeError,
} from "./compact-merge";

const items = [
  {
    id: "s1-i1",
    moduleId: "s1-m1",
    title: "蒸发动力",
    summary: "太阳能驱动蒸发。",
    sourceUnitIds: ["source-1"],
    commonMisconceptions: [],
  },
  {
    id: "s2-i1",
    moduleId: "s2-m1",
    title: "蒸发能量",
    summary: "热量使水蒸发。",
    sourceUnitIds: ["source-2"],
    commonMisconceptions: ["蒸发不需要能量。"],
  },
  {
    id: "s2-i2",
    moduleId: "s2-m1",
    title: "重力径流",
    summary: "重力推动水向低处流动。",
    sourceUnitIds: ["source-3"],
    commonMisconceptions: [],
  },
];

const merge = {
  mergeGroups: [
    {
      id: "group-1",
      sourceKnowledgeItemIds: ["s1-i1", "s2-i1"],
      canonical: {
        title: "蒸发能量",
        summary: "太阳提供水蒸发所需能量。",
        commonMisconceptions: ["蒸发不需要能量。"],
      },
    },
    {
      id: "group-2",
      sourceKnowledgeItemIds: ["s2-i2"],
      canonical: {
        title: "重力径流",
        summary: "重力推动水向低处流动。",
        commonMisconceptions: [],
      },
    },
  ],
};

describe("紧凑候选分层归并", () => {
  it("按完整谱系生成更小候选，并合并全部来源", () => {
    expect(assembleCompactMerge(items, compactMergeSchema.parse(merge))).toEqual([
      {
        id: "s1-i1",
        moduleId: "s1-m1",
        title: "蒸发能量",
        summary: "太阳提供水蒸发所需能量。",
        sourceUnitIds: ["source-1", "source-2"],
        commonMisconceptions: ["蒸发不需要能量。"],
      },
      items[2],
    ]);
  });

  it("拒绝遗漏、重复或未知候选 ID", () => {
    const invalid = structuredClone(merge);
    invalid.mergeGroups[0]!.sourceKnowledgeItemIds = ["s1-i1", "missing"];

    expect(() => assembleCompactMerge(items, compactMergeSchema.parse(invalid))).toThrow(
      CompactMergeError,
    );
  });
});
