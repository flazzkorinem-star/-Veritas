import type {
  CognitiveLevel,
  ExamReport,
  KnowledgeNode,
  NodeConversation,
  QuestionNextAction,
  QuestionResponse,
  SupportKind,
  SupportRecord,
} from '@/lib/types'

export type QuestionRequestType = 'normal' | 'hint' | 'answer'

export type StructuredQuestionResponse = QuestionResponse & {
  reply: string
  currentLevel: CognitiveLevel
  passedCurrentLevel: boolean
  nextAction: QuestionNextAction
  blindSpotSummary: string
  supportUsed?: SupportKind | 'none'
  supportRecords?: SupportRecord[]
  nextLevel?: CognitiveLevel
}

export type QuestionApiResponse = Partial<StructuredQuestionResponse> & {
  error?: string
}

export interface EvaluateApiResponse extends ExamReport {
  error?: string
}

export interface RetryQuestionRequest {
  userAnswer: string
  requestType: QuestionRequestType
  levelOverride?: CognitiveLevel
  commitUserTurn?: boolean
}

export interface FetchQuestionOptions extends RetryQuestionRequest {
  baseConversations?: NodeConversation[]
}

export interface AnalyzeResponse {
  nodes?: KnowledgeNode[]
  documentContent?: string
  contentWarning?: string
  error?: string
}

export type MenuTarget =
  | { type: 'record'; id: string; anchor: { right: number; bottom: number } }
  | { type: 'node'; id: string; anchor: { right: number; bottom: number } }
