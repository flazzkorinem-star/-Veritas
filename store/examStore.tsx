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
  appendTurnToNodeConversationById,
  createInitialLevelStates,
  getFirstDeepLevel,
} from '@/lib/examFlow'

const SESSION_KEY = 'veritas_exam_state'

type PathProgress = 'not_started' | 'in_progress' | 'completed' | 'not_applicable'
type DialogueStatus = 'idle' | 'agent_replied' | 'deep_dive_choice' | 'node_complete'
type ReportStatus = 'idle' | 'generating' | 'ready' | 'stale' | 'failed'

type AgentResponseV3 = QuestionResponse & {
  passedCurrentLevel?: boolean
  supportUsed?: SupportKind | 'none'
  nextLevel?: CognitiveLevel
}

interface NodePathState {
  quickPath: PathProgress
  deepPath: PathProgress
  completed: boolean
}

export type StoreExamState = ExamState & {
  recordId: string | null
  materialTitle: string
  recordPinned: boolean
  createdAt: string | null
  updatedAt: string | null
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
  recordId: null,
  materialTitle: '当前诊断',
  recordPinned: false,
  createdAt: null,
  updatedAt: null,
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
        completed: false,
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
    recordId: 'recordId' in state ? state.recordId : null,
    materialTitle: 'materialTitle' in state ? state.materialTitle : '当前诊断',
    recordPinned: 'recordPinned' in state ? state.recordPinned : false,
    createdAt: 'createdAt' in state ? state.createdAt : null,
    updatedAt: 'updatedAt' in state ? state.updatedAt : null,
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

function sortNodePairs(nodes: KnowledgeNode[], conversations: NodeConversation[]) {
  return nodes
    .map((node, index) => ({ node, conversation: conversations[index], index }))
    .sort((a, b) => {
      if (a.node.pinned !== b.node.pinned) return a.node.pinned ? -1 : 1
      return a.index - b.index
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
  | {
      type: 'SET_RECORD_META'
      recordId?: string
      materialTitle?: string
      recordPinned?: boolean
      createdAt?: string
      updatedAt?: string
    }
  | { type: 'SET_NODES'; nodes: KnowledgeNode[] }
  | { type: 'UPDATE_NODE_NAME'; nodeId: string; name: string }
  | { type: 'TOGGLE_NODE_PIN'; nodeId: string }
  | { type: 'DELETE_NODE'; nodeId: string }
  | { type: 'SET_QUESTION'; question: string }
  | { type: 'ADD_TURN'; turn: ConversationTurn; nodeId?: string }
  | { type: 'NEXT_NODE'; fromNodeId?: string }
  | { type: 'SET_CURRENT_LEVEL'; level: CognitiveLevel; nodeId?: string }
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
  | { type: 'COMPLETE_NODE'; nodeId?: string }
  | { type: 'ENTER_DEEP_PATH'; nodeId?: string }
  | { type: 'SELECT_NEXT_NODE'; nodeIndex?: number }
  | { type: 'SET_AGENT_RESPONSE'; response: QuestionResponse; nodeId?: string }
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

    case 'SET_RECORD_META':
      return {
        ...state,
        recordId: action.recordId ?? state.recordId,
        materialTitle: action.materialTitle ?? state.materialTitle,
        recordPinned: action.recordPinned ?? state.recordPinned,
        createdAt: action.createdAt ?? state.createdAt,
        updatedAt: action.updatedAt ?? state.updatedAt,
      }

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

    case 'UPDATE_NODE_NAME': {
      const nodes = state.nodes.map((node) => (
        node.id === action.nodeId ? { ...node, name: action.name } : node
      ))
      const nodeConversations = state.nodeConversations.map((conversation) => (
        conversation.node.id === action.nodeId
          ? { ...conversation, node: { ...conversation.node, name: action.name } }
          : conversation
      ))
      return {
        ...state,
        nodes,
        nodeConversations,
        reportStatus: state.reportStatus === 'ready' ? 'stale' : state.reportStatus,
      }
    }

    case 'TOGGLE_NODE_PIN': {
      const nodes = state.nodes.map((node) => (
        node.id === action.nodeId ? { ...node, pinned: !node.pinned } : node
      ))
      const nodeConversations = state.nodeConversations.map((conversation) => (
        conversation.node.id === action.nodeId
          ? { ...conversation, node: { ...conversation.node, pinned: !conversation.node.pinned } }
          : conversation
      ))
      const currentNodeId = getCurrentNodeId(state)
      const sorted = sortNodePairs(nodes, nodeConversations)
      const nextIndex = sorted.findIndex((item) => item.node.id === currentNodeId)
      return {
        ...state,
        nodes: sorted.map((item) => item.node),
        nodeConversations: sorted.map((item) => item.conversation),
        currentNodeIndex: nextIndex >= 0 ? nextIndex : 0,
      }
    }

    case 'DELETE_NODE': {
      const currentNodeId = getCurrentNodeId(state)
      const nodes = state.nodes.filter((node) => node.id !== action.nodeId)
      const nodeConversations = state.nodeConversations.filter((conversation) => (
        conversation.node.id !== action.nodeId
      ))
      const { [action.nodeId]: _removedLevelState, ...nodeLevelStates } = state.nodeLevelStates
      const { [action.nodeId]: _removedPathState, ...nodePathStates } = state.nodePathStates
      const nextIndex = Math.min(state.currentNodeIndex, Math.max(nodes.length - 1, 0))
      const nextNodeId = currentNodeId === action.nodeId
        ? nodes[nextIndex]?.id ?? null
        : currentNodeId
      const resolvedIndex = nextNodeId
        ? Math.max(nodes.findIndex((node) => node.id === nextNodeId), 0)
        : 0
      const nextLevelStates = nextNodeId ? nodeLevelStates[nextNodeId] : undefined
      return {
        ...state,
        nodes,
        nodeConversations,
        nodeLevelStates,
        nodePathStates,
        currentNodeIndex: resolvedIndex,
        currentNodeId: nextNodeId,
        currentLevel: getFirstSuitableLevel(nextLevelStates ?? []),
        currentAgentResponse: null,
        report: null,
        reportStatus: 'idle',
      }
    }

    case 'SET_QUESTION':
      return { ...state, currentQuestion: action.question }

    case 'ADD_TURN': {
      const updated = action.nodeId
        ? appendTurnToNodeConversationById(state.nodeConversations, action.nodeId, action.turn)
        : appendTurnToNodeConversations(
            state.nodeConversations,
            state.currentNodeIndex,
            action.turn
          )
      return {
        ...state,
        nodeConversations: updated,
        reportStatus: state.reportStatus === 'ready' ? 'stale' : state.reportStatus,
      }
    }

    case 'NEXT_NODE':
    case 'SELECT_NEXT_NODE': {
      if (action.type === 'NEXT_NODE' && action.fromNodeId && action.fromNodeId !== getCurrentNodeId(state)) {
        return state
      }
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
      if (action.nodeId && action.nodeId !== getCurrentNodeId(state)) return state
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

    case 'COMPLETE_NODE': {
      const nodeId = action.nodeId ?? getCurrentNodeId(state)
      if (!nodeId) return state
      return {
        ...state,
        nodePathStates: {
          ...state.nodePathStates,
          [nodeId]: {
            ...state.nodePathStates[nodeId],
            completed: true,
          },
        },
      }
    }

    case 'ENTER_DEEP_PATH': {
      const nodeId = action.nodeId ?? getCurrentNodeId(state)
      const node = state.nodes.find((item) => item.id === nodeId)
      const firstDeepLevel = getFirstDeepLevel(node?.suitableLevels)
      const isCurrentNode = nodeId === getCurrentNodeId(state)
      if (!nodeId || !firstDeepLevel) return state
      return {
        ...state,
        currentLevel: isCurrentNode ? firstDeepLevel : state.currentLevel,
        nodePathStates: {
          ...state.nodePathStates,
          [nodeId]: {
            quickPath: 'completed',
            deepPath: 'in_progress',
            completed: false,
          },
        },
      }
    }

    case 'SET_AGENT_RESPONSE': {
      const response = action.response as AgentResponseV3
      const passedCurrentLevel = response.passedCurrentLevel ?? response.levelPassed
      const targetNodeId = action.nodeId ?? getCurrentNodeId(state)
      const isCurrentNode = targetNodeId === getCurrentNodeId(state)
      let nextState: StoreExamState = {
        ...state,
        currentAgentResponse: isCurrentNode ? response : state.currentAgentResponse,
        currentQuestion: isCurrentNode ? response.reply ?? response.question : state.currentQuestion,
        currentLevel: isCurrentNode ? response.currentLevel ?? state.currentLevel : state.currentLevel,
      }
      const nodeId = targetNodeId
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
      return { ...state, phase: 'examining', report: action.report, reportStatus: 'ready' }

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
