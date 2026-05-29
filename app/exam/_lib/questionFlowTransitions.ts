import type { Action } from '@/store/examStore'
import { getLevelAfterNextAction } from '@/lib/examFlow'
import type { KnowledgeNode } from '@/lib/types'
import type { StructuredQuestionResponse } from './examPageTypes'

export function buildQuestionResponseActions({
  response,
  requestNode,
  requestNodeId,
}: {
  response: StructuredQuestionResponse
  requestNode: KnowledgeNode
  requestNodeId: string
}): { actions: Action[]; shouldCompleteNode: boolean } {
  const actions: Action[] = [
    {
      type: 'ADD_TURN',
      nodeId: requestNodeId,
      turn: { role: 'assistant', content: response.reply },
    },
    { type: 'SET_AGENT_RESPONSE', nodeId: requestNodeId, response },
  ]

  if (response.nextAction === 'advance_next_level') {
    actions.push({
      type: 'SET_CURRENT_LEVEL',
      nodeId: requestNodeId,
      level: response.nextLevel ?? getLevelAfterNextAction({
        currentLevel: response.currentLevel,
        nextAction: response.nextAction,
        suitableLevels: requestNode.suitableLevels,
      }),
    })
  }

  if (response.nextAction === 'offer_deep_dive') {
    actions.push({ type: 'COMPLETE_QUICK_PATH', nodeId: requestNodeId })
  }

  if (
    response.nextAction === 'complete_node'
    && response.currentLevel === 'application'
    && response.passedCurrentLevel
  ) {
    actions.push({ type: 'COMPLETE_QUICK_PATH', nodeId: requestNodeId })
  }

  return {
    actions,
    shouldCompleteNode: response.nextAction === 'complete_node',
  }
}
