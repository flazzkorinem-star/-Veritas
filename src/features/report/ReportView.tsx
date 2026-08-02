import type { StoredReport } from "@/storage/types";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";

interface ReportViewProps {
  report: StoredReport;
  onClose: () => void;
  onDownload: () => void;
  onPrint: () => void;
  onShare: () => void;
}

const STAGE_LABELS = {
  MEMORY: "记忆",
  UNDERSTANDING: "理解",
  APPLICATION: "应用",
  ANALYSIS: "分析",
} as const;

const STATUS_LABELS = {
  PASSED: "独立通过",
  PASSED_WITH_HINT: "提示后通过",
  PASSED_WITH_ANSWER: "依赖答案",
} as const;

function TextList({ empty = "暂无", values }: { empty?: string; values: string[] }) {
  return values.length ? (
    <ul>
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  ) : (
    <p className="report-empty-copy">{empty}</p>
  );
}

export function ReportView(props: ReportViewProps) {
  const document = props.report.document;
  return (
    <div
      aria-label="学习诊断报告"
      aria-modal="true"
      className="report-page"
      role="dialog"
    >
      <header className="report-toolbar">
        <Button aria-label="关闭报告" onClick={props.onClose} size="icon" variant="ghost">
          <Icon name="close" />
        </Button>
        <div>
          <span className="eyebrow">Veritas 学习诊断</span>
          <strong>{document.materialTitle}</strong>
        </div>
        <div className="report-actions">
          <Button onClick={props.onDownload} size="sm" variant="secondary">
            下载 Markdown
          </Button>
          <Button onClick={props.onPrint} size="sm" variant="secondary">
            打印或保存 PDF
          </Button>
          <Button onClick={props.onShare} size="sm" variant="primary">
            分享报告
          </Button>
        </div>
      </header>

      <main className="report-document">
        <section className="report-hero">
          <div>
            <span className="eyebrow">学习诊断报告</span>
            <h1>{document.materialTitle}</h1>
            <p>{document.summary}</p>
          </div>
          <div className="report-progress-card">
            <strong>
              {document.progress.completed} / {document.progress.total} 个主题
            </strong>
            <span>{new Date(document.generatedAt).toLocaleString("zh-CN")}</span>
          </div>
        </section>

        <section className="report-section report-coverage">
          <h2>材料覆盖情况</h2>
          <div className="report-coverage-grid">
            <div>
              <h3>已诊断</h3>
              <TextList values={document.coverage.diagnosed} />
            </div>
            <div>
              <h3>尚未诊断</h3>
              <TextList values={document.coverage.undiagnosed} />
            </div>
            <div>
              <h3>辅助覆盖</h3>
              <TextList values={document.coverage.supporting} />
            </div>
            <div>
              <h3>仅作参考</h3>
              <TextList values={document.coverage.referenceOnly} />
            </div>
          </div>
        </section>

        {document.nodes.map((node, index) => (
          <article className="report-node" key={node.nodeId}>
            <header>
              <div>
                <span>主题 {index + 1}</span>
                <h2>{node.title}</h2>
              </div>
              <strong>{node.score} 分</strong>
            </header>
            <div className="report-stage-grid">
              {Object.entries(node.stages).map(([stage, status]) => (
                <div key={stage} data-status={status}>
                  <span>{STAGE_LABELS[stage as keyof typeof STAGE_LABELS]}</span>
                  <strong>{STATUS_LABELS[status]}</strong>
                </div>
              ))}
            </div>
            <div className="report-detail-grid">
              <section>
                <h3>已经理解</h3>
                <TextList values={node.understood.map((item) => item.statement)} />
              </section>
              <section>
                <h3>主要盲点与误解</h3>
                <TextList values={node.blindSpots} />
              </section>
              <section className="report-wide">
                <h3>用户原话证据</h3>
                {node.evidenceQuotes.length ? (
                  node.evidenceQuotes.map((quote) => (
                    <blockquote key={quote}>{quote}</blockquote>
                  ))
                ) : (
                  <p className="report-empty-copy">暂无可引用原话</p>
                )}
              </section>
              <section>
                <h3>家教提供的支架</h3>
                <TextList
                  values={node.scaffoldNotes.map(
                    (item) => `${item.type}：${item.reason}；${item.learningEffect}`,
                  )}
                />
              </section>
              <section>
                <h3>本次学会或修正</h3>
                <TextList
                  values={node.learnedOrCorrected.map((item) => item.description)}
                />
              </section>
              <section>
                <h3>下一步建议</h3>
                <TextList values={node.nextSteps} />
              </section>
              <section>
                <h3>材料来源</h3>
                {node.sourceReferences.map((source) => (
                  <div
                    className="report-source"
                    key={`${source.label}:${source.excerpt}`}
                  >
                    <strong>{source.label}</strong>
                    <p>{source.excerpt}</p>
                  </div>
                ))}
              </section>
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}
