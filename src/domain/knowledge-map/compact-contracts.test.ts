import { describe, expect, it } from "vitest";

import { compactExtractionSchema } from "./compact-contracts";

function validExtraction() {
  return {
    modules: [
      {
        id: "module-1",
        title: "水循环",
        sourceUnitIds: ["source-1", "source-2"],
      },
    ],
    knowledgeItems: [
      {
        id: "item-1",
        moduleId: "module-1",
        title: "循环动力",
        summary: "太阳能驱动蒸发，重力推动径流。",
        sourceUnitIds: ["source-1", "source-2"],
        commonMisconceptions: ["水循环只由太阳能推动。"],
      },
    ],
    topicDrafts: [
      {
        id: "topic-1",
        moduleId: "module-1",
        title: "区分两种动力",
        objective: "说清太阳能与重力分别作用在哪些环节。",
        knowledgeItemIds: ["item-1"],
      },
    ],
    sourceCoverage: ["source-1", "source-2"],
  };
}

describe("紧凑提取契约", () => {
  it("允许叶级临时主题先归拢超过五个候选", () => {
    const extraction = validExtraction();
    extraction.knowledgeItems = Array.from({ length: 6 }, (_, index) => ({
      ...extraction.knowledgeItems[0]!,
      id: `item-${index + 1}`,
      title: `候选 ${index + 1}`,
    }));
    extraction.topicDrafts[0]!.knowledgeItemIds = extraction.knowledgeItems.map(
      ({ id }) => id,
    );

    expect(compactExtractionSchema.safeParse(extraction).success).toBe(true);
  });

  it("只保留叶级提取负责的候选字段", () => {
    expect(compactExtractionSchema.parse(validExtraction())).toEqual(validExtraction());
  });

  it.each([
    [
      "未被知识条目引用的来源单元",
      (value: ReturnType<typeof validExtraction>) => {
        value.knowledgeItems[0]!.sourceUnitIds = ["source-1"];
      },
    ],
    [
      "不存在的模块",
      (value: ReturnType<typeof validExtraction>) => {
        value.knowledgeItems[0]!.moduleId = "module-missing";
      },
    ],
    [
      "不存在的知识条目",
      (value: ReturnType<typeof validExtraction>) => {
        value.topicDrafts[0]!.knowledgeItemIds = ["item-missing"];
      },
    ],
    [
      "重复的来源覆盖",
      (value: ReturnType<typeof validExtraction>) => {
        value.sourceCoverage.push("source-1");
      },
    ],
  ])("拒绝%s", (_name, mutate) => {
    const value = validExtraction();
    mutate(value);
    expect(compactExtractionSchema.safeParse(value).success).toBe(false);
  });

  it("拒绝把归并阶段字段塞回叶级输出", () => {
    const value = validExtraction() as ReturnType<typeof validExtraction> & {
      diagnosticRationale?: string;
    };
    value.diagnosticRationale = "不应由叶级模型生成";

    expect(compactExtractionSchema.safeParse(value).success).toBe(false);
  });
});
