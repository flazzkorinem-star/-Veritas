import type { MobilePanel, StoredTask } from "@/storage/types";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { ProgressBar } from "@/ui/ProgressBar";
import { StatusBadge } from "@/ui/StatusBadge";
import { Vita } from "@/ui/Vita";

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
          {activeTask ? <StatusBadge tone="warning">等待主题</StatusBadge> : null}
        </header>
        <section className="chat-empty" aria-live="polite">
          <div className="vita-figure">
            <Vita state={activeTask ? "processing" : "waiting"} size={188} />
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
            <Button aria-label="语音输入" disabled size="icon" variant="ghost">
              <Icon name="microphone" />
            </Button>
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
            <Button aria-label="发送回答" disabled size="icon" variant="ghost">
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
            <strong>0 / 0</strong>
          </div>
          <ProgressBar label="材料完成进度 0%" max={100} value={0} />
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
