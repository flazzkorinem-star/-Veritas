"use client";

import { useMemo, useState } from "react";

import { getVeritasDatabase } from "@/storage/database";
import { createTaskRepository } from "@/storage/task-repository";
import type { MobilePanel, StoredTask } from "@/storage/types";

import { LearningPanels } from "./LearningPanels";
import { DeleteDialog, RenameDialog } from "./TaskDialogs";
import { useWorkspace, type TaskRepository } from "./use-workspace";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

export function WorkspaceApp({ repository }: { repository?: TaskRepository }) {
  const defaultRepository = useMemo(
    () => repository ?? createTaskRepository(getVeritasDatabase()),
    [repository],
  );
  const workspace = useWorkspace(defaultRepository);
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
        openMenuId={openMenuId}
        search={workspace.search}
        tasks={workspace.tasks}
      />
      <LearningPanels
        activeTask={workspace.activeTask}
        mobilePanel={mobilePanel}
        onClosePanel={() => setMobilePanel(null)}
        onOpenPanel={setMobilePanel}
      />

      {workspace.error ? (
        <div className="error-toast" role="alert">
          {workspace.error}
        </div>
      ) : null}
      {workspace.deletedSnapshot ? (
        <div className="undo-toast" role="status">
          <span>任务已删除</span>
          <button onClick={() => void workspace.undoDelete()} type="button">
            撤销删除
          </button>
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
