import { z } from "zod";

import {
  chunkExtractionSchema,
  diagnosticNodeSchema,
  knowledgeItemSchema,
  materialModuleSchema,
} from "@/domain/knowledge-map/contracts";
import { reportAgentInputSchema } from "@/domain/report/contracts";
import { STAGE_ORDER } from "@/domain/types";

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
      modules: z.array(materialModuleSchema).min(1).max(500),
      knowledgeItems: z.array(knowledgeItemSchema).min(1).max(2_000),
      nodes: z.array(diagnosticNodeSchema).min(1).max(1_000),
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

export const agentOperationRequestSchema = z.discriminatedUnion("operation", [
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
      operation: z.literal("CREATE_TOPIC_OPENING"),
      input: z
        .object({
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
            })
            .strict()
            .superRefine((value, context) => {
              if ((value.status === "ACTIVE") !== Boolean(value.mainQuestion)) {
                context.addIssue({
                  code: "custom",
                  message: "诊断状态与当前主问题不一致。",
                });
              }
            }),
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
      operation: z.literal("CREATE_REPORT"),
      input: reportAgentInputSchema,
    })
    .strict(),
]);

export type AgentOperationRequest = z.infer<typeof agentOperationRequestSchema>;
