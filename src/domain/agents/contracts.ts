import { z } from "zod";

import {
  chunkExtractionSchema,
  diagnosticNodeSchema,
  knowledgeItemSchema,
} from "@/domain/knowledge-map/contracts";

const chunkIdSchema = z.string().regex(/^chunk-[1-9][0-9]*$/);

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
]);

export type AgentOperationRequest = z.infer<typeof agentOperationRequestSchema>;
