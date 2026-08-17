import { z } from "zod";

import {
  MAX_DIAGNOSTIC_NODES,
  MAX_KNOWLEDGE_ITEMS,
} from "@/config/knowledge-map-limits";
import { MAX_REPORT_SUMMARY_CHARACTERS } from "@/config/report-limits";
import type { StageKey, StageStatus } from "@/domain/types";

import {
  validateReportEvidence,
  type ReportAgentInput,
  type ReportAgentOutput,
} from "./contracts";

export interface ReportCoverage {
  diagnosed: string[];
  undiagnosed: string[];
  supporting: string[];
  referenceOnly: string[];
}

export type LearningEvidenceCategory =
  "INDEPENDENT" | "AFTER_HINT" | "AFTER_TEACHING_VERIFIED" | "EXPLAINED_NOT_VERIFIED";

export interface ReportDocumentNode {
  nodeId: string;
  title: string;
  score: number;
  stages: Record<StageKey, Extract<StageStatus, `PASSED${string}` | "PASSED">>;
  learningEvidence: {
    stage: StageKey;
    category: LearningEvidenceCategory;
    statement: string;
    evidenceQuote: string | null;
  }[];
  misconceptions: { description: string; evidenceQuote: string }[];
  understood: { statement: string; evidenceQuote: string }[];
  blindSpots: string[];
  scaffoldNotes: { type: string; reason: string; learningEffect: string }[];
  nextSteps: string[];
  sourceReferences: { label: string; excerpt: string }[];
}

export interface ReportDocument {
  taskId: string;
  materialTitle: string;
  generatedAt: string;
  progress: { completed: number; total: number };
  coverage: ReportCoverage;
  summary: string;
  nodes: ReportDocumentNode[];
}

const storedText = z.string().trim().min(1).max(2_000);
const storedSummary = z.string().trim().min(1).max(MAX_REPORT_SUMMARY_CHARACTERS);
const storedStageStatus = z.enum(["PASSED", "PASSED_WITH_HINT", "PASSED_WITH_ANSWER"]);

