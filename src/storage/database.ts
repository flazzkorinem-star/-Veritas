import Dexie, { type Table } from "dexie";

import type {
  StoredDraft,
  StoredMaterial,
  StoredMessage,
  StoredReport,
  StoredSession,
  StoredTask,
  StoredUiState,
  StoredWorkspaceState,
} from "@/storage/types";
import type { StageState } from "@/domain/diagnostic/contracts";

export class VeritasDatabase extends Dexie {
  tasks!: Table<StoredTask, string>;
  materials!: Table<StoredMaterial, string>;
  sessions!: Table<StoredSession, [string, string]>;
  messages!: Table<StoredMessage, string>;
  drafts!: Table<StoredDraft, [string, string]>;
  reports!: Table<StoredReport, string>;
  uiStates!: Table<StoredUiState, string>;
  workspaceStates!: Table<StoredWorkspaceState, string>;

  constructor(name = "veritas") {
    super(name);

    this.version(1).stores({
      tasks: "&id, title, fileName, updatedAt",
      materials: "&taskId",
      sessions: "[taskId+nodeId], taskId, nodeId",
      messages: "&id, taskId, nodeId, createdAt",
      reports: "&taskId",
    });

    this.version(2)
      .stores({
        tasks: "&id, title, fileName, updatedAt",
        materials: "&taskId",
        sessions: "[taskId+nodeId], taskId, nodeId",
        messages: "&id, taskId, nodeId, createdAt",
        drafts: "[taskId+nodeId], taskId, nodeId, updatedAt",
        reports: "&taskId",
        uiStates: "&taskId, updatedAt",
      })
      .upgrade((transaction) =>
        transaction
          .table<StoredTask & { isPinned?: boolean }, string>("tasks")
          .toCollection()
          .modify((storedTask) => {
            storedTask.isPinned ??= false;
          }),
      );

    this.version(3).stores({
      tasks: "&id, title, fileName, updatedAt",
      materials: "&taskId",
      sessions: "[taskId+nodeId], taskId, nodeId",
      messages: "&id, taskId, nodeId, createdAt",
      drafts: "[taskId+nodeId], taskId, nodeId, updatedAt",
      reports: "&taskId",
      uiStates: "&taskId, updatedAt",
      workspaceStates: "&id, updatedAt",
    });

    this.version(4)
      .stores({
        tasks: "&id, title, fileName, updatedAt",
        materials: "&taskId",
        sessions: "[taskId+nodeId], taskId, nodeId",
        messages: "&id, taskId, nodeId, createdAt",
        drafts: "[taskId+nodeId], taskId, nodeId, updatedAt",
        reports: "&taskId",
        uiStates: "&taskId, updatedAt",
        workspaceStates: "&id, updatedAt",
      })
      .upgrade((transaction) =>
        transaction
          .table<StoredSession, [string, string]>("sessions")
          .toCollection()
          .modify((stored) => {
            for (const stage of Object.values(stored.session.stages)) {
              const legacy = stage as StageState & {
                answerOrigin?: StageState["answerOrigin"];
                verificationQuestion?: string | null;
              };
              legacy.verificationQuestion ??= null;
              legacy.answerOrigin ??=
                legacy.status === "PASSED_WITH_ANSWER" ? "REQUESTED" : "NONE";
            }
          }),
      );

    this.version(5)
      .stores({
        tasks: "&id, title, fileName, updatedAt",
        materials: "&taskId",
        sessions: "[taskId+nodeId], taskId, nodeId",
        messages: "&id, taskId, nodeId, createdAt",
        drafts: "[taskId+nodeId], taskId, nodeId, updatedAt",
        reports: "&taskId",
        uiStates: "&taskId, updatedAt",
        workspaceStates: "&id, updatedAt",
      })
      .upgrade((transaction) =>
        transaction
          .table<StoredMaterial, string>("materials")
          .toCollection()
          .modify((material) => {
            material.processingTrace ??= null;
          }),
      );

    this.version(6)
      .stores({
        tasks: "&id, title, fileName, updatedAt",
        materials: "&taskId",
        sessions: "[taskId+nodeId], taskId, nodeId",
        messages: "&id, taskId, nodeId, createdAt",
        drafts: "[taskId+nodeId], taskId, nodeId, updatedAt",
        reports: "&taskId",
        uiStates: "&taskId, updatedAt",
        workspaceStates: "&id, updatedAt",
      })
      .upgrade((transaction) =>
        transaction
          .table<StoredReport, string>("reports")
          .toCollection()
          .modify((report) => {
            for (const node of report.document.nodes) {
              const legacy = node as typeof node & {
                evidenceQuotes?: unknown;
                learnedOrCorrected?: unknown;
              };
              delete legacy.evidenceQuotes;
              delete legacy.learnedOrCorrected;
            }
          }),
      );
  }
}

export function createVeritasDatabase(name?: string) {
  return new VeritasDatabase(name);
}

let browserDatabase: VeritasDatabase | undefined;

export function getVeritasDatabase() {
  browserDatabase ??= createVeritasDatabase();
  return browserDatabase;
}
