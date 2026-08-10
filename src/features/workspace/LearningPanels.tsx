import { useEffect, useRef, useState } from "react";

import { getNodeScore } from "@/domain/diagnostic/selectors";
import type { MaterialProcessingProgress } from "@/features/materials/process-text-material";
import {
  useSpeechInput,
  type SpeechRecognitionFactory,
} from "@/features/speech/use-speech-input";
import type {
  MobilePanel,
  StoredMaterial,
  StoredMessage,
  StoredDraft,
  StoredSession,
  StoredTask,
  StoredReport,
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
    report: StoredReport | undefined;
  } | null;
  processingProgress: MaterialProcessingProgress | null;
  canCancelProcessing: boolean;
  mobilePanel: MobilePanel;
  uploadDisabled: boolean;
  onUpload: (file: File) => void;
  onRetry: () => void;
  onCancelProcessing: () => void;
  onSendMessage: (content: string) => void;
  onDraftChange: (content: string) => void;
  onRequestHint: () => void;
  onRevealAnswer: () => void;
  onSelectNode: (nodeId: string) => void;
  isResponding: boolean;
  isGeneratingReport: boolean;
  pendingUserMessage: string | null;
  onOpenPanel: (panel: Exclude<MobilePanel, null>) => void;
  onClosePanel: () => void;
  onOpenReport: () => void;
  speechRecognitionFactory?: SpeechRecognitionFactory;
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
  canCancelProcessing,
  mobilePanel,
  uploadDisabled,
  onUpload,
  onRetry,
  onCancelProcessing,
  onSendMessage,
  onDraftChange,
  onRequestHint,
  onRevealAnswer,
  onSelectNode,
  isResponding,
  isGeneratingReport,
  pendingUserMessage,
  onOpenPanel,
  onClosePanel,
  onOpenReport,
  speechRecognitionFactory,
}: LearningPanelsProps) {
  const elapsedSeconds = useElapsedSeconds(processingProgress);
  const threadRef = useRef<HTMLElement | null>(null);
  const [isAtLatest, setIsAtLatest] = useState(true);
  const speech = useSpeechInput(onDraftChange, speechRecognitionFactory);
  const material = learningData?.material;
  const nodes = material?.nodes.toSorted((left, right) => left.order - right.order) ?? [];
  const currentSession = learningData?.session?.session;
  const nextNode =
    currentSession?.status === "COMPLETED"
      ? nodes.find((node) => {
          if (
            node.order <=
            (nodes.find((item) => item.id === currentSession.nodeId)?.order ?? 0)
          ) {
            return false;
          }
          return !learningData?.sessions.some(
            (stored) =>
              stored.nodeId === node.id && stored.session.status === "COMPLETED",
          );
        })
      : undefined;
  const completedNodes =
    learningData?.sessions.filter(({ session }) => session.status === "COMPLETED")
      .length ?? 0;
  const score = currentSession ? getNodeScore(currentSession) : 0;
  const canMessage = Boolean(currentSession) && activeTask?.status !== "PROCESSING";
  const hasActiveQuestion = Boolean(
    currentSession &&
    currentSession.status !== "COMPLETED" &&
    currentSession.stages[currentSession.currentStage].status === "ACTIVE",
  );
  const badge = activeTask ? TASK_BADGES[activeTask.status] : null;
  const currentNode = nodes.find((node) => node.id === activeTask?.currentNodeId);
  const showComposer =
    Boolean(activeTask) &&
    activeTask?.status !== "FAILED" &&
    activeTask?.status !== "PROCESSING";
  useEffect(() => {
    if (!isAtLatest) return;
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [isAtLatest, isResponding, learningData?.messages.length, pendingUserMessage]);
  return (
    <>
      <aside
        aria-label="学习主题"
        className="topic-sidebar"
        data-mobile-open={mobilePanel === "TOPICS"}
      >
        <div className="panel-heading">
          <h2>主题</h2>
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
                <details className="topic-module" key={module.id} open>
                  <summary className="topic-module-heading">
                    <h3>{module.title}</h3>
                    <span>{moduleNodes.length}</span>
                  </summary>
                  <div className="topic-list">
                    {moduleNodes.map((node) => {
                      const stored = learningData?.sessions.find(
                        (candidate) => candidate.nodeId === node.id,
                      );
                      const topicStatus =
                        stored?.session.status === "COMPLETED"
                          ? "completed"
                          : stored
                            ? "continue"
                            : "new";
                      return (
                        <button
                          className="topic-item"
                          data-active={node.id === activeTask?.currentNodeId}
                          data-status={topicStatus}
                          disabled={isResponding}
                          key={node.id}
                          onClick={() => onSelectNode(node.id)}
                          type="button"
                        >
                          <span>{node.order}</span>
                          <strong>{node.title}</strong>
                          <small>
                            {topicStatus === "completed"
                              ? "已完成"
                              : topicStatus === "continue"
                                ? "继续"
                                : "未开始"}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <div className="topic-empty">
            <strong>
              {activeTask?.status === "FAILED"
                ? "重新处理后显示主题"
                : activeTask
                  ? "正在准备学习主题"
                  : "上传材料后显示主题"}
            </strong>
          </div>
        )}
      </aside>

      <main className="chat-workspace" data-empty={!activeTask}>
        <nav aria-label="移动端工作区导航" className="mobile-nav">
          <Button
            aria-label="打开任务"
            onClick={() => onOpenPanel("TASKS")}
            size="sm"
            variant="ghost"
          >
            <Icon name="tasks" size={17} />
            <span>任务</span>
          </Button>
          <Button
            aria-label="打开主题"
            onClick={() => onOpenPanel("TOPICS")}
            size="sm"
            variant="ghost"
          >
            <Icon name="topics" size={17} />
            {activeTask?.title ?? "主题"}
          </Button>
          <Button
            aria-label="打开进度"
            onClick={() => onOpenPanel("DIAGNOSTIC")}
            size="sm"
            variant="ghost"
          >
            <Icon name="progress" size={17} />
            <span>进度</span>
          </Button>
        </nav>
        <header className="chat-heading">
          <div className="chat-title-group">
            <div>
              <h1>{activeTask?.title ?? "从一份材料开始"}</h1>
              {currentNode ? <p>{currentNode.title}</p> : null}
            </div>
            {badge ? <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge> : null}
          </div>
          {nodes.length > 0 ? (
            <div className="chat-heading-actions">
              <Button
                aria-label="主题"
                className="quiet-tool-button"
                onClick={() => onOpenPanel("TOPICS")}
                size="sm"
                variant="secondary"
              >
                <Icon name="topics" size={18} />
                <span>主题</span>
              </Button>
              <Button
                aria-label="进度"
                className="header-progress-button"
                onClick={() => onOpenPanel("DIAGNOSTIC")}
                size="sm"
                variant="secondary"
              >
                <span aria-hidden="true">
                  {completedNodes} / {nodes.length}
                </span>
                <ProgressBar
                  label={`材料完成进度 ${Math.round((completedNodes / nodes.length) * 100)}%`}
                  max={nodes.length}
                  value={completedNodes}
                />
              </Button>
            </div>
          ) : null}
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
            {canCancelProcessing ? (
              <Button onClick={onCancelProcessing} size="sm" variant="ghost">
                取消处理
              </Button>
            ) : null}
          </section>
        ) : learningData?.messages.length ? (
          <section
            aria-busy={isResponding}
            className="chat-thread"
            aria-live="polite"
            onScroll={(event) => {
              const thread = event.currentTarget;
              setIsAtLatest(
                thread.scrollHeight - thread.scrollTop - thread.clientHeight < 64,
              );
            }}
            ref={threadRef}
          >
            {learningData.messages.map((message) => (
              <MessageBubble key={message.id} role={message.role}>
                {message.content}
              </MessageBubble>
            ))}
            {pendingUserMessage ? (
              <MessageBubble role="USER">{pendingUserMessage}</MessageBubble>
            ) : null}
            {isResponding ? (
              <MessageBubble role="ASSISTANT" vitaState="processing">
                <span className="turn-pending">维塔正在回复…</span>
              </MessageBubble>
            ) : null}
            {!isAtLatest ? (
              <Button
                className="latest-message-button"
                onClick={() => {
                  const thread = threadRef.current;
                  if (thread) thread.scrollTop = thread.scrollHeight;
                  setIsAtLatest(true);
                }}
                size="sm"
                variant="secondary"
              >
                回到最新消息
              </Button>
            ) : null}
          </section>
        ) : (
          <section className="chat-empty" aria-live="polite">
            <div className="vita-figure">
              <Vita state={activeTask ? "processing" : "waiting"} size={188} />
            </div>
            <div>
              <strong>{activeTask ? "正在恢复学习" : "上传一份材料，开始学习"}</strong>
              {activeTask ? <p>主题和对话会从这台设备恢复。</p> : null}
              {!activeTask ? (
                <div className="empty-start-actions">
                  <UploadButton
                    disabled={uploadDisabled}
                    id="empty-state-upload"
                    onSelect={onUpload}
                  />
                </div>
              ) : null}
            </div>
          </section>
        )}
        {showComposer ? (
          <footer className="composer-shell">
            {hasActiveQuestion ? (
              <div className="composer-actions">
                <Button
                  className="quiet-tool-button"
                  disabled={isResponding}
                  onClick={onRequestHint}
                  size="sm"
                  variant="secondary"
                >
                  <Icon name="hint" size={17} />
                  给我提示
                </Button>
                <Button
                  className="quiet-tool-button"
                  disabled={isResponding}
                  onClick={onRevealAnswer}
                  size="sm"
                  variant="secondary"
                >
                  <Icon name="answer" size={17} />
                  看答案
                </Button>
              </div>
            ) : null}
            {nextNode ? (
              <div className="next-topic-action">
                <Button
                  aria-label={`学习下一个主题：${nextNode.title}`}
                  onClick={() => onSelectNode(nextNode.id)}
                  size="sm"
                  variant="primary"
                >
                  <span>下一个主题</span>
                  <strong>{nextNode.title}</strong>
                </Button>
              </div>
            ) : null}
            <div className="composer-row">
              <Button
                aria-label={speech.state === "IDLE" ? "开始语音输入" : "停止语音输入"}
                aria-pressed={speech.state !== "IDLE"}
                className="speech-button"
                data-listening={speech.state !== "IDLE"}
                disabled={!canMessage || isResponding}
                onClick={() => speech.toggle(learningData?.draft?.content ?? "")}
                size="icon"
                variant="ghost"
              >
                <Icon name="microphone" />
              </Button>
              <label className="composer-input">
                <span className="visually-hidden">消息输入</span>
                <textarea
                  aria-label="消息输入"
                  disabled={!canMessage || isResponding}
                  onChange={(event) => onDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key !== "Enter" ||
                      event.shiftKey ||
                      event.nativeEvent.isComposing
                    ) {
                      return;
                    }
                    event.preventDefault();
                    const content = learningData?.draft?.content ?? "";
                    if (canMessage && content.trim() && speech.state === "IDLE") {
                      onSendMessage(content);
                    }
                  }}
                  placeholder={
                    learningData?.messages.length
                      ? "问材料，或说说你想怎么学……"
                      : activeTask
                        ? "主题准备好后就能开始对话"
                        : "请先上传一份学习材料"
                  }
                  rows={1}
                  value={learningData?.draft?.content ?? ""}
                />
              </label>
              <Button
                aria-label="发送消息"
                disabled={
                  !canMessage ||
                  isResponding ||
                  !learningData?.draft?.content.trim() ||
                  speech.state !== "IDLE"
                }
                onClick={() => onSendMessage(learningData?.draft?.content ?? "")}
                size="icon"
                variant="primary"
              >
                <Icon name="send" />
              </Button>
            </div>
            {speech.state !== "IDLE" ? (
              <p className="speech-feedback" role="status">
                {speech.state === "STOPPING" ? "正在结束语音输入…" : "正在听，请说话…"}
              </p>
            ) : null}
            {speech.error ? (
              <p className="speech-feedback speech-error" role="alert">
                {speech.error}
              </p>
            ) : null}
          </footer>
        ) : null}
      </main>

      <aside
        aria-label="诊断进度"
        className="diagnostic-panel"
        data-mobile-open={mobilePanel === "DIAGNOSTIC"}
      >
        <div className="panel-heading">
          <h2>学习进度</h2>
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
        {activeTask ? (
          <>
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
            <Button
              className="report-entry-button"
              disabled={!learningData?.report}
              onClick={onOpenReport}
              variant="secondary"
            >
              {learningData?.report
                ? "查看学习报告"
                : isGeneratingReport
                  ? "正在更新报告…"
                  : "完成一个主题后可查看报告"}
            </Button>
          </>
        ) : (
          <div className="diagnostic-empty">
            <span aria-hidden="true" />
            <strong>上传材料后显示学习进度</strong>
          </div>
        )}
      </aside>
    </>
  );
}
