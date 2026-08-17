import { z } from "zod";

import {
  REPORT_AGENT_NODE_LIMIT,
  REPORT_AGENT_SUMMARY_CHARACTER_LIMIT,
} from "@/config/report-limits";
import { STAGE_ORDER } from "@/domain/types";

const completedStageStatusSchema = z.enum([
  "PASSED",
  "PASSED_WITH_HINT",
  "PASSED_WITH_ANSWER",
]);
const identifierSchema = z.string().trim().min(1).max(120);
const shortTextSchema = z.string().trim().min(1).max(1_200);
const messageContentSchema = z.string().trim().min(1).max(12_000);
const answerOriginSchema = z.enum(["NONE", "REQUESTED", "AUTOMATIC"]);
const completedStageSchema = z
  .object({
    status: completedStageStatusSchema,
    mainQuestion: shortTextSchema,
    verificationQuestion: shortTextSchema.nullable(),
    answerOrigin: answerOriginSchema,
    hintLevel: z.number().int().min(0).max(3),
  })
  .strict()
  .superRefine((value, context) => {
    const answerStateMatches =
      value.status === "PASSED_WITH_ANSWER"
        ? value.answerOrigin !== "NONE"
        : value.answerOrigin === "NONE";
    const automaticVerificationMatches =
      value.answerOrigin !== "AUTOMATIC" || value.verificationQuestion !== null;
    const hintMatches = value.status !== "PASSED_WITH_HINT" || value.hintLevel > 0;
    if (!answerStateMatches || !automaticVerificationMatches || !hintMatches) {
      context.addIssue({
        code: "custom",
        message: "报告层级事实相互矛盾。",
      });
    }
  });

export const reportAgentInputSchema = z
  .object({
    materialTitle: z.string().trim().min(1).max(255),
    learningGoal: z.string().trim().min(1).max(500).nullable(),
    completedNodes: z
      .array(
        z
          .object({
            nodeId: identifierSchema,
            title: z.string().trim().min(1).max(200),
            canonicalUnderstanding: shortTextSchema,
            commonMisconceptions: z.array(shortTextSchema).max(20),
            score: z.number().int().min(0).max(100),
            stages: z
              .object({
                MEMORY: completedStageSchema,
                UNDERSTANDING: completedStageSchema,
                APPLICATION: completedStageSchema,
                ANALYSIS: completedStageSchema,
              })
              .strict(),
            messages: z
              .array(
                z
                  .object({
                    id: identifierSchema,
                    role: z.enum(["USER", "ASSISTANT"]),
                    content: messageContentSchema,
                  })
                  .strict(),
              )
              .max(160),
            scaffoldEvents: z
              .array(
                z
                  .object({
                    id: identifierSchema,
                    stage: z.enum(STAGE_ORDER),
                    type: z.enum([
                      "CLARIFICATION",
                      "EXAMPLE",
                      "ANALOGY",
                      "COUNTEREXAMPLE",
                      "STEP_BY_STEP",
                    ]),
                    reason: shortTextSchema,
                  })
                  .strict(),
              )
              .max(40),
            sourceReferences: z
              .array(
                z
                  .object({
                    label: z.string().trim().min(1).max(200),
                    excerpt: shortTextSchema,
                  })
                  .strict(),
              )
              .min(1)
              .max(30),
          })
          .strict(),
      )
      .min(1)
      .max(REPORT_AGENT_NODE_LIMIT),
  })
  .strict();

const scaffoldNoteSchema = z
  .object({ scaffoldEventId: identifierSchema, learningEffect: shortTextSchema })
  .strict();
const learningEvidenceSchema = z
  .object({
    stage: z.enum(STAGE_ORDER),
    category: z.enum([
      "INDEPENDENT",
      "AFTER_HINT",
      "AFTER_TEACHING_VERIFIED",
      "EXPLAINED_NOT_VERIFIED",
    ]),
    statement: shortTextSchema,
    userMessageId: identifierSchema.nullable(),
  })
  .strict();
const misconceptionSchema = z
  .object({ description: shortTextSchema, userMessageId: identifierSchema })
  .strict();
const internalReportTermPattern = /\bPASSED(?:_WITH_(?:HINT|ANSWER))?\b|确定性分数/;

