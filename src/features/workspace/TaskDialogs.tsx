import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import type { StoredTask } from "@/storage/types";
import { Button } from "@/ui/Button";

const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

function TaskDialog({
  children,
  onCancel,
  returnFocus,
  titleId,
}: {
  children: ReactNode;
  onCancel: () => void;
  returnFocus: HTMLElement | null;
  titleId: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      returnFocus?.focus();
    },
    [returnFocus],
  );

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="ui-card task-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        {children}
      </div>
    </div>
  );
}

export function RenameDialog({
  task,
  onCancel,
  onSave,
  returnFocus,
}: {
  task: StoredTask;
  onCancel: () => void;
  onSave: (title: string) => void;
  returnFocus: HTMLElement | null;
}) {
  const [title, setTitle] = useState(task.title);
  return (
    <TaskDialog onCancel={onCancel} returnFocus={returnFocus} titleId="rename-title">
      <span className="eyebrow">整理工作区</span>
      <h2 id="rename-title">重命名任务</h2>
      <label>
        <span>任务名称</span>
        <input
          aria-label="任务名称"
          autoFocus
          maxLength={80}
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
      </label>
      <div className="dialog-actions">
        <Button onClick={onCancel} variant="secondary">
          取消
        </Button>
        <Button
          disabled={!title.trim()}
          onClick={() => onSave(title.trim())}
          variant="primary"
        >
          保存名称
        </Button>
      </div>
    </TaskDialog>
  );
}

export function DeleteDialog({
  task,
  onCancel,
  onConfirm,
  returnFocus,
}: {
  task: StoredTask;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocus: HTMLElement | null;
}) {
  return (
    <TaskDialog onCancel={onCancel} returnFocus={returnFocus} titleId="delete-title">
      <span className="eyebrow">请确认</span>
      <h2 id="delete-title">删除任务</h2>
      <p>“{task.title}”及其材料、聊天和学习进度会从这台设备删除。</p>
      <div className="dialog-actions">
        <Button autoFocus onClick={onCancel} variant="secondary">
          取消
        </Button>
        <Button onClick={onConfirm} variant="danger">
          确认删除
        </Button>
      </div>
    </TaskDialog>
  );
}
