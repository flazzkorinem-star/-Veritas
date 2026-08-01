import { z } from "zod";

import {
  chunkExtractionSchema,
  diagnosticNodeSchema,
  knowledgeItemSchema,
} from "@/domain/knowledge-map/contracts";
import { STAGE_ORDER } from "@/domain/types";

const chunkIdSchema = z.string().regex(/^chunk-[1-9][0-9]*$/);
const stageSchema = z.enum(STAGE_ORDER);
const agentTwoContext = {
  node: diagnosticNodeSchema,
  knowledgeItems: z.array(knowledgeItemSchema).min(1).max(20),
};
const conversationContext = {
  mainQuestion: z.string().trim().min(1).max(600),
  recentMessages: z
    .array(
      z
        .object({
          role: z.enum(["USER", "ASSISTANT"]),
          content: z.string().trim().min(1).max(2_000),
        })
        .strict(),
    )
    .max(12),
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
      operation: z.literal("CREATE_FIRST_QUESTION"),
      input: z
        .object({
          materialTitle: z.string().trim().min(1).max(255),
          node: diagnosticNodeSchema,
          knowledgeItems: z.array(knowledgeItemSchema).min(1).max(20),
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
      operation: z.literal("EVALUATE_ANSWER"),
      input: z
        .object({
          ...agentTwoContext,
          ...conversationContext,
          stage: stageSchema,
          userAnswer: z.string().trim().min(1).max(4_000),
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
        })
        .strict(),
    })
    .strict(),
]);

export type AgentOperationRequest = z.infer<typeof agentOperationRequestSchema>;
