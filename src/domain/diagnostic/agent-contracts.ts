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
const assistantMessageSchema = z.string().trim().min(1).max(8_000);

const evaluationFields = {
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
} as const;

function validateEvaluation(
  value: {
    classification: string;
    isCorrect: boolean;
    progress: string;
    correctEvidence: readonly string[];
    missingPoints: readonly string[];
  },
  context: z.core.$RefinementCtx,
) {
  if (value.isCorrect !== (value.classification === "CORRECT")) {
    context.addIssue({ code: "custom", message: "正确性与回答分类矛盾。" });
  }
  if (value.isCorrect && value.progress !== "ADVANCING") {
    context.addIssue({ code: "custom", message: "正确回答必须代表有进展。" });
  }
  if (value.classification === "NO_ANSWER" && value.progress !== "STALLED") {
    context.addIssue({ code: "custom", message: "无法作答必须记为停滞。" });
  }
  if (value.classification === "COPIED" && value.progress !== "STALLED") {
    context.addIssue({ code: "custom", message: "复述内容不能算作新进展。" });
  }
  if (value.classification === "CORRECT" && value.correctEvidence.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["correctEvidence"],
      message: "正确回答必须包含直接通过证据。",
    });
  }
  if (value.classification === "CORRECT" && value.missingPoints.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["missingPoints"],
      message: "正确回答不能仍有未满足点。",
    });
  }
}

const learningGoalUpdateSchema = z.string().trim().min(1).max(500).nullable();
const actionIntentFields = {
  learningGoalUpdate: learningGoalUpdateSchema.optional(),
  assistantMessage: assistantMessageSchema.optional(),
} as const;

export const userTurnDecisionSchema = z
  .discriminatedUnion("responseMode", [
    z
      .object({
        responseMode: z.literal("CONVERSATION"),
        learningGoalUpdate: learningGoalUpdateSchema,
        assistantMessage: assistantMessageSchema,
      })
      .strict(),
    z
      .object({
        responseMode: z.literal("START_DIAGNOSTIC"),
        learningGoalUpdate: learningGoalUpdateSchema,
        assistantMessage: assistantMessageSchema,
        question: z.string().trim().min(1).max(600),
      })
      .strict(),
    z
      .object({
        responseMode: z.literal("EVALUATE_DIAGNOSTIC"),
        learningGoalUpdate: learningGoalUpdateSchema,
        ...evaluationFields,
        assistantMessage: assistantMessageSchema,
      })
      .strict(),
    z.object({ responseMode: z.literal("REQUEST_HINT"), ...actionIntentFields }).strict(),
    z
      .object({ responseMode: z.literal("REVEAL_ANSWER"), ...actionIntentFields })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (value.responseMode === "EVALUATE_DIAGNOSTIC") {
      validateEvaluation(value, context);
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

export type ScaffoldType = (typeof SCAFFOLD_TYPES)[number];
export type UserTurnDecision = z.infer<typeof userTurnDecisionSchema>;
export type StageQuestion = z.infer<typeof stageQuestionSchema>;
export type HintResponse = z.infer<typeof hintResponseSchema>;
export type StageAnswer = z.infer<typeof stageAnswerSchema>;
