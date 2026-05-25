import { describe, expect, it, beforeEach } from 'vitest'
import {
  getDiagnosisRecord,
  listDiagnosisRecords,
  LOCAL_DIAGNOSIS_SCHEMA_VERSION,
  migrateDiagnosisRecord,
  restorePersistedDiagnosisState,
  saveDiagnosisRecord,
  deleteDiagnosisRecord,
  toPersistedDiagnosisState,
  type LocalDiagnosisRecord,
} from '@/lib/localHistory'
import { initialState, type StoreExamState } from '@/store/examStore'

class MemoryIndexedDb {
  private stores = new Map<string, Map<string, unknown>>()

  open() {
    const request: Partial<IDBOpenDBRequest> = {}
    const db = this.createDb()
    queueMicrotask(() => {
      request.result = db
      request.onupgradeneeded?.({} as IDBVersionChangeEvent)
      request.onsuccess?.({} as Event)
    })
    return request as IDBOpenDBRequest
  }

  private createDb(): IDBDatabase {
    const stores = this.stores
    return {
      objectStoreNames: {
        contains(name: string) {
          return stores.has(name)
        },
      },
      createObjectStore(name: string) {
        stores.set(name, new Map())
        return {} as IDBObjectStore
      },
      transaction(name: string) {
        const store = stores.get(name) ?? new Map<string, unknown>()
        stores.set(name, store)
        const tx: Partial<IDBTransaction> = {
          objectStore() {
            return {
              put(value: LocalDiagnosisRecord) {
                store.set(value.id, value)
                return createRequest(undefined, tx)
              },
              get(id: string) {
                return createRequest(store.get(id), tx)
              },
              getAll() {
                return createRequest(Array.from(store.values()), tx)
              },
              delete(id: string) {
                store.delete(id)
                return createRequest(undefined, tx)
              },
            } as IDBObjectStore
          },
        }
        return tx as IDBTransaction
      },
      close() {},
    } as IDBDatabase
  }
}

function createRequest(result: unknown, tx: Partial<IDBTransaction>): IDBRequest {
  const request: Partial<IDBRequest> = { result }
  queueMicrotask(() => {
    request.onsuccess?.({} as Event)
    tx.oncomplete?.({} as Event)
  })
  return request as IDBRequest
}

function makeState(overrides: Partial<StoreExamState> = {}): StoreExamState {
  return {
    ...initialState,
    phase: 'examining',
    recordId: 'record-1',
    materialTitle: '材料一',
    recordPinned: false,
    createdAt: '2026-05-24T00:00:00.000Z',
    updatedAt: '2026-05-24T00:00:00.000Z',
    currentAgentResponse: {
      question: '运行态问题',
      reply: '运行态回复',
    },
    error: '运行态错误',
    ...overrides,
  }
}

function makeRecord(id: string, state: StoreExamState, updatedAt: string, pinned = false): LocalDiagnosisRecord {
  return {
    schemaVersion: LOCAL_DIAGNOSIS_SCHEMA_VERSION,
    id,
    title: state.materialTitle,
    createdAt: state.createdAt ?? updatedAt,
    updatedAt,
    pinned,
    state: toPersistedDiagnosisState({ ...state, recordId: id, updatedAt, recordPinned: pinned }),
  }
}

describe('localHistory', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', {
      value: new MemoryIndexedDb(),
      configurable: true,
    })
  })

  it('保存、读取并删除本地诊断记录', async () => {
    const state = makeState()
    const record = makeRecord('record-1', state, '2026-05-24T01:00:00.000Z')

    await saveDiagnosisRecord(record)
    const saved = await getDiagnosisRecord('record-1')

    expect(saved?.schemaVersion).toBe(LOCAL_DIAGNOSIS_SCHEMA_VERSION)
    expect(saved?.state.materialTitle).toBe('材料一')
    expect(restorePersistedDiagnosisState(saved!.state).currentAgentResponse).toBeNull()
    expect(restorePersistedDiagnosisState(saved!.state).error).toBeNull()

    await deleteDiagnosisRecord('record-1')
    await expect(getDiagnosisRecord('record-1')).resolves.toBeUndefined()
  })

  it('列表按置顶优先，再按更新时间倒序排列', async () => {
    await saveDiagnosisRecord(makeRecord('older', makeState({ materialTitle: '旧记录' }), '2026-05-24T01:00:00.000Z'))
    await saveDiagnosisRecord(makeRecord('newer', makeState({ materialTitle: '新记录' }), '2026-05-24T02:00:00.000Z'))
    await saveDiagnosisRecord(makeRecord('pinned', makeState({ materialTitle: '置顶记录' }), '2026-05-24T00:00:00.000Z', true))

    const records = await listDiagnosisRecords()

    expect(records.map((record) => record.id)).toEqual(['pinned', 'newer', 'older'])
  })

  it('迁移旧记录并丢弃运行态字段', () => {
    const legacyState = makeState()
    const migrated = migrateDiagnosisRecord({
      id: 'legacy',
      title: '旧 schema',
      createdAt: '2026-05-24T00:00:00.000Z',
      updatedAt: '2026-05-24T00:00:00.000Z',
      state: legacyState,
    })

    expect(migrated.schemaVersion).toBe(LOCAL_DIAGNOSIS_SCHEMA_VERSION)
    expect(migrated.state.materialTitle).toBe('材料一')
    expect('currentAgentResponse' in migrated.state).toBe(false)
    expect('error' in migrated.state).toBe(false)
  })
})
