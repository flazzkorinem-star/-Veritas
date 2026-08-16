import { z } from "zod";

export const agentOperationMetaSchema = z
  .object({
    attempts: z.number().int().min(1).max(3),
    repaired: z.boolean(),
    validationSource: z.literal("MODEL_VALIDATED"),
  })
  .strict();

export type AgentOperationMeta = z.infer<typeof agentOperationMetaSchema>;
