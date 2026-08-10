"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AgentClientError } from "@/features/materials/agent-client";
import {
  createTopicOpening,
  requestHint as runHintTurn,
  respondToUser,
  revealStageAnswer,
  type DiagnosticAgentCall,
} from "@/features/diagnostic/diagnostic-turn";
import { MaterialFileError } from "@/features/materials/material-file";
import { MaterialParseError } from "@/features/materials/parsed-material";
import {
  processTextMaterial,
  TextProcessingError,
  type MaterialProcessingProgress,
} from "@/features/materials/process-text-material";
import {
  generateTaskReport,
  type ReportAgentCall,
} from "@/features/report/generate-report";
import { MaterialReadError } from "@/features/materials/text-reader";
import { LocalStoreError, type createTaskRepository } from "@/storage/task-repository";
import type { DeletedTaskSnapshot, StoredTask } from "@/storage/types";

export type TaskRepository = ReturnType<typeof createTaskRepository>;
export type TextMaterialProcessor = typeof processTextMaterial;
type TaskLearningData = Awaited<ReturnType<TaskRepository["getTaskLearningData"]>>;
type DiagnosticAction =
  { kind: "MESSAGE"; userMessage: string } | { kind: "HINT" } | { kind: "REVEAL" };

const INTERRUPTED_PROCESSING_MESSAGE = "上次处理被中断，请重新处理。";

function errorMessage(error: unknown) {
  return error instanceof LocalStoreError
    ? error.message
    : "本地任务暂时无法更新，请重试。";
}

function processingStageLabel(progress: MaterialProcessingProgress) {
  switch (progress.stage) {
    case "READING":
      return "读取文件";
    case "PARSING":
      return "解析材料";
    case "OCR":
      return "识别图片文字";
    case "EXTRACTING":
      return "整理材料内容";
    case "AUDITING":
      return "核对整份材料";
    case "PREPARING_CONTEXT":
      return "准备第一个主题";
  }
}

function processingErrorMessage(
  error: unknown,
  progress: MaterialProcessingProgress,
  wasCancelled: boolean,
) {
  if (wasCancelled) return "已取消处理这份材料。";
  const message =
    error instanceof MaterialReadError ||
    error instanceof MaterialFileError ||
    error instanceof MaterialParseError ||
    error instanceof AgentClientError ||
    error instanceof TextProcessingError
      ? error.message
      : "暂时无法处理这份材料，请重试。";
  return `${processingStageLabel(progress)}时失败：${message}`;
}

