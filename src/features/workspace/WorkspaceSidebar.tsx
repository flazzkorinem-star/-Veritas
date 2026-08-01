import type { StoredTask } from "@/storage/types";

import { UploadButton } from "./UploadButton";

interface WorkspaceSidebarProps {
  tasks: StoredTask[];
  activeTaskId: string | undefined;
  search: string;
  collapsed: boolean;
  mobileOpen: boolean;
  openMenuId: string | null;
  onSearch: (value: string) => void;
  onSelect: (taskId: string) => void;
  onToggleCollapsed: () => void;
  onToggleMenu: (taskId: string | null) => void;
  onRename: (task: StoredTask) => void;
  onPin: (task: StoredTask) => void;
  onDelete: (task: StoredTask) => void;
  onCloseMobile: () => void;
}

const STATUS_TEXT = {
  PROCESSING: "读取中",
  READY: "待开始",
  IN_PROGRESS: "学习中",
  COMPLETED: "已完成",
  FAILED: "需处理",
} as const;

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  return (
    <aside
      aria-label="任务工作区"
      className="workspace-sidebar"
      data-collapsed={props.collapsed}
      data-mobile-open={props.mobileOpen}
    >
      <div className="brand-row">
        <div className="brand-mark" aria-hidden="true">
          V
        </div>
        <div className="brand-copy">
          <strong>Veritas</strong>
          <span>把材料真正学会</span>
        </div>
        <button
          aria-label="关闭任务抽屉"
          className="mobile-close"
          onClick={props.onCloseMobile}
          type="button"
        >
          ×
        </button>
      </div>

      <div className="workspace-expanded">
        <UploadButton id="workspace-upload" />
        <label className="search-field">
          <span className="visually-hidden">搜索任务</span>
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="搜索任务"
            onChange={(event) => props.onSearch(event.target.value)}
            placeholder="搜索任务或文件"
            type="search"
            value={props.search}
          />
        </label>
        <div className="task-list-heading">
          <h2>学习任务</h2>
          <span>{props.tasks.length}</span>
        </div>
        <div className="task-list" role="list">
          {props.tasks.length === 0 ? (
            <p className="sidebar-empty">还没有本地任务</p>
          ) : (
            props.tasks.map((task) => (
              <div
                className="task-row"
                data-active={task.id === props.activeTaskId}
                key={task.id}
                role="listitem"
              >
                <button
                  className="task-main"
                  onClick={() => props.onSelect(task.id)}
                  type="button"
                  aria-label={`打开任务 ${task.title}`}
                >
                  <span className="task-title">
                    {task.isPinned ? <span aria-label="已置顶">◆</span> : null}
                    {task.title}
                  </span>
                  <span className="task-meta">
                    {task.fileName} · {STATUS_TEXT[task.status]}
                  </span>
                </button>
                <button
                  aria-expanded={props.openMenuId === task.id}
                  aria-label={`打开“${task.title}”的任务菜单`}
                  className="task-menu-trigger"
                  onClick={() =>
                    props.onToggleMenu(props.openMenuId === task.id ? null : task.id)
                  }
                  type="button"
                >
                  ···
                </button>
                {props.openMenuId === task.id ? (
                  <div className="task-menu" role="menu">
                    <button
                      onClick={() => props.onRename(task)}
                      role="menuitem"
                      type="button"
                    >
                      重命名
                    </button>
                    <button
                      onClick={() => props.onPin(task)}
                      role="menuitem"
                      type="button"
                    >
                      {task.isPinned ? "取消置顶" : "置顶"}
                    </button>
                    <button
                      disabled
                      role="menuitem"
                      title="完成学习后可分享报告"
                      type="button"
                    >
                      分享
                    </button>
                    <button
                      onClick={() => props.onDelete(task)}
                      role="menuitem"
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
        <p className="privacy-note">任务只保存在这台设备的当前浏览器中。</p>
      </div>

      <div className="workspace-compact">
        <UploadButton compact id="compact-upload" />
      </div>
      <button
        aria-label={props.collapsed ? "展开工作区" : "收起工作区"}
        className="collapse-button"
        onClick={props.onToggleCollapsed}
        type="button"
      >
        {props.collapsed ? "›" : "‹"}
      </button>
    </aside>
  );
}
