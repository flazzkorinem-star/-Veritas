import type { StoreExamState } from '@/store/examStore'

const DB_NAME = 'veritas-local-history'
const DB_VERSION = 1
const STORE_NAME = 'diagnoses'
export const LOCAL_DIAGNOSIS_SCHEMA_VERSION = 2

export interface PersistedDiagnosisState {
  phase: StoreExamState['phase']
  documentContent: StoreExamState['documentContent']
  recordId: StoreExamState['recordId']
  materialTitle: StoreExamState['materialTitle']
  recordPinned: StoreExamState['recordPinned']
  createdAt: StoreExamState['createdAt']
  updatedAt: StoreExamState['updatedAt']
  nodes: StoreExamState['nodes']
  currentNodeIndex: StoreExamState['currentNodeIndex']
  nodeConversations: StoreExamState['nodeConversations']
  currentQuestion: StoreExamState['currentQuestion']
  report: StoreExamState['report']
  currentNodeId: StoreExamState['currentNodeId']
  currentLevel: StoreExamState['currentLevel']
  nodeLevelStates: StoreExamState['nodeLevelStates']
  nodePathStates: StoreExamState['nodePathStates']
  reportStatus: StoreExamState['reportStatus']
}

export interface LocalDiagnosisRecord {
  schemaVersion: typeof LOCAL_DIAGNOSIS_SCHEMA_VERSION
  id: string
  title: string
  createdAt: string
  updatedAt: string
  pinned?: boolean
  state: PersistedDiagnosisState
}

type LegacyDiagnosisRecord = Omit<LocalDiagnosisRecord, 'schemaVersion' | 'state'> & {
  schemaVersion?: number
  state: Partial<StoreExamState> | PersistedDiagnosisState
}

export function toPersistedDiagnosisState(state: Partial<StoreExamState>): PersistedDiagnosisState {
  return {
    phase: state.phase === 'analyzing' || state.phase === 'reporting'
      ? 'idle'
      : state.phase ?? 'idle',
    documentContent: state.documentContent ?? '',
    recordId: state.recordId ?? null,
    materialTitle: state.materialTitle ?? '当前诊断',
    recordPinned: state.recordPinned ?? false,
    createdAt: state.createdAt ?? null,
    updatedAt: state.updatedAt ?? null,
    nodes: state.nodes ?? [],
    currentNodeIndex: state.currentNodeIndex ?? 0,
    nodeConversations: state.nodeConversations ?? [],
    currentQuestion: state.currentQuestion ?? '',
    report: state.report ?? null,
    currentNodeId: state.currentNodeId ?? state.nodes?.[state.currentNodeIndex ?? 0]?.id ?? null,
    currentLevel: state.currentLevel ?? 'memory',
    nodeLevelStates: state.nodeLevelStates ?? {},
    nodePathStates: state.nodePathStates ?? {},
    reportStatus: state.reportStatus ?? (state.report ? 'ready' : 'idle'),
  }
}

export function restorePersistedDiagnosisState(state: PersistedDiagnosisState): StoreExamState {
  return {
    ...state,
    phase: (state.phase as string) === 'done' ? 'reviewing' : state.phase,
    currentAgentResponse: null,
    error: null,
  }
}

export function migrateDiagnosisRecord(record: LocalDiagnosisRecord | LegacyDiagnosisRecord): LocalDiagnosisRecord {
  if (record.schemaVersion === LOCAL_DIAGNOSIS_SCHEMA_VERSION) return record as LocalDiagnosisRecord

  const persistedState = toPersistedDiagnosisState(record.state as Partial<StoreExamState>)

  return {
    ...record,
    schemaVersion: LOCAL_DIAGNOSIS_SCHEMA_VERSION,
    title: record.title || persistedState.materialTitle,
    pinned: record.pinned ?? persistedState.recordPinned,
    state: persistedState,
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const request = action(tx.objectStore(STORE_NAME))

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function saveDiagnosisRecord(record: LocalDiagnosisRecord): Promise<void> {
  await withStore('readwrite', (store) => store.put(record))
}

export async function getDiagnosisRecord(id: string): Promise<LocalDiagnosisRecord | undefined> {
  const record = await withStore<LocalDiagnosisRecord | LegacyDiagnosisRecord | undefined>(
    'readonly',
    (store) => store.get(id)
  )
  return record ? migrateDiagnosisRecord(record) : undefined
}

export async function listDiagnosisRecords(): Promise<LocalDiagnosisRecord[]> {
  const records = await withStore<Array<LocalDiagnosisRecord | LegacyDiagnosisRecord>>(
    'readonly',
    (store) => store.getAll()
  )
  const migratedRecords = records.map(migrateDiagnosisRecord)
  return migratedRecords.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

export async function deleteDiagnosisRecord(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id))
}
