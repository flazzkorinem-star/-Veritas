import { z } from "zod";

import { STAGE_ORDER } from "@/domain/types";

const completedStageStatusSchema = z.enum([
  "PASSED",
  "PASSED_WITH_HINT",
  "PASSED_WITH_ANSWER",
]);
const identifierSchema = z.string().trim().min(1).max(120);
const shortTextSchema = z.string().trim().min(1).max(1_200);

export const reportAgentInputSchema = z
  .object({
    materialTitle: z.string().trim().min(1).max(255),
    completedNodes: z
      .array(
        z
          .object({
            nodeId: identifierSchema,
            title: z.string().trim().min(1).max(200),
            canonicalUnderstanding: shortTextSchema,
            commonMisconceptions: z.array(shortTextSchema).max(20),
            score: z.number().int().min(0).max(100),
            stages: z.object({
              MEMORY: completedStageStatusSchema,
              UNDERSTANDING: completedStageStatusSchema,
              APPLICATION: completedStageStatusSchema,
              ANALYSIS: completedStageStatusSchema,
            }),
            userMessages: z
              .array(
                z.object({ id: identifierSchema, content: shortTextSchema }).strict(),
              )
              .max(80),
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
      .max(40),
  })
  .strict();

const understoodSchema = z
  .object({ statement: shortTextSchema, userMessageId: identifierSchema })
  .strict();
const scaffoldNoteSchema = z
  .object({ scaffoldEventId: identifierSchema, learningEffect: shortTextSchema })
  .strict();
const learnedSchema = z
  .object({
    description: shortTextSchema,
    basis: z.enum(["USER_RESPONSE", "TUTOR_GUIDANCE"]),
    evidenceId: identifierSchema,
  })
  .strict();
const internalReportTermPattern = /\bPASSED(?:_WITH_(?:HINT|ANSWER))?\b|确定性分数/;

export const reportAgentOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(2_000),
    nodeInsights: z
      .array(
        z
          .object({
            nodeId: identifierSchema,
            understood: z.array(understoodSchema).max(12),
            blindSpots: z.array(shortTextSchema).max(12),
            userEvidenceMessageIds: z.array(identifierSchema).max(12),
            scaffoldNotes: z.array(scaffoldNoteSchema).max(12),
            learnedOrCorrected: z.array(learnedSchema).max(12),
            nextSteps: z.array(shortTextSchema).min(1).max(8),
            sourceReferenceIndexes: z.array(z.number().int().min(0)).min(1).max(12),
          })
          .strict(),
      )
      .min(1)
      .max(40),
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
    const messageIds = new Set(node.userMessages.map((message) => message.id));
    const scaffoldIds = new Set(node.scaffoldEvents.map((event) => event.id));
    const hasInvalidEvidence =
      insight.understood.some((item) => !messageIds.has(item.userMessageId)) ||
      insight.userEvidenceMessageIds.some((id) => !messageIds.has(id)) ||
      insight.scaffoldNotes.some((note) => !scaffoldIds.has(note.scaffoldEventId)) ||
      insight.learnedOrCorrected.some((item) =>
        item.basis === "USER_RESPONSE"
          ? !messageIds.has(item.evidenceId)
          : !scaffoldIds.has(item.evidenceId),
      ) ||
      insight.sourceReferenceIndexes.some(
        (index) => index >= node.sourceReferences.length,
      );
    if (hasInvalidEvidence) {
      throw new Error("报告引用了不存在的本地证据。");
    }
  }
  return output;
}
