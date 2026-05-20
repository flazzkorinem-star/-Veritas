'use client'

import { createContext, useContext, useReducer, useEffect, useState, ReactNode } from 'react'
import {
  ExamState, KnowledgeNode, ConversationTurn,
  NodeConversation, ExamReport, CognitiveLevel,
  LevelStatus, NodeLevelState, SupportRecord,
  QuestionResponse, SupportKind
} from '@/lib/types'
import {
  appendTurnToNodeConversations,
  createInitialLevelStates,
  getFirstDeepLevel,
} from '@/lib/examFlow'

const SESSION_KEY = 'veritas_exam_state'

type PathProgress = 'not_started' | 'in_progress' | 'completed' | 'not_applicable'
type DialogueStatus = 'idle' | 'agent_replied' | 'deep_dive_choice' | 'node_complete'
type ReportStatus = 'idle' | 'generating' | 'ready' | 'failed'

type AgentResponseV3 = QuestionResponse & {
  passedCurrentLevel?: boolean
  supportUsed?: SupportKind | 'none'
  nextLevel?: CognitiveLevel
}

interface NodePathState {
  quickPath: PathProgress
  deepPath: PathProgress
}

export type StoreExamState = ExamState & {
  currentNodeId: string | null
  currentLevel: CognitiveLevel
  nodeLevelStates: Record<string, NodeLevelState[]>
  nodePathStates: Record<string, NodePathState>
  currentAgentResponse: QuestionResponse | null
  reportStatus: ReportStatus
}

export const initialState: StoreExamState = {
  phase: 'idle',
  documentContent: '',
  nodes: [],
  currentNodeIndex: 0,
  nodeConversations: [],
  currentQuestion: '',
  report: null,
  error: null,
  currentNodeId: null,
  currentLevel: 'memory',
  nodeLevelStates: {},
  nodePathStates: {},
  currentAgentResponse: null,
  reportStatus: 'idle',
}

export function getDialogueStatus(response: QuestionResponse | null): DialogueStatus {
  if (!response) return 'idle'
  if (response.nextAction === 'offer_deep_dive') return 'deep_dive_choice'
  if (response.nextAction === 'complete_node') return 'node_complete'
  return 'agent_replied'
}

function getFirstSuitableLevel(levelStates: NodeLevelState[]): CognitiveLevel {
  return levelStates.find((state) => state.status !== 'not_applicable')?.level ?? 'memory'
}

function getCurrentNodeId(state: StoreExamState): string | null {
  return state.currentNodeId ?? state.nodes[state.currentNodeIndex]?.id ?? null
}

function createLevelStatesByNode(nodes: KnowledgeNode[]): Record<string, NodeLevelState[]> {
  return Object.fromEntries(
    nodes.map((node) => [
      node.id,
      createInitialLevelStates(node.suitableLevels),
    ])
  )
}

function createPathStatesByNode(nodes: KnowledgeNode[]): Record<string, NodePathState> {
  return Object.fromEntries(
    nodes.map((node, index) => [
      node.id,
      {
        quickPath: index === 0 ? 'in_progress' : 'not_started',
        deepPath: getFirstDeepLevel(node.suitableLevels) ? 'not_started' : 'not_applicable',
      },
    ])
  )
}

function normalizeState(state: ExamState | StoreExamState): StoreExamState {
  const levelStates = 'nodeLevelStates' in state
    ? state.nodeLevelStates
    : createLevelStatesByNode(state.nodes)
  const pathStates = 'nodePathStates' in state
    ? state.nodePathStates
    : createPathStatesByNode(state.nodes)
  const currentNodeId = 'currentNodeId' in state
    ? state.currentNodeId
    : state.nodes[state.currentNodeIndex]?.id ?? null
  const currentNodeLevels = currentNodeId ? levelStates[currentNodeId] : undefined

  return {
    ...initialState,
    ...state,
    currentNodeId,
    currentLevel: 'currentLevel' in state
      ? state.currentLevel
      : getFirstSuitableLevel(currentNodeLevels ?? []),
    nodeLevelStates: levelStates,
    nodePathStates: pathStates,
    currentAgentResponse: 'currentAgentResponse' in state ? state.currentAgentResponse : null,
    reportStatus: 'reportStatus' in state ? state.reportStatus : initialState.reportStatus,
  }
}

