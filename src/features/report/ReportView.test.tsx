import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StoredReport } from "@/storage/types";

import { ReportView } from "./ReportView";

const report: StoredReport = {
  id: "report-1",
  taskId: "11111111-1111-4111-8111-111111111111",
  markdown: "# 水循环报告",
  completedNodeIds: ["node-1"],
  createdAt: "2026-08-02T08:00:00.000Z",
  updatedAt: "2026-08-02T08:00:00.000Z",
  document: {
    taskId: "11111111-1111-4111-8111-111111111111",
    materialTitle: "water.md",
    generatedAt: "2026-08-02T08:00:00.000Z",
    progress: { completed: 1, total: 2 },
    coverage: {
      diagnosed: ["循环动力"],
      undiagnosed: ["降水回流"],
      supporting: [],
      referenceOnly: [],
    },
    summary: "已经理解主要动力。",
    nodes: [
      {
        nodeId: "node-1",
        title: "循环动力",
        score: 75,
        stages: {
          MEMORY: "PASSED",
          UNDERSTANDING: "PASSED_WITH_HINT",
          APPLICATION: "PASSED_WITH_ANSWER",
          ANALYSIS: "PASSED_WITH_ANSWER",
        },
        understood: [{ statement: "能指出太阳能。", evidenceQuote: "太阳能驱动蒸发。" }],
        blindSpots: ["应用时依赖了完整答案。"],
        learningEvidence: [
          {
            stage: "MEMORY",
            category: "INDEPENDENT",
            statement: "能指出太阳能。",
            evidenceQuote: "太阳能驱动蒸发。",
          },
          {
            stage: "UNDERSTANDING",
            category: "AFTER_HINT",
            statement: "提示后能解释原因。",
            evidenceQuote: "太阳能为蒸发提供能量。",
          },
          {
            stage: "APPLICATION",
            category: "AFTER_TEACHING_VERIFIED",
            statement: "讲解后通过了小验证。",
            evidenceQuote: "阴天仍然会蒸发。",
          },
          {
            stage: "ANALYSIS",
            category: "EXPLAINED_NOT_VERIFIED",
            statement: "看过分析答案，但没有验证。",
            evidenceQuote: null,
          },
        ],
        misconceptions: [
          { description: "仍把风当作唯一动力。", evidenceQuote: "只有风才会让水循环。" },
        ],
        scaffoldNotes: [],
        nextSteps: ["独立完成新情境应用。"],
        sourceReferences: [{ label: "第 1 段", excerpt: "太阳驱动蒸发。" }],
      },
    ],
  },
};

describe("报告全屏页面", () => {
  it("渲染确定性进度、层级状态、原话和来源，不解析模型 HTML", () => {
    render(
      <ReportView
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onPrint={vi.fn()}
        onShare={vi.fn()}
        report={report}
      />,
    );

    expect(screen.getByRole("dialog", { name: "学习诊断报告" })).toBeVisible();
    expect(screen.getByText("1 / 2 个主题")).toBeVisible();
    expect(screen.getByText("太阳能驱动蒸发。")).toBeVisible();
    expect(screen.getByText("第 1 段")).toBeVisible();
    expect(screen.getAllByText("讲解后经过验证学会", { exact: false })).not.toHaveLength(
      0,
    );
    expect(screen.getAllByText("看过答案但未验证", { exact: false })).not.toHaveLength(0);
    expect(screen.getByText("仍把风当作唯一动力。", { exact: false })).toBeVisible();
    expect(document.querySelector("script")).toBeNull();
  });

  it("提供关闭、下载、打印和分享动作", () => {
    const actions = {
      onClose: vi.fn(),
      onDownload: vi.fn(),
      onPrint: vi.fn(),
      onShare: vi.fn(),
    };
    render(<ReportView {...actions} report={report} />);
    fireEvent.click(screen.getByRole("button", { name: "关闭报告" }));
    fireEvent.click(screen.getByRole("button", { name: "下载 Markdown" }));
    fireEvent.click(screen.getByRole("button", { name: "打印或保存 PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "分享报告" }));
    expect(actions.onClose).toHaveBeenCalledOnce();
    expect(actions.onDownload).toHaveBeenCalledOnce();
    expect(actions.onPrint).toHaveBeenCalledOnce();
    expect(actions.onShare).toHaveBeenCalledOnce();
  });

  it("把不可信报告文本作为纯文本渲染", () => {
    const hostile = structuredClone(report);
    hostile.document.summary = "<img src=x onerror=alert(1)>";
    hostile.document.nodes[0]!.learningEvidence[0]!.evidenceQuote =
      "<script>alert(1)</script>";
    render(
      <ReportView
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onPrint={vi.fn()}
        onShare={vi.fn()}
        report={hostile}
      />,
    );

    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
    expect(screen.getByText("<script>alert(1)</script>")).toBeVisible();
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  it("仍能显示旧报告的派生证据字段", () => {
    const legacy = structuredClone(report);
    legacy.document.nodes[0]!.learningEvidence = [];
    legacy.document.nodes[0]!.misconceptions = [];

    render(
      <ReportView
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onPrint={vi.fn()}
        onShare={vi.fn()}
        report={legacy}
      />,
    );

    expect(screen.getByText("能指出太阳能。")).toBeVisible();
    expect(screen.getByText("应用时依赖了完整答案。")).toBeVisible();
  });
});
