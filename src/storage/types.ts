import type { NodeSession } from "@/domain/diagnostic/contracts";
import type { MaterialProcessingTrace } from "@/domain/materials/processing-trace";
import type { ScaffoldType } from "@/domain/diagnostic/agent-contracts";
import type {
  CoverageAssignment,
  DiagnosticNode,
  KnowledgeItem,
  MaterialModule,
  Message,
  Report,
  Task,
} from "@/domain/types";

export interface StoredTask extends Task {
  fileName: string;
  isPinned: boolean;
  learningGoal?: string;
  failureReason?: string;
}

export interface StoredMaterial {
  taskId: string;
  materialId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  originalFile: Blob;
  parsedText: string | null;
  processingTrace: MaterialProcessingTrace | null;
  modules: MaterialModule[];
  knowledgeItems: KnowledgeItem[];
  nodes: DiagnosticNode[];
  coverageAssignments: CoverageAssignment[];
}

export interface StoredSession {
  taskId: string;
  nodeId: string;
  session: NodeSession;
  scaffoldEvents?: StoredScaffoldEvent[];
}

export interface StoredScaffoldEvent {
  id: string;
  stage: NodeSession["currentStage"];
  type: ScaffoldType;
  reason: string;
  createdAt: string;
}

export interface StoredMessage extends Message {
  taskId: string;
}

export interface StoredDraft {
  taskId: string;
  nodeId: string;
  content: string;
  updatedAt: string;
}

export interface StoredWorkspaceState {
  id: "workspace";
  activeTaskId: string | null;
  workspaceCollapsed: boolean;
  updatedAt: string;
}

export type StoredReport = Report;

export interface DeletedTaskSnapshot {
  task: StoredTask;
  material: StoredMaterial | undefined;
  sessions: StoredSession[];
  messages: StoredMessage[];
  drafts: StoredDraft[];
  report: StoredReport | undefined;
  workspaceState: StoredWorkspaceState | undefined;
}
