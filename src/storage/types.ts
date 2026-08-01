import type { NodeSession } from "@/domain/diagnostic/contracts";
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
  modules: MaterialModule[];
  knowledgeItems: KnowledgeItem[];
  nodes: DiagnosticNode[];
  coverageAssignments: CoverageAssignment[];
}

export interface StoredSession {
  taskId: string;
  nodeId: string;
  session: NodeSession;
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

export type MobilePanel = "TASKS" | "TOPICS" | "DIAGNOSTIC" | null;

export interface StoredUiState {
  taskId: string;
  selectedNodeId: string | null;
  mobilePanel: MobilePanel;
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
  uiState: StoredUiState | undefined;
  workspaceState: StoredWorkspaceState | undefined;
}
