import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { StoredTask } from "@/storage/types";
import { Button } from "@/ui/Button";
import { BrandSymbol } from "@/ui/BrandSymbol";
import { Icon } from "@/ui/Icon";

import { UploadButton } from "./UploadButton";

interface WorkspaceSidebarProps {
  tasks: StoredTask[];
  activeTaskId: string | undefined;
  search: string;
  collapsed: boolean;
  mobileOpen: boolean;
  openMenuId: string | null;
  reportTaskIds: string[];
  onSearch: (value: string) => void;
  onSelect: (taskId: string) => void;
  onToggleCollapsed: () => void;
  onToggleMenu: (taskId: string | null) => void;
  onRename: (task: StoredTask) => void;
  onPin: (task: StoredTask) => void;
  onDelete: (task: StoredTask) => void;
  onShare: (task: StoredTask) => void;
  onCloseMobile: () => void;
  onUpload: (file: File) => void;
  uploadDisabled: boolean;
}

const STATUS_TEXT = {
  PROCESSING: "读取中",
  READY: "待开始",
  IN_PROGRESS: "学习中",
  COMPLETED: "已完成",
  FAILED: "需处理",
} as const;

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(
    null,
  );
  const onToggleMenu = props.onToggleMenu;
  const openTask = props.tasks.find((task) => task.id === props.openMenuId);

  useLayoutEffect(() => {
    if (!openTask || !menuAnchor || !menuRef.current) return;
    const menu = menuRef.current.getBoundingClientRect();
    const below = menuAnchor.bottom + 4;
    const top =
      below + menu.height <= window.innerHeight - 8
        ? below
        : Math.max(8, menuAnchor.top - menu.height - 4);
    setMenuPosition({
      left: Math.min(
        window.innerWidth - menu.width - 8,
        Math.max(8, menuAnchor.right - menu.width),
      ),
      top,
    });
  }, [menuAnchor, openTask]);

  useEffect(() => {
    if (!openTask) return;
    const trigger = triggerRefs.current.get(openTask.id);
    const close = () => onToggleMenu(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !trigger?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      trigger?.focus();
    };
    const onViewportChange = () => {
      const rect = trigger?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
        close();
        return;
      }
      setMenuPosition(null);
      setMenuAnchor(rect);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [openTask, onToggleMenu]);

  function runMenuAction(task: StoredTask, action: (task: StoredTask) => void) {
    triggerRefs.current.get(task.id)?.focus();
    action(task);
  }

  return (
    <aside
      aria-label="任务工作区"
      className="workspace-sidebar"
      data-collapsed={props.collapsed}
      data-mobile-open={props.mobileOpen}
    >
      <div className="brand-row">
        <div className="brand-mark" aria-hidden="true">
          <BrandSymbol />
        </div>
        <div className="brand-copy">
          <strong>Veritas</strong>
        </div>
        <Button
          aria-label="关闭任务抽屉"
          className="mobile-close"
          onClick={props.onCloseMobile}
          size="icon"
          variant="ghost"
        >
          <Icon name="close" />
        </Button>
      </div>

      <div className="workspace-expanded">
        <UploadButton
          disabled={props.uploadDisabled}
          id="workspace-upload"
          onSelect={props.onUpload}
        />
        <label className="search-field">
          <span className="visually-hidden">搜索任务</span>
          <Icon name="search" size={16} />
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
          {props.tasks.length > 0 ? <span>{props.tasks.length}</span> : null}
        </div>
        <div className="task-list" role="list">
          {props.tasks.length === 0 ? (
            <p className="sidebar-empty">还没有任务</p>
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
                <Button
                  aria-expanded={props.openMenuId === task.id}
                  aria-label={`打开“${task.title}”的任务菜单`}
                  className="task-menu-trigger"
                  onClick={(event) => {
                    if (props.openMenuId === task.id) {
                      props.onToggleMenu(null);
                      return;
                    }
                    setMenuPosition(null);
                    setMenuAnchor(event.currentTarget.getBoundingClientRect());
                    props.onToggleMenu(task.id);
                  }}
                  ref={(element) => {
                    if (element) triggerRefs.current.set(task.id, element);
                    else triggerRefs.current.delete(task.id);
                  }}
                  size="icon"
                  variant="ghost"
                >
                  <Icon name="menu" size={18} />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="workspace-compact">
        <UploadButton
          compact
          disabled={props.uploadDisabled}
          id="compact-upload"
          onSelect={props.onUpload}
        />
      </div>
      <Button
        aria-label={props.collapsed ? "展开工作区" : "收起工作区"}
        className="collapse-button"
        onClick={props.onToggleCollapsed}
        size="icon"
        variant="ghost"
      >
        <Icon className="collapse-icon" name="chevron-left" size={18} />
      </Button>
      {openTask && menuAnchor && typeof document !== "undefined"
        ? createPortal(
            <div
              className="task-menu"
              ref={menuRef}
              role="menu"
              style={{
                left: menuPosition?.left ?? 0,
                top: menuPosition?.top ?? 0,
                visibility: menuPosition ? "visible" : "hidden",
              }}
            >
              <button
                onClick={() => runMenuAction(openTask, props.onRename)}
                role="menuitem"
                type="button"
              >
                重命名
              </button>
              <button
                onClick={() => runMenuAction(openTask, props.onPin)}
                role="menuitem"
                type="button"
              >
                {openTask.isPinned ? "取消置顶" : "置顶"}
              </button>
              <button
                disabled={!props.reportTaskIds.includes(openTask.id)}
                onClick={() => runMenuAction(openTask, props.onShare)}
                role="menuitem"
                title={
                  props.reportTaskIds.includes(openTask.id)
                    ? "分享当前任务报告"
                    : "完成一个主题后可分享报告"
                }
                type="button"
              >
                分享
              </button>
              <button
                onClick={() => runMenuAction(openTask, props.onDelete)}
                role="menuitem"
                type="button"
              >
                删除
              </button>
            </div>,
            document.body,
          )
        : null}
    </aside>
  );
}
