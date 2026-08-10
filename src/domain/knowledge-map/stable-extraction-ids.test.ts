import { describe, expect, it } from "vitest";

import { namespaceChunkExtraction } from "./stable-extraction-ids";

const source = { label: "第 1 段", excerpt: "太阳驱动蒸发。" };

describe("分块提取稳定 ID", () => {
  it("按分块与原始顺序重写模块、条目和模块引用", () => {
    const extraction = {
      modules: [
        { id: "module-1", title: "动力", sourceRange: "第 1 段" },
        { id: "module-2", title: "过程", sourceRange: "第 2 段" },
      ],
      knowledgeItems: [
        {
          id: "item-1",
          moduleId: "module-2",
          title: "蒸发",
          summary: "水受热蒸发。",
          kind: "CORE" as const,
          diagnosticRationale: "理解状态变化。",
          sourceReferences: [source],
          commonMisconceptions: [],
        },
      ],
    };

    expect(namespaceChunkExtraction("chunk-12", extraction)).toMatchObject({
      modules: [{ id: "c12-m1" }, { id: "c12-m2" }],
      knowledgeItems: [{ id: "c12-i1", moduleId: "c12-m2" }],
    });
  });
});
