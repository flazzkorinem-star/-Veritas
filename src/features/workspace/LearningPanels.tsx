import { useEffect, useState } from "react";

import { getNodeScore } from "@/domain/diagnostic/selectors";
import type { MaterialProcessingProgress } from "@/features/materials/process-text-material";
import type {
  MobilePanel,
  StoredMaterial,
  StoredMessage,
  StoredDraft,
  StoredSession,
  StoredTask,
} from "@/storage/types";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { MessageBubble } from "@/ui/MessageBubble";
import { ProgressBar } from "@/ui/ProgressBar";
import { StatusBadge } from "@/ui/StatusBadge";
import { Vita } from "@/ui/Vita";

import { UploadButton } from "./UploadButton";

interface LearningPanelsProps {
  activeTask: StoredTask | null;
  learningData: {
    material: StoredMaterial | undefined;
    session: StoredSession | undefined;
    sessions: StoredSession[];
    messages: StoredMessage[];
    draft: StoredDraft | undefined;
  } | null;
  processingProgress: MaterialProcessingProgress | null;
  mobilePanel: MobilePanel;
  uploadDisabled: boolean;
  onUpload: (file: File) => void;
  onRetry: () => void;
  onCancelProcessing: () => void;
  onCancelTurn: () => void;
  onSendAnswer: (content: string) => void;
  onDraftChange: (content: string) => void;
  onRequestHint: () => void;
  onRevealAnswer: () => void;
  onSelectNode: (nodeId: string) => void;
  isResponding: boolean;
  onOpenPanel: (panel: Exclude<MobilePanel, null>) => void;
  onClosePanel: () => void;
}

const TASK_BADGES = {
  PROCESSING: { tone: "warning", text: "处理中" },
  READY: { tone: "neutral", text: "待开始" },
  IN_PROGRESS: { tone: "active", text: "学习中" },
  COMPLETED: { tone: "success", text: "已完成" },
  FAILED: { tone: "danger", text: "需要处理" },
} as const;

function useElapsedSeconds(progress: MaterialProcessingProgress | null) {
  const startedAt = progress && "startedAt" in progress ? progress.startedAt : null;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (startedAt === null) return;
    const update = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [startedAt]);
  return elapsed;
}

function ProcessingCopy({
  progress,
  elapsedSeconds,
}: {
  progress: MaterialProcessingProgress | null;
  elapsedSeconds: number;
}) {
  if (!progress || progress.stage === "READING") {
    const loadedBytes = progress?.loadedBytes ?? 0;
    const totalBytes = progress?.totalBytes ?? 0;
    const percent = totalBytes ? Math.round((loadedBytes / totalBytes) * 100) : 0;
    return (
      <div className="processing-copy">
        <strong>正在读取文件</strong>
        <p>
          {totalBytes ? `已读取 ${loadedBytes} / ${totalBytes} 字节` : "正在准备读取…"}
        </p>
        <ProgressBar label={`文件读取进度 ${percent}%`} max={100} value={percent} />
      </div>
    );
  }
  if (progress.stage === "PARSING" || progress.stage === "OCR") {
    const percent = progress.total
      ? Math.round((progress.current / progress.total) * 100)
      : 0;
    return (
      <div className="processing-copy">
        <strong>{progress.label}</strong>
        <p>
          {progress.stage === "OCR" ? "正在识别图片文字" : "正在解析材料"} ·{" "}
          {progress.current}
          {" / "}
          {progress.total}
        </p>
        <ProgressBar label={`${progress.label} ${percent}%`} max={100} value={percent} />
      </div>
    );
  }
  const title =
    progress.stage === "EXTRACTING"
      ? `正在整理内容 ${progress.currentChunk} / ${progress.totalChunks}`
      : progress.stage === "AUDITING"
        ? "正在核对整份材料"
        : "正在准备第一个主题";
  return (
    <div className="processing-copy">
      <strong>{title}</strong>
      <p>维塔正在仔细梳理 · 已用 {elapsedSeconds} 秒</p>
      <div
        aria-label="模型处理进行中"
        className="indeterminate-progress"
        role="progressbar"
      >
        <span />
      </div>
    </div>
  );
}

