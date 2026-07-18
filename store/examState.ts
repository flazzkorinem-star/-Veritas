import type {
  CognitiveLevel,
  ExamReport,
  ExamState,
  KnowledgeNode,
  ConversationTurn,
  LevelStatus,
  NodeConversation,
  NodeLevelState,
  QuestionResponse,
  SupportKind,
  SupportRecord,
} from '@/lib/types'

export type ReportStatus = 'idle' | 'generating' | 'ready' | 'stale' | 'failed'

export type AgentResponseV3 = QuestionResponse & {
  passedCurrentLevel?: boolean
  supportUsed?: SupportKind | 'none'
}

export interface NodePathState {
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
  report: null,
  error: null,
  currentNodeId: null,
  currentLevel: 'memory',
  nodeLevelStates: {},
  nodePathStates: {},
  currentAgentResponse: null,
  reportStatus: 'idle',
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
  | { type: 'CYCLE_NODE_IMPORTANCE'; nodeId: string }
  | { type: 'TOGGLE_NODE_PIN'; nodeId: string }
  | { type: 'DELETE_NODE'; nodeId: string }
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
  | { type: 'COMPLETE_NODE'; nodeId?: string }
  | { type: 'SELECT_NEXT_NODE'; nodeIndex?: number }
  | { type: 'SET_AGENT_RESPONSE'; response: QuestionResponse; nodeId?: string }
  | { type: 'START_REPORTING' }
  | { type: 'SET_REPORT'; report: ExamReport }
  | { type: 'REPORT_FAILED'; error: string }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'RESET' }
  | { type: 'RESTORE'; state: ExamState | StoreExamState }