export const reportAgentOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(REPORT_AGENT_SUMMARY_CHARACTER_LIMIT),
    nodeInsights: z
      .array(
        z
          .object({
            nodeId: identifierSchema,
            learningEvidence: z.array(learningEvidenceSchema).length(4),
            misconceptions: z.array(misconceptionSchema).max(12),
            scaffoldNotes: z.array(scaffoldNoteSchema).max(12),
            nextSteps: z.array(shortTextSchema).min(1).max(8),
            sourceReferenceIndexes: z.array(z.number().int().min(0)).min(1).max(12),
          })
          .strict(),
      )
      .min(1)
      .max(REPORT_AGENT_NODE_LIMIT),
  })
  .strict()
  .superRefine((value, context) => {
    if (internalReportTermPattern.test(JSON.stringify(value))) {
      context.addIssue({
        code: "custom",
        message: "用户可见报告不得包含内部实现术语。",
      });
    }
  });

export type ReportAgentInput = z.infer<typeof reportAgentInputSchema>;
export type ReportAgentOutput = z.infer<typeof reportAgentOutputSchema>;

export function expectedLearningEvidenceCategory(
  state: ReportAgentInput["completedNodes"][number]["stages"][(typeof STAGE_ORDER)[number]],
  hasScaffold: boolean,
) {
  if (
    state.status === "PASSED_WITH_ANSWER" &&
    state.answerOrigin === "AUTOMATIC" &&
    state.verificationQuestion
  ) {
    return "AFTER_TEACHING_VERIFIED" as const;
  }
  if (state.status === "PASSED_WITH_ANSWER") {
    return "EXPLAINED_NOT_VERIFIED" as const;
  }
  if (state.status === "PASSED_WITH_HINT" || hasScaffold) {
    return "AFTER_HINT" as const;
  }
  return "INDEPENDENT" as const;
}

export function validateReportEvidence(
  input: ReportAgentInput,
  output: ReportAgentOutput,
) {
  const nodeInputs = new Map(input.completedNodes.map((node) => [node.nodeId, node]));
  const outputIds = output.nodeInsights.map((node) => node.nodeId);
  if (
    new Set(outputIds).size !== outputIds.length ||
    outputIds.length !== nodeInputs.size ||
    outputIds.some((id) => !nodeInputs.has(id))
  ) {
    throw new Error("报告主题与已完成主题不匹配。");
  }

  for (const insight of output.nodeInsights) {
    const node = nodeInputs.get(insight.nodeId)!;
    const messageIds = new Set(
      node.messages
        .filter((message) => message.role === "USER")
        .map((message) => message.id),
    );
    const scaffoldIds = new Set(node.scaffoldEvents.map((event) => event.id));
    const evidenceStages = insight.learningEvidence.map((item) => item.stage);
    const hasInvalidStageConclusion =
      new Set(evidenceStages).size !== STAGE_ORDER.length ||
      STAGE_ORDER.some((stage) => !evidenceStages.includes(stage)) ||
      insight.learningEvidence.some((item) => {
        const expected = expectedLearningEvidenceCategory(
          node.stages[item.stage],
          node.scaffoldEvents.some((event) => event.stage === item.stage),
        );
        const needsUserEvidence = expected !== "EXPLAINED_NOT_VERIFIED";
        return (
          item.category !== expected ||
          (needsUserEvidence && item.userMessageId === null) ||
          (!needsUserEvidence && item.userMessageId !== null)
        );
      });
    if (hasInvalidStageConclusion) {
      throw new Error("报告结论与确定性诊断状态不匹配。");
    }

    const hasInvalidEvidence =
      insight.learningEvidence.some(
        (item) => item.userMessageId !== null && !messageIds.has(item.userMessageId),
      ) ||
      insight.misconceptions.some((item) => !messageIds.has(item.userMessageId)) ||
      insight.scaffoldNotes.some((note) => !scaffoldIds.has(note.scaffoldEventId)) ||
      insight.sourceReferenceIndexes.some(
        (index) => index >= node.sourceReferences.length,
      );
    if (hasInvalidEvidence) {
      throw new Error("报告引用了不存在的本地证据。");
    }
  }
  return output;
}
