import { z } from "zod";

export const publicErrorCodeSchema = z.enum([
  "CONFIGURATION_ERROR",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
  "MODEL_OUTPUT_INVALID",
  "UPSTREAM_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export const publicErrorSchema = z
  .object({
    error: z
      .object({
        code: publicErrorCodeSchema,
        message: z.string().trim().min(1).max(200),
        errorId: z.string().uuid(),
      })
      .strict(),
  })
  .strict();

export function createPublicError(
  code: z.infer<typeof publicErrorCodeSchema>,
  message: string,
  errorId = crypto.randomUUID(),
) {
  return publicErrorSchema.parse({ error: { code, message, errorId } });
}
