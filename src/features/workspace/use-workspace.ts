"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AgentClientError } from "@/features/materials/agent-client";
import { MaterialFileError } from "@/features/materials/material-file";
import { MaterialParseError } from "@/features/materials/parsed-material";
import {
  processTextMaterial,
  TextProcessingError,
  type MaterialProcessingProgress,
} from "@/features/materials/process-text-material";
import { MaterialReadError } from "@/features/materials/text-reader";
import { LocalStoreError, type createTaskRepository } from "@/storage/task-repository";
import type { DeletedTaskSnapshot, StoredTask } from "@/storage/types";

export type TaskRepository = ReturnType<typeof createTaskRepository>;
export type TextMaterialProcessor = typeof processTextMaterial;
type TaskLearningData = Awaited<ReturnType<TaskRepository["getTaskLearningData"]>>;

function errorMessage(error: unknown) {
  return error instanceof LocalStoreError
    ? error.message
    : "本地任务暂时无法更新，请重试。";
}

function processingErrorMessage(error: unknown) {
  return error instanceof MaterialReadError ||
    error instanceof MaterialFileError ||
    error instanceof MaterialParseError ||
    error instanceof AgentClientError ||
    error instanceof TextProcessingError
    ? error.message
    : "暂时无法处理这份材料，请重试。";
}

export function useWorkspace(
  repository: TaskRepository,
  processor: TextMaterialProcessor = processTextMaterial,
) {
  const [tasks, setTasks] = useState<StoredTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [learningData, setLearningData] = useState<TaskLearningData | null>(null);
  const [processingProgress, setProcessingProgress] =
    useState<MaterialProcessingProgress | null>(null);
  const [processingTaskId, setProcessingTaskId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [deletedSnapshot, setDeletedSnapshot] = useState<DeletedTaskSnapshot | null>(
    null,
  );
  const processingController = useRef<AbortController | null>(null);

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
    let mounted = true;
    if (!activeTaskId) return;
    void repository
      .getTaskLearningData(activeTaskId)
      .then((data) => mounted && setLearningData(data))
      .catch((reason: unknown) => mounted && setError(errorMessage(reason)));
    return () => {
      mounted = false;
    };
  }, [activeTaskId, repository]);

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

  async function runProcessing(task: StoredTask, file: File) {
    const controller = new AbortController();
    processingController.current = controller;
    setProcessingTaskId(task.id);
    setProcessingProgress({ stage: "READING", loadedBytes: 0, totalBytes: file.size });
    try {
      const result = await processor(file, setProcessingProgress, {
        signal: controller.signal,
      });
      await repository.completeTextProcessing(
        task.id,
        result.parsedText,
        result.knowledgeMap,
        result.firstQuestion,
      );
    } catch (reason) {
      await repository.failTaskProcessing(task.id, processingErrorMessage(reason));
    } finally {
      await reloadTasks();
      setLearningData(await repository.getTaskLearningData(task.id));
      setProcessingProgress(null);
      setProcessingTaskId(null);
      setIsImporting(false);
      if (processingController.current === controller) {
        processingController.current = null;
      }
    }
  }

  function cancelProcessing() {
    processingController.current?.abort();
  }

  async function importMaterial(file: File) {
    if (isImporting) return;
    setIsImporting(true);
    setError(null);
    try {
      const task = await repository.createProcessingTask(file);
      setWorkspaceCollapsed(false);
      setActiveTaskId(task.id);
      await reloadTasks();
      await runProcessing(task, file);
    } catch (reason) {
      setError(errorMessage(reason));
      setIsImporting(false);
    }
  }

  async function retryProcessing(taskId: string) {
    if (isImporting) return;
    setIsImporting(true);
    setError(null);
    try {
      const data = await repository.getTaskLearningData(taskId);
      if (!data.material) throw new LocalStoreError("NOT_FOUND", "找不到原始材料。");
      const task = await repository.restartTaskProcessing(taskId);
      await reloadTasks();
      const file = new File([data.material.originalFile], data.material.fileName, {
        type: data.material.mimeType,
      });
      await runProcessing(task, file);
    } catch (reason) {
      setError(errorMessage(reason));
      setIsImporting(false);
    }
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
      if (!nextActiveId) setLearningData(null);
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
    learningData: learningData?.task.id === activeTaskId ? learningData : null,
    processingProgress: processingTaskId === activeTaskId ? processingProgress : null,
    isImporting,
    workspaceCollapsed,
    search,
    isLoading,
    error,
    deletedSnapshot,
    setSearch,
    importMaterial,
    retryProcessing,
    cancelProcessing,
    selectTask,
    renameTask,
    setTaskPinned,
    deleteTask,
    undoDelete,
    toggleWorkspace,
  };
}
