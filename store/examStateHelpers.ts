import type {
  CognitiveLevel,
  ExamState,
  KnowledgeNode,
  LevelStatus,
  NodeConversation,
  NodeLevelState,
  QuestionResponse,
  SupportRecord,
} from '@/lib/types'
import { createInitialLevelStates } from '@/lib/examFlow'
import { initialState, type NodePathState, type StoreExamState, type DialogueStatus } from './examState'

export function getDialogueStatus(response: QuestionResponse | null): DialogueStatus {
  if (!response) return 'idle'
  if (response.nextAction === 'complete_node') return 'node_complete'
  return 'agent_replied'
}

export function getCurrentNodeId(state: StoreExamState): string | null {
  return state.currentNodeId ?? state.nodes[state.currentNodeIndex]?.id ?? null
}

export function createLevelStatesByNode(nodes: KnowledgeNode[]): Record<string, NodeLevelState[]> {
  return Object.fromEntries(
    nodes.map((node) => [
      node.id,
      createInitialLevelStates(),
    ])
  )
}

export function createPathStatesByNode(nodes: KnowledgeNode[]): Record<string, NodePathState> {
  return Object.fromEntries(
    nodes.map((node) => [node.id, { completed: false }])
  )
}

export function normalizeState(state: ExamState | StoreExamState): StoreExamState {
  const levelStates = 'nodeLevelStates' in state
    ? state.nodeLevelStates
    : createLevelStatesByNode(state.nodes)
  const pathStates = 'nodePathStates' in state
    ? state.nodePathStates
    : createPathStatesByNode(state.nodes)
  const currentNodeId = 'currentNodeId' in state
    ? state.currentNodeId
    : state.nodes[state.currentNodeIndex]?.id ?? null

  return {
    ...initialState,
    ...state,
    phase: (state.phase as string) === 'done' ? 'reviewing' : state.phase,
    recordId: 'recordId' in state ? state.recordId : null,
    materialTitle: 'materialTitle' in state ? state.materialTitle : '当前诊断',
    recordPinned: 'recordPinned' in state ? state.recordPinned : false,
    createdAt: 'createdAt' in state ? state.createdAt : null,
    updatedAt: 'updatedAt' in state ? state.updatedAt : null,
    currentNodeId,
    currentLevel: 'currentLevel' in state
      ? state.currentLevel
      : 'memory',
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

export function setNodeLevelStatus(
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

export function recordSupport(state: StoreExamState, nodeId: string, record: SupportRecord): StoreExamState {
  return updateNodeLevelState(state, nodeId, (levelState) => {
    if (levelState.level !== record.level) return levelState
    return {
      ...levelState,
      supportRecords: [...(levelState.supportRecords ?? []), record],
    }
  })
}

export function sortNodePairs(nodes: KnowledgeNode[], conversations: NodeConversation[]) {
  return nodes
    .map((node, index) => ({ node, conversation: conversations[index], index }))
    .sort((a, b) => {
      if (a.node.pinned !== b.node.pinned) return a.node.pinned ? -1 : 1
      return a.index - b.index
    })
}
