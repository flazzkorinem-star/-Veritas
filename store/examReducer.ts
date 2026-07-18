import type { KnowledgeNode, NodeConversation } from '@/lib/types'
import {
  appendTurnToNodeConversationById,
  appendTurnToNodeConversations,
} from '@/lib/examFlow'
import { initialState, type Action, type AgentResponseV3, type StoreExamState } from './examState'
import {
  createLevelStatesByNode,
  createPathStatesByNode,
  getCurrentNodeId,
  normalizeState,
  recordSupport,
  setNodeLevelStatus,
  sortNodePairs,
} from './examStateHelpers'

function getNextImportance(importance: KnowledgeNode['importance']): KnowledgeNode['importance'] {
  if (importance === 1) return 2
  if (importance === 2) return 3
  return 1
}

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
        currentLevel: 'memory',
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

    case 'CYCLE_NODE_IMPORTANCE': {
      const nodes = state.nodes.map((node) => (
        node.id === action.nodeId ? { ...node, importance: getNextImportance(node.importance) } : node
      ))
      const nodeConversations = state.nodeConversations.map((conversation) => (
        conversation.node.id === action.nodeId
          ? { ...conversation, node: { ...conversation.node, importance: getNextImportance(conversation.node.importance) } }
          : conversation
      ))
      return {
        ...state,
        nodes,
        nodeConversations,
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
      return {
        ...state,
        nodes,
        nodeConversations,
        nodeLevelStates,
        nodePathStates,
        currentNodeIndex: resolvedIndex,
        currentNodeId: nextNodeId,
        currentLevel: 'memory',
        currentAgentResponse: null,
        report: null,
        reportStatus: 'idle',
      }
    }

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
      return {
        ...state,
        currentNodeIndex: nextIndex,
        currentNodeId: nextNodeId,
        currentLevel: 'memory',
        currentAgentResponse: null,
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

    case 'SET_AGENT_RESPONSE': {
      const response = action.response as AgentResponseV3
      const passedCurrentLevel = response.passedCurrentLevel ?? response.levelPassed
      const targetNodeId = action.nodeId ?? getCurrentNodeId(state)
      const isCurrentNode = targetNodeId === getCurrentNodeId(state)
      let nextState: StoreExamState = {
        ...state,
        currentAgentResponse: isCurrentNode ? response : state.currentAgentResponse,
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
      return { ...state, phase: 'reviewing', report: action.report, reportStatus: 'ready' }

    case 'REPORT_FAILED':
      return {
        ...state,
        phase: state.report ? 'reviewing' : 'examining',
        reportStatus: 'failed',
        error: action.error,
      }

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
