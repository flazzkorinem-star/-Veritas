"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AgentClientError } from "@/features/materials/agent-client";
import {
  createInitialStageQuestion,
  requestHint as runHintTurn,
  revealStageAnswer,
  submitDiagnosticAnswer,
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
  { kind: "ANSWER"; userMessage: string } | { kind: "HINT" } | { kind: "REVEAL" };

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
  const diagnosticController = useRef<AbortController | null>(null);
  const responding = useRef(false);
  const draftWrite = useRef<Promise<void>>(Promise.resolve());
  const reportWrite = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      repository.listTasks(),
      repository.getWorkspaceState(),
      repository.listReportTaskIds(),
    ])
      .then(async ([storedTasks, workspaceState, storedReportTaskIds]) => {
        if (!mounted) return;
        const restoredId = storedTasks.some(
          (task) => task.id === workspaceState.activeTaskId,
        )
          ? workspaceState.activeTaskId
          : (storedTasks[0]?.id ?? null);
        setTasks(storedTasks);
        setReportTaskIds(storedReportTaskIds);
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

  function cancelDiagnosticTurn() {
    diagnosticController.current?.abort();
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
    diagnosticController.current = controller;
    setIsResponding(true);
    setPendingDiagnosticAction(action);
    setFailedDiagnosticAction(null);
    setError(null);
    try {
      await draftWrite.current;
      const context = currentDiagnosticContext(controller);
      const result =
        action.kind === "ANSWER"
          ? diagnosticAgent
            ? await submitDiagnosticAnswer(
                { ...context, userAnswer: action.userMessage },
                diagnosticAgent,
              )
            : await submitDiagnosticAnswer({
                ...context,
                userAnswer: action.userMessage,
              })
          : action.kind === "HINT"
            ? diagnosticAgent
              ? await runHintTurn(context, diagnosticAgent)
              : await runHintTurn(context)
            : diagnosticAgent
              ? await revealStageAnswer(context, diagnosticAgent)
              : await revealStageAnswer(context);
      await repository.saveDiagnosticTurn({
        taskId: context.task.id,
        nodeId: context.node.id,
        session: result.session,
        userMessage: action.kind === "ANSWER" ? action.userMessage : undefined,
        assistantMessages: result.assistantMessages,
        scaffold: result.scaffold,
      });
      if (action.kind === "ANSWER") {
        await repository.saveDraft(context.task.id, context.node.id, "");
      }
      await reloadTasks();
      setLearningData(await repository.getTaskLearningData(context.task.id));
      if (
        context.session.status !== "COMPLETED" &&
        result.session.status === "COMPLETED"
      ) {
        queueReportUpdate(context.task.id);
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        setFailedDiagnosticAction(action);
        setError(
          reason instanceof AgentClientError || reason instanceof LocalStoreError
            ? reason.message
            : "暂时无法继续这个回合，请重试。",
        );
      }
    } finally {
      if (diagnosticController.current === controller) {
        diagnosticController.current = null;
      }
      responding.current = false;
      setPendingDiagnosticAction(null);
      setIsResponding(false);
    }
  }

  async function sendAnswer(content: string) {
    const answer = content.trim();
    if (!answer) return;
    await runDiagnosticAction({ kind: "ANSWER", userMessage: answer });
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
        };
        const output = diagnosticAgent
          ? await createInitialStageQuestion(input, diagnosticAgent)
          : await createInitialStageQuestion(input);
        question = output.question;
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
    isImporting,
    isResponding,
    isGeneratingReport,
    pendingUserMessage:
      pendingDiagnosticAction?.kind === "ANSWER"
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
    cancelDiagnosticTurn,
    sendAnswer,
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
