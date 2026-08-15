import { beforeEach, describe, expect, it } from "vitest";

import {
  acquireAgentRequest,
  agentRequestCategory,
  resetAgentRequestGuardForTests,
} from "./request-guard";

describe("Agent 请求保护", () => {
  beforeEach(resetAgentRequestGuardForTests);

  it("允许四路材料编译，同时为实时对话保留两个槽位", () => {
    const releases = ["a", "b", "c", "d"].map((id) =>
      acquireAgentRequest(`client-${id}`, "MATERIAL", 1_000),
    );

    expect(() => acquireAgentRequest("client-e", "MATERIAL", 1_000)).toThrow(
      expect.objectContaining({ code: "CONCURRENCY_LIMITED" }),
    );
    const releaseRealtimeOne = acquireAgentRequest("client-live-1", "REALTIME", 1_000);
    const releaseRealtimeTwo = acquireAgentRequest("client-live-2", "REALTIME", 1_000);
    expect(() => acquireAgentRequest("client-live-3", "REALTIME", 1_000)).toThrow(
      expect.objectContaining({ code: "CONCURRENCY_LIMITED" }),
    );

    releases.forEach((release) => release());
    releaseRealtimeOne();
    releaseRealtimeTwo();
  });

  it("报告与材料共享四个后台槽位，不能挤占实时保留容量", () => {
    const releases = ["a", "b", "c"].map((id) =>
      acquireAgentRequest(`client-${id}`, "MATERIAL", 1_000),
    );
    const releaseReport = acquireAgentRequest("client-report", "BACKGROUND", 1_000);

    expect(() => acquireAgentRequest("client-d", "MATERIAL", 1_000)).toThrow(
      expect.objectContaining({ code: "CONCURRENCY_LIMITED" }),
    );
    expect(() => acquireAgentRequest("client-report-2", "BACKGROUND", 1_000)).toThrow(
      expect.objectContaining({ code: "CONCURRENCY_LIMITED" }),
    );
    expect(() => acquireAgentRequest("client-live", "REALTIME", 1_000)).not.toThrow();

    releases.forEach((release) => release());
    releaseReport();
  });

  it("根据固定操作分类，不接受客户端自报优先级", () => {
    expect(agentRequestCategory({ operation: "EXTRACT_COMPACT_KNOWLEDGE" })).toBe(
      "MATERIAL",
    );
    expect(agentRequestCategory({ operation: "COMPILE_KNOWLEDGE_MAP" })).toBe("MATERIAL");
    expect(agentRequestCategory({ operation: "CREATE_REPORT" })).toBe("BACKGROUND");
    expect(agentRequestCategory({ operation: "RESPOND_TO_USER", priority: "LOW" })).toBe(
      "REALTIME",
    );
  });

  it("单客户端一分钟内最多提交三十次，并在窗口后恢复", () => {
    for (let index = 0; index < 30; index += 1) {
      acquireAgentRequest("client-a", "REALTIME", 1_000 + index)();
    }

    expect(() => acquireAgentRequest("client-a", "REALTIME", 1_500)).toThrow(
      expect.objectContaining({ code: "RATE_LIMITED" }),
    );
    expect(() => acquireAgentRequest("client-a", "REALTIME", 61_029)).not.toThrow();
  });

  it("大材料编译不消耗用户的实时对话限额", () => {
    for (let index = 0; index < 40; index += 1) {
      acquireAgentRequest("client-a", "MATERIAL", 1_000 + index)();
    }

    expect(() => acquireAgentRequest("client-a", "REALTIME", 1_500)).not.toThrow();
  });

  it("单客户端一分钟内最多提交一百二十次材料编译请求", () => {
    for (let index = 0; index < 120; index += 1) {
      acquireAgentRequest("client-a", "MATERIAL", 1_000 + index)();
    }

    expect(() => acquireAgentRequest("client-a", "MATERIAL", 1_500)).toThrow(
      expect.objectContaining({ code: "RATE_LIMITED" }),
    );
  });
});
