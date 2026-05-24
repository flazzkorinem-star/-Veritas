import type { StoreExamState } from '@/store/examStore'

const DB_NAME = 'veritas-local-history'
const DB_VERSION = 1
const STORE_NAME = 'diagnoses'

export interface LocalDiagnosisRecord {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  pinned?: boolean
  state: StoreExamState
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
  return withStore('readonly', (store) => store.get(id))
}

export async function listDiagnosisRecords(): Promise<LocalDiagnosisRecord[]> {
  const records = await withStore('readonly', (store) => store.getAll())
  return records.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

export async function deleteDiagnosisRecord(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id))
}