export function LearningPanels({
  activeTask,
  learningData,
  processingProgress,
  mobilePanel,
  uploadDisabled,
  onUpload,
  onRetry,
  onCancelProcessing,
  onCancelTurn,
  onSendAnswer,
  onDraftChange,
  onRequestHint,
  onRevealAnswer,
  onSelectNode,
  isResponding,
  onOpenPanel,
  onClosePanel,
}: LearningPanelsProps) {
  const elapsedSeconds = useElapsedSeconds(processingProgress);
  const material = learningData?.material;
  const nodes = material?.nodes.toSorted((left, right) => left.order - right.order) ?? [];
  const currentSession = learningData?.session?.session;
  const completedNodes =
    learningData?.sessions.filter(({ session }) => session.status === "COMPLETED")
      .length ?? 0;
  const score = currentSession ? getNodeScore(currentSession) : 0;
  const canRespond =
    Boolean(currentSession) &&
    currentSession?.status !== "COMPLETED" &&
    activeTask?.status !== "PROCESSING";
  const badge = activeTask ? TASK_BADGES[activeTask.status] : null;
  return (
    <>
      <aside
        aria-label="学习主题"
        className="topic-sidebar"
        data-mobile-open={mobilePanel === "TOPICS"}
      >
        <div className="panel-heading">
          <div>
            <span className="eyebrow">学习路线</span>
            <h2>主题</h2>
          </div>
          <Button
            aria-label="关闭主题抽屉"
            className="mobile-close"
            onClick={onClosePanel}
            size="icon"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>
        {material && nodes.length > 0 ? (
          <div className="topic-modules">
            {material.modules.map((module) => {
              const moduleNodes = nodes.filter((node) => node.moduleId === module.id);
              if (moduleNodes.length === 0) return null;
              return (
                <section className="topic-module" key={module.id}>
                  <div className="topic-module-heading">
                    <h3>{module.title}</h3>
                    <span>{moduleNodes.length}</span>
                  </div>
                  <div className="topic-list">
                    {moduleNodes.map((node) => {
                      const stored = learningData?.sessions.find(
                        (candidate) => candidate.nodeId === node.id,
                      );
                      return (
                        <button
                          className="topic-item"
                          data-active={node.id === activeTask?.currentNodeId}
                          disabled={isResponding}
                          key={node.id}
                          onClick={() => onSelectNode(node.id)}
                          type="button"
                        >
                          <span>{node.order}</span>
                          <strong>{node.title}</strong>
                          <small>
                            {stored?.session.status === "COMPLETED"
                              ? "已完成"
                              : stored
                                ? "继续"
                                : "未开始"}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="topic-empty">
            <span aria-hidden="true">◎</span>
            <strong>还没有学习主题</strong>
            <p>
              {activeTask
                ? "材料准备好后，主题会按模块排在这里。"
                : "上传材料后，这里会出现完整的学习路线。"}
            </p>
          </div>
        )}
      </aside>

      <main className="chat-workspace">
        <nav aria-label="移动端工作区导航" className="mobile-nav">
          <Button onClick={() => onOpenPanel("TASKS")} size="sm" variant="ghost">
            <Icon name="tasks" size={17} />
            <span>任务</span>
          </Button>
          <Button onClick={() => onOpenPanel("TOPICS")} size="sm" variant="ghost">
            <Icon name="topics" size={17} />
            {activeTask?.title ?? "主题"}
          </Button>
          <Button onClick={() => onOpenPanel("DIAGNOSTIC")} size="sm" variant="ghost">
            <Icon name="progress" size={17} />
            <span>进度</span>
          </Button>
        </nav>
        <header className="chat-heading">
          <div>
            <span className="eyebrow">当前学习</span>
            <h1>{activeTask?.title ?? "从一份材料开始"}</h1>
          </div>
          {badge ? <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge> : null}
        </header>
        {activeTask?.status === "FAILED" ? (
          <section className="chat-empty" aria-live="polite">
            <div className="vita-figure">
              <Vita state="error" size={188} />
            </div>
            <div>
              <strong>这份材料暂时没能准备好</strong>
              <p>{activeTask.failureReason ?? "请稍后重试，原始文件仍保存在本机。"}</p>
              <Button disabled={uploadDisabled} onClick={onRetry} variant="primary">
                重新处理
              </Button>
            </div>
          </section>
        ) : activeTask?.status === "PROCESSING" ? (
          <section className="chat-empty processing-state" aria-live="polite">
            <div className="vita-figure">
              <Vita state="processing" size={188} />
            </div>
            <ProcessingCopy
              progress={processingProgress}
              elapsedSeconds={elapsedSeconds}
            />
            <Button onClick={onCancelProcessing} size="sm" variant="ghost">
              取消处理
            </Button>
          </section>
        ) : learningData?.messages.length ? (
          <section className="chat-thread" aria-live="polite">
            {learningData.messages.map((message) => (
              <MessageBubble key={message.id} role={message.role}>
                {message.content}
              </MessageBubble>
            ))}
          </section>
        ) : (
          <section className="chat-empty" aria-live="polite">
            <div className="vita-figure">
              <Vita state={activeTask ? "processing" : "waiting"} size={188} />
            </div>
            <div>
              <strong>{activeTask ? "正在恢复学习现场" : "带上一份想学懂的材料"}</strong>
              <p>
                {activeTask
                  ? "主题和对话会从这台设备恢复。"
                  : "上传讲义、文章或图片，维塔会陪你从记忆走到分析。"}
              </p>
            </div>
          </section>
        )}
        <footer className="composer-shell">
          {!activeTask ? (
            <div className="composer-upload">
              <UploadButton
                disabled={uploadDisabled}
                id="composer-upload"
                onSelect={onUpload}
              />
              <span>材料文字会发送给 DeepSeek 以整理主题；原始文件只保存在本机</span>
            </div>
          ) : null}
          {canRespond ? (
            <div className="composer-actions">
              <Button
                disabled={isResponding}
                onClick={onRequestHint}
                size="sm"
                variant="ghost"
              >
                给我提示
              </Button>
              <Button
                disabled={isResponding}
                onClick={onRevealAnswer}
                size="sm"
                variant="ghost"
              >
                看答案
              </Button>
              {isResponding ? (
                <Button onClick={onCancelTurn} size="sm" variant="ghost">
                  停止生成
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="composer-row">
            <Button aria-label="语音输入" disabled size="icon" variant="ghost">
              <Icon name="microphone" />
            </Button>
            <label className="composer-input">
              <span className="visually-hidden">回答输入</span>
              <textarea
                aria-label="回答输入"
                disabled={!canRespond || isResponding}
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder={
                  learningData?.messages.length
                    ? currentSession?.status === "COMPLETED"
                      ? "这个主题已经完成"
                      : "写下你的理解……"
                    : activeTask
                      ? "主题准备好后就能开始回答"
                      : "请先上传一份学习材料"
                }
                rows={1}
                value={learningData?.draft?.content ?? ""}
              />
            </label>
            <Button
              aria-label="发送回答"
              disabled={
                !canRespond || isResponding || !learningData?.draft?.content.trim()
              }
              onClick={() => onSendAnswer(learningData?.draft?.content ?? "")}
              size="icon"
              variant="ghost"
            >
              <Icon name="send" />
            </Button>
          </div>
        </footer>
      </main>

      <aside
        aria-label="诊断进度"
        className="diagnostic-panel"
        data-mobile-open={mobilePanel === "DIAGNOSTIC"}
      >
        <div className="panel-heading">
          <div>
            <span className="eyebrow">诊断</span>
            <h2>学习进度</h2>
          </div>
          <Button
            aria-label="关闭诊断抽屉"
            className="mobile-close"
            onClick={onClosePanel}
            size="icon"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>
        <section className="progress-group" aria-labelledby="material-progress">
          <div className="progress-label">
            <h3 id="material-progress">整份材料</h3>
            <strong>
              {completedNodes} / {nodes.length}
            </strong>
          </div>
          <ProgressBar
            label={`材料完成进度 ${nodes.length ? Math.round((completedNodes / nodes.length) * 100) : 0}%`}
            max={nodes.length || 1}
            value={completedNodes}
          />
          <p>完成的主题会逐步点亮这里。</p>
        </section>
        <section
          className="progress-group current-topic"
          aria-labelledby="topic-progress"
        >
          <span className="eyebrow">当前主题</span>
          <h3 id="topic-progress">
            {nodes.find((node) => node.id === activeTask?.currentNodeId)?.title ??
              "还没有主题"}
          </h3>
          <div className="score-line">
            <span>
              {currentSession?.status === "COMPLETED"
                ? "已完成"
                : currentSession
                  ? "学习中"
                  : "未开始"}
            </span>
            <strong>{score}</strong>
          </div>
        </section>
      </aside>
    </>
  );
}
