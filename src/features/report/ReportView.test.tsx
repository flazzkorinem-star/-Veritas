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
          ANALYSIS: "PASSED",
        },
        understood: [{ statement: "能指出太阳能。", evidenceQuote: "太阳能驱动蒸发。" }],
        blindSpots: ["应用时依赖了完整答案。"],
        evidenceQuotes: ["太阳能驱动蒸发。"],
        scaffoldNotes: [],
        learnedOrCorrected: [],
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
    expect(screen.getByText("依赖答案", { exact: false })).toBeVisible();
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
    hostile.document.nodes[0]!.evidenceQuotes = ["<script>alert(1)</script>"];
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
});
