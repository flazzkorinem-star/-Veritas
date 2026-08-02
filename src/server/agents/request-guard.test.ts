import { beforeEach, describe, expect, it } from "vitest";

import { acquireAgentRequest, resetAgentRequestGuardForTests } from "./request-guard";

describe("Agent 请求保护", () => {
  beforeEach(resetAgentRequestGuardForTests);

  it("全局最多允许两个并发请求，释放后恢复容量", () => {
    const releaseFirst = acquireAgentRequest("client-a", 1_000);
    const releaseSecond = acquireAgentRequest("client-b", 1_000);

    expect(() => acquireAgentRequest("client-c", 1_000)).toThrow(
      expect.objectContaining({ code: "CONCURRENCY_LIMITED" }),
    );
    releaseFirst();
    releaseFirst();
    const releaseThird = acquireAgentRequest("client-c", 1_001);

    releaseSecond();
    releaseThird();
  });

  it("单客户端一分钟内最多提交三十次，并在窗口后恢复", () => {
    for (let index = 0; index < 30; index += 1) {
      acquireAgentRequest("client-a", 1_000 + index)();
    }

    expect(() => acquireAgentRequest("client-a", 1_500)).toThrow(
      expect.objectContaining({ code: "RATE_LIMITED" }),
    );
    expect(() => acquireAgentRequest("client-a", 61_029)).not.toThrow();
  });
});
