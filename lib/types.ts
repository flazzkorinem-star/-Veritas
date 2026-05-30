export type CognitiveLevel =
  | 'memory'
  | 'understanding'
  | 'application'
  | 'analysis'

export type LevelStatus =
  | 'not_started'
  | 'in_progress'
  | 'passed'
  | 'answer_assisted'
  | 'failed'

export type SupportKind = 'hint' | 'answer' | 'analogy'

export interface SupportRecord {
  kind: SupportKind
  level: CognitiveLevel
  question: string
  content: string
  createdAt?: string
}

export interface NodeLevelState {
  level: CognitiveLevel
  status: LevelStatus
  supportRecords?: SupportRecord[]
  blindSpotSummary?: string
  userQuote?: string
}

export type QuestionNextAction =
  | 'continue_current_level'
  | 'advance_next_level'
  | 'complete_node'

// A knowledge concept extracted from the user's document
export interface KnowledgeNode {
  id: string
  name: string
  context: string // one sentence: how this concept appears in the document
  sourceExcerpt: string // exact excerpt from the source material supporting this node
  priorityReason?: string
  pinned?: boolean
}

// One exchange in a Socratic dialogue
export interface ConversationTurn {
  role: 'assistant' | 'user'
  content: string
  kind?: 'diagnosis_plan'
}

// All dialogue for one knowledge node
export interface NodeConversation {
  node: KnowledgeNode
  turns: ConversationTurn[]
}

// Agent 2 response
export interface QuestionResponse {
  question: string
  reply?: string
  currentLevel?: CognitiveLevel
  levelPassed?: boolean
  nextAction?: QuestionNextAction
  blindSpotSummary?: string
  supportRecords?: SupportRecord[]
}

// Agent 3 output per node
export interface NodeEvaluation {
  nodeId: string
  nodeName: string
  sourceExcerpt?: string       // source material excerpt for evidence display
  levelStatus: Record<CognitiveLevel, LevelStatus>
  evidenceQuotes: string[]
  blindSpot: string
  supportUsed: Record<SupportKind, boolean>
  correctUnderstanding: string
  nextStep: string
  score: number
}

// Full evaluation report from Agent 3
export interface ExamReport {
  overallScore: number
  nodes: NodeEvaluation[]
  summary: string
}

// Client-side exam phases
export type ExamPhase =
  | 'idle'
  | 'analyzing'
  | 'examining'
  | 'reviewing'
  | 'reporting'

// Full client-side exam session state
export interface ExamState {
  phase: ExamPhase
  documentContent: string
  nodes: KnowledgeNode[]
  currentNodeIndex: number
  nodeConversations: NodeConversation[]
  currentQuestion: string
  report: ExamReport | null
  error: string | null
}
