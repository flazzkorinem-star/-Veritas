'use client'

import { createContext, useContext, useReducer, useEffect, useState, ReactNode } from 'react'
import {
  ExamState, KnowledgeNode, ConversationTurn,
  NodeConversation, ExamReport
} from '@/lib/types'
import { appendTurnToNodeConversations } from '@/lib/examFlow'

const SESSION_KEY = 'veritas_exam_state'

const initialState: ExamState = {
  phase: 'idle',
  documentContent: '',
  nodes: [],
  currentNodeIndex: 0,
  nodeConversations: [],
  currentQuestion: '',
  report: null,
  error: null,
}

function loadFromSession(): ExamState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return initialState
    const parsed = JSON.parse(raw) as ExamState
    // Don't restore mid-flight states
    if (parsed.phase === 'analyzing' || parsed.phase === 'reporting') return initialState
    return parsed
  } catch {
    return initialState
  }
}

function saveToSession(state: ExamState) {
  try {
    if (state.phase === 'idle') sessionStorage.removeItem(SESSION_KEY)
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
  } catch { /* ignore quota errors */ }
}

type Action =
  | { type: 'START_ANALYZING'; content: string }
  | { type: 'SET_NODES'; nodes: KnowledgeNode[] }
  | { type: 'SET_QUESTION'; question: string }
  | { type: 'ADD_TURN'; turn: ConversationTurn }
  | { type: 'NEXT_NODE' }
  | { type: 'START_REPORTING' }
  | { type: 'SET_REPORT'; report: ExamReport }
  | { type: 'REPORT_FAILED'; error: string }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'RESET' }
  | { type: 'RESTORE'; state: ExamState }

function reducer(state: ExamState, action: Action): ExamState {
  switch (action.type) {
    case 'START_ANALYZING':
      return { ...initialState, phase: 'analyzing', documentContent: action.content }

    case 'SET_NODES': {
      const nodeConversations: NodeConversation[] = action.nodes.map((node) => ({
        node,
        turns: [],
      }))
      return { ...state, phase: 'examining', nodes: action.nodes, nodeConversations }
    }

    case 'SET_QUESTION':
      return { ...state, currentQuestion: action.question }

    case 'ADD_TURN': {
      const updated = appendTurnToNodeConversations(
        state.nodeConversations,
        state.currentNodeIndex,
        action.turn
      )
      return { ...state, nodeConversations: updated }
    }

    case 'NEXT_NODE':
      return { ...state, currentNodeIndex: state.currentNodeIndex + 1, currentQuestion: '' }

    case 'START_REPORTING':
      return { ...state, phase: 'reporting', error: null }

    case 'SET_REPORT':
      return { ...state, phase: 'done', report: action.report }

    case 'REPORT_FAILED':
      return { ...state, phase: 'examining', error: action.error }

    case 'SET_ERROR':
      return { ...state, error: action.error }

    case 'RESET':
      return initialState

    case 'RESTORE':
      return action.state

    default:
      return state
  }
}

const ExamContext = createContext<{
  state: ExamState
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
