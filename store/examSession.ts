import type { ExamState } from '@/lib/types'
import { initialState, type StoreExamState } from './examState'
import { normalizeState } from './examStateHelpers'

const SESSION_KEY = 'veritas_exam_state'

export function loadFromSession(): StoreExamState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return initialState
    const parsed = JSON.parse(raw) as ExamState | StoreExamState
    // Don't restore mid-flight states
    if (parsed.phase === 'analyzing' || parsed.phase === 'reporting') return initialState
    return normalizeState(parsed)
  } catch {
    return initialState
  }
}

export function saveToSession(state: StoreExamState) {
  try {
    if (state.phase === 'idle') sessionStorage.removeItem(SESSION_KEY)
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
  } catch { /* ignore quota errors */ }
}
