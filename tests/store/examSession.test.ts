import { beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_DIAGNOSIS_SCHEMA_VERSION } from '@/lib/localHistory'
import { initialState, type StoreExamState } from '@/store/examState'
import { loadFromSession, saveToSession } from '@/store/examSession'

const SESSION_KEY = 'veritas_exam_state'

function makeState(): StoreExamState {
  return {
    ...initialState,
    phase: 'examining',
    materialTitle: '当前会话',
  }
}

describe('examSession', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('saves the current schema version with the session state', () => {
    const state = makeState()

    saveToSession(state)

    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!)).toEqual({
      schemaVersion: LOCAL_DIAGNOSIS_SCHEMA_VERSION,
      state,
    })
  })

  it('does not restore an unversioned legacy session', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(makeState()))

    expect(loadFromSession()).toEqual(initialState)
  })

  it('does not restore a session from schema version 3', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      schemaVersion: 3,
      state: makeState(),
    }))

    expect(loadFromSession()).toEqual(initialState)
  })

  it('restores a session from the current schema version', () => {
    const state = makeState()
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      schemaVersion: LOCAL_DIAGNOSIS_SCHEMA_VERSION,
      state,
    }))

    expect(loadFromSession()).toEqual(state)
  })

  it.each(['analyzing', 'reporting'] as const)('does not restore a %s session', (phase) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      schemaVersion: LOCAL_DIAGNOSIS_SCHEMA_VERSION,
      state: {
        ...makeState(),
        phase,
      },
    }))

    expect(loadFromSession()).toEqual(initialState)
  })
})
