import Dexie from "dexie";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MaterialFileError } from "@/features/materials/material-file";
import { WorkspaceApp } from "@/features/workspace/WorkspaceApp";
import { createVeritasDatabase, type VeritasDatabase } from "@/storage/database";
import { createTaskRepository } from "@/storage/task-repository";
import type { StoredTask } from "@/storage/types";
import type { TextMaterialProcessor } from "./use-workspace";

const databaseNames: string[] = [];
const databases: VeritasDatabase[] = [];

function setup() {
  const name = `veritas-ui-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const database = createVeritasDatabase(name);
  databases.push(database);
  return { database, repository: createTaskRepository(database) };
}

function task(overrides: Partial<StoredTask> = {}): StoredTask {
  return {
    id: crypto.randomUUID(),
    title: "水循环诊断",
    fileName: "water-cycle.md",
    materialId: crypto.randomUUID(),
    status: "READY",
    currentNodeId: null,
    isPinned: false,
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
    ...overrides,
  };
}

function processingResult() {
  const source = { label: "第 1 段", excerpt: "太阳驱动蒸发。" };
  return {
    parsedText: "# 水循环\n\n太阳驱动蒸发。",
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
  databases.splice(0).forEach((database) => database.close());
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe("主工作区", () => {
  it("移动浮层支持遮罩、Escape 和浏览器返回关闭", async () => {
    const { repository } = setup();
    render(<WorkspaceApp repository={repository} />);
    await screen.findByRole("heading", { name: "从一份材料开始" });

    fireEvent.click(screen.getByRole("button", { name: "打开任务" }));
    expect(screen.getByLabelText("任务工作区")).toHaveAttribute(
      "data-mobile-open",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭当前浮层" }));
    await waitFor(() =>
      expect(screen.getByLabelText("任务工作区")).toHaveAttribute(
        "data-mobile-open",
        "false",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "打开主题" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByLabelText("学习主题")).toHaveAttribute(
      "data-mobile-open",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "打开进度" }));
    fireEvent.popState(window);
    expect(screen.getByLabelText("诊断进度")).toHaveAttribute(
      "data-mobile-open",
      "false",
    );
  });

  it("无任务时只显示学习材料入口，不展示无效输入和零进度", async () => {
    const { repository } = setup();

    render(<WorkspaceApp repository={repository} />);

    expect(await screen.findByRole("heading", { name: "从一份材料开始" })).toBeVisible();
    expect(screen.queryByLabelText("消息输入")).toBeNull();
    expect(screen.queryByText("0 / 0")).toBeNull();
    expect(screen.getAllByText("上传学习材料").length).toBeGreaterThan(0);
    expect(screen.getByText("上传材料后显示主题")).toBeVisible();
    expect(
      screen.queryByText("材料文字会发送给 DeepSeek；原始文件只保存在本机"),
    ).toBeNull();
  });

  it("本地任务恢复期间仍可选择新的学习材料", async () => {
    const { repository } = setup();
    let finishLoading!: (tasks: StoredTask[]) => void;
    const delayedRepository = {
      ...repository,
      listTasks: vi.fn(
        () => new Promise<StoredTask[]>((resolve) => (finishLoading = resolve)),
      ),
    };

    render(<WorkspaceApp repository={delayedRepository} />);

    expect(
      document.querySelector<HTMLInputElement>("#workspace-upload"),
    ).not.toBeDisabled();
    finishLoading([]);
    await waitFor(() =>
      expect(document.querySelector(".veritas-shell")).toHaveAttribute(
        "aria-busy",
        "false",
      ),
    );
  });

  it("搜索标题和文件名，并在切换后恢复当前任务", async () => {
    const { repository } = setup();
    const water = task();
    const rain = task({
      title: "城市降雨",
      fileName: "urban-rain.txt",
      updatedAt: "2026-08-02T08:00:00.000Z",
    });
    await repository.saveTask(water);
    await repository.saveTask(rain);
    const view = render(<WorkspaceApp repository={repository} />);
    await screen.findByRole("heading", { name: "城市降雨" });

    fireEvent.change(screen.getByLabelText("搜索任务"), {
      target: { value: "water-cycle" },
    });
    expect(await screen.findByText("水循环诊断")).toBeVisible();
    expect(screen.queryByText("城市降雨", { selector: ".task-title" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "打开任务 水循环诊断" }));
    await screen.findByRole("heading", { name: "水循环诊断" });
    view.unmount();

    render(<WorkspaceApp repository={repository} />);
    expect(await screen.findByRole("heading", { name: "水循环诊断" })).toBeVisible();
  });

  it("支持重命名、置顶、删除确认和短时撤销", async () => {
    const { repository } = setup();
    await repository.saveTask(task());
    render(<WorkspaceApp repository={repository} />);
    await screen.findByRole("heading", { name: "水循环诊断" });

    fireEvent.click(screen.getByRole("button", { name: "打开“水循环诊断”的任务菜单" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
    fireEvent.change(screen.getByLabelText("任务名称"), {
      target: { value: "水循环复习" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));
    expect(await screen.findByRole("heading", { name: "水循环复习" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "打开“水循环复习”的任务菜单" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "置顶" }));
    await waitFor(() => expect(screen.getByLabelText("已置顶")).toBeVisible());

    fireEvent.click(screen.getByRole("button", { name: "打开“水循环复习”的任务菜单" }));
    expect(screen.getByRole("menuitem", { name: "取消置顶" })).toBeVisible();
    fireEvent.click(screen.getByRole("menuitem", { name: "删除" }));
    expect(screen.getByRole("dialog", { name: "删除任务" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    expect(await screen.findByRole("heading", { name: "从一份材料开始" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "撤销删除" }));
    expect(await screen.findByRole("heading", { name: "水循环复习" })).toBeVisible();
  });

  it("上传文本后显示完整主题入口、材料判断和首个问题", async () => {
    const { repository } = setup();
    const processor: TextMaterialProcessor = async (_file, onProgress) => {
      onProgress({ stage: "AUDITING", startedAt: Date.now() });
      return processingResult();
    };
    render(<WorkspaceApp processor={processor} repository={repository} />);
    await screen.findByRole("heading", { name: "从一份材料开始" });

    fireEvent.change(document.querySelector<HTMLInputElement>("#workspace-upload")!, {
      target: {
        files: [
          new File(["# 水循环\n\n太阳驱动蒸发。"], "water-cycle.md", {
            type: "text/markdown",
          }),
        ],
      },
    });

    await expectLatestVitaMessage(
      "这份材料真正值得抓的是循环动力。",
      "水循环最基本的动力来源是什么？",
    );
    expect(screen.getByText("自然水循环")).toBeVisible();
    expect(screen.getAllByText("循环动力").length).toBeGreaterThan(0);
    expect(screen.getAllByText("学习中").length).toBeGreaterThan(0);
  });

  it("材料处理失败时保留任务并显示重试入口", async () => {
    const { repository } = setup();
    const processor: TextMaterialProcessor = async (_file, onProgress) => {
      onProgress({ stage: "AUDITING", startedAt: Date.now() });
      throw new Error("上游原始敏感错误");
    };
    render(<WorkspaceApp processor={processor} repository={repository} />);
    await screen.findByRole("heading", { name: "从一份材料开始" });

    fireEvent.change(document.querySelector<HTMLInputElement>("#workspace-upload")!, {
      target: {
        files: [new File(["材料"], "notes.txt", { type: "text/plain" })],
      },
    });

    expect(await screen.findByText("这份材料暂时没能准备好")).toBeVisible();
    expect(
      screen.getByText("核对整份材料时失败：暂时无法处理这份材料，请重试。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "重新处理" })).toBeVisible();
    expect(screen.queryByLabelText("消息输入")).toBeNull();
    expect(screen.queryByRole("button", { name: "发送消息" })).toBeNull();
    expect(screen.queryByText("上游原始敏感错误")).toBeNull();
    await expect(repository.listTasks()).resolves.toEqual([
      expect.objectContaining({ status: "FAILED", fileName: "notes.txt" }),
    ]);
  });

  it("刷新后把失去执行上下文的处理中任务转成可重试状态", async () => {
    const { repository } = setup();
    await repository.createProcessingTask(
      new File(["材料"], "interrupted.txt", { type: "text/plain" }),
    );

    render(<WorkspaceApp repository={repository} />);

    expect(await screen.findByText("这份材料暂时没能准备好")).toBeVisible();
    expect(screen.getByText("上次处理被中断，请重新处理。")).toBeVisible();
    expect(screen.getByText("重新处理后显示主题")).toBeVisible();
    expect(screen.getByRole("button", { name: "重新处理" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "取消处理" })).toBeNull();
    await expect(repository.listTasks()).resolves.toEqual([
      expect.objectContaining({
        fileName: "interrupted.txt",
        status: "FAILED",
        failureReason: "上次处理被中断，请重新处理。",
      }),
    ]);
  });

  it("解析期间可取消，并保留可重试的失败任务", async () => {
    const { repository } = setup();
    const processor: TextMaterialProcessor = async (_file, onProgress, dependencies) => {
      onProgress({ stage: "OCR", current: 0, total: 1, label: "识别图片文字" });
      return new Promise((_, reject) => {
        dependencies?.signal?.addEventListener(
          "abort",
          () => reject(new MaterialFileError("CANCELLED", "已取消处理这份材料。 ")),
          { once: true },
        );
      });
    };
    render(<WorkspaceApp processor={processor} repository={repository} />);
    await screen.findByRole("heading", { name: "从一份材料开始" });

    fireEvent.change(document.querySelector<HTMLInputElement>("#workspace-upload")!, {
      target: {
        files: [new File(["image"], "notes.png", { type: "image/png" })],
      },
    });
    expect(await screen.findByText("识别图片文字", { exact: true })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "取消处理" }));

    expect(await screen.findByText("这份材料暂时没能准备好")).toBeVisible();
    expect(screen.getByText("已取消处理这份材料。")).toBeVisible();
    await waitFor(async () =>
      expect(await repository.listTasks()).toEqual([
        expect.objectContaining({
          status: "FAILED",
          fileName: "notes.png",
          failureReason: "已取消处理这份材料。",
        }),
      ]),
    );
  });

  it("后台材料处理结束时不覆盖用户已经切换到的任务", async () => {
    const { repository } = setup();
    const existing = await repository.createProcessingTask(
      new File(["旧材料"], "existing.md", { type: "text/markdown" }),
    );
    const existingResult = processingResult();
    await repository.completeTextProcessing(
      existing.id,
      existingResult.parsedText,
      existingResult.knowledgeMap,
      existingResult.firstQuestion,
    );
    let finishProcessing!: (result: ReturnType<typeof processingResult>) => void;
    const processor: TextMaterialProcessor = async (_file, onProgress) => {
      onProgress({ stage: "AUDITING", startedAt: Date.now() });
      return new Promise((resolve) => {
        finishProcessing = resolve;
      });
    };

    render(<WorkspaceApp processor={processor} repository={repository} />);
    await expectLatestVitaMessage(
      "这份材料真正值得抓的是循环动力。",
      "水循环最基本的动力来源是什么？",
    );
    fireEvent.change(document.querySelector<HTMLInputElement>("#workspace-upload")!, {
      target: {
        files: [new File(["新材料"], "new.md", { type: "text/markdown" })],
      },
    });
    await screen.findByText("正在核对整份材料");

    fireEvent.click(screen.getByRole("button", { name: `打开任务 ${existing.title}` }));
    await expectLatestVitaMessage(
      "这份材料真正值得抓的是循环动力。",
      "水循环最基本的动力来源是什么？",
    );
    finishProcessing(processingResult());

    await waitFor(async () =>
      expect(await repository.listTasks()).toContainEqual(
        expect.objectContaining({ fileName: "new.md", status: "IN_PROGRESS" }),
      ),
    );
    await waitFor(() =>
      expect(
        document.querySelector<HTMLInputElement>("#workspace-upload"),
      ).not.toBeDisabled(),
    );
    await expectLatestVitaMessage(
      "这份材料真正值得抓的是循环动力。",
      "水循环最基本的动力来源是什么？",
    );
  });
});
