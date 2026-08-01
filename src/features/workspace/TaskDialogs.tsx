import { useState } from "react";

import type { StoredTask } from "@/storage/types";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";

export function RenameDialog({
  task,
  onCancel,
  onSave,
}: {
  task: StoredTask;
  onCancel: () => void;
  onSave: (title: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  return (
    <div className="dialog-backdrop">
      <Card
        aria-labelledby="rename-title"
        aria-modal="true"
        className="task-dialog"
        role="dialog"
      >
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
      </Card>
    </div>
  );
}

export function DeleteDialog({
  task,
  onCancel,
  onConfirm,
}: {
  task: StoredTask;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop">
      <Card
        aria-labelledby="delete-title"
        aria-modal="true"
        className="task-dialog"
        role="dialog"
      >
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
      </Card>
    </div>
  );
}
