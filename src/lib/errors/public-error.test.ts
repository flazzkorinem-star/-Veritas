import { describe, expect, it } from "vitest";

import { createPublicError, publicErrorSchema } from "./public-error";

describe("公共错误", () => {
  it("只暴露稳定错误码、中文消息和随机错误编号", () => {
    const result = createPublicError(
      "VALIDATION_ERROR",
      "提交内容不符合要求。",
      "82e7fbdd-e201-4b47-bfa3-0d8343119381",
    );

    expect(result).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "提交内容不符合要求。",
        errorId: "82e7fbdd-e201-4b47-bfa3-0d8343119381",
      },
    });
    expect(result.error).not.toHaveProperty("stack");
    expect(result.error).not.toHaveProperty("cause");
  });

  it("拒绝夹带内部错误字段", () => {
    expect(() =>
      publicErrorSchema.parse({
        error: {
          code: "INTERNAL_ERROR",
          message: "暂时无法处理，请稍后重试。",
          errorId: "82e7fbdd-e201-4b47-bfa3-0d8343119381",
          stack: "private stack",
        },
      }),
    ).toThrow();
  });
});
