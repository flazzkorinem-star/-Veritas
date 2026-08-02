import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentServiceError } from "@/server/agents/service";

const { runAgentOperation } = vi.hoisted(() => ({ runAgentOperation: vi.fn() }));

vi.mock("@/lib/env/server", () => ({
  readServerEnv: () => ({ deepseekApiKey: "server-only-key" }),
}));
vi.mock("@/server/agents/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/agents/service")>();
  return { ...original, runAgentOperation };
});

import { POST } from "./route";
import { resetAgentRequestGuardForTests } from "@/server/agents/request-guard";

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/agents", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      ...headers,
    },
  });
}

describe("同源 Agent API", () => {
  beforeEach(() => {
    runAgentOperation.mockReset();
    resetAgentRequestGuardForTests();
  });

  it("只把通过边界校验的操作交给服务端 Agent", async () => {
    runAgentOperation.mockResolvedValue({ opening: "材料开场", question: "问题？" });
    const body = JSON.stringify({
      operation: "CREATE_FIRST_QUESTION",
      input: { materialTitle: "材料", node: {}, knowledgeItems: [] },
    });

    const response = await POST(request(body));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      result: { opening: "材料开场", question: "问题？" },
    });
    expect(runAgentOperation).toHaveBeenCalledWith(
      JSON.parse(body),
      "server-only-key",
      undefined,
      expect.any(AbortSignal),
    );
  });

  it("按浏览器实际 Host 判断同源，不受服务器内部 URL 主机名影响", async () => {
    runAgentOperation.mockResolvedValue({ ok: true });
    const response = await POST(
      request("{}", { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }),
    );

    expect(response.status).toBe(200);
  });

  it.each([
    ["跨来源", { origin: "https://evil.example" }, 403],
    ["错误 Content-Type", { "content-type": "text/plain" }, 415],
  ])("拒绝%s请求", async (_name, headers, status) => {
    const response = await POST(request("{}", headers));

    expect(response.status).toBe(status);
    expect((await response.json()).error).toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(runAgentOperation).not.toHaveBeenCalled();
  });

  it("拒绝超过上限的请求体", async () => {
    const response = await POST(
      request("{}", { "content-length": String(4 * 1024 * 1024 + 1) }),
    );

    expect(response.status).toBe(413);
    expect(runAgentOperation).not.toHaveBeenCalled();
  });

  it("不信任缺失的 Content-Length，仍按实际字节数拒绝大请求", async () => {
    const response = await POST(request(`{"input":"${"中".repeat(1_400_000)}"}`));

    expect(response.status).toBe(413);
    expect(runAgentOperation).not.toHaveBeenCalled();
  });

  it("不向浏览器暴露无效模型输出细节", async () => {
    runAgentOperation.mockRejectedValue(new AgentServiceError("INVALID_MODEL_OUTPUT"));

    const response = await POST(request("{}"));
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(502);
    expect(body).not.toContain("INVALID_MODEL_OUTPUT");
    expect(body).not.toContain("server-only-key");
  });
});