export const reportDocumentSchema: z.ZodType<ReportDocument> = z
  .object({
    taskId: z.uuid(),
    materialTitle: z.string().trim().min(1).max(255),
    generatedAt: z.string().datetime(),
    progress: z
      .object({
        completed: z.number().int().min(1).max(MAX_DIAGNOSTIC_NODES),
        total: z.number().int().min(1).max(MAX_DIAGNOSTIC_NODES),
      })
      .strict(),
    coverage: z
      .object({
        diagnosed: z.array(storedText).max(MAX_DIAGNOSTIC_NODES),
        undiagnosed: z.array(storedText).max(MAX_DIAGNOSTIC_NODES),
        supporting: z.array(storedText).max(MAX_KNOWLEDGE_ITEMS),
        referenceOnly: z.array(storedText).max(MAX_KNOWLEDGE_ITEMS),
      })
      .strict(),
    summary: storedSummary,
    nodes: z
      .array(
        z
          .object({
            nodeId: z.string().trim().min(1).max(120),
            title: z.string().trim().min(1).max(200),
            score: z.number().int().min(0).max(100),
            stages: z
              .object({
                MEMORY: storedStageStatus,
                UNDERSTANDING: storedStageStatus,
                APPLICATION: storedStageStatus,
                ANALYSIS: storedStageStatus,
              })
              .strict(),
            learningEvidence: z
              .array(
                z
                  .object({
                    stage: z.enum(["MEMORY", "UNDERSTANDING", "APPLICATION", "ANALYSIS"]),
                    category: z.enum([
                      "INDEPENDENT",
                      "AFTER_HINT",
                      "AFTER_TEACHING_VERIFIED",
                      "EXPLAINED_NOT_VERIFIED",
                    ]),
                    statement: storedText,
                    evidenceQuote: storedText.nullable(),
                  })
                  .strict(),
              )
              .max(4)
              .default([]),
            misconceptions: z
              .array(
                z.object({ description: storedText, evidenceQuote: storedText }).strict(),
              )
              .max(12)
              .default([]),
            understood: z
              .array(
                z.object({ statement: storedText, evidenceQuote: storedText }).strict(),
              )
              .max(12),
            blindSpots: z.array(storedText).max(12),
            scaffoldNotes: z
              .array(
                z
                  .object({
                    type: storedText,
                    reason: storedText,
                    learningEffect: storedText,
                  })
                  .strict(),
              )
              .max(12),
            nextSteps: z.array(storedText).min(1).max(8),
            sourceReferences: z
              .array(z.object({ label: storedText, excerpt: storedText }).strict())
              .min(1)
              .max(12),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_DIAGNOSTIC_NODES),
  })
  .strict();

export function buildReportDocument(options: {
  taskId: string;
  generatedAt: string;
  totalNodeCount: number;
  coverage: ReportCoverage;
  input: ReportAgentInput;
  output: ReportAgentOutput;
}): ReportDocument {
  const output = validateReportEvidence(options.input, options.output);
  const insightByNode = new Map(output.nodeInsights.map((node) => [node.nodeId, node]));
  return reportDocumentSchema.parse({
    taskId: options.taskId,
    materialTitle: options.input.materialTitle,
    generatedAt: options.generatedAt,
    progress: {
      completed: options.input.completedNodes.length,
      total: options.totalNodeCount,
    },
    coverage: options.coverage,
    summary: output.summary,
    nodes: options.input.completedNodes.map((node) => {
      const insight = insightByNode.get(node.nodeId)!;
      const messages = new Map(
        node.messages
          .filter((message) => message.role === "USER")
          .map((message) => [message.id, message]),
      );
      const scaffolds = new Map(node.scaffoldEvents.map((event) => [event.id, event]));
      return {
        nodeId: node.nodeId,
        title: node.title,
        score: node.score,
        stages: Object.fromEntries(
          Object.entries(node.stages).map(([stage, state]) => [stage, state.status]),
        ) as ReportDocumentNode["stages"],
        learningEvidence: insight.learningEvidence.map((item) => ({
          stage: item.stage,
          category: item.category,
          statement: item.statement,
          evidenceQuote:
            item.userMessageId === null
              ? null
              : messages.get(item.userMessageId)!.content,
        })),
        misconceptions: insight.misconceptions.map((item) => ({
          description: item.description,
          evidenceQuote: messages.get(item.userMessageId)!.content,
        })),
        understood: insight.learningEvidence.flatMap((item) =>
          item.userMessageId === null
            ? []
            : [
                {
                  statement: item.statement,
                  evidenceQuote: messages.get(item.userMessageId)!.content,
                },
              ],
        ),
        blindSpots: [
          ...insight.misconceptions.map((item) => item.description),
          ...insight.learningEvidence
            .filter((item) => item.category === "EXPLAINED_NOT_VERIFIED")
            .map((item) => item.statement),
        ],
        scaffoldNotes: insight.scaffoldNotes.map((note) => {
          const event = scaffolds.get(note.scaffoldEventId)!;
          return {
            type: event.type,
            reason: event.reason,
            learningEffect: note.learningEffect,
          };
        }),
        nextSteps: insight.nextSteps,
        sourceReferences: insight.sourceReferenceIndexes.map(
          (index) => node.sourceReferences[index]!,
        ),
      };
    }),
  });
}

function escapeMarkdown(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/[\\`*_[\]#|]/g, "\\$&");
}

function list(values: string[]) {
  return values.length
    ? values.map((value) => `- ${escapeMarkdown(value)}`).join("\n")
    : "- 无";
}

function evidenceList(items: ReportDocumentNode["learningEvidence"]) {
  return items.length
    ? items
        .map(
          (item) =>
            `- ${escapeMarkdown(item.statement)}${item.evidenceQuote ? `\n\n> ${escapeMarkdown(item.evidenceQuote)}` : ""}`,
        )
        .join("\n\n")
    : "- 无";
}

export const REPORT_STAGE_LABELS: Record<StageKey, string> = {
  MEMORY: "记忆",
  UNDERSTANDING: "理解",
  APPLICATION: "应用",
  ANALYSIS: "分析",
};

export const REPORT_STATUS_LABELS: Record<
  ReportDocumentNode["stages"][StageKey],
  string
> = {
  PASSED: "答对",
  PASSED_WITH_HINT: "提示后通过",
  PASSED_WITH_ANSWER: "使用过完整答案",
};

export const LEARNING_EVIDENCE_LABELS: Record<LearningEvidenceCategory, string> = {
  INDEPENDENT: "原本就会",
  AFTER_HINT: "提示或引导后通过",
  AFTER_TEACHING_VERIFIED: "讲解后经过验证学会",
  EXPLAINED_NOT_VERIFIED: "看过答案但未验证",
};

export function reportToMarkdown(report: ReportDocument) {
  const nodeSections = report.nodes
    .map(
      (node) => `## ${escapeMarkdown(node.title)} · ${node.score} 分

### 四层状态

${Object.entries(node.stages)
  .map(
    ([stage, status]) =>
      `- ${REPORT_STAGE_LABELS[stage as StageKey]}：${REPORT_STATUS_LABELS[status]}`,
  )
  .join("\n")}

${(Object.keys(LEARNING_EVIDENCE_LABELS) as LearningEvidenceCategory[])
  .map((category) => {
    const items = node.learningEvidence.filter((item) => item.category === category);
    return `### ${LEARNING_EVIDENCE_LABELS[category]}\n\n${evidenceList(items)}`;
  })
  .join("\n\n")}

### 仍然存在的误解

${list(node.misconceptions.map((item) => item.description))}

### 家教提供的支架

${list(node.scaffoldNotes.map((note) => `${note.type}：${note.reason}；${note.learningEffect}`))}

### 下一步建议

${list(node.nextSteps)}

### 材料来源

${list(node.sourceReferences.map((source) => `${source.label}：${source.excerpt}`))}`,
    )
    .join("\n\n");

  return `# ${escapeMarkdown(report.materialTitle)} · 学习诊断报告

- 诊断时间：${report.generatedAt}
- 总体进度：${report.progress.completed} / ${report.progress.total}

## 总结

${escapeMarkdown(report.summary)}

## 覆盖情况

- 已诊断：${escapeMarkdown(report.coverage.diagnosed.join("、") || "无")}
- 尚未诊断：${escapeMarkdown(report.coverage.undiagnosed.join("、") || "无")}
- 辅助覆盖：${escapeMarkdown(report.coverage.supporting.join("、") || "无")}
- 仅作参考：${escapeMarkdown(report.coverage.referenceOnly.join("、") || "无")}

${nodeSections}
`;
}
