// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  appendTranscript,
  appendTurnToNodeConversations,
  appendTurnToNodeConversationById,
  buildNodeTransition,
  buildNodeCompletion,
  createSupportRecord,
  createInitialLevelStates,
  getLevelAfterNextAction,
  getNextActionForLevelResult,
  getNextSuitableLevel,
  shouldRequestInitialQuestion,
} from '../../lib/examFlow'
import { NodeConversation } from '../../lib/types'

describe('appendTurnToNodeConversations', () => {
  it('includes the just-submitted user answer in conversations sent for evaluation', () => {
    const conversations: NodeConversation[] = [
      {
        node: {
          id: 'node-1',
          name: 'RAG',
          context: '检索增强生成',
          sourceExcerpt: 'RAG 会先检索相关文档片段。',
        },
        turns: [
          { role: 'assistant', content: 'RAG 是什么？' },
        ],
      },
    ]

    const updated = appendTurnToNodeConversations(conversations, 0, {
      role: 'user',
      content: 'RAG 是先检索相关资料，再交给模型生成回答。',
    })

    expect(updated[0].turns).toEqual([
      { role: 'assistant', content: 'RAG 是什么？' },
      { role: 'user', content: 'RAG 是先检索相关资料，再交给模型生成回答。' },
    ])
    expect(conversations[0].turns).toHaveLength(1)
  })
})

describe('appendTranscript', () => {
  it('appends a new voice transcript instead of replacing the existing answer', () => {
    expect(appendTranscript('我不知道', '我再补充一点')).toBe('我不知道我再补充一点')
  })

  it('uses the transcript directly when the answer is empty', () => {
    expect(appendTranscript('', '第一段回答')).toBe('第一段回答')
  })
})

describe('buildNodeTransition', () => {
  it('builds the fixed neutral transition text between nodes', () => {
    expect(buildNodeTransition('注意力机制', '残差连接')).toBe(
      '好，关于 注意力机制 我们先聊到这里。我们来看下一个：残差连接……'
    )
  })

  it('can append a turn by node id even when the selected index changes', () => {
    const conversations: NodeConversation[] = [
      {
        node: {
          id: 'node-1',
          name: 'RAG',
          context: '检索增强生成',
          sourceExcerpt: 'RAG 会先检索相关文档片段。',
        },
        turns: [],
      },
      {
        node: {
          id: 'node-2',
          name: '提示词约束',
          context: '提示词用于约束模型输出。',
          sourceExcerpt: '提示词需要明确任务和边界。',
        },
        turns: [],
      },
    ]

    const updated = appendTurnToNodeConversationById(conversations, 'node-1', {
      role: 'assistant',
      content: 'RAG 是什么？',
    })

    expect(updated[0].turns).toEqual([{ role: 'assistant', content: 'RAG 是什么？' }])
    expect(updated[1].turns).toEqual([])
  })

  it('builds explicit completion text for node transitions and the final node', () => {
    expect(buildNodeCompletion('注意力机制', '残差连接')).toBe(
      '「注意力机制」这个知识点已完成。我们来看下一个：残差连接。'
    )
    expect(buildNodeCompletion('残差连接')).toBe(
      '「残差连接」这个知识点已完成。所有目标知识点都完成了，我来生成诊断报告。'
    )
  })
})

describe('shouldRequestInitialQuestion', () => {
  it('does not request the first question twice for the same node', () => {
    expect(shouldRequestInitialQuestion({
      isHydrated: true,
      phase: 'examining',
      currentNodeId: 'node-1',
      turnCount: 0,
      submitting: false,
      requestedNodeId: 'node-1',
    })).toBe(false)
  })

  it('requests the first question once for an untouched node', () => {
    expect(shouldRequestInitialQuestion({
      isHydrated: true,
      phase: 'examining',
      currentNodeId: 'node-1',
      turnCount: 0,
      submitting: false,
      requestedNodeId: null,
    })).toBe(true)
  })
})

describe('level flow helpers', () => {
  it('creates a not_started state for every one of the four cognitive levels', () => {
    expect(createInitialLevelStates()).toEqual([
      { level: 'memory', status: 'not_started' },
      { level: 'understanding', status: 'not_started' },
      { level: 'application', status: 'not_started' },
      { level: 'analysis', status: 'not_started' },
    ])
  })

  it('finds the next level in the fixed four-level sequence', () => {
    expect(getNextSuitableLevel('memory')).toBe('understanding')
    expect(getNextSuitableLevel('application')).toBe('analysis')
    expect(getNextSuitableLevel('analysis')).toBeNull()
  })

  it('advances to the next level when the current level passes', () => {
    expect(getNextActionForLevelResult({
      currentLevel: 'memory',
      levelPassed: true,
    })).toBe('advance_next_level')

    expect(getNextActionForLevelResult({
      currentLevel: 'application',
      levelPassed: true,
    })).toBe('advance_next_level')
  })

  it('completes the node after analysis passes', () => {
    expect(getNextActionForLevelResult({
      currentLevel: 'analysis',
      levelPassed: true,
    })).toBe('complete_node')
  })

  it('continues the current level when the level has not passed', () => {
    expect(getNextActionForLevelResult({
      currentLevel: 'understanding',
      levelPassed: false,
    })).toBe('continue_current_level')
  })

  it('uses nextAction to advance to the next level', () => {
    expect(getLevelAfterNextAction({
      currentLevel: 'memory',
      nextAction: 'advance_next_level',
    })).toBe('understanding')

    expect(getLevelAfterNextAction({
      currentLevel: 'memory',
      nextAction: 'continue_current_level',
    })).toBe('memory')
  })

  it('records hint and answer support for the current level', () => {
    expect(createSupportRecord({
      kind: 'hint',
      level: 'understanding',
      question: '为什么需要 RAG？',
      content: '先想它解决了什么上下文问题。',
      createdAt: '2026-05-21T00:00:00.000Z',
    })).toEqual({
      kind: 'hint',
      level: 'understanding',
      question: '为什么需要 RAG？',
      content: '先想它解决了什么上下文问题。',
      createdAt: '2026-05-21T00:00:00.000Z',
    })

    expect(createSupportRecord({
      kind: 'answer',
      level: 'application',
      question: '什么时候该用 RAG？',
      content: '适合需要外部材料支撑的回答。',
    })).toEqual({
      kind: 'answer',
      level: 'application',
      question: '什么时候该用 RAG？',
      content: '适合需要外部材料支撑的回答。',
    })
  })

})
