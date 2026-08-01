import { describe, expect, it, vi } from "vitest";

import { callAgent } from "./agent-client";

const extraction = {
  modules: [{ id: "module-1", title: "模块", sourceRange: "第 1 段" }],
  knowledgeItems: [
    {
      id: "item-1",
      moduleId: "module-1",
      title: "条目",
      summary: "摘要",
      kind: "CORE" as const,
      diagnosticRationale: "值得诊断",
      sourceReferences: [{ label: "第 1 段", excerpt: "材料摘录" }],
      commonMisconceptions: [],
    },
  ],
};

describe("浏览器 Agent 客户端", () => {
  it("只向同源路由发送固定业务操作，并校验结果", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(Response.json({ result: extraction }, { status: 200 }));
    const operation = {
      operation: "EXTRACT_KNOWLEDGE" as const,
      input: { chunkId: "chunk-1", sourceLabel: "第 1 段", text: "材料" },
    };

    await expect(callAgent(operation, { fetchImpl })).resolves.toEqual(extraction);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/agents");
    expect(JSON.parse(init.body)).toEqual(operation);
    expect(init.body).not.toContain("deepseek-v4-flash");
    expect(init.body).not.toContain("system");
  });

  it("拒绝成功响应中的未知或无效字段", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json({ result: { ...extraction, secret: "不应出现" } }, { status: 200 }),
      );

    await expect(
      callAgent(
        {
          operation: "EXTRACT_KNOWLEDGE",
          input: { chunkId: "chunk-1", sourceLabel: "第 1 段", text: "材料" },
        },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("只显示服务端稳定错误，不采用原始响应正文", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "请求较多，请稍等片刻再试。",
            errorId: crypto.randomUUID(),
          },
        },
        { status: 429 },
      ),
    );

    await expect(
      callAgent(
        {
          operation: "EXTRACT_KNOWLEDGE",
          input: { chunkId: "chunk-1", sourceLabel: "第 1 段", text: "材料" },
        },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "请求较多，请稍等片刻再试。",
    });
  });
});
