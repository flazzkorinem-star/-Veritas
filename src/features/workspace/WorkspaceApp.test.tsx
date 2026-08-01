import Dexie from "dexie";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceApp } from "@/features/workspace/WorkspaceApp";
import { createVeritasDatabase, type VeritasDatabase } from "@/storage/database";
import { createTaskRepository } from "@/storage/task-repository";
import type { StoredTask } from "@/storage/types";

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

afterEach(async () => {
  databases.splice(0).forEach((database) => database.close());
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe("主工作区", () => {
  it("无任务时显示上传入口并禁用回答输入", async () => {
    const { repository } = setup();

    render(<WorkspaceApp repository={repository} />);

    expect(await screen.findByRole("heading", { name: "从一份材料开始" })).toBeVisible();
    expect(screen.getByLabelText("回答输入")).toBeDisabled();
    expect(screen.getAllByText("上传学习材料").length).toBeGreaterThan(0);
    expect(screen.getByText("还没有学习主题")).toBeVisible();
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
});
