import { describe, expect, it } from "vitest";

import { readServerEnv } from "./server";

describe("readServerEnv", () => {
  it("缺少 DeepSeek Key 时拒绝启动模型调用", () => {
    expect(() => readServerEnv({})).toThrow("本地服务未配置 DeepSeek Key");
  });

  it("只返回服务端需要的已校验字段", () => {
    expect(readServerEnv({ DEEPSEEK_API_KEY: "test-key" })).toEqual({
      deepseekApiKey: "test-key",
    });
  });
});
