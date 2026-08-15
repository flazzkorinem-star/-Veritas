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
      opening: "这份材料真正值得抓的是循环动力。",
      question: "水循环最基本的动力来源是什么？",
    },
  };
}

async function expectLatestVitaMessage(...parts: string[]) {
  await waitFor(() => {
    const latestMessage = screen.getAllByLabelText("维塔的消息").at(-1);
    expect(latestMessage).toBeDefined();
    for (const part of parts) expect(latestMessage).toHaveTextContent(part);
  });
}

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe("工作区诊断交互", () => {
  it("上传后保留首问和提示答案入口，普通对话完整回应且不推进四层", async () => {
    const name = `veritas-conversation-ui-${crypto.randomUUID()}`;
    names.push(name);
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    const agent = vi.fn().mockResolvedValue({
      responseMode: "CONVERSATION",
      learningGoalUpdate: "先理解水循环的整体机制",
      assistantMessage: "水循环可以先抓两股力量：太阳能让水进入大气，重力让水回到低处。",
    });
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

    const input = await screen.findByLabelText("消息输入");
    await waitFor(() => expect(input).toBeEnabled());
    expect(screen.getByRole("button", { name: "给我提示" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "看答案" })).toBeEnabled();
    fireEvent.change(input, { target: { value: "先解释整体机制，不要考我。" } });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(
      await screen.findByText(
        "水循环可以先抓两股力量：太阳能让水进入大气，重力让水回到低处。",
      ),
    ).toBeVisible();
    expect(screen.getByText("0", { selector: ".score-line strong" })).toBeVisible();
    const learning = await repository.getTaskLearningData(
      (await repository.listTasks())[0]!.id,
    );
    expect(learning.session?.session.stages.MEMORY).toMatchObject({
      status: "ACTIVE",
      mainQuestion: "水循环最基本的动力来源是什么？",
    });
    expect(learning.task.learningGoal).toBe("先理解水循环的整体机制");
    database.close();
  });

  it("连续三轮无法作答后页面与持久化状态一起进入答案通过", async () => {
    const name = `veritas-no-answer-ui-${crypto.randomUUID()}`;
    names.push(name);
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    const noAnswer = (assistantMessage: string) => ({
      responseMode: "EVALUATE_DIAGNOSTIC" as const,
      learningGoalUpdate: null,
      classification: "NO_ANSWER" as const,
      isCorrect: false,
      progress: "STALLED" as const,
      correctEvidence: [],
      missingPoints: ["没有提供可评价的回答内容"],
      misconceptions: [],
      teachingMove: "PROVIDE_SCAFFOLD" as const,
      scaffold: { type: "EXAMPLE" as const, reason: "帮助用户开始思考" },
      assistantMessage,
    });
    const agent = vi
      .fn()
      .mockResolvedValueOnce(noAnswer("先想想晒湿衣服时，水去了哪里。"))
      .mockResolvedValueOnce(noAnswer("把过程拆成获得能量和离开水面两步。"))
      .mockResolvedValueOnce(noAnswer("你仍然没有可评价的回答，我们直接讲清这题。"))
      .mockResolvedValueOnce({
        assistantMessage: "完整答案是太阳能给水分子提供能量，推动水蒸发。",
      })
      .mockResolvedValueOnce({ question: "太阳能怎样推动水蒸发？" });
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

    const input = await screen.findByLabelText("消息输入");
    await waitFor(() => expect(input).toBeEnabled());
    const taskId = (await repository.listTasks())[0]!.id;
    const messages = ["我真的不知道。", "还是完全没思路。", "这题我确实答不上来。"];

    for (const [index, message] of messages.entries()) {
      fireEvent.change(input, { target: { value: message } });
      fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
      await waitFor(() => expect(input).toBeEnabled());
      const learning = await repository.getTaskLearningData(taskId);
      if (index < 2) {
        expect(learning.session?.session.stages.MEMORY).toMatchObject({
          status: "ACTIVE",
          mainQuestion: "水循环最基本的动力来源是什么？",
          stalledCount: index + 1,
        });
      }
    }

    expect(
      await screen.findByText("完整答案是太阳能给水分子提供能量，推动水蒸发。"),
    ).toBeVisible();
    expect(await screen.findByText("太阳能怎样推动水蒸发？")).toBeVisible();
    expect(screen.getByText("0", { selector: ".score-line strong" })).toBeVisible();
    const learning = await repository.getTaskLearningData(taskId);
    expect(learning.session?.session).toMatchObject({
      status: "IN_PROGRESS",
      currentStage: "UNDERSTANDING",
      stages: {
        MEMORY: { status: "PASSED_WITH_ANSWER", stalledCount: 0 },
        UNDERSTANDING: {
          status: "ACTIVE",
          mainQuestion: "太阳能怎样推动水蒸发？",
          stalledCount: 0,
        },
        APPLICATION: { status: "LOCKED", stalledCount: 0 },
        ANALYSIS: { status: "LOCKED", stalledCount: 0 },
      },
    });
    expect(learning.session?.scaffoldEvents).toHaveLength(3);
    expect(agent.mock.calls.map(([request]) => request.operation)).toEqual([
      "RESPOND_TO_USER",
      "RESPOND_TO_USER",
      "RESPOND_TO_USER",
      "CREATE_STAGE_ANSWER",
      "CREATE_STAGE_QUESTION",
    ]);
    database.close();
  });

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
    await waitFor(
      () => expect(screen.getByRole("button", { name: "开始语音输入" })).toBeEnabled(),
      { timeout: 5_000 },
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
    expect(screen.getByLabelText("消息输入")).toHaveValue("太阳能驱动水蒸发");

    fireEvent.click(screen.getByRole("button", { name: "停止语音输入" }));
    expect(recognition.stop).toHaveBeenCalledOnce();
    act(() => recognition.onend?.());
    const input = screen.getByLabelText("消息输入");
    fireEvent.change(input, { target: { value: "太阳能驱动水蒸发并进入大气" } });
    expect(input).toHaveValue("太阳能驱动水蒸发并进入大气");
    expect(screen.getByRole("button", { name: "发送消息" })).toBeEnabled();
    database.close();
  });

  it("完成主题后后台生成报告，并开放查看与任务分享入口", async () => {
    const name = `veritas-report-ui-${crypto.randomUUID()}`;
    names.push(name);
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    const diagnosticAgent = vi.fn(
      async (request: {
        operation: string;
        input?: { diagnostic?: { status: string } };
      }) => {
        if (
          request.operation === "RESPOND_TO_USER" &&
          request.input?.diagnostic?.status === "NOT_STARTED"
        ) {
          return {
            responseMode: "START_DIAGNOSTIC",
            learningGoalUpdate: "检验自己是否真正理解水循环",
            assistantMessage: "可以，先从最基础但有意义的一层开始。",
            question: "水循环的主要动力是什么？",
          };
        }
        if (request.operation === "RESPOND_TO_USER") {
          return {
            responseMode: "EVALUATE_DIAGNOSTIC",
            learningGoalUpdate: null,
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
        if (request.operation === "CREATE_FIRST_QUESTION") {
          return {
            opening: "这个主题真正值得抓的是降水回流。",
            question: "降水主要通过什么作用回到地表？",
          };
        }
        return { question: "请继续用一个新情境说明这个机制。" };
      },
    );
    const reportAgent = vi.fn(
      async (
        request: Parameters<
          NonNullable<React.ComponentProps<typeof WorkspaceApp>["reportAgent"]>
        >[0],
      ) => {
        const node = request.input.completedNodes[0]!;
        const evidenceMessage = node.messages.find(
          (message) => message.role === "USER" && message.content.includes("层回答"),
        )!;
        return {
          summary: "已经能解释水循环的主要动力。",
          nodeInsights: [
            {
              nodeId: node.nodeId,
              understood: [
                {
                  statement: "能指出太阳能是主要动力。",
                  userMessageId: evidenceMessage.id,
                },
              ],
              blindSpots: [],
              userEvidenceMessageIds: [evidenceMessage.id],
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

    const startInput = await screen.findByLabelText("消息输入");
    await waitFor(() => expect(startInput).toBeEnabled());
    await expectLatestVitaMessage(
      "这份材料真正值得抓的是循环动力。",
      "水循环最基本的动力来源是什么？",
    );

    for (let index = 1; index <= 4; index += 1) {
      await waitFor(() => expect(screen.getByLabelText("消息输入")).toBeEnabled());
      const input = screen.getByLabelText("消息输入");
      fireEvent.change(input, { target: { value: `第 ${index} 层回答太阳能` } });
      fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
      await waitFor(() =>
        expect(
          screen.getByText(String(index * 25), { selector: ".score-line strong" }),
        ).toBeVisible(),
      );
    }

    const reportButton = await screen.findByRole("button", { name: "查看学习报告" });
    await waitFor(() => expect(reportButton).toBeEnabled());
    expect(
      screen.getByRole("button", { name: "学习下一个主题：降水回流" }),
    ).toBeVisible();
    fireEvent.click(reportButton);
    expect(screen.getByRole("dialog", { name: "学习诊断报告" })).toBeVisible();
    expect(screen.getByText("已经能解释水循环的主要动力。")).toBeVisible();
    expect(reportAgent).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "关闭报告" }));
    fireEvent.click(screen.getByRole("button", { name: "打开“water-cycle”的任务菜单" }));
    expect(screen.getByRole("menuitem", { name: "分享" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "学习下一个主题：降水回流" }));
    await expectLatestVitaMessage(
      "这个主题真正值得抓的是降水回流。",
      "降水主要通过什么作用回到地表？",
    );
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

  it("进入诊断后可请求提示、回答问题并显示持久化分数", async () => {
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
        responseMode: "EVALUATE_DIAGNOSTIC",
        learningGoalUpdate: null,
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

    const startInput = await screen.findByLabelText("消息输入");
    await waitFor(() => expect(startInput).toBeEnabled());
    await expectLatestVitaMessage(
      "这份材料真正值得抓的是循环动力。",
      "水循环最基本的动力来源是什么？",
    );

    fireEvent.click(await screen.findByRole("button", { name: "给我提示" }));
    expect(await screen.findByText("先想一想蒸发需要的能量来自哪里。")).toBeVisible();
    expect(document.querySelector(".chat-heading .chat-brand-symbol")).toBeNull();
    expect(
      document.querySelector('.chat-heading-actions button[aria-label="主题"]'),
    ).toHaveClass("quiet-tool-button");
    expect(screen.getByRole("button", { name: "给我提示" })).toHaveClass(
      "quiet-tool-button",
    );
    expect(screen.getByRole("button", { name: "看答案" })).toHaveClass(
      "quiet-tool-button",
    );
    const vitaMessageCountBeforeAnswer = screen.getAllByLabelText("维塔的消息").length;

    const input = screen.getByLabelText("消息输入");
    fireEvent.change(input, { target: { value: "主要动力是太阳能。" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "发送消息" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(await screen.findByText("对，太阳能是水循环的关键动力。")).toBeVisible();
    expect(await screen.findByText("太阳能怎样推动水蒸发？")).toBeVisible();
    await waitFor(() =>
      expect(screen.getAllByLabelText("维塔的消息")).toHaveLength(
        vitaMessageCountBeforeAnswer + 2,
      ),
    );
    expect(
      screen
        .getAllByLabelText("维塔的消息")
        .slice(-2)
        .map((message) => message.textContent),
    ).toEqual(["对，太阳能是水循环的关键动力。", "太阳能怎样推动水蒸发？"]);
    expect(screen.getByText("25", { selector: ".score-line strong" })).toBeVisible();
    expect(input).toHaveValue("");
    expect(agent.mock.calls.map(([request]) => request.operation)).toEqual([
      "CREATE_HINT",
      "RESPOND_TO_USER",
      "CREATE_STAGE_QUESTION",
    ]);
    const taskId = (await repository.listTasks())[0]!.id;
    const learning = await repository.getTaskLearningData(taskId);
    const storedQuestion = learning.session?.session.stages.UNDERSTANDING.mainQuestion;
    expect(storedQuestion).toBe("太阳能怎样推动水蒸发？");
    expect(
      learning.messages
        .filter((message) => message.role === "ASSISTANT")
        .slice(-2)
        .map((message) => message.content),
    ).toEqual(["对，太阳能是水循环的关键动力。", storedQuestion]);
    database.close();
  });

  it("在输入框里自然请求提示或答案时复用现有按钮流程", async () => {
    const name = `veritas-semantic-actions-ui-${crypto.randomUUID()}`;
    names.push(name);
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    const agent = vi
      .fn()
      .mockResolvedValueOnce({ responseMode: "REQUEST_HINT" })
      .mockResolvedValueOnce({
        hintLevel: 1,
        assistantMessage: "先想想蒸发需要的能量从哪里来。",
      })
      .mockResolvedValueOnce({ responseMode: "REVEAL_ANSWER" })
      .mockResolvedValueOnce({
        assistantMessage: "太阳能为水分子提供能量，使液态水蒸发。",
      })
      .mockResolvedValueOnce({ question: "太阳能怎样推动水蒸发？" });
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

    const input = await screen.findByLabelText("消息输入");
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: "能不能给我一点方向，先别揭晓。" } });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
    expect(await screen.findByText("先想想蒸发需要的能量从哪里来。")).toBeVisible();

    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.change(input, { target: { value: "我还是不会，这次直接告诉我吧。" } });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));
    expect(
      await screen.findByText("太阳能为水分子提供能量，使液态水蒸发。"),
    ).toBeVisible();
    expect(await screen.findByText("太阳能怎样推动水蒸发？")).toBeVisible();
    expect(agent.mock.calls.map(([request]) => request.operation)).toEqual([
      "RESPOND_TO_USER",
      "CREATE_HINT",
      "RESPOND_TO_USER",
      "CREATE_STAGE_ANSWER",
      "CREATE_STAGE_QUESTION",
    ]);
    const learning = await repository.getTaskLearningData(
      (await repository.listTasks())[0]!.id,
    );
    expect(learning.session?.session.stages.MEMORY.status).toBe("PASSED_WITH_ANSWER");
    database.close();
  });

  it("Enter 发送消息，Shift+Enter 只保留当前草稿", async () => {
    const name = `veritas-enter-ui-${crypto.randomUUID()}`;
    names.push(name);
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    const agent = vi
      .fn()
      .mockResolvedValueOnce({
        responseMode: "EVALUATE_DIAGNOSTIC",
        learningGoalUpdate: null,
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
    const startInput = await screen.findByLabelText("消息输入");
    await waitFor(() => expect(startInput).toBeEnabled());
    await expectLatestVitaMessage(
      "这份材料真正值得抓的是循环动力。",
      "水循环最基本的动力来源是什么？",
    );

    await waitFor(() => expect(screen.getByLabelText("消息输入")).toBeEnabled());
    const input = screen.getByLabelText("消息输入");
    fireEvent.change(input, { target: { value: "主要动力是太阳能。" } });

    fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true });
    expect(agent).not.toHaveBeenCalled();
    expect(input).toHaveValue("主要动力是太阳能。");

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(await screen.findByText("对，太阳能是关键动力。")).toBeVisible();
    expect(input).toHaveValue("");
    database.close();
  });

  it("切换主题后恢复各自的问题和输入草稿", async () => {
    const name = `veritas-node-ui-${crypto.randomUUID()}`;
    names.push(name);
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    const agent = vi.fn().mockResolvedValue({
      opening: "这个主题真正值得抓的是降水回流。",
      question: "降水主要通过什么作用回到地表？",
    });
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
    await waitFor(() => expect(screen.getByLabelText("消息输入")).toBeEnabled());
    const input = screen.getByLabelText("消息输入");
    fireEvent.change(input, { target: { value: "第一个主题的草稿" } });
    await waitFor(() => expect(input).toHaveValue("第一个主题的草稿"));

    fireEvent.click(screen.getByRole("button", { name: /降水回流/ }));
    await expectLatestVitaMessage(
      "这个主题真正值得抓的是降水回流。",
      "降水主要通过什么作用回到地表？",
    );
    const secondInput = screen.getByLabelText("消息输入");
    fireEvent.change(secondInput, { target: { value: "第二个主题的草稿" } });
    await waitFor(() => expect(secondInput).toHaveValue("第二个主题的草稿"));

    fireEvent.click(screen.getByRole("button", { name: /循环动力/ }));
    await waitFor(() =>
      expect(screen.getByLabelText("消息输入")).toHaveValue("第一个主题的草稿"),
    );
    await expectLatestVitaMessage(
      "这份材料真正值得抓的是循环动力。",
      "水循环最基本的动力来源是什么？",
    );
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
        responseMode: "EVALUATE_DIAGNOSTIC",
        learningGoalUpdate: null,
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
    const startInput = await screen.findByLabelText("消息输入");
    await waitFor(() => expect(startInput).toBeEnabled());
    await expectLatestVitaMessage(
      "这份材料真正值得抓的是循环动力。",
      "水循环最基本的动力来源是什么？",
    );

    await waitFor(() => expect(screen.getByLabelText("消息输入")).toBeEnabled());
    const input = screen.getByLabelText("消息输入");
    fireEvent.change(input, { target: { value: "主要动力是太阳能。" } });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(await screen.findByText("维塔正在回复…")).toBeVisible();
    expect(document.querySelector(".chat-thread")).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByLabelText("我的消息").at(-1)).toHaveTextContent(
      "主要动力是太阳能。",
    );
    expect(input).toHaveValue("");
    expect(screen.queryByRole("button", { name: "先停一下" })).toBeNull();
    expect(screen.getByRole("button", { name: "给我提示" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "看答案" })).toBeDisabled();
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
});
