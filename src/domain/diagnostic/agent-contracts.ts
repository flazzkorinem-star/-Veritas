import { z } from "zod";

import { ANSWER_CLASSIFICATIONS } from "../types";

export const TEACHING_MOVES = [
  "AFFIRM_AND_ADVANCE",
  "ASK_MISSING_POINT",
  "CLARIFY_CONFLICT",
  "REQUEST_OWN_WORDS",
  "USE_COUNTEREXAMPLE",
  "BRIDGE_BACK",
  "PROVIDE_SCAFFOLD",
  "PAUSE",
] as const;

export const SCAFFOLD_TYPES = [
  "CLARIFICATION",
  "EXAMPLE",
  "ANALOGY",
  "COUNTEREXAMPLE",
  "STEP_BY_STEP",
] as const;

const evidenceSchema = z.string().trim().min(1).max(600);
const evidenceListSchema = z.array(evidenceSchema).max(12);
const assistantMessageSchema = z.string().trim().min(1).max(2_000);

export const evaluationDecisionSchema = z
  .object({
    classification: z.enum(ANSWER_CLASSIFICATIONS),
    isCorrect: z.boolean(),
    progress: z.enum(["ADVANCING", "STALLED"]),
    correctEvidence: evidenceListSchema,
    missingPoints: evidenceListSchema,
    misconceptions: evidenceListSchema,
    teachingMove: z.enum(TEACHING_MOVES),
    scaffold: z
      .object({
        type: z.enum(SCAFFOLD_TYPES),
        reason: evidenceSchema,
      })
      .strict()
      .nullable(),
    assistantMessage: assistantMessageSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.isCorrect !== (value.classification === "CORRECT")) {
      context.addIssue({ code: "custom", message: "正确性与回答分类矛盾。" });
    }
    if (value.isCorrect && value.progress !== "ADVANCING") {
      context.addIssue({ code: "custom", message: "正确回答必须代表有进展。" });
    }
  });

export const stageQuestionSchema = z
  .object({ question: z.string().trim().min(1).max(600) })
  .strict();

export const hintResponseSchema = z
  .object({
    hintLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    assistantMessage: assistantMessageSchema,
  })
  .strict();

export const stageAnswerSchema = z
  .object({ assistantMessage: assistantMessageSchema })
  .strict();

export type TeachingMove = (typeof TEACHING_MOVES)[number];
export type ScaffoldType = (typeof SCAFFOLD_TYPES)[number];
export type EvaluationDecision = z.infer<typeof evaluationDecisionSchema>;
export type StageQuestion = z.infer<typeof stageQuestionSchema>;
export type HintResponse = z.infer<typeof hintResponseSchema>;
export type StageAnswer = z.infer<typeof stageAnswerSchema>;
