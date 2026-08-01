import type { TaskStatus } from "../types";
import type { NodeSession } from "./contracts";

export type DiagnosticTaskStatus = Extract<
  TaskStatus,
  "READY" | "IN_PROGRESS" | "COMPLETED"
>;

export function getTaskDiagnosticStatus(
  sessions: readonly NodeSession[],
): DiagnosticTaskStatus {
  if (sessions.length > 0 && sessions.every(({ status }) => status === "COMPLETED")) {
    return "COMPLETED";
  }
  return sessions.some(({ status }) => status !== "NOT_STARTED")
    ? "IN_PROGRESS"
    : "READY";
}

export function getMaterialProgress(sessions: readonly NodeSession[]) {
  return {
    completedNodes: sessions.filter(({ status }) => status === "COMPLETED").length,
    totalNodes: sessions.length,
  };
}

export function getNodeScore(session: NodeSession) {
  return (
    Object.values(session.stages).filter(
      ({ status }) => status === "PASSED" || status === "PASSED_WITH_HINT",
    ).length * 25
  );
}
