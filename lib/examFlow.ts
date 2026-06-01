import {
  CognitiveLevel,
  ConversationTurn,
  ExamPhase,
  NodeConversation,
  NodeLevelState,
  QuestionNextAction,
  SupportKind,
  SupportRecord,
} from './types'

export const COGNITIVE_LEVELS: CognitiveLevel[] = [
  'memory',
  'understanding',
  'application',
  'analysis',
]

export function appendTurnToNodeConversations(
  conversations: NodeConversation[],
  nodeIndex: number,
  turn: ConversationTurn
): NodeConversation[] {
  return conversations.map((conversation, index) => {
    if (index !== nodeIndex) return conversation
    return {
      ...conversation,
      turns: [...conversation.turns, turn],
    }
  })
}

export function appendTurnToNodeConversationById(
  conversations: NodeConversation[],
  nodeId: string,
  turn: ConversationTurn
): NodeConversation[] {
  return conversations.map((conversation) => {
    if (conversation.node.id !== nodeId) return conversation
    return {
      ...conversation,
      turns: [...conversation.turns, turn],
    }
  })
}

export function buildNodeCompletion(currentNodeName: string, nextNodeName?: string): string {
  if (nextNodeName) {
    return `「${currentNodeName}」这个知识点已完成。我们来看下一个：${nextNodeName}。`
  }
  return `「${currentNodeName}」这个知识点已完成。所有目标知识点都完成了，我来生成诊断报告。`
}

export function shouldRequestInitialQuestion({
  isHydrated,
  phase,
  currentNodeId,
  turnCount,
  submitting,
  requestedNodeId,
}: {
  isHydrated: boolean
  phase: ExamPhase
  currentNodeId?: string
  turnCount: number
  submitting: boolean
  requestedNodeId: string | null
}): boolean {
  return Boolean(
    isHydrated
    && phase === 'examining'
    && currentNodeId
    && turnCount === 0
    && !submitting
    && requestedNodeId !== currentNodeId
  )
}

export function createInitialLevelStates(): NodeLevelState[] {
  return COGNITIVE_LEVELS.map((level) => ({
    level,
    status: 'not_started',
  }))
}

export function getNextSuitableLevel(currentLevel: CognitiveLevel): CognitiveLevel | null {
  const currentIndex = COGNITIVE_LEVELS.indexOf(currentLevel)
  return COGNITIVE_LEVELS[currentIndex + 1] ?? null
}

export function getNextActionForLevelResult({
  currentLevel,
  levelPassed,
}: {
  currentLevel: CognitiveLevel
  levelPassed: boolean
}): QuestionNextAction {
  if (!levelPassed) return 'continue_current_level'
  return getNextSuitableLevel(currentLevel) ? 'advance_next_level' : 'complete_node'
}

export function getLevelAfterNextAction({
  currentLevel,
  nextAction,
}: {
  currentLevel: CognitiveLevel
  nextAction: QuestionNextAction
}): CognitiveLevel {
  if (nextAction !== 'advance_next_level') return currentLevel
  return getNextSuitableLevel(currentLevel) ?? currentLevel
}

export function createSupportRecord({
  kind,
  level,
  question,
  content,
  createdAt,
}: {
  kind: SupportKind
  level: CognitiveLevel
  question: string
  content: string
  createdAt?: string
}): SupportRecord {
  return {
    kind,
    level,
    question,
    content,
    ...(createdAt ? { createdAt } : {}),
  }
}
