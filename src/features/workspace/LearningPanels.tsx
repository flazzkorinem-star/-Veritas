import type { MobilePanel, StoredTask } from "@/storage/types";

import { UploadButton } from "./UploadButton";

interface LearningPanelsProps {
  activeTask: StoredTask | null;
  mobilePanel: MobilePanel;
  onOpenPanel: (panel: Exclude<MobilePanel, null>) => void;
  onClosePanel: () => void;
}

export function LearningPanels({
  activeTask,
  mobilePanel,
  onOpenPanel,
  onClosePanel,
}: LearningPanelsProps) {
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
          <button
            aria-label="关闭主题抽屉"
            className="mobile-close"
            onClick={onClosePanel}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="topic-empty">
          <span aria-hidden="true">◎</span>
          <strong>还没有学习主题</strong>
          <p>
            {activeTask
              ? "材料准备好后，主题会按模块排在这里。"
              : "上传材料后，这里会出现完整的学习路线。"}
          </p>
        </div>
      </aside>

      <main className="chat-workspace">
        <nav aria-label="移动端工作区导航" className="mobile-nav">
          <button onClick={() => onOpenPanel("TASKS")} type="button">
            任务
          </button>
          <button onClick={() => onOpenPanel("TOPICS")} type="button">
            {activeTask?.title ?? "主题"}
          </button>
          <button onClick={() => onOpenPanel("DIAGNOSTIC")} type="button">
            进度
          </button>
        </nav>
        <header className="chat-heading">
          <div>
            <span className="eyebrow">当前学习</span>
            <h1>{activeTask?.title ?? "从一份材料开始"}</h1>
          </div>
          {activeTask ? <span className="status-pill">等待主题</span> : null}
        </header>
        <section className="chat-empty" aria-live="polite">
          <div className="vita-placeholder" aria-hidden="true">
            <span>V</span>
          </div>
          <div>
            <strong>{activeTask ? "材料已回到工作区" : "带上一份想学懂的材料"}</strong>
            <p>
              {activeTask
                ? "主题准备好后，维塔会在这里陪你逐层说清楚。"
                : "上传讲义、文章或图片，维塔会陪你从记忆走到分析。"}
            </p>
          </div>
        </section>
        <footer className="composer-shell">
          {!activeTask ? (
            <div className="composer-upload">
              <UploadButton id="composer-upload" />
              <span>支持常见文档与图片，单个文件不超过 30MB</span>
            </div>
          ) : null}
          <div className="composer-row">
            <button aria-label="语音输入" disabled type="button">
              ◉
            </button>
            <label className="composer-input">
              <span className="visually-hidden">回答输入</span>
              <textarea
                aria-label="回答输入"
                disabled
                placeholder={
                  activeTask ? "主题准备好后就能开始回答" : "请先上传一份学习材料"
                }
                rows={1}
              />
            </label>
            <button aria-label="发送回答" disabled type="button">
              ↑
            </button>
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
          <button
            aria-label="关闭诊断抽屉"
            className="mobile-close"
            onClick={onClosePanel}
            type="button"
          >
            ×
          </button>
        </div>
        <section className="progress-group" aria-labelledby="material-progress">
          <div className="progress-label">
            <h3 id="material-progress">整份材料</h3>
            <strong>0 / 0</strong>
          </div>
          <div
            aria-label="材料完成进度 0%"
            className="progress-track"
            role="progressbar"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={0}
          >
            <span />
          </div>
          <p>完成的主题会逐步点亮这里。</p>
        </section>
        <section
          className="progress-group current-topic"
          aria-labelledby="topic-progress"
        >
          <span className="eyebrow">当前主题</span>
          <h3 id="topic-progress">还没有主题</h3>
          <div className="score-line">
            <span>未开始</span>
            <strong>0</strong>
          </div>
        </section>
      </aside>
    </>
  );
}
