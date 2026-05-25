// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { KnowledgeNode, SupportRecord } from '../../lib/types'
import { getDialogueStatus, initialState, reducer } from '../../store/examStore'

const nodes: KnowledgeNode[] = [
  {
    id: 'node-1',
    name: 'RAG',
    context: '检索增强生成用于降低幻觉。',
    sourceExcerpt: 'RAG 会先检索相关文档片段，再交给模型生成回答。',
    suitableLevels: ['memory', 'understanding', 'application', 'analysis'],
    priorityReason: '能同时考察定义、机制和应用边界。',
  },
  {
    id: 'node-2',
    name: '提示词约束',
    context: '提示词用于约束模型输出。',
    sourceExcerpt: '提示词需要明确任务、边界和输出格式。',
    suitableLevels: ['memory', 'understanding', 'application'],
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
    expect(getDialogueStatus(initialState.currentAgentResponse)).toBe('idle')
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
      { level: 'evaluation', status: 'not_applicable' },
      { level: 'creation', status: 'not_applicable' },
    ])
    expect(state.nodeLevelStates['node-2']).toHaveLength(6)
    expect(state.nodePathStates['node-1']).toEqual({
      quickPath: 'in_progress',
      deepPath: 'not_started',
      completed: false,
    })
    expect(state.nodePathStates['node-2']).toEqual({
      quickPath: 'not_started',
      deepPath: 'not_applicable',
      completed: false,
    })
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

  it('records hint, answer, and analogy support events', () => {
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
      {
        kind: 'analogy',
        level: 'application',
        question: '什么时候使用 RAG？',
        content: '可以类比开卷查资料。',
      },
    ]
    const updated = records.reduce(
      (state, record) => reducer(state, { type: 'RECORD_SUPPORT', record }),
      withNodes
    )

    expect(updated.nodeLevelStates['node-1'].find((item) => item.level === 'memory')?.supportRecords).toEqual([records[0]])
    expect(updated.nodeLevelStates['node-1'].find((item) => item.level === 'understanding')?.supportRecords).toEqual([records[1]])
    expect(updated.nodeLevelStates['node-1'].find((item) => item.level === 'application')?.supportRecords).toEqual([records[2]])
  })

  it('stores structured Agent 2 response and keeps currentQuestion bridged', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })
    const updated = reducer(withNodes, {
      type: 'SET_AGENT_RESPONSE',
      response: {
        question: 'RAG 的应用边界是什么？',
        reply: '这个回答已经到应用层了，我们接着看边界。',
        currentLevel: 'application',
        levelPassed: true,
        nextAction: 'offer_deep_dive',
        blindSpotSummary: '还需要区分适用和不适用场景。',
      },
    })

    expect(updated.currentQuestion).toBe('这个回答已经到应用层了，我们接着看边界。')
    expect(updated.currentAgentResponse?.nextAction).toBe('offer_deep_dive')
    expect(getDialogueStatus(updated.currentAgentResponse)).toBe('deep_dive_choice')
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
        question: 'RAG 是什么？',
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
    const quickComplete = reducer(selectedSecondNode, { type: 'COMPLETE_QUICK_PATH', nodeId: 'node-1' })
    const deepPath = reducer(selectedSecondNode, { type: 'ENTER_DEEP_PATH', nodeId: 'node-1' })

    expect(ignoredLevel.currentNodeId).toBe('node-2')
    expect(ignoredLevel.currentLevel).toBe('memory')
    expect(ignoredNextNode.currentNodeId).toBe('node-2')
    expect(quickComplete.nodePathStates['node-1'].quickPath).toBe('completed')
    expect(quickComplete.nodePathStates['node-2'].quickPath).toBe('in_progress')
    expect(deepPath.currentNodeId).toBe('node-2')
    expect(deepPath.currentLevel).toBe('memory')
    expect(deepPath.nodePathStates['node-1'].deepPath).toBe('in_progress')
  })

  it('marks quick path complete, enters deep path, and selects the next node', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })
    const quickComplete = reducer(withNodes, { type: 'COMPLETE_QUICK_PATH' })
    const deepPath = reducer(quickComplete, { type: 'ENTER_DEEP_PATH' })
    const completed = reducer(deepPath, { type: 'COMPLETE_NODE' })
    const nextNode = reducer(completed, { type: 'SELECT_NEXT_NODE' })

    expect(quickComplete.nodePathStates['node-1'].quickPath).toBe('completed')
    expect(deepPath.currentLevel).toBe('analysis')
    expect(deepPath.nodePathStates['node-1']).toEqual({
      quickPath: 'completed',
      deepPath: 'in_progress',
      completed: false,
    })
    expect(completed.nodePathStates['node-1'].completed).toBe(true)
    expect(nextNode.currentNodeId).toBe('node-2')
    expect(nextNode.currentNodeIndex).toBe(1)
    expect(nextNode.nodePathStates['node-2'].quickPath).toBe('in_progress')
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

  it('keeps dialogue open after report generation and marks report stale after new turns', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })
    const withReport = reducer(withNodes, {
      type: 'SET_REPORT',
      report: {
        overallScore: 80,
        summary: '诊断报告',
        nodes: [],
      },
    })
    const withNewTurn = reducer(withReport, {
      type: 'ADD_TURN',
      turn: { role: 'user', content: '我想继续问一下。' },
    })

    expect(withReport.phase).toBe('examining')
    expect(withReport.reportStatus).toBe('ready')
    expect(withNewTurn.reportStatus).toBe('stale')
  })

  it('RESET restores the initial state', () => {
    const withNodes = reducer(initialState, { type: 'SET_NODES', nodes })

    expect(reducer(withNodes, { type: 'RESET' })).toEqual(initialState)
  })
})
