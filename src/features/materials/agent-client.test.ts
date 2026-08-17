import { describe, expect, it, vi } from "vitest";

import { callAgent } from "./agent-client";

const compactExtraction = {
  modules: [{ id: "module-1", title: "模块", sourceUnitIds: ["source-1"] }],
  knowledgeItems: [
    {
      id: "item-1",
      moduleId: "module-1",
      title: "条目",
      summary: "摘要",
      sourceUnitIds: ["source-1"],
      commonMisconceptions: [],
    },
  ],
  topicDrafts: [
    {
      id: "topic-1",
      moduleId: "module-1",
      title: "主题",
      objective: "理解条目。",
      knowledgeItemIds: ["item-1"],
    },
  ],
  sourceCoverage: ["source-1"],
};

const compactOperation = {
  operation: "EXTRACT_COMPACT_KNOWLEDGE" as const,
  input: {
    shardId: "shard-1",
    sourceUnits: [{ id: "source-1", sourceLabel: "第 1 页", text: "材料" }],
  },
};

const operationMeta = {
  attempts: 1,
  repaired: false,
  validationSource: "MODEL_VALIDATED",
} as const;

describe("浏览器 Agent 客户端", () => {
  it("校验紧凑提取响应，而不是把未知模型字段带入编排层", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json({ result: compactExtraction, meta: operationMeta }, { status: 200 }),
      );

    await expect(callAgent(compactOperation, { fetchImpl })).resolves.toEqual(
      compactExtraction,
    );
  });

  it("拒绝缺少操作元数据的成功响应", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(Response.json({ result: compactExtraction }, { status: 200 }));

    await expect(callAgent(compactOperation, { fetchImpl })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("把服务端的模型验证元数据交给编排层观测", async () => {
    const onMeta = vi.fn();
    const meta = {
      attempts: 2,
      repaired: true,
      validationSource: "MODEL_VALIDATED",
    } as const;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(Response.json({ result: compactExtraction, meta }));

    await expect(callAgent(compactOperation, { fetchImpl, onMeta })).resolves.toEqual(
      compactExtraction,
    );
    expect(onMeta).toHaveBeenCalledWith(meta);
  });

  it("只向同源路由发送固定业务操作，并校验结果", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json({ result: compactExtraction, meta: operationMeta }, { status: 200 }),
      );
    const operation = compactOperation;

    await expect(callAgent(operation, { fetchImpl })).resolves.toEqual(compactExtraction);
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
        Response.json(
          { result: { ...compactExtraction, secret: "不应出现" }, meta: operationMeta },
          { status: 200 },
        ),
      );

    await expect(callAgent(compactOperation, { fetchImpl })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
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

    await expect(callAgent(compactOperation, { fetchImpl })).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "请求较多，请稍等片刻再试。",
    });
  });

  it("请求体超过同源 API 上限时不发送网络请求", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json({ result: compactExtraction, meta: operationMeta }, { status: 200 }),
      );

    await expect(
      callAgent(compactOperation, { fetchImpl, maxRequestBytes: 10 }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "提交给模型的内容过大，请拆分材料后重试。",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("校验待开始主题的新顺序", async () => {
    const result = { nodeIds: ["node-3", "node-2"] };
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(Response.json({ result, meta: operationMeta }, { status: 200 }));

    await expect(
      callAgent(
        {
          operation: "PRIORITIZE_PENDING_NODES",
          input: {
            learningGoal: "优先理解蒸发条件",
            pendingNodes: [
              { id: "node-2", title: "降水回流", objective: "解释回流。", order: 2 },
              { id: "node-3", title: "蒸发条件", objective: "解释蒸发。", order: 3 },
            ],
          },
        },
        { fetchImpl },
      ),
    ).resolves.toEqual(result);
  });
});
