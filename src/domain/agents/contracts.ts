import { z } from "zod";

import {
  chunkExtractionSchema,
  diagnosticNodeSchema,
  knowledgeItemSchema,
  materialModuleSchema,
} from "@/domain/knowledge-map/contracts";
import { materialSourceUnitSchema } from "@/domain/knowledge-map/compact-contracts";
import { reportAgentInputSchema } from "@/domain/report/contracts";
import { STAGE_ORDER, STAGE_STATUSES } from "@/domain/types";

const chunkIdSchema = z.string().regex(/^chunk-[1-9][0-9]*$/);
const stageSchema = z.enum(STAGE_ORDER);
const learningGoalSchema = z.string().trim().min(1).max(500).nullable();
const agentTwoContext = {
  node: diagnosticNodeSchema,
  knowledgeItems: z.array(knowledgeItemSchema).min(1).max(20),
  learningGoal: learningGoalSchema,
};
const materialContext = {
  materialContext: z
    .object({
      title: z.string().trim().min(1).max(255),
      modules: z
        .array(materialModuleSchema.pick({ id: true, title: true }).strict())
        .min(1)
        .max(500),
      itemIndex: z
        .array(
          knowledgeItemSchema
            .pick({ id: true, title: true, kind: true, summary: true })
            .partial({ summary: true })
            .strict(),
        )
        .min(1)
        .max(2_000),
    })
    .strict(),
};
const conversationContext = {
  recentMessages: z
    .array(
      z
        .object({
          role: z.enum(["USER", "ASSISTANT"]),
          content: z.string().trim().min(1).max(8_000),
        })
        .strict(),
    )
    .max(20),
};

export const pendingNodeOrderSchema = z
  .object({ nodeIds: z.array(z.string().trim().min(1).max(120)).min(1).max(40) })
  .strict();
export type PendingNodeOrder = z.infer<typeof pendingNodeOrderSchema>;

export const agentOperationRequestSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("EXTRACT_COMPACT_KNOWLEDGE"),
      input: z
        .object({
          shardId: z.string().regex(/^shard-[1-9][0-9]*$/),
          sourceUnits: z
            .array(materialSourceUnitSchema)
            .min(1)
            .max(120)
            .superRefine((units, context) => {
              if (new Set(units.map(({ id }) => id)).size !== units.length) {
                context.addIssue({ code: "custom", message: "来源单元 ID 重复。" });
              }
            }),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("EXTRACT_KNOWLEDGE"),
      input: z
        .object({
          chunkId: chunkIdSchema,
          sourceLabel: z.string().trim().min(1).max(200),
          text: z.string().trim().min(1).max(20_000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("AUDIT_KNOWLEDGE_MAP"),
      input: z
        .object({
          chunks: z
            .array(
              z
                .object({ chunkId: chunkIdSchema, extraction: chunkExtractionSchema })
                .strict(),
            )
            .min(1)
            .max(40),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("CREATE_FIRST_QUESTION"),
      input: z
        .object({
          stage: z.literal("MEMORY"),
          ...materialContext,
          node: diagnosticNodeSchema,
          knowledgeItems: z.array(knowledgeItemSchema).min(1).max(20),
          learningGoal: learningGoalSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("CREATE_STAGE_QUESTION"),
      input: z.object({ ...agentTwoContext, stage: stageSchema }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("CREATE_STAGE_VERIFICATION"),
      input: z
        .object({
          ...agentTwoContext,
          stage: stageSchema,
          mainQuestion: z.string().trim().min(1).max(600),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("RESPOND_TO_USER"),
      input: z
        .object({
          ...agentTwoContext,
          ...materialContext,
          ...conversationContext,
          diagnostic: z
            .object({
              status: z.enum(["NOT_STARTED", "ACTIVE", "COMPLETED"]),
              stage: stageSchema,
              mainQuestion: z.string().trim().min(1).max(600).nullable(),
              currentQuestion: z.string().trim().min(1).max(600).nullable().optional(),
              verificationQuestion: z
                .string()
                .trim()
                .min(1)
                .max(600)
                .nullable()
                .optional(),
              hintLevel: z
                .union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
                .optional(),
              hasRequestedHint: z.boolean().optional(),
              stalledCount: z.number().int().min(0).max(3).optional(),
              answerOrigin: z.enum(["NONE", "REQUESTED", "AUTOMATIC"]).optional(),
              stageStatuses: z
                .object({
                  MEMORY: z.enum(STAGE_STATUSES),
                  UNDERSTANDING: z.enum(STAGE_STATUSES),
                  APPLICATION: z.enum(STAGE_STATUSES),
                  ANALYSIS: z.enum(STAGE_STATUSES),
                })
                .strict()
                .optional(),
            })
            .strict()
            .superRefine((value, context) => {
              if (
                (value.status === "ACTIVE") !==
                Boolean(
                  value.mainQuestion &&
                  (value.currentQuestion === undefined
                    ? value.mainQuestion
                    : value.currentQuestion),
                )
              ) {
                context.addIssue({
                  code: "custom",
                  message: "诊断状态与当前主问题不一致。",
                });
              }
              if (
                value.verificationQuestion &&
                ((value.answerOrigin ?? "NONE") !== "AUTOMATIC" ||
                  value.currentQuestion !== value.verificationQuestion)
              ) {
                context.addIssue({
                  code: "custom",
                  message: "答案验证题与当前诊断事实不一致。",
                });
              }
            })
            .transform((value) => ({
              ...value,
              currentQuestion:
                value.currentQuestion === undefined
                  ? value.mainQuestion
                  : value.currentQuestion,
              verificationQuestion: value.verificationQuestion ?? null,
              hintLevel: value.hintLevel ?? 0,
              hasRequestedHint: value.hasRequestedHint ?? false,
              stalledCount: value.stalledCount ?? 0,
              answerOrigin: value.answerOrigin ?? "NONE",
              stageStatuses:
                value.stageStatuses ??
                Object.fromEntries(
                  STAGE_ORDER.map((stage) => [
                    stage,
                    stage === value.stage && value.status === "ACTIVE"
                      ? "ACTIVE"
                      : "LOCKED",
                  ]),
                ),
            })),
          userMessage: z.string().trim().min(1).max(12_000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("CREATE_HINT"),
      input: z
        .object({
          ...agentTwoContext,
          ...conversationContext,
          stage: stageSchema,
          mainQuestion: z.string().trim().min(1).max(600),
          hintLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("CREATE_STAGE_ANSWER"),
      input: z
        .object({
          ...agentTwoContext,
          ...conversationContext,
          stage: stageSchema,
          mainQuestion: z.string().trim().min(1).max(600),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("PRIORITIZE_PENDING_NODES"),
      input: z
        .object({
          learningGoal: z.string().trim().min(1).max(500),
          pendingNodes: z
            .array(
              diagnosticNodeSchema
                .pick({ id: true, title: true, objective: true, order: true })
                .strict(),
            )
            .min(2)
            .max(40),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("CREATE_REPORT"),
      input: reportAgentInputSchema,
    })
    .strict(),
]);

export type AgentOperationRequest = z.infer<typeof agentOperationRequestSchema>;
