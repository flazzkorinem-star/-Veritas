import Dexie from "dexie";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DiagnosticAgentCall } from "@/features/diagnostic/diagnostic-turn";
import { createVeritasDatabase } from "@/storage/database";
import { createTaskRepository } from "@/storage/task-repository";

import { WorkspaceApp } from "./WorkspaceApp";
import type { TextMaterialProcessor } from "./use-workspace";

const names: string[] = [];

function result() {
  const source = { label: "第 1 段", excerpt: "太阳能驱动蒸发。" };
  return {
    parsedText: "太阳能驱动蒸发。",
    knowledgeMap: {
      modules: [{ id: "module-1", title: "自然水循环", sourceRange: "第 1 段" }],
      knowledgeItems: [
        {
          id: "item-1",
          moduleId: "module-1",
          title: "循环动力",
          summary: "太阳能驱动蒸发。",
          kind: "CORE" as const,
          diagnosticRationale: "基础机制",
          sourceReferences: [source],
          commonMisconceptions: [],
        },
      ],
      nodes: [
        {
          id: "node-1",
          moduleId: "module-1",
          title: "循环动力",
          objective: "解释循环动力。",
          knowledgeItemIds: ["item-1"],
          sourceReferences: [source],
          canonicalUnderstanding: "太阳能驱动蒸发。",
          commonMisconceptions: [],
          bloomTargets: {
            memory: "说出动力。",
            understanding: "解释作用。",
            application: "判断环节。",
            analysis: "分析关系。",
          },
          order: 1,
        },
        {
          id: "node-2",
          moduleId: "module-1",
          title: "降水回流",
          objective: "解释降水怎样回到地表。",
          knowledgeItemIds: ["item-1"],
          sourceReferences: [source],
          canonicalUnderstanding: "降水在重力作用下回到地表。",
          commonMisconceptions: [],
          bloomTargets: {
            memory: "说出回流环节。",
            understanding: "解释重力作用。",
            application: "判断回流路径。",
            analysis: "分析路径差异。",
          },
          order: 2,
        },
      ],
      coverageAssignments: [
        {
          knowledgeItemId: "item-1",
          disposition: "DIAGNOSED_IN_NODE" as const,
          nodeId: "node-1",
        },
      ],
    },
    firstQuestion: {
      opening: "先从循环的动力看。",
      question: "水循环的主要动力是什么？",
    },
  };
}

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe("工作区诊断交互", () => {
  it("请求提示、发送回答并显示持久化后的分数", async () => {
    const name = `veritas-diagnostic-ui-${crypto.randomUUID()}`;
    names.push(name);
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    const processor: TextMaterialProcessor = async () => result();
    const agent = vi
      .fn()
      .mockResolvedValueOnce({
        hintLevel: 1,
        assistantMessage: "先想一想蒸发需要的能量来自哪里。",
      })
      .mockResolvedValueOnce({
        classification: "CORRECT",
        isCorrect: true,
        progress: "ADVANCING",
        correctEvidence: ["说出太阳能"],
        missingPoints: [],
        misconceptions: [],
        teachingMove: "AFFIRM_AND_ADVANCE",
        scaffold: null,
        assistantMessage: "对，太阳能是水循环的关键动力。",
      })
      .mockResolvedValueOnce({ question: "太阳能怎样推动水蒸发？" });
    render(
      <WorkspaceApp
        diagnosticAgent={agent as DiagnosticAgentCall}
        processor={processor}
        repository={repository}
      />,
    );
    await screen.findByRole("heading", { name: "从一份材料开始" });
    fireEvent.change(document.querySelector<HTMLInputElement>("#workspace-upload")!, {
      target: {
        files: [new File(["材料"], "water-cycle.md", { type: "text/markdown" })],
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "给我提示" }));
    expect(await screen.findByText("先想一想蒸发需要的能量来自哪里。")).toBeVisible();

    const input = screen.getByLabelText("回答输入");
    fireEvent.change(input, { target: { value: "主要动力是太阳能。" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "发送回答" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "发送回答" }));

    expect(await screen.findByText("对，太阳能是水循环的关键动力。")).toBeVisible();
    expect(await screen.findByText("太阳能怎样推动水蒸发？")).toBeVisible();
    expect(screen.getByText("25", { selector: ".score-line strong" })).toBeVisible();
    expect(input).toHaveValue("");
    expect(agent.mock.calls.map(([request]) => request.operation)).toEqual([
      "CREATE_HINT",
      "EVALUATE_ANSWER",
      "CREATE_STAGE_QUESTION",
    ]);
    database.close();
  });

  it("切换主题后恢复各自的问题和输入草稿", async () => {
    const name = `veritas-node-ui-${crypto.randomUUID()}`;
    names.push(name);
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    const agent = vi.fn().mockResolvedValue({ question: "降水怎样回到地表？" });
    render(
      <WorkspaceApp
        diagnosticAgent={agent as DiagnosticAgentCall}
        processor={async () => result()}
        repository={repository}
      />,
    );
    await screen.findByRole("heading", { name: "从一份材料开始" });
    fireEvent.change(document.querySelector<HTMLInputElement>("#workspace-upload")!, {
      target: {
        files: [new File(["材料"], "water-cycle.md", { type: "text/markdown" })],
      },
    });
    const input = await screen.findByLabelText("回答输入");
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: "第一个主题的草稿" } });
    await waitFor(() => expect(input).toHaveValue("第一个主题的草稿"));

    fireEvent.click(screen.getByRole("button", { name: /降水回流/ }));
    expect(await screen.findByText("降水怎样回到地表？")).toBeVisible();
    fireEvent.change(input, { target: { value: "第二个主题的草稿" } });
    await waitFor(() => expect(input).toHaveValue("第二个主题的草稿"));

    fireEvent.click(screen.getByRole("button", { name: /循环动力/ }));
    await waitFor(() => expect(input).toHaveValue("第一个主题的草稿"));
    expect(screen.getByText("水循环的主要动力是什么？", { exact: false })).toBeVisible();
    expect(agent).toHaveBeenCalledTimes(1);
    database.close();
  });
});
