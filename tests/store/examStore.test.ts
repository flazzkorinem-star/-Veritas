// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { KnowledgeNode, SupportRecord } from '../../lib/types'
import { initialState, reducer } from '../../store/examStore'

const nodes: KnowledgeNode[] = [
  {
    id: 'node-1',
    name: 'RAG',
    context: '检索增强生成用于降低幻觉。',
    sourceExcerpt: 'RAG 会先检索相关文档片段，再交给模型生成回答。',
    importance: 1,
    priorityReason: '能同时考察定义、机制和应用边界。',
  },
  {
    id: 'node-2',
    name: '提示词约束',
    context: '提示词用于约束模型输出。',
    sourceExcerpt: '提示词需要明确任务、边界和输出格式。',
    importance: 2,
    priorityReason: '容易暴露只会复述、不知道如何应用的问题。',
  },
]

describe('exam store v3 state', () => {
  it('initial state includes v3 bridge fields', () => {
    expect(initialState.currentNodeId).toBeNull()
    expect(initialState.recordId).toBeNull()
    expect(initialState.materialTitle).toBe('当前诊断')
    expect(initialState.recordPinned).toBe(false)
    expect(initialState.createdAt).toBeNull()
    expect(initialState.updatedAt).toBeNull()
    expect(initialState.currentLevel).toBe('memory')
    expect(initialState.nodeLevelStates).toEqual({})
    expect(initialState.nodePathStates).toEqual({})
    expect(initialState.currentAgentResponse).toBeNull()
    expect(initialState.reportStatus).toBe('idle')
  })

  it('SET_NODES initializes level and path states for every node', () => {
    const state = reducer(initialState, { type: 'SET_NODES', nodes })

    expect(state.phase).toBe('examining')
    expect(state.currentNodeId).toBe('node-1')
    expect(state.currentLevel).toBe('memory')
    expect(state.nodeLevelStates['node-1']).toEqual([
      { level: 'memory', status: 'not_started' },
      { level: 'understanding', status: 'not_started' },
      { level: 'application', status: 'not_started' },
      { level: 'analysis', status: 'not_started' },
    ])
    expect(state.nodeLevelStates['node-2']).toHaveLength(4)
    expect(state.nodePathStates['node-1']).toEqual({ completed: false })
    expect(state.nodePathStates['node-2']).toEqual({ completed: false })
  })

  it('stores local diagnosis record metadata', () => {
    const updated = reducer(initialState, {
      type: 'SET_RECORD_META',
      recordId: 'record-1',
      materialTitle: 'WEEK11: Markov Chain Monte Carlo',
      recordPinned: true,
      createdAt: '2026-05-24T01:00:00.000Z',
      updatedAt: '2026-05-24T01:00:00.000Z',
    })

    expect(updated.recordId).toBe('record-1')
    expect(updated.materialTitle).toBe('WEEK11: Markov Chain Monte Carlo')
    expect(updated.recordPinned).toBe(true)
    expect(updated.createdAt).toBe('2026-05-24T01:00:00.000Z')
    expect(updated.updatedAt).toBe('2026-05-24T01:00:00.000Z')
  })

  it('updates current level and level pass state', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })
    const atUnderstanding = reducer(withNodes, {
      type: 'SET_CURRENT_LEVEL',
      level: 'understanding',
    })
    const updated = reducer(atUnderstanding, {
      type: 'UPDATE_NODE_LEVEL_STATUS',
      level: 'understanding',
      status: 'passed',
      blindSpotSummary: '能解释 RAG 的基本机制。',
      userQuote: '先检索资料，再让模型回答。',
    })

    expect(updated.currentLevel).toBe('understanding')
    expect(updated.nodeLevelStates['node-1']).toContainEqual({
      level: 'understanding',
      status: 'passed',
      blindSpotSummary: '能解释 RAG 的基本机制。',
      userQuote: '先检索资料，再让模型回答。',
    })
  })

  it('can mark a level as answer-assisted without treating it as passed', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })
    const updated = reducer(withNodes, {
      type: 'UPDATE_NODE_LEVEL_STATUS',
      level: 'memory',
      status: 'answer_assisted',
    })

    expect(updated.nodeLevelStates['node-1']).toContainEqual({
      level: 'memory',
      status: 'answer_assisted',
    })
  })

  it('records hint and answer support events', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })
    const records: SupportRecord[] = [
      {
        kind: 'hint',
        level: 'memory',
        question: 'RAG 是什么？',
        content: '先说全称和基本作用。',
      },
      {
        kind: 'answer',
        level: 'understanding',
        question: '为什么需要 RAG？',
        content: 'RAG 用检索片段补充上下文。',
      },
    ]
    const updated = records.reduce(
      (state, record) => reducer(state, { type: 'RECORD_SUPPORT', record }),
      withNodes
    )

    expect(updated.nodeLevelStates['node-1'].find((item) => item.level === 'memory')?.supportRecords).toEqual([records[0]])
    expect(updated.nodeLevelStates['node-1'].find((item) => item.level === 'understanding')?.supportRecords).toEqual([records[1]])
  })

  it('stores structured Agent 2 response', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })
    const updated = reducer(withNodes, {
      type: 'SET_AGENT_RESPONSE',
      response: {
        reply: '这个回答已经到应用层了，我们接着看边界。',
        currentLevel: 'application',
        levelPassed: true,
        nextAction: 'advance_next_level',
        blindSpotSummary: '还需要区分适用和不适用场景。',
      },
    })

    expect(updated.currentAgentResponse?.nextAction).toBe('advance_next_level')
    expect(updated.currentAgentResponse?.levelPassed).toBe(true)
    expect(updated.currentAgentResponse?.blindSpotSummary).toBe('还需要区分适用和不适用场景。')
    expect(updated.nodeLevelStates['node-1']).toContainEqual({
      level: 'application',
      status: 'passed',
      blindSpotSummary: '还需要区分适用和不适用场景。',
    })
  })

  it('writes delayed node replies to the original node instead of the currently selected node', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })
    const selectedSecondNode = reducer(withNodes, { type: 'SELECT_NEXT_NODE' })
    const withReply = reducer(selectedSecondNode, {
      type: 'ADD_TURN',
      nodeId: 'node-1',
      turn: { role: 'assistant', content: 'RAG 是什么？' },
    })
    const withResponse = reducer(withReply, {
      type: 'SET_AGENT_RESPONSE',
      nodeId: 'node-1',
      response: {
        reply: '先确认 RAG 的基本定义。',
        currentLevel: 'memory',
        levelPassed: false,
        nextAction: 'continue_current_level',
        blindSpotSummary: '还没有说出定义。',
      },
    })

    expect(withResponse.currentNodeId).toBe('node-2')
    expect(withResponse.nodeConversations[0].turns).toEqual([
      { role: 'assistant', content: 'RAG 是什么？' },
    ])
    expect(withResponse.nodeConversations[1].turns).toEqual([])
    expect(withResponse.nodeLevelStates['node-1']).toContainEqual({
      level: 'memory',
      status: 'in_progress',
      blindSpotSummary: '还没有说出定义。',
    })
    expect(withResponse.nodeLevelStates['node-2']).toContainEqual({
      level: 'memory',
      status: 'not_started',
    })
  })

  it('keeps node-targeted race guards from mutating the active node', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })
    const selectedSecondNode = reducer(withNodes, { type: 'SELECT_NEXT_NODE' })
    const ignoredLevel = reducer(selectedSecondNode, {
      type: 'SET_CURRENT_LEVEL',
      nodeId: 'node-1',
      level: 'analysis',
    })
    const ignoredNextNode = reducer(selectedSecondNode, { type: 'NEXT_NODE', fromNodeId: 'node-1' })

    expect(ignoredLevel.currentNodeId).toBe('node-2')
    expect(ignoredLevel.currentLevel).toBe('memory')
    expect(ignoredNextNode.currentNodeId).toBe('node-2')
  })

  it('completes a node and selects the next node', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })
    const completed = reducer(withNodes, { type: 'COMPLETE_NODE' })
    const nextNode = reducer(completed, { type: 'SELECT_NEXT_NODE' })

    expect(completed.nodePathStates['node-1'].completed).toBe(true)
    expect(nextNode.currentNodeId).toBe('node-2')
    expect(nextNode.currentNodeIndex).toBe(1)
    expect(nextNode.currentLevel).toBe('memory')
  })

  it('renames, pins, and deletes knowledge nodes', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })
    const renamed = reducer(withNodes, {
      type: 'UPDATE_NODE_NAME',
      nodeId: 'node-2',
      name: 'Prompt 约束',
    })
    const pinned = reducer(renamed, { type: 'TOGGLE_NODE_PIN', nodeId: 'node-2' })
    const deleted = reducer(pinned, { type: 'DELETE_NODE', nodeId: 'node-2' })

    expect(renamed.nodes[1].name).toBe('Prompt 约束')
    expect(renamed.nodeConversations[1].node.name).toBe('Prompt 约束')
    expect(pinned.nodes[0].id).toBe('node-2')
    expect(pinned.nodes[0].pinned).toBe(true)
    expect(deleted.nodes.map((node) => node.id)).toEqual(['node-1'])
    expect(deleted.nodeLevelStates['node-2']).toBeUndefined()
  })

  it('cycles node importance and keeps the conversation node in sync', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })
    const secondTier = reducer(withNodes, { type: 'CYCLE_NODE_IMPORTANCE', nodeId: 'node-1' })
    const thirdTier = reducer(secondTier, { type: 'CYCLE_NODE_IMPORTANCE', nodeId: 'node-1' })
    const firstTier = reducer(thirdTier, { type: 'CYCLE_NODE_IMPORTANCE', nodeId: 'node-1' })

    expect(secondTier.nodes[0].importance).toBe(2)
    expect(secondTier.nodeConversations[0].node.importance).toBe(2)
    expect(thirdTier.nodes[0].importance).toBe(3)
    expect(firstTier.nodes[0].importance).toBe(1)
  })

  it('keeps dialogue open after report generation and marks report stale after new turns', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })
    const withReport = reducer(withNodes, {
      type: 'SET_REPORT',
      report: {
        summary: '诊断报告',
        nodes: [],
      },
    })
    const withNewTurn = reducer(withReport, {
      type: 'ADD_TURN',
      turn: { role: 'user', content: '我想继续问一下。' },
    })

    expect(withReport.phase).toBe('reviewing')
    expect(withReport.reportStatus).toBe('ready')
    expect(withNewTurn.reportStatus).toBe('stale')
  })

  it('normalizes legacy done phase to reviewing on restore', () => {
    const restored = reducer(initialState, {
      type: 'RESTORE',
      state: {
        ...initialState,
        phase: 'done',
      } as unknown as typeof initialState,
    })

    expect(restored.phase).toBe('reviewing')
  })

  it('RESET restores the initial state', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })

    expect(reducer(withNodes, { type: 'RESET' })).toEqual(initialState)
  })
})
