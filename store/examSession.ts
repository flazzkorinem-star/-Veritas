import { LOCAL_DIAGNOSIS_SCHEMA_VERSION } from '@/lib/localHistory'
import type { ExamState } from '@/lib/types'
import { initialState, type StoreExamState } from './examState'
import { normalizeState } from './examStateHelpers'

const SESSION_KEY = 'veritas_exam_state'

interface PersistedExamSession {
  schemaVersion: typeof LOCAL_DIAGNOSIS_SCHEMA_VERSION
  state: ExamState | StoreExamState
}

export function loadFromSession(): StoreExamState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return initialState
    const parsed = JSON.parse(raw) as Partial<PersistedExamSession>
    if (parsed.schemaVersion !== LOCAL_DIAGNOSIS_SCHEMA_VERSION || !parsed.state) return initialState
    // Don't restore mid-flight states
    if (parsed.state.phase === 'analyzing' || parsed.state.phase === 'reporting') return initialState
    return normalizeState(parsed.state)
  } catch {
    return initialState
  }
}

export function saveToSession(state: StoreExamState) {
  try {
    if (state.phase === 'idle') sessionStorage.removeItem(SESSION_KEY)
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      schemaVersion: LOCAL_DIAGNOSIS_SCHEMA_VERSION,
      state,
    }))
  } catch { /* ignore quota errors */ }
}
