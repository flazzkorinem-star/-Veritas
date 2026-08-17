import { describe, expect, it } from "vitest";

import { analyzeExactCoverage } from "./exact-coverage";

describe("精确覆盖分析", () => {
  it("按输入顺序报告缺失、重复和未知 ID", () => {
    expect(
      analyzeExactCoverage(["item-1", "item-2", "item-3"], [
        "item-1",
        "unknown",
        "item-1",
      ]),
    ).toEqual({
      missing: ["item-2", "item-3"],
      duplicate: ["item-1"],
      unknown: ["unknown"],
    });
  });
});