export function useWorkspace(
  repository: TaskRepository,
  processor: TextMaterialProcessor = processTextMaterial,
  diagnosticAgent?: DiagnosticAgentCall,
  reportAgent?: ReportAgentCall,
) {
  const [tasks, setTasks] = useState<StoredTask[]>([]);
  const [reportTaskIds, setReportTaskIds] = useState<string[]>([]);
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
  const [isResponding, setIsResponding] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [failedReportTaskId, setFailedReportTaskId] = useState<string | null>(null);
  const [pendingDiagnosticAction, setPendingDiagnosticAction] =
    useState<DiagnosticAction | null>(null);
  const [failedDiagnosticAction, setFailedDiagnosticAction] =
    useState<DiagnosticAction | null>(null);
  const [deletedSnapshot, setDeletedSnapshot] = useState<DeletedTaskSnapshot | null>(
    null,
  );
  const processingController = useRef<AbortController | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  const responding = useRef(false);
  const draftWrite = useRef<Promise<void>>(Promise.resolve());
  const reportWrite = useRef<Promise<void>>(Promise.resolve());

  function activateTask(taskId: string | null) {
    activeTaskIdRef.current = taskId;
    setActiveTaskId(taskId);
  }

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      repository.listTasks(),
      repository.getWorkspaceState(),
      repository.listReportTaskIds(),
    ])
      .then(async ([loadedTasks, workspaceState, storedReportTaskIds]) => {
        if (!mounted) return;
        const interruptedTasks = loadedTasks.filter(
          (task) => task.status === "PROCESSING",
        );
        if (interruptedTasks.length > 0) {
          await Promise.all(
            interruptedTasks.map((task) =>
              repository.failTaskProcessing(task.id, INTERRUPTED_PROCESSING_MESSAGE),
            ),
          );
        }
        if (!mounted) return;
        const storedTasks =
          interruptedTasks.length > 0 ? await repository.listTasks() : loadedTasks;
        if (!mounted) return;
        const restoredId = storedTasks.some(
          (task) => task.id === workspaceState.activeTaskId,
        )
          ? workspaceState.activeTaskId
          : (storedTasks[0]?.id ?? null);
        setTasks(storedTasks);
        setReportTaskIds(storedReportTaskIds);
        activateTask(restoredId);
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
      .then((data) => {
        if (!mounted) return;
        setLearningData(data);
        if (data.reportCorrupted) {
          setFailedReportTaskId(activeTaskId);
          setError("本地学习报告已损坏，核心任务仍可继续。请重试报告生成。");
        }
      })
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
    const [storedTasks, storedReportTaskIds] = await Promise.all([
      repository.listTasks(),
      repository.listReportTaskIds(),
    ]);
    setTasks(storedTasks);
    setReportTaskIds(storedReportTaskIds);
  }

  async function updateReport(taskId: string) {
    setIsGeneratingReport(true);
    setFailedReportTaskId(null);
    try {
      await generateTaskReport(taskId, repository, reportAgent);
      await reloadTasks();
      if (activeTaskId === taskId) {
        setLearningData(await repository.getTaskLearningData(taskId));
      }
    } catch {
      setFailedReportTaskId(taskId);
      setError("这个主题已经保存，但学习报告暂时没有更新。请重试报告生成。");
    } finally {
      setIsGeneratingReport(false);
    }
  }

  function queueReportUpdate(taskId: string) {
    reportWrite.current = reportWrite.current.then(() => updateReport(taskId));
  }

  async function runProcessing(task: StoredTask, file: File) {
    const controller = new AbortController();
    let latestProgress: MaterialProcessingProgress = {
      stage: "READING",
      loadedBytes: 0,
      totalBytes: file.size,
    };
    const updateProgress = (progress: MaterialProcessingProgress) => {
      latestProgress = progress;
      setProcessingProgress(progress);
    };
    processingController.current = controller;
    setProcessingTaskId(task.id);
    setProcessingProgress(latestProgress);
    try {
      const result = await processor(file, updateProgress, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        throw new MaterialFileError("CANCELLED", "已取消处理这份材料。 ");
      }
      await repository.completeTextProcessing(
        task.id,
        result.parsedText,
        result.knowledgeMap,
        result.topicOpening,
      );
    } catch (reason) {
      await repository.failTaskProcessing(
        task.id,
        processingErrorMessage(reason, latestProgress, controller.signal.aborted),
      );
    } finally {
      await reloadTasks();
      if (activeTaskIdRef.current === task.id) {
        setLearningData(await repository.getTaskLearningData(task.id));
      }
      setProcessingProgress(null);
      setProcessingTaskId(null);
      setIsImporting(false);
      if (processingController.current === controller) {
        processingController.current = null;
      }
    }
  }

  function cancelProcessing(taskId: string) {
    if (processingTaskId !== taskId) return;
    processingController.current?.abort();
  }

  async function importMaterial(file: File) {
    if (isImporting) return;
    setIsImporting(true);
    setError(null);
    try {
      const task = await repository.createProcessingTask(file);
      setWorkspaceCollapsed(false);
      activateTask(task.id);
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
    activateTask(taskId);
    setFailedDiagnosticAction(null);
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
      activateTask(nextActiveId);
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

  function currentDiagnosticContext(controller: AbortController) {
    const task = learningData?.task;
    const material = learningData?.material;
    const storedSession = learningData?.session;
    const node = material?.nodes.find(
      (candidate) => candidate.id === task?.currentNodeId,
    );
    if (!task || !material || !storedSession || !node) {
      throw new LocalStoreError("NOT_FOUND", "当前学习主题尚未准备好。");
    }
    const itemIds = new Set(node.knowledgeItemIds);
    return {
      task,
      node,
      knowledgeItems: material.knowledgeItems.filter((item) => itemIds.has(item.id)),
      materialContext: {
        title: material.fileName,
        modules: material.modules,
        knowledgeItems: material.knowledgeItems,
        nodes: material.nodes,
      },
      learningGoal: task.learningGoal ?? null,
      session: storedSession.session,
      recentMessages: learningData.messages
        .slice(-12)
        .map(({ role, content }) => ({ role, content })),
      signal: controller.signal,
    };
  }

  async function runDiagnosticAction(action: DiagnosticAction) {
    if (responding.current) return;
    const controller = new AbortController();
    responding.current = true;
    if (action.kind === "MESSAGE") saveDraft("");
    setIsResponding(true);
    setPendingDiagnosticAction(action);
    setFailedDiagnosticAction(null);
    setError(null);
    try {
      await draftWrite.current;
      const context = currentDiagnosticContext(controller);
      const result =
        action.kind === "MESSAGE"
          ? diagnosticAgent
            ? await respondToUser(
                { ...context, userMessage: action.userMessage },
                diagnosticAgent,
              )
            : await respondToUser({
                ...context,
                userMessage: action.userMessage,
              })
          : action.kind === "HINT"
            ? diagnosticAgent
              ? await runHintTurn(context, diagnosticAgent)
              : await runHintTurn(context)
            : diagnosticAgent
              ? await revealStageAnswer(context, diagnosticAgent)
              : await revealStageAnswer(context);
      await repository.saveConversationTurn({
        taskId: context.task.id,
        nodeId: context.node.id,
        session: result.session,
        userMessage: action.kind === "MESSAGE" ? action.userMessage : undefined,
        assistantMessages: result.assistantMessages,
        scaffold: result.scaffold,
        learningGoalUpdate: result.learningGoalUpdate,
      });
      await reloadTasks();
      setLearningData(await repository.getTaskLearningData(context.task.id));
      if (
        context.session.status !== "COMPLETED" &&
        result.session.status === "COMPLETED"
      ) {
        queueReportUpdate(context.task.id);
      }
    } catch (reason) {
      if (action.kind === "MESSAGE") saveDraft(action.userMessage);
      if (!controller.signal.aborted) {
        setFailedDiagnosticAction(action);
        setError(
          reason instanceof AgentClientError || reason instanceof LocalStoreError
            ? reason.message
            : "暂时无法继续这个回合，请重试。",
        );
      }
    } finally {
      responding.current = false;
      setPendingDiagnosticAction(null);
      setIsResponding(false);
    }
  }

  async function sendMessage(content: string) {
    const message = content.trim();
    if (!message) return;
    await runDiagnosticAction({ kind: "MESSAGE", userMessage: message });
  }

  async function requestHint() {
    await runDiagnosticAction({ kind: "HINT" });
  }

  async function revealAnswer() {
    await runDiagnosticAction({ kind: "REVEAL" });
  }

  async function retryDiagnosticTurn() {
    if (failedDiagnosticAction) await runDiagnosticAction(failedDiagnosticAction);
  }

  async function retryReport() {
    if (failedReportTaskId) queueReportUpdate(failedReportTaskId);
  }

  async function selectNode(nodeId: string) {
    if (responding.current) return;
    if (!learningData?.material || !learningData.task) return;
    const node = learningData.material.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    setFailedDiagnosticAction(null);
    setError(null);
    try {
      await draftWrite.current;
      const existing = learningData.sessions.some((stored) => stored.nodeId === nodeId);
      let question: string | undefined;
      if (!existing) {
        const itemIds = new Set(node.knowledgeItemIds);
        const input = {
          node,
          knowledgeItems: learningData.material.knowledgeItems.filter((item) =>
            itemIds.has(item.id),
          ),
          materialContext: {
            title: learningData.material.fileName,
            modules: learningData.material.modules,
            knowledgeItems: learningData.material.knowledgeItems,
            nodes: learningData.material.nodes,
          },
          learningGoal: learningData.task.learningGoal ?? null,
        };
        const output = diagnosticAgent
          ? await createTopicOpening(input, diagnosticAgent)
          : await createTopicOpening(input);
        question = output.assistantMessage;
      }
      await repository.openNode(learningData.task.id, nodeId, question);
      await reloadTasks();
      setLearningData(await repository.getTaskLearningData(learningData.task.id));
    } catch (reason) {
      setError(
        reason instanceof AgentClientError || reason instanceof LocalStoreError
          ? reason.message
          : "暂时无法打开这个主题，请重试。",
      );
    }
  }

  function saveDraft(content: string) {
    const taskId = learningData?.task.id;
    const nodeId = learningData?.task.currentNodeId;
    if (!taskId || !nodeId) return;
    setLearningData((current) =>
      current && current.task.id === taskId
        ? {
            ...current,
            draft: { taskId, nodeId, content, updatedAt: new Date().toISOString() },
          }
        : current,
    );
    draftWrite.current = draftWrite.current
      .then(() => repository.saveDraft(taskId, nodeId, content))
      .catch((reason: unknown) => setError(errorMessage(reason)));
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
    reportTaskIds,
    activeTask: tasks.find((task) => task.id === activeTaskId) ?? null,
    learningData: learningData?.task.id === activeTaskId ? learningData : null,
    processingProgress: processingTaskId === activeTaskId ? processingProgress : null,
    canCancelProcessing: processingTaskId === activeTaskId,
    isImporting,
    isResponding,
    isGeneratingReport,
    pendingUserMessage:
      pendingDiagnosticAction?.kind === "MESSAGE"
        ? pendingDiagnosticAction.userMessage
        : null,
    canRetryDiagnosticTurn: failedDiagnosticAction !== null,
    canRetryReport: failedReportTaskId !== null,
    workspaceCollapsed,
    search,
    isLoading,
    error,
    deletedSnapshot,
    setSearch,
    importMaterial,
    retryProcessing,
    cancelProcessing,
    sendMessage,
    requestHint,
    revealAnswer,
    retryDiagnosticTurn,
    retryReport,
    selectNode,
    saveDraft,
    selectTask,
    renameTask,
    setTaskPinned,
    deleteTask,
    undoDelete,
    toggleWorkspace,
    getReport: repository.getReport,
  };
}
