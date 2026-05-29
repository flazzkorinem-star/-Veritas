'use client'

import { createContext, useContext, useEffect, useReducer, useState, type ReactNode } from 'react'
import { initialState, type Action, type StoreExamState } from './examState'
import { reducer } from './examReducer'
import { loadFromSession, saveToSession } from './examSession'

export { initialState, type Action, type StoreExamState } from './examState'
export { reducer } from './examReducer'
export { getDialogueStatus } from './examStateHelpers'

const ExamContext = createContext<{
  state: StoreExamState
  dispatch: React.Dispatch<Action>
  isHydrated: boolean
} | null>(null)

export function ExamProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [isHydrated, setIsHydrated] = useState(false)

  // Client-only: restore from sessionStorage after mount to avoid SSR mismatch
  useEffect(() => {
    const saved = loadFromSession()
    if (saved.phase !== 'idle') {
      dispatch({ type: 'RESTORE', state: saved })
    }
    setIsHydrated(true)
  }, [])

  // Persist state changes to sessionStorage
  useEffect(() => {
    if (isHydrated) saveToSession(state)
  }, [state, isHydrated])

  return (
    <ExamContext.Provider value={{ state, dispatch, isHydrated }}>
      {children}
    </ExamContext.Provider>
  )
}

export function useExam() {
  const ctx = useContext(ExamContext)
  if (!ctx) throw new Error('useExam must be used within ExamProvider')
  return ctx
}
