import Dexie from "dexie";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DiagnosticAgentCall } from "@/features/diagnostic/diagnostic-turn";
import type { SpeechRecognitionLike } from "@/features/speech/use-speech-input";
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
  it("通过浏览器语音识别把中文转写写入草稿，停止后仍可编辑", async () => {
    const name = `veritas-speech-ui-${crypto.randomUUID()}`;
    names.push(name);
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    const recognition: SpeechRecognitionLike = {
      lang: "",
      continuous: true,
      interimResults: false,
      maxAlternatives: 2,
      onstart: null,
      onresult: null,
      onerror: null,
      onend: null,
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
    };
    render(
      <WorkspaceApp
        processor={async () => result()}
        repository={repository}
        speechRecognitionFactory={() => recognition}
      />,
    );
    await screen.findByRole("heading", { name: "从一份材料开始" });
    fireEvent.change(document.querySelector<HTMLInputElement>("#workspace-upload")!, {
      target: {
        files: [new File(["材料"], "water-cycle.md", { type: "text/markdown" })],
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "开始语音输入" })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "开始语音输入" }));
    expect(recognition).toMatchObject({
      lang: "zh-CN",
      continuous: false,
      interimResults: true,
    });
    act(() => recognition.onstart?.());
    expect(screen.getByRole("button", { name: "停止语音输入" })).toBeVisible();
    act(() =>
      recognition.onresult?.({
        results: {
          0: { 0: { transcript: "太阳能驱动水蒸发" }, isFinal: true },
          length: 1,
        },
      }),
    );
    expect(screen.getByLabelText("回答输入")).toHaveValue("太阳能驱动水蒸发");

    fireEvent.click(screen.getByRole("button", { name: "停止语音输入" }));
    expect(recognition.stop).toHaveBeenCalledOnce();
    act(() => recognition.onend?.());
    const input = screen.getByLabelText("回答输入");
    fireEvent.change(input, { target: { value: "太阳能驱动水蒸发并进入大气" } });
    expect(input).toHaveValue("太阳能驱动水蒸发并进入大气");
    expect(screen.getByRole("button", { name: "发送回答" })).toBeEnabled();
    database.close();
  });

  it("完成主题后后台生成报告，并开放查看与任务分享入口", async () => {
    const name = `veritas-report-ui-${crypto.randomUUID()}`;
    names.push(name);
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    const diagnosticAgent = vi.fn(async (request: { operation: string }) => {
      if (request.operation === "EVALUATE_ANSWER") {
        return {
          classification: "CORRECT",
          isCorrect: true,
          progress: "ADVANCING",
          correctEvidence: ["回答包含关键概念"],
          missingPoints: [],
          misconceptions: [],
          teachingMove: "AFFIRM_AND_ADVANCE",
          scaffold: null,
          assistantMessage: "这一步已经说清楚了。",
        };
      }
      return { question: "请继续用一个新情境说明这个机制。" };
    });
    const reportAgent = vi.fn(
      async (
        request: Parameters<
          NonNullable<React.ComponentProps<typeof WorkspaceApp>["reportAgent"]>
        >[0],
      ) => {
        const node = request.input.completedNodes[0]!;
        return {
          summary: "已经能解释水循环的主要动力。",
          nodeInsights: [
            {
              nodeId: node.nodeId,
              understood: [
                {
                  statement: "能指出太阳能是主要动力。",
                  userMessageId: node.userMessages[0]!.id,
                },
              ],
              blindSpots: [],
              userEvidenceMessageIds: [node.userMessages[0]!.id],
              scaffoldNotes: [],
              learnedOrCorrected: [],
              nextSteps: ["换一个天气情境独立解释。"],
              sourceReferenceIndexes: [0],
            },
          ],
        };
      },
    );
    render(
      <WorkspaceApp
        diagnosticAgent={diagnosticAgent as DiagnosticAgentCall}
        processor={async () => result()}
        reportAgent={reportAgent}
        repository={repository}
      />,
    );
    await screen.findByRole("heading", { name: "从一份材料开始" });
    fireEvent.change(document.querySelector<HTMLInputElement>("#workspace-upload")!, {
      target: {
        files: [new File(["材料"], "water-cycle.md", { type: "text/markdown" })],
      },
    });

    for (let index = 1; index <= 4; index += 1) {
      await waitFor(() => expect(screen.getByLabelText("回答输入")).toBeEnabled());
      const input = screen.getByLabelText("回答输入");
      fireEvent.change(input, { target: { value: `第 ${index} 层回答太阳能` } });
      fireEvent.click(screen.getByRole("button", { name: "发送回答" }));
      await waitFor(() =>
        expect(
          screen.getByText(String(index * 25), { selector: ".score-line strong" }),
        ).toBeVisible(),
      );
    }

    const reportButton = await screen.findByRole("button", { name: "查看学习报告" });
    await waitFor(() => expect(reportButton).toBeEnabled());
    fireEvent.click(reportButton);
    expect(screen.getByRole("dialog", { name: "学习诊断报告" })).toBeVisible();
    expect(screen.getByText("已经能解释水循环的主要动力。")).toBeVisible();
    expect(reportAgent).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "关闭报告" }));
    fireEvent.click(screen.getByRole("button", { name: "打开“water-cycle”的任务菜单" }));
    expect(screen.getByRole("menuitem", { name: "分享" })).toBeEnabled();
    database.close();
  });

  it("长对话离开底部时提供回到最新消息入口", async () => {
    const name = `veritas-scroll-ui-${crypto.randomUUID()}`;
    names.push(name);
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    render(<WorkspaceApp processor={async () => result()} repository={repository} />);
    await screen.findByRole("heading", { name: "从一份材料开始" });
    fireEvent.change(document.querySelector<HTMLInputElement>("#workspace-upload")!, {
      target: {
        files: [new File(["材料"], "water-cycle.md", { type: "text/markdown" })],
      },
    });
    const thread = await screen
      .findByLabelText("维塔的消息")
      .then((message) => message.closest<HTMLElement>(".chat-thread"));
    expect(thread).not.toBeNull();
    Object.defineProperties(thread!, {
      scrollHeight: { configurable: true, value: 1_000 },
      clientHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    fireEvent.scroll(thread!);

    fireEvent.click(await screen.findByRole("button", { name: "回到最新消息" }));
    expect(thread!.scrollTop).toBe(1_000);
    database.close();
  });

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
    await waitFor(() => expect(screen.getByLabelText("回答输入")).toBeEnabled());
    const input = screen.getByLabelText("回答输入");
    fireEvent.change(input, { target: { value: "第一个主题的草稿" } });
    await waitFor(() => expect(input).toHaveValue("第一个主题的草稿"));

    fireEvent.click(screen.getByRole("button", { name: /降水回流/ }));
    expect(await screen.findByText("降水怎样回到地表？")).toBeVisible();
    const secondInput = screen.getByLabelText("回答输入");
    fireEvent.change(secondInput, { target: { value: "第二个主题的草稿" } });
    await waitFor(() => expect(secondInput).toHaveValue("第二个主题的草稿"));

    fireEvent.click(screen.getByRole("button", { name: /循环动力/ }));
    await waitFor(() =>
      expect(screen.getByLabelText("回答输入")).toHaveValue("第一个主题的草稿"),
    );
    expect(screen.getByText("水循环的主要动力是什么？", { exact: false })).toBeVisible();
    expect(agent).toHaveBeenCalledTimes(1);
    database.close();
  });

  it("发送中显示本轮内容，失败后保留草稿并可原地重试", async () => {
    const name = `veritas-retry-ui-${crypto.randomUUID()}`;
    names.push(name);
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    let rejectFirst!: (reason: unknown) => void;
    const firstAttempt = new Promise((_, reject) => {
      rejectFirst = reject;
    });
    const agent = vi
      .fn()
      .mockReturnValueOnce(firstAttempt)
      .mockResolvedValueOnce({
        classification: "CORRECT",
        isCorrect: true,
        progress: "ADVANCING",
        correctEvidence: ["说出太阳能"],
        missingPoints: [],
        misconceptions: [],
        teachingMove: "AFFIRM_AND_ADVANCE",
        scaffold: null,
        assistantMessage: "对，太阳能是关键动力。",
      })
      .mockResolvedValueOnce({ question: "太阳能怎样推动蒸发？" });
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
    await waitFor(() => expect(screen.getByLabelText("回答输入")).toBeEnabled());
    const input = screen.getByLabelText("回答输入");
    fireEvent.change(input, { target: { value: "主要动力是太阳能。" } });
    fireEvent.click(screen.getByRole("button", { name: "发送回答" }));

    expect(await screen.findByText("维塔正在组织反馈…")).toBeVisible();
    expect(screen.getByLabelText("我的消息")).toHaveTextContent("主要动力是太阳能。");
    expect(screen.getByRole("button", { name: "停止生成" })).toBeVisible();
    await waitFor(() => expect(agent).toHaveBeenCalledTimes(1));
    rejectFirst(new Error("模拟网络失败"));

    expect(await screen.findByRole("button", { name: "重试本轮" })).toBeVisible();
    expect(input).toHaveValue("主要动力是太阳能。");
    fireEvent.click(screen.getByRole("button", { name: "重试本轮" }));

    expect(await screen.findByText("对，太阳能是关键动力。")).toBeVisible();
    expect(screen.getByText("太阳能怎样推动蒸发？")).toBeVisible();
    expect(input).toHaveValue("");
    expect(agent).toHaveBeenCalledTimes(3);
    database.close();
  });

  it("停止生成会取消当前请求并保留可编辑草稿", async () => {
    const name = `veritas-cancel-ui-${crypto.randomUUID()}`;
    names.push(name);
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    const agent: DiagnosticAgentCall = (_request, dependencies) =>
      new Promise((_, reject) => {
        if (dependencies.signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        dependencies.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    render(
      <WorkspaceApp
        diagnosticAgent={agent}
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
    await waitFor(() => expect(screen.getByLabelText("回答输入")).toBeEnabled());
    const input = screen.getByLabelText("回答输入");
    fireEvent.change(input, { target: { value: "稍后继续修改的回答" } });
    fireEvent.click(screen.getByRole("button", { name: "发送回答" }));
    fireEvent.click(await screen.findByRole("button", { name: "停止生成" }));

    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue("稍后继续修改的回答");
    expect(screen.queryByRole("button", { name: "重试本轮" })).toBeNull();
    database.close();
  });
});