function updateNodeLevelState(
  state: StoreExamState,
  nodeId: string,
  updater: (levelState: NodeLevelState) => NodeLevelState
): StoreExamState {
  return {
    ...state,
    nodeLevelStates: {
      ...state.nodeLevelStates,
      [nodeId]: (state.nodeLevelStates[nodeId] ?? []).map(updater),
    },
  }
}

function setNodeLevelStatus(
  state: StoreExamState,
  nodeId: string,
  level: CognitiveLevel,
  status: LevelStatus,
  details?: Pick<NodeLevelState, 'blindSpotSummary' | 'userQuote'>
): StoreExamState {
  return updateNodeLevelState(state, nodeId, (levelState) => {
    if (levelState.level !== level) return levelState
    return { ...levelState, status, ...details }
  })
}

function recordSupport(state: StoreExamState, nodeId: string, record: SupportRecord): StoreExamState {
  return updateNodeLevelState(state, nodeId, (levelState) => {
    if (levelState.level !== record.level) return levelState
    return {
      ...levelState,
      supportRecords: [...(levelState.supportRecords ?? []), record],
    }
  })
}

function loadFromSession(): StoreExamState {
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

function saveToSession(state: StoreExamState) {
  try {
    if (state.phase === 'idle') sessionStorage.removeItem(SESSION_KEY)
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
  } catch { /* ignore quota errors */ }
}

export type Action =
  | { type: 'START_ANALYZING'; content: string }
  | { type: 'SET_NODES'; nodes: KnowledgeNode[] }
  | { type: 'SET_QUESTION'; question: string }
  | { type: 'ADD_TURN'; turn: ConversationTurn }
  | { type: 'NEXT_NODE' }
  | { type: 'SET_CURRENT_LEVEL'; level: CognitiveLevel }
  | {
      type: 'UPDATE_NODE_LEVEL_STATUS'
      nodeId?: string
      level: CognitiveLevel
      status: LevelStatus
      blindSpotSummary?: string
      userQuote?: string
    }
  | { type: 'RECORD_SUPPORT'; nodeId?: string; record: SupportRecord }
  | { type: 'COMPLETE_QUICK_PATH'; nodeId?: string }
  | { type: 'ENTER_DEEP_PATH'; nodeId?: string }
  | { type: 'SELECT_NEXT_NODE'; nodeIndex?: number }
  | { type: 'SET_AGENT_RESPONSE'; response: QuestionResponse }
  | { type: 'START_REPORTING' }
  | { type: 'SET_REPORT'; report: ExamReport }
  | { type: 'REPORT_FAILED'; error: string }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'RESET' }
  | { type: 'RESTORE'; state: ExamState | StoreExamState }

