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
