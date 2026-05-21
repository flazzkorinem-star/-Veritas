import {
  CognitiveLevel,
  ConversationTurn,
  ExamPhase,
  LevelStatus,
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
  'evaluation',
  'creation',
]

export const QUICK_PATH_LEVELS: CognitiveLevel[] = [
  'memory',
  'understanding',
  'application',
]

export const DEEP_PATH_LEVELS: CognitiveLevel[] = [
  'analysis',
  'evaluation',
  'creation',
]

const ACTIVE_DEEP_PATH_LEVELS: CognitiveLevel[] = [
  // V1 keeps the automatic deep path to analysis/evaluation; creation needs a future explicit entry.
  'analysis',
  'evaluation',
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

export function buildNodeTransition(currentNodeName: string, nextNodeName: string): string {
  return `好，关于 ${currentNodeName} 我们先聊到这里。我们来看下一个：${nextNodeName}……`
}

export function appendTranscript(current: string, transcript: string): string {
  const next = transcript.trim()
  if (!next) return current
  return current ? `${current}${next}` : next
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

export function isLevelSuitable(
  level: CognitiveLevel,
  suitableLevels: CognitiveLevel[] = COGNITIVE_LEVELS
): boolean {
  return suitableLevels.includes(level)
}

export function createInitialLevelStates(
  suitableLevels: CognitiveLevel[] = COGNITIVE_LEVELS
): NodeLevelState[] {
  return COGNITIVE_LEVELS.map((level) => ({
    level,
    status: isLevelSuitable(level, suitableLevels) ? 'not_started' : 'not_applicable',
  }))
}

export function getNextSuitableLevel(
  currentLevel: CognitiveLevel,
  suitableLevels: CognitiveLevel[] = COGNITIVE_LEVELS
): CognitiveLevel | null {
  const currentIndex = COGNITIVE_LEVELS.indexOf(currentLevel)
  return COGNITIVE_LEVELS.slice(currentIndex + 1)
    .find((level) => isLevelSuitable(level, suitableLevels)) ?? null
}

export function getFirstDeepLevel(
  suitableLevels: CognitiveLevel[] = COGNITIVE_LEVELS
): CognitiveLevel | null {
  return ACTIVE_DEEP_PATH_LEVELS.find((level) => isLevelSuitable(level, suitableLevels)) ?? null
}

export function getNextActionForLevelResult({
  currentLevel,
  levelPassed,
  suitableLevels = COGNITIVE_LEVELS,
}: {
  currentLevel: CognitiveLevel
  levelPassed: boolean
  suitableLevels?: CognitiveLevel[]
}): QuestionNextAction {
  if (!levelPassed) return 'continue_current_level'

  if (currentLevel === 'application') {
    return getFirstDeepLevel(suitableLevels) ? 'offer_deep_dive' : 'complete_node'
  }

  if (currentLevel === 'analysis') {
    return isLevelSuitable('evaluation', suitableLevels) ? 'advance_next_level' : 'complete_node'
  }

  if (currentLevel === 'evaluation' || currentLevel === 'creation') return 'complete_node'

  const nextLevel = getNextSuitableLevel(currentLevel, suitableLevels)
  if (!nextLevel) return 'complete_node'

  if (QUICK_PATH_LEVELS.includes(nextLevel)) return 'advance_next_level'

  return 'complete_node'
}

export function getLevelAfterNextAction({
  currentLevel,
  nextAction,
  suitableLevels = COGNITIVE_LEVELS,
}: {
  currentLevel: CognitiveLevel
  nextAction: QuestionNextAction
  suitableLevels?: CognitiveLevel[]
}): CognitiveLevel {
  if (nextAction !== 'advance_next_level') return currentLevel
  return getNextSuitableLevel(currentLevel, suitableLevels) ?? currentLevel
}

export function getDeepDiveStartLevel(
  suitableLevels: CognitiveLevel[] = COGNITIVE_LEVELS
): CognitiveLevel | null {
  return getFirstDeepLevel(suitableLevels)
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

export function updateLevelStatus(
  states: NodeLevelState[],
  level: CognitiveLevel,
  status: LevelStatus
): NodeLevelState[] {
  return states.map((state) => (
    state.level === level ? { ...state, status } : state
  ))
}
