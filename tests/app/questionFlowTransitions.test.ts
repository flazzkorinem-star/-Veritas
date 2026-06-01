import { describe, expect, it } from 'vitest'
import { buildQuestionResponseActions } from '../../app/exam/_lib/questionFlowTransitions'
import type { StructuredQuestionResponse } from '../../app/exam/_lib/examPageTypes'
import type { KnowledgeNode } from '../../lib/types'

const requestNode: KnowledgeNode = {
  id: 'node-1',
  name: 'RAG',
  context: '检索增强生成用于降低幻觉。',
  sourceExcerpt: 'RAG 会先检索相关文档片段，再交给模型生成回答。',
  priorityReason: '能考察定义、理解和应用。',
}

function makeResponse(overrides: Partial<StructuredQuestionResponse> = {}): StructuredQuestionResponse {
  return {
    reply: '回答得不错。',
    currentLevel: 'memory',
    passedCurrentLevel: true,
    nextAction: 'continue_current_level',
    blindSpotSummary: '',
    ...overrides,
  }
}

function build(response: StructuredQuestionResponse) {
  return buildQuestionResponseActions({ response, requestNodeId: requestNode.id })
}

describe('buildQuestionResponseActions', () => {
  it('总是先派发助手气泡和 Agent 响应', () => {
    const { actions, shouldCompleteNode } = build(makeResponse())
    expect(actions[0]).toEqual({
      type: 'ADD_TURN',
      nodeId: 'node-1',
      turn: { role: 'assistant', content: '回答得不错。' },
    })
    expect(actions[1]).toMatchObject({ type: 'SET_AGENT_RESPONSE', nodeId: 'node-1' })
    expect(shouldCompleteNode).toBe(false)
  })

  it('continue_current_level 只产出基础动作', () => {
    const { actions } = build(makeResponse({ nextAction: 'continue_current_level' }))
    expect(actions).toHaveLength(2)
  })

  it('advance_next_level 只按固定四层顺序推进，不跳级', () => {
    const { actions } = build(makeResponse({
      nextAction: 'advance_next_level',
      currentLevel: 'memory',
    }))
    expect(actions).toContainEqual({
      type: 'SET_CURRENT_LEVEL',
      nodeId: 'node-1',
      level: 'understanding',
    })
  })

  it('complete_node 只产出基础动作并要求完成节点', () => {
    const { actions, shouldCompleteNode } = build(makeResponse({
      nextAction: 'complete_node',
      currentLevel: 'analysis',
      passedCurrentLevel: true,
    }))
    expect(actions).toHaveLength(2)
    expect(shouldCompleteNode).toBe(true)
  })
})