export function reducer(state: StoreExamState, action: Action): StoreExamState {
  switch (action.type) {
    case 'START_ANALYZING':
      return { ...initialState, phase: 'analyzing', documentContent: action.content }

    case 'SET_NODES': {
      const nodeConversations: NodeConversation[] = action.nodes.map((node) => ({
        node,
        turns: [],
      }))
      const nodeLevelStates = createLevelStatesByNode(action.nodes)
      const nodePathStates = createPathStatesByNode(action.nodes)
      const currentNodeId = action.nodes[0]?.id ?? null
      return {
        ...state,
        phase: 'examining',
        nodes: action.nodes,
        currentNodeIndex: 0,
        currentNodeId,
        currentLevel: currentNodeId ? getFirstSuitableLevel(nodeLevelStates[currentNodeId]) : 'memory',
        nodeConversations,
        nodeLevelStates,
        nodePathStates,
        currentAgentResponse: null,
      }
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
    case 'SELECT_NEXT_NODE': {
      const nextIndex = action.type === 'SELECT_NEXT_NODE'
        ? action.nodeIndex ?? state.currentNodeIndex + 1
        : state.currentNodeIndex + 1
      const nextNodeId = state.nodes[nextIndex]?.id ?? null
      const nextLevelStates = nextNodeId ? state.nodeLevelStates[nextNodeId] : undefined
      return {
        ...state,
        currentNodeIndex: nextIndex,
        currentNodeId: nextNodeId,
        currentLevel: getFirstSuitableLevel(nextLevelStates ?? []),
        currentQuestion: '',
        currentAgentResponse: null,
        nodePathStates: nextNodeId
          ? {
              ...state.nodePathStates,
              [nextNodeId]: {
                ...state.nodePathStates[nextNodeId],
                quickPath: state.nodePathStates[nextNodeId]?.quickPath === 'completed'
                  ? 'completed'
                  : 'in_progress',
              },
            }
          : state.nodePathStates,
      }
    }

    case 'SET_CURRENT_LEVEL':
      return { ...state, currentLevel: action.level }

    case 'UPDATE_NODE_LEVEL_STATUS': {
      const nodeId = action.nodeId ?? getCurrentNodeId(state)
      if (!nodeId) return state
      return setNodeLevelStatus(state, nodeId, action.level, action.status, {
        blindSpotSummary: action.blindSpotSummary,
        userQuote: action.userQuote,
      })
    }

    case 'RECORD_SUPPORT': {
      const nodeId = action.nodeId ?? getCurrentNodeId(state)
      if (!nodeId) return state
      return recordSupport(state, nodeId, action.record)
    }

    case 'COMPLETE_QUICK_PATH': {
      const nodeId = action.nodeId ?? getCurrentNodeId(state)
      if (!nodeId) return state
      return {
        ...state,
        nodePathStates: {
          ...state.nodePathStates,
          [nodeId]: {
            ...state.nodePathStates[nodeId],
            quickPath: 'completed',
          },
        },
      }
    }

    case 'ENTER_DEEP_PATH': {
      const nodeId = action.nodeId ?? getCurrentNodeId(state)
      const node = state.nodes.find((item) => item.id === nodeId)
      const firstDeepLevel = getFirstDeepLevel(node?.suitableLevels)
      if (!nodeId || !firstDeepLevel) return state
      return {
        ...state,
        currentLevel: firstDeepLevel,
        nodePathStates: {
          ...state.nodePathStates,
          [nodeId]: {
            quickPath: 'completed',
            deepPath: 'in_progress',
          },
        },
      }
    }

    case 'SET_AGENT_RESPONSE': {
      const response = action.response as AgentResponseV3
      const passedCurrentLevel = response.passedCurrentLevel ?? response.levelPassed
      let nextState: StoreExamState = {
        ...state,
        currentAgentResponse: response,
        currentQuestion: response.reply ?? response.question,
        currentLevel: response.currentLevel ?? state.currentLevel,
      }
      const nodeId = getCurrentNodeId(nextState)
      if (nodeId && response.currentLevel && passedCurrentLevel !== undefined) {
        nextState = setNodeLevelStatus(
          nextState,
          nodeId,
          response.currentLevel,
          passedCurrentLevel ? 'passed' : 'in_progress',
          { blindSpotSummary: response.blindSpotSummary }
        )
      }
      if (nodeId && response.supportRecords) {
        response.supportRecords.forEach((record) => {
          nextState = recordSupport(nextState, nodeId, record)
        })
      }
      return nextState
    }

    case 'START_REPORTING':
      return { ...state, phase: 'reporting', reportStatus: 'generating', error: null }

    case 'SET_REPORT':
      return { ...state, phase: 'done', report: action.report, reportStatus: 'ready' }

    case 'REPORT_FAILED':
      return { ...state, phase: 'examining', reportStatus: 'failed', error: action.error }

    case 'SET_ERROR':
      return { ...state, error: action.error }

    case 'RESET':
      return initialState

    case 'RESTORE':
      return normalizeState(action.state)

    default:
      return state
  }
}

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
