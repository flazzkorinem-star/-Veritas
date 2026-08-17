import { describe, expect, it, vi } from "vitest";

import { callDeepSeekJson } from "./client";

function response(content: string | null, status = 200, finishReason = "stop") {
  return new Response(
    status === 200
      ? JSON.stringify({
          choices: [{ finish_reason: finishReason, message: { content } }],
        })
      : "上游敏感错误正文",
    { status, headers: { "content-type": "application/json" } },
  );
}

function request() {
  return {
    apiKey: "test-secret",
    system: "请输出 json。",
    user: "材料内容",
    thinking: false as const,
    maxTokens: 2_000,
  };
}

describe("DeepSeek 服务端客户端", () => {
  it("只调用固定上游和模型，并启用 JSON Output", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('{"ok":true}'));

    await expect(callDeepSeekJson(request(), { fetchImpl })).resolves.toEqual({
      ok: true,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-secret");
    expect(JSON.parse(init.body)).toMatchObject({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      stream: false,
    });
  });

  it("覆盖审计可开启思考，但不会把 reasoning 内容返回业务层", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: '{"map":true}', reasoning_content: "内部推理" },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      callDeepSeekJson(
        { ...request(), thinking: true, reasoningEffort: "low" },
        { fetchImpl },
      ),
    ).resolves.toEqual({ map: true });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body);
    expect(body).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "low",
    });
  });

  it("一次客户端调用只发送一个物理请求", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(null, 429));

    await expect(callDeepSeekJson(request(), { fetchImpl })).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("按调用方要求发送确定性采样温度", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('{"ok":true}'));

    await callDeepSeekJson({ ...request(), temperature: 0 }, { fetchImpl });

    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toMatchObject({
      temperature: 0,
    });
  });

  it.each([
    ["截断", response('{"partial":', 200, "length"), "INVALID_RESPONSE"],
    ["空内容", response(null), "INVALID_RESPONSE"],
    ["非法 JSON", response("not-json"), "INVALID_RESPONSE"],
    ["不可重试状态", response(null, 400), "UPSTREAM_REJECTED"],
  ])("把%s转换为不含上游正文的稳定错误", async (_name, upstream, code) => {
    const fetchImpl = vi.fn().mockResolvedValue(upstream);

    const promise = callDeepSeekJson(request(), { fetchImpl });
    await expect(promise).rejects.toMatchObject({ code });
    await expect(promise).rejects.not.toThrow(/敏感错误正文|test-secret/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("调用方取消时中止尚未完成的上游请求", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const pending = callDeepSeekJson(
      { ...request(), signal: controller.signal },
      { fetchImpl },
    );

    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
