import type { StoredReport } from "@/storage/types";
import {
  LEARNING_EVIDENCE_LABELS,
  REPORT_STAGE_LABELS,
  REPORT_STATUS_LABELS,
  type ReportDocumentNode,
} from "@/domain/report/build-report";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";

interface ReportViewProps {
  report: StoredReport;
  onClose: () => void;
  onDownload: () => void;
  onPrint: () => void;
  onShare: () => void;
}

function stageResultLabel(
  node: ReportDocumentNode,
  stage: keyof typeof REPORT_STAGE_LABELS,
) {
  const evidence = node.learningEvidence.find((item) => item.stage === stage);
  return evidence
    ? LEARNING_EVIDENCE_LABELS[evidence.category]
    : REPORT_STATUS_LABELS[node.stages[stage]];
}

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
                  <span>
                    {REPORT_STAGE_LABELS[stage as keyof typeof REPORT_STAGE_LABELS]}
                  </span>
                  <strong>
                    {stageResultLabel(
                      node,
                      stage as keyof typeof REPORT_STAGE_LABELS,
                    )}
                  </strong>
                </div>
              ))}
            </div>
            <div className="report-detail-grid">
              {Object.entries(LEARNING_EVIDENCE_LABELS).map(([category, label]) => {
                const evidence = node.learningEvidence.filter(
                  (item) => item.category === category,
                );
                return (
                  <section key={category}>
                    <h3>{label}</h3>
                    {evidence.length ? (
                      evidence.map((item) => (
                        <div key={item.stage}>
                          <p>{item.statement}</p>
                          {item.evidenceQuote ? (
                            <blockquote>{item.evidenceQuote}</blockquote>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="report-empty-copy">暂无</p>
                    )}
                  </section>
                );
              })}
              {node.learningEvidence.length === 0 ? (
                <section>
                  <h3>已验证的内容</h3>
                  <TextList values={node.understood.map((item) => item.statement)} />
                </section>
              ) : null}
              <section>
                <h3>仍然存在的误解</h3>
                <TextList
                  values={
                    node.misconceptions.length
                      ? node.misconceptions.map((item) => item.description)
                      : node.blindSpots
                  }
                />
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
