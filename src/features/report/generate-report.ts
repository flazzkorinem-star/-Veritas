import { getNodeScore } from "@/domain/diagnostic/selectors";
import type { NodeSession } from "@/domain/diagnostic/contracts";
import { buildReportDocument, reportToMarkdown } from "@/domain/report/build-report";
import type { ReportAgentOutput } from "@/domain/report/contracts";
import type { AgentOperationRequest } from "@/domain/agents/contracts";
import { callAgent } from "@/features/materials/agent-client";
import type {
  StoredMaterial,
  StoredMessage,
  StoredScaffoldEvent,
  StoredTask,
} from "@/storage/types";

interface ReportGenerationData {
  task: Pick<StoredTask, "id" | "fileName">;
  material: Pick<StoredMaterial, "nodes" | "knowledgeItems" | "coverageAssignments">;
  sessions: {
    nodeId: string;
    session: Pick<NodeSession, "status" | "stages">;
    scaffoldEvents?: StoredScaffoldEvent[];
  }[];
  messages: Pick<StoredMessage, "id" | "nodeId" | "role" | "content">[];
}

interface ReportRepository {
  getReportGenerationData(taskId: string): Promise<ReportGenerationData>;
  saveReport(
    document: ReturnType<typeof buildReportDocument>,
    markdown: string,
  ): Promise<unknown> | unknown;
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
    completedNodes: nodes.map((node) => {
      const stored = completed.find((candidate) => candidate.nodeId === node.id)!;
      return {
        nodeId: node.id,
        title: node.title,
        canonicalUnderstanding: node.canonicalUnderstanding,
        commonMisconceptions: node.commonMisconceptions,
        score: getNodeScore(stored.session as NodeSession),
        stages: {
          MEMORY: stored.session.stages.MEMORY.status,
          UNDERSTANDING: stored.session.stages.UNDERSTANDING.status,
          APPLICATION: stored.session.stages.APPLICATION.status,
          ANALYSIS: stored.session.stages.ANALYSIS.status,
        },
        userMessages: data.messages
          .filter((message) => message.nodeId === node.id && message.role === "USER")
          .map(({ id, content }) => ({ id, content })),
        scaffoldEvents: (stored.scaffoldEvents ?? []).map(
          ({ id, stage, type, reason }) => ({ id, stage, type, reason }),
        ),
        sourceReferences: node.sourceReferences,
      };
    }),
  } as Extract<AgentOperationRequest, { operation: "CREATE_REPORT" }>["input"];
  const output = await agent({ operation: "CREATE_REPORT", input });
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
  const document = buildReportDocument({
    taskId: data.task.id,
    generatedAt: now(),
    totalNodeCount: data.material.nodes.length,
    coverage: {
      diagnosed: nodes.map((node) => node.title),
      undiagnosed: data.material.nodes
        .filter((node) => !completedIds.has(node.id))
        .map((node) => node.title),
      supporting,
      referenceOnly,
    },
    input,
    output,
  });
  await repository.saveReport(document, reportToMarkdown(document));
  return document;
}
