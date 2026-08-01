"use client";

import { useMemo, useState } from "react";

import { getVeritasDatabase } from "@/storage/database";
import { createTaskRepository } from "@/storage/task-repository";
import type { MobilePanel, StoredTask } from "@/storage/types";
import { Button } from "@/ui/Button";
import type { DiagnosticAgentCall } from "@/features/diagnostic/diagnostic-turn";

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
}: {
  repository?: TaskRepository;
  processor?: TextMaterialProcessor;
  diagnosticAgent?: DiagnosticAgentCall;
}) {
  const defaultRepository = useMemo(
    () => repository ?? createTaskRepository(getVeritasDatabase()),
    [repository],
  );
  const workspace = useWorkspace(defaultRepository, processor, diagnosticAgent);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameTask, setRenameTask] = useState<StoredTask | null>(null);
  const [deleteTask, setDeleteTask] = useState<StoredTask | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);

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
        onCloseMobile={() => setMobilePanel(null)}
        onDelete={openDelete}
        onPin={(task) => {
          setOpenMenuId(null);
          void workspace.setTaskPinned(task.id, !task.isPinned);
        }}
        onRename={openRename}
        onSearch={workspace.setSearch}
        onSelect={(taskId) => {
          setMobilePanel(null);
          void workspace.selectTask(taskId);
        }}
        onToggleCollapsed={() => void workspace.toggleWorkspace()}
        onToggleMenu={setOpenMenuId}
        onUpload={(file) => void workspace.importMaterial(file)}
        openMenuId={openMenuId}
        search={workspace.search}
        tasks={workspace.tasks}
        uploadDisabled={workspace.isImporting}
      />
      <LearningPanels
        activeTask={workspace.activeTask}
        learningData={workspace.learningData}
        mobilePanel={mobilePanel}
        onClosePanel={() => setMobilePanel(null)}
        onCancelProcessing={workspace.cancelProcessing}
        onCancelTurn={workspace.cancelDiagnosticTurn}
        onOpenPanel={setMobilePanel}
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
        uploadDisabled={workspace.isImporting}
      />

      {workspace.error ? (
        <div className="error-toast" role="alert">
          {workspace.error}
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
    </div>
  );
}
