"use client";

import { useEffect, useMemo, useState } from "react";

import { LocalStoreError, type createTaskRepository } from "@/storage/task-repository";
import type { DeletedTaskSnapshot, StoredTask } from "@/storage/types";

export type TaskRepository = ReturnType<typeof createTaskRepository>;

function errorMessage(error: unknown) {
  return error instanceof LocalStoreError
    ? error.message
    : "本地任务暂时无法更新，请重试。";
}

export function useWorkspace(repository: TaskRepository) {
  const [tasks, setTasks] = useState<StoredTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletedSnapshot, setDeletedSnapshot] = useState<DeletedTaskSnapshot | null>(
    null,
  );

  useEffect(() => {
    let mounted = true;
    void Promise.all([repository.listTasks(), repository.getWorkspaceState()])
      .then(async ([storedTasks, workspaceState]) => {
        if (!mounted) return;
        const restoredId = storedTasks.some(
          (task) => task.id === workspaceState.activeTaskId,
        )
          ? workspaceState.activeTaskId
          : (storedTasks[0]?.id ?? null);
        setTasks(storedTasks);
        setActiveTaskId(restoredId);
        setWorkspaceCollapsed(workspaceState.workspaceCollapsed);
        if (restoredId !== workspaceState.activeTaskId) {
          await repository.saveWorkspaceState({
            ...workspaceState,
            activeTaskId: restoredId,
            updatedAt: new Date().toISOString(),
          });
        }
      })
      .catch((reason: unknown) => mounted && setError(errorMessage(reason)))
      .finally(() => mounted && setIsLoading(false));
    return () => {
      mounted = false;
    };
  }, [repository]);

  useEffect(() => {
    if (!deletedSnapshot) return;
    const timeout = window.setTimeout(() => setDeletedSnapshot(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [deletedSnapshot]);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("zh-CN");
    return query
      ? tasks.filter((task) =>
          `${task.title}\n${task.fileName}`.toLocaleLowerCase("zh-CN").includes(query),
        )
      : tasks;
  }, [search, tasks]);

  async function reloadTasks() {
    setTasks(await repository.listTasks());
  }

  async function selectTask(taskId: string) {
    setActiveTaskId(taskId);
    setError(null);
    try {
      await repository.saveWorkspaceState({
        id: "workspace",
        activeTaskId: taskId,
        workspaceCollapsed,
        updatedAt: new Date().toISOString(),
      });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function renameTask(taskId: string, title: string) {
    setError(null);
    try {
      await repository.renameTask(taskId, title);
      await reloadTasks();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function setTaskPinned(taskId: string, isPinned: boolean) {
    setError(null);
    try {
      await repository.setTaskPinned(taskId, isPinned);
      await reloadTasks();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function deleteTask(taskId: string) {
    setError(null);
    try {
      const snapshot = await repository.deleteTask(taskId);
      const remaining = await repository.listTasks();
      const nextActiveId =
        activeTaskId === taskId ? (remaining[0]?.id ?? null) : activeTaskId;
      setTasks(remaining);
      setActiveTaskId(nextActiveId);
      setDeletedSnapshot(snapshot);
      await repository.saveWorkspaceState({
        id: "workspace",
        activeTaskId: nextActiveId,
        workspaceCollapsed,
        updatedAt: new Date().toISOString(),
      });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function undoDelete() {
    if (!deletedSnapshot) return;
    setError(null);
    try {
      await repository.restoreDeletedTask(deletedSnapshot);
      await reloadTasks();
      await selectTask(deletedSnapshot.task.id);
      setDeletedSnapshot(null);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function toggleWorkspace() {
    const collapsed = !workspaceCollapsed;
    setWorkspaceCollapsed(collapsed);
    try {
      await repository.saveWorkspaceState({
        id: "workspace",
        activeTaskId,
        workspaceCollapsed: collapsed,
        updatedAt: new Date().toISOString(),
      });
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return {
    tasks: visibleTasks,
    activeTask: tasks.find((task) => task.id === activeTaskId) ?? null,
    workspaceCollapsed,
    search,
    isLoading,
    error,
    deletedSnapshot,
    setSearch,
    selectTask,
    renameTask,
    setTaskPinned,
    deleteTask,
    undoDelete,
    toggleWorkspace,
  };
}
