import { describe, expect, it } from 'vitest'
import { buildQuestionResponseActions } from '../../app/exam/_lib/questionFlowTransitions'
import type { StructuredQuestionResponse } from '../../app/exam/_lib/examPageTypes'
import type { KnowledgeNode } from '../../lib/types'

const requestNode: KnowledgeNode = {
  id: 'node-1',
  name: 'RAG',
  context: '检索增强生成用于降低幻觉。',
  sourceExcerpt: 'RAG 会先检索相关文档片段，再交给模型生成回答。',
  suitableLevels: ['memory', 'understanding', 'application'],
  priorityReason: '能考察定义、理解和应用。',
}

function makeResponse(overrides: Partial<StructuredQuestionResponse> = {}): StructuredQuestionResponse {
  return {
    question: '什么是 RAG？',
    reply: '回答得不错。',
    currentLevel: 'memory',
    passedCurrentLevel: true,
    nextAction: 'continue_current_level',
    blindSpotSummary: '',
    ...overrides,
  }
}

function build(response: StructuredQuestionResponse) {
  return buildQuestionResponseActions({ response, requestNode, requestNodeId: requestNode.id })
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

  it('advance_next_level 用 response.nextLevel 推进层级', () => {
    const { actions } = build(makeResponse({
      nextAction: 'advance_next_level',
      currentLevel: 'memory',
      nextLevel: 'application',
    }))
    expect(actions).toContainEqual({
      type: 'SET_CURRENT_LEVEL',
      nodeId: 'node-1',
      level: 'application',
    })
  })

  it('advance_next_level 缺 nextLevel 时回退到 suitableLevels 的下一层', () => {
    const { actions } = build(makeResponse({
      nextAction: 'advance_next_level',
      currentLevel: 'memory',
      nextLevel: undefined,
    }))
    expect(actions).toContainEqual({
      type: 'SET_CURRENT_LEVEL',
      nodeId: 'node-1',
      level: 'understanding',
    })
  })

  it('offer_deep_dive 完成快速通道但不完成节点', () => {
    const { actions, shouldCompleteNode } = build(makeResponse({ nextAction: 'offer_deep_dive' }))
    expect(actions).toContainEqual({ type: 'COMPLETE_QUICK_PATH', nodeId: 'node-1' })
    expect(shouldCompleteNode).toBe(false)
  })

  it('complete_node 在 application 层通过时补一条 COMPLETE_QUICK_PATH 并要求完成节点', () => {
    const { actions, shouldCompleteNode } = build(makeResponse({
      nextAction: 'complete_node',
      currentLevel: 'application',
      passedCurrentLevel: true,
    }))
    expect(actions).toContainEqual({ type: 'COMPLETE_QUICK_PATH', nodeId: 'node-1' })
    expect(shouldCompleteNode).toBe(true)
  })

  it('complete_node 非 application 通过时不补 COMPLETE_QUICK_PATH 但仍要求完成节点', () => {
    const { actions, shouldCompleteNode } = build(makeResponse({
      nextAction: 'complete_node',
      currentLevel: 'understanding',
      passedCurrentLevel: true,
    }))
    expect(actions).not.toContainEqual({ type: 'COMPLETE_QUICK_PATH', nodeId: 'node-1' })
    expect(shouldCompleteNode).toBe(true)
  })
})
