import { describe, expect, it } from "vitest";

import { createNodeSession, diagnosticReducer } from "./reducer";
import { getMaterialProgress, getTaskDiagnosticStatus } from "./selectors";

function completeNode(nodeId: string) {
  let state = createNodeSession(nodeId);
  for (let count = 0; count < 4; count += 1) {
    state = diagnosticReducer(state, {
      type: "START_STAGE",
      question: `问题 ${count + 1}`,
    });
    state = diagnosticReducer(state, { type: "REVEAL_ANSWER" });
  }
  return state;
}

describe("诊断任务派生状态", () => {
  it("没有主题或尚未开始时保持准备状态", () => {
    expect(getTaskDiagnosticStatus([])).toBe("READY");
    expect(getTaskDiagnosticStatus([createNodeSession("node-1")])).toBe("READY");
  });

  it("任一主题开始后进入进行中", () => {
    const active = diagnosticReducer(createNodeSession("node-1"), {
      type: "START_STAGE",
      question: "问题",
    });

    expect(getTaskDiagnosticStatus([active, createNodeSession("node-2")])).toBe(
      "IN_PROGRESS",
    );
  });

  it("所有主题完成后才完成任务", () => {
    expect(
      getTaskDiagnosticStatus([completeNode("node-1"), createNodeSession("node-2")]),
    ).toBe("IN_PROGRESS");
    expect(
      getTaskDiagnosticStatus([completeNode("node-1"), completeNode("node-2")]),
    ).toBe("COMPLETED");
  });

  it("材料进度只计算已完成主题数，不计算平均分", () => {
    expect(
      getMaterialProgress([completeNode("node-1"), createNodeSession("node-2")]),
    ).toEqual({ completedNodes: 1, totalNodes: 2 });
  });
});
