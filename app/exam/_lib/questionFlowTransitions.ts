import type { Action } from '@/store/examStore'
import { getLevelAfterNextAction } from '@/lib/examFlow'
import type { StructuredQuestionResponse } from './examPageTypes'

export function buildQuestionResponseActions({
  response,
  requestNodeId,
}: {
  response: StructuredQuestionResponse
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
      }),
    })
  }

  return {
    actions,
    shouldCompleteNode: response.nextAction === 'complete_node',
  }
}
