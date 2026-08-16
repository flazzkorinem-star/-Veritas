import { z } from "zod";

export const materialProcessingTraceSchema = z
  .object({
    extractionRequestCount: z.number().int().nonnegative(),
    splitCount: z.number().int().nonnegative(),
    mergeRequestCount: z.number().int().nonnegative(),
    mergeBypassCount: z.number().int().nonnegative(),
    compilePartitionCount: z.number().int().positive(),
    repairedRequestCount: z.number().int().nonnegative(),
    deterministicFallbackCount: z.literal(0),
    finalCompileSource: z.literal("MODEL_VALIDATED"),
  })
  .strict();

export type MaterialProcessingTrace = z.infer<typeof materialProcessingTraceSchema>;
