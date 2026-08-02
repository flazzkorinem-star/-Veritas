import { z } from "zod";

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

export interface ReportDocumentNode {
  nodeId: string;
  title: string;
  score: number;
  stages: Record<StageKey, Extract<StageStatus, `PASSED${string}` | "PASSED">>;
  understood: { statement: string; evidenceQuote: string }[];
  blindSpots: string[];
  evidenceQuotes: string[];
  scaffoldNotes: { type: string; reason: string; learningEffect: string }[];
  learnedOrCorrected: { description: string; basis: string; evidence: string }[];
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
const storedStageStatus = z.enum(["PASSED", "PASSED_WITH_HINT", "PASSED_WITH_ANSWER"]);

export const reportDocumentSchema: z.ZodType<ReportDocument> = z
  .object({
    taskId: z.uuid(),
    materialTitle: z.string().trim().min(1).max(255),
    generatedAt: z.string().datetime(),
    progress: z
      .object({
        completed: z.number().int().min(1).max(40),
        total: z.number().int().min(1).max(40),
      })
      .strict(),
    coverage: z
      .object({
        diagnosed: z.array(storedText).max(40),
        undiagnosed: z.array(storedText).max(40),
        supporting: z.array(storedText).max(200),
        referenceOnly: z.array(storedText).max(200),
      })
      .strict(),
    summary: storedText,
    nodes: z
      .array(
        z
          .object({
            nodeId: z.string().trim().min(1).max(120),
            title: z.string().trim().min(1).max(200),
            score: z.number().int().min(0).max(100),
            stages: z.object({
              MEMORY: storedStageStatus,
              UNDERSTANDING: storedStageStatus,
              APPLICATION: storedStageStatus,
              ANALYSIS: storedStageStatus,
            }),
            understood: z
              .array(
                z.object({ statement: storedText, evidenceQuote: storedText }).strict(),
              )
              .max(12),
            blindSpots: z.array(storedText).max(12),
            evidenceQuotes: z.array(storedText).max(12),
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
            learnedOrCorrected: z
              .array(
                z
                  .object({
                    description: storedText,
                    basis: storedText,
                    evidence: storedText,
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
      .max(40),
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
  return {
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
      const messages = new Map(node.userMessages.map((message) => [message.id, message]));
      const scaffolds = new Map(node.scaffoldEvents.map((event) => [event.id, event]));
      return {
        nodeId: node.nodeId,
        title: node.title,
        score: node.score,
        stages: node.stages,
        understood: insight.understood.map((item) => ({
          statement: item.statement,
          evidenceQuote: messages.get(item.userMessageId)!.content,
        })),
        blindSpots: insight.blindSpots,
        evidenceQuotes: insight.userEvidenceMessageIds.map(
          (id) => messages.get(id)!.content,
        ),
        scaffoldNotes: insight.scaffoldNotes.map((note) => {
          const event = scaffolds.get(note.scaffoldEventId)!;
          return {
            type: event.type,
            reason: event.reason,
            learningEffect: note.learningEffect,
          };
        }),
        learnedOrCorrected: insight.learnedOrCorrected.map((item) => {
          const evidence =
            item.basis === "USER_RESPONSE"
              ? messages.get(item.evidenceId)!.content
              : scaffolds.get(item.evidenceId)!.reason;
          return { description: item.description, basis: item.basis, evidence };
        }),
        nextSteps: insight.nextSteps,
        sourceReferences: insight.sourceReferenceIndexes.map(
          (index) => node.sourceReferences[index]!,
        ),
      };
    }),
  };
}

function escapeMarkdown(value: string) {
  return value.replace(/[\\`*_[\]<>#|]/g, "\\$&");
}

function list(values: string[]) {
  return values.length
    ? values.map((value) => `- ${escapeMarkdown(value)}`).join("\n")
    : "- 无";
}

export function reportToMarkdown(report: ReportDocument) {
  const nodeSections = report.nodes
    .map(
      (node) => `## ${escapeMarkdown(node.title)} · ${node.score} 分

### 四层状态

${Object.entries(node.stages)
  .map(([stage, status]) => `- ${stage}: ${status}`)
  .join("\n")}

### 已经理解

${list(node.understood.map((item) => item.statement))}

### 主要盲点

${list(node.blindSpots)}

### 用户原话证据

${node.evidenceQuotes.length ? node.evidenceQuotes.map((quote) => `> ${escapeMarkdown(quote)}`).join("\n\n") : "无"}

### 家教提供的支架

${list(node.scaffoldNotes.map((note) => `${note.type}：${note.reason}；${note.learningEffect}`))}

### 本次学会或修正

${list(node.learnedOrCorrected.map((item) => item.description))}

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
