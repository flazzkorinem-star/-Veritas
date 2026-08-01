import { describe, expect, it, vi } from "vitest";

import { callDeepSeekJson } from "./client";

describe("DeepSeek 取消", () => {
  it("用户取消时立即停止且不重试", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const pending = callDeepSeekJson(
      {
        apiKey: "test-secret",
        system: "只输出 JSON。",
        user: "材料内容",
        thinking: false,
        maxTokens: 2_000,
        signal: controller.signal,
      },
      { fetchImpl, sleep },
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
