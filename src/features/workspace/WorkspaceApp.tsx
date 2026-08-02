"use client";

import { useEffect, useMemo, useState } from "react";

import { getVeritasDatabase } from "@/storage/database";
import { createTaskRepository } from "@/storage/task-repository";
import type { MobilePanel, StoredTask } from "@/storage/types";
import { Button } from "@/ui/Button";
import type { DiagnosticAgentCall } from "@/features/diagnostic/diagnostic-turn";
import type { ReportAgentCall } from "@/features/report/generate-report";
import { ReportView } from "@/features/report/ReportView";
import { downloadReport, shareReport } from "@/features/report/report-actions";
import type { SpeechRecognitionFactory } from "@/features/speech/use-speech-input";

import { LearningPanels } from "./LearningPanels";
import { DeleteDialog, RenameDialog } from "./TaskDialogs";
import {
  useWorkspace,
  type TaskRepository,
  type TextMaterialProcessor,
} from "./use-workspace";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

export function WorkspaceApp({
  repository,
  processor,
  diagnosticAgent,
  reportAgent,
  speechRecognitionFactory,
}: {
  repository?: TaskRepository;
  processor?: TextMaterialProcessor;
  diagnosticAgent?: DiagnosticAgentCall;
  reportAgent?: ReportAgentCall;
  speechRecognitionFactory?: SpeechRecognitionFactory;
}) {
  const defaultRepository = useMemo(
    () => repository ?? createTaskRepository(getVeritasDatabase()),
    [repository],
  );
  const workspace = useWorkspace(
    defaultRepository,
    processor,
    diagnosticAgent,
    reportAgent,
  );
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameTask, setRenameTask] = useState<StoredTask | null>(null);
  const [deleteTask, setDeleteTask] = useState<StoredTask | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  useEffect(() => {
    const close = () => {
      setMobilePanel(null);
      setReportOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        if (window.history.state?.veritasOverlay) window.history.back();
      }
    };
    window.addEventListener("popstate", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("popstate", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function openOverlay(panel: Exclude<MobilePanel, null> | "REPORT") {
    if (!mobilePanel && !reportOpen) {
      window.history.pushState({ ...window.history.state, veritasOverlay: true }, "");
    }
    setMobilePanel(panel === "REPORT" ? null : panel);
    setReportOpen(panel === "REPORT");
  }

  function closeOverlay() {
    setMobilePanel(null);
    setReportOpen(false);
    if (window.history.state?.veritasOverlay) window.history.back();
  }

  async function shareTaskReport(taskId: string) {
    const report = await workspace.getReport(taskId);
    if (!report) return;
    try {
      const result = await shareReport({
        title: report.document.materialTitle,
        summary: report.document.summary,
        markdown: report.markdown,
      });
      if (result === "COPIED") setShareNotice("报告摘要已复制");
    } catch {
      setShareNotice("当前浏览器暂时无法分享报告");
    }
  }

  function openRename(task: StoredTask) {
    setOpenMenuId(null);
    setRenameTask(task);
  }

  function openDelete(task: StoredTask) {
    setOpenMenuId(null);
    setDeleteTask(task);
  }

  return (
    <div
      aria-busy={workspace.isLoading}
      className="veritas-shell"
      data-workspace-collapsed={workspace.workspaceCollapsed}
    >
      <WorkspaceSidebar
        activeTaskId={workspace.activeTask?.id}
        collapsed={workspace.workspaceCollapsed}
        mobileOpen={mobilePanel === "TASKS"}
        onCloseMobile={closeOverlay}
        onDelete={openDelete}
        onPin={(task) => {
          setOpenMenuId(null);
          void workspace.setTaskPinned(task.id, !task.isPinned);
        }}
        onRename={openRename}
        onShare={(task) => {
          setOpenMenuId(null);
          void shareTaskReport(task.id);
        }}
        onSearch={workspace.setSearch}
        onSelect={(taskId) => {
          closeOverlay();
          void workspace.selectTask(taskId);
        }}
        onToggleCollapsed={() => void workspace.toggleWorkspace()}
        onToggleMenu={setOpenMenuId}
        onUpload={(file) => void workspace.importMaterial(file)}
        openMenuId={openMenuId}
        reportTaskIds={workspace.reportTaskIds}
        search={workspace.search}
        tasks={workspace.tasks}
        uploadDisabled={workspace.isImporting}
      />
      <LearningPanels
        key={`${workspace.activeTask?.id ?? "empty"}:${workspace.activeTask?.currentNodeId ?? "none"}`}
        activeTask={workspace.activeTask}
        learningData={workspace.learningData}
        mobilePanel={mobilePanel}
        onClosePanel={closeOverlay}
        onCancelProcessing={workspace.cancelProcessing}
        onCancelTurn={workspace.cancelDiagnosticTurn}
        onOpenPanel={openOverlay}
        onRequestHint={() => void workspace.requestHint()}
        onRevealAnswer={() => void workspace.revealAnswer()}
        onSelectNode={(nodeId) => void workspace.selectNode(nodeId)}
        onSendAnswer={(content) => void workspace.sendAnswer(content)}
        onDraftChange={(content) => void workspace.saveDraft(content)}
        onRetry={() => {
          if (workspace.activeTask) {
            void workspace.retryProcessing(workspace.activeTask.id);
          }
        }}
        onUpload={(file) => void workspace.importMaterial(file)}
        processingProgress={workspace.processingProgress}
        isResponding={workspace.isResponding}
        isGeneratingReport={workspace.isGeneratingReport}
        pendingUserMessage={workspace.pendingUserMessage}
        uploadDisabled={workspace.isImporting}
        onOpenReport={() => openOverlay("REPORT")}
        speechRecognitionFactory={speechRecognitionFactory}
      />

      {mobilePanel ? (
        <button
          aria-label="关闭当前浮层"
          className="drawer-backdrop"
          onClick={closeOverlay}
          type="button"
        />
      ) : null}

      {workspace.error ? (
        <div className="error-toast" role="alert">
          <span>{workspace.error}</span>
          {workspace.canRetryDiagnosticTurn ? (
            <Button
              onClick={() => void workspace.retryDiagnosticTurn()}
              size="sm"
              variant="ghost"
            >
              重试本轮
            </Button>
          ) : null}
          {workspace.canRetryReport ? (
            <Button
              onClick={() => void workspace.retryReport()}
              size="sm"
              variant="ghost"
            >
              重试报告
            </Button>
          ) : null}
        </div>
      ) : null}
      {shareNotice ? (
        <div className="share-toast" role="status">
          {shareNotice}
        </div>
      ) : null}
      {workspace.deletedSnapshot ? (
        <div className="undo-toast" role="status">
          <span>任务已删除</span>
          <Button onClick={() => void workspace.undoDelete()} size="sm" variant="ghost">
            撤销删除
          </Button>
        </div>
      ) : null}
      {renameTask ? (
        <RenameDialog
          key={renameTask.id}
          onCancel={() => setRenameTask(null)}
          onSave={(title) => {
            void workspace.renameTask(renameTask.id, title);
            setRenameTask(null);
          }}
          task={renameTask}
        />
      ) : null}
      {deleteTask ? (
        <DeleteDialog
          onCancel={() => setDeleteTask(null)}
          onConfirm={() => {
            void workspace.deleteTask(deleteTask.id);
            setDeleteTask(null);
          }}
          task={deleteTask}
        />
      ) : null}
      {reportOpen && workspace.learningData?.report ? (
        <ReportView
          onClose={closeOverlay}
          onDownload={() =>
            downloadReport(
              workspace.learningData!.report!.document.materialTitle,
              workspace.learningData!.report!.markdown,
            )
          }
          onPrint={() => window.print()}
          onShare={() => void shareTaskReport(workspace.learningData!.task.id)}
          report={workspace.learningData.report}
        />
      ) : null}
    </div>
  );
}
