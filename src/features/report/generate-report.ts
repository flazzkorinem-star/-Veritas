import { getNodeScore } from "@/domain/diagnostic/selectors";
import type { NodeSession } from "@/domain/diagnostic/contracts";
import { REPORT_AGENT_NODE_LIMIT } from "@/config/report-limits";
import {
  buildReportDocument,
  reportDocumentSchema,
  reportToMarkdown,
  type ReportDocument,
} from "@/domain/report/build-report";
import type { ReportAgentOutput } from "@/domain/report/contracts";
import type { AgentOperationRequest } from "@/domain/agents/contracts";
import { STAGE_ORDER } from "@/domain/types";
import { callAgent } from "@/features/materials/agent-client";
import type {
  StoredMaterial,
  StoredMessage,
  StoredReport,
  StoredScaffoldEvent,
  StoredTask,
} from "@/storage/types";

interface ReportGenerationData {
  task: Pick<StoredTask, "id" | "fileName" | "learningGoal">;
  material: Pick<StoredMaterial, "nodes" | "knowledgeItems" | "coverageAssignments">;
  sessions: {
    nodeId: string;
    session: Pick<NodeSession, "status" | "stages">;
    scaffoldEvents?: StoredScaffoldEvent[];
  }[];
  messages: Pick<StoredMessage, "id" | "nodeId" | "role" | "content">[];
  report?: Pick<StoredReport, "document">;
}

interface ReportRepository {
  getReportGenerationData(taskId: string): Promise<ReportGenerationData>;
  saveReport(document: ReportDocument, markdown: string): Promise<unknown> | unknown;
}

export type ReportAgentCall = (
  request: Extract<AgentOperationRequest, { operation: "CREATE_REPORT" }>,
) => Promise<ReportAgentOutput>;

export async function generateTaskReport(
  taskId: string,
  repository: ReportRepository,
  agent: ReportAgentCall = callAgent,
  now: () => string = () => new Date().toISOString(),
) {
  const data = await repository.getReportGenerationData(taskId);
  const completed = data.sessions.filter(
    (stored) => stored.session.status === "COMPLETED",
  );
  if (completed.length === 0) return null;
  const completedIds = new Set(completed.map((stored) => stored.nodeId));
  const nodes = data.material.nodes
    .filter((node) => completedIds.has(node.id))
    .toSorted((left, right) => left.order - right.order);
  const input = {
    materialTitle: data.task.fileName,
    learningGoal: data.task.learningGoal ?? null,
    completedNodes: nodes.map((node) => {
      const stored = completed.find((candidate) => candidate.nodeId === node.id)!;
      return {
        nodeId: node.id,
        title: node.title,
        canonicalUnderstanding: node.canonicalUnderstanding,
        commonMisconceptions: node.commonMisconceptions,
        score: getNodeScore(stored.session as NodeSession),
        stages: Object.fromEntries(
          Object.entries(stored.session.stages).map(([stage, state]) => [
            stage,
            {
              status: state.status,
              mainQuestion: state.mainQuestion,
              verificationQuestion: state.verificationQuestion,
              answerOrigin: state.answerOrigin,
              hintLevel: state.hintLevel,
            },
          ]),
        ),
        messages: data.messages
          .filter((message) => message.nodeId === node.id)
          .map(({ id, role, content }) => ({ id, role, content })),
        scaffoldEvents: (stored.scaffoldEvents ?? []).map(
          ({ id, stage, type, reason }) => ({ id, stage, type, reason }),
        ),
        sourceReferences: node.sourceReferences,
      };
    }),
  } as Extract<AgentOperationRequest, { operation: "CREATE_REPORT" }>["input"];
  const itemTitles = new Map(
    data.material.knowledgeItems.map((item) => [item.id, item.title]),
  );
  const supporting = data.material.coverageAssignments
    .filter(
      (assignment) =>
        assignment.disposition === "SUPPORTING_IN_NODE" &&
        completedIds.has(assignment.nodeId),
    )
    .map((assignment) => itemTitles.get(assignment.knowledgeItemId))
    .filter((title): title is string => Boolean(title));
  const referenceOnly = data.material.coverageAssignments
    .filter((assignment) => assignment.disposition === "REFERENCE_ONLY")
    .map((assignment) => itemTitles.get(assignment.knowledgeItemId))
    .filter((title): title is string => Boolean(title));
  const coverage = {
    diagnosed: nodes.map((node) => node.title),
    undiagnosed: data.material.nodes
      .filter((node) => !completedIds.has(node.id))
      .map((node) => node.title),
    supporting,
    referenceOnly,
  };
  const previous = data.report?.document;
  const previousIds = previous?.nodes.map((node) => node.nodeId) ?? [];
  const canReusePrevious =
    previous !== undefined &&
    previous.taskId === data.task.id &&
    previous.materialTitle === data.task.fileName &&
    previous.progress.completed === previous.nodes.length &&
    new Set(previousIds).size === previousIds.length &&
    previousIds.every((nodeId) => completedIds.has(nodeId)) &&
    previous.nodes.every(
      (node) => node.learningEvidence.length === STAGE_ORDER.length,
    );
  const nodeById = new Map(
    canReusePrevious ? previous.nodes.map((node) => [node.nodeId, node]) : [],
  );
  const summaries = canReusePrevious ? [previous.summary] : [];
  const pendingNodes = input.completedNodes.filter((node) => !nodeById.has(node.nodeId));
  const generatedAt = now();

  for (let offset = 0; offset < pendingNodes.length; offset += REPORT_AGENT_NODE_LIMIT) {
    const batchInput = {
      ...input,
      completedNodes: pendingNodes.slice(offset, offset + REPORT_AGENT_NODE_LIMIT),
    };
    const output = await agent({ operation: "CREATE_REPORT", input: batchInput });
    const batchDocument = buildReportDocument({
      taskId: data.task.id,
      generatedAt,
      totalNodeCount: data.material.nodes.length,
      coverage,
      input: batchInput,
      output,
    });
    summaries.push(batchDocument.summary);
    for (const node of batchDocument.nodes) nodeById.set(node.nodeId, node);
  }

  const document = reportDocumentSchema.parse({
    taskId: data.task.id,
    materialTitle: data.task.fileName,
    generatedAt,
    progress: { completed: nodes.length, total: data.material.nodes.length },
    coverage,
    summary: summaries.join("\n\n"),
    nodes: nodes.map((node) => nodeById.get(node.id)),
  });
  await repository.saveReport(document, reportToMarkdown(document));
  return document;
}
