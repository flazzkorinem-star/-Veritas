import type { ReportDocument } from "@/domain/report/build-report";

export const TASK_STATUSES = [
  "PROCESSING",
  "READY",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const NODE_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const STAGE_ORDER = [
  "MEMORY",
  "UNDERSTANDING",
  "APPLICATION",
  "ANALYSIS",
] as const;
export type StageKey = (typeof STAGE_ORDER)[number];

export const STAGE_STATUSES = [
  "LOCKED",
  "ACTIVE",
  "PASSED",
  "PASSED_WITH_HINT",
  "PASSED_WITH_ANSWER",
] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const ANSWER_CLASSIFICATIONS = [
  "CORRECT",
  "PARTIAL",
  "INCORRECT",
  "TOO_SHORT",
  "COPIED",
  "MISCONCEPTION",
  "OFF_TOPIC",
  "NO_ANSWER",
] as const;
export type AnswerClassification = (typeof ANSWER_CLASSIFICATIONS)[number];
export type Progress = "ADVANCING" | "STALLED";

export interface SourceReference {
  label: string;
  excerpt: string;
}

export interface MaterialModule {
  id: string;
  title: string;
  sourceRange: string;
}

export interface KnowledgeItem {
  id: string;
  moduleId: string;
  title: string;
  summary: string;
  kind: "CORE" | "SUPPORTING";
  diagnosticRationale: string;
  sourceReferences: SourceReference[];
  commonMisconceptions: string[];
}

export interface DiagnosticNode {
  id: string;
  moduleId: string;
  title: string;
  objective: string;
  knowledgeItemIds: string[];
  sourceReferences: SourceReference[];
  canonicalUnderstanding: string;
  commonMisconceptions: string[];
  bloomTargets: {
    memory: string;
    understanding: string;
    application: string;
    analysis: string;
  };
  order: number;
}

export type CoverageAssignment = { knowledgeItemId: string } & (
  | {
      disposition: "DIAGNOSED_IN_NODE" | "SUPPORTING_IN_NODE";
      nodeId: string;
    }
  | {
      disposition: "REFERENCE_ONLY";
      reason: string;
    }
);

export interface Task {
  id: string;
  title: string;
  materialId: string;
  status: TaskStatus;
  currentNodeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  nodeId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

export interface Report {
  id: string;
  taskId: string;
  markdown: string;
  document: ReportDocument;
  completedNodeIds: string[];
  createdAt: string;
  updatedAt: string;
}
