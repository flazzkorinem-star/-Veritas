// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  calculateNodeScore,
  calculateOverallScore,
  calculateQuickPathScore,
  isScoredQuickPathPass,
} from '../../lib/score'
import { NodeEvaluation, NodeLevelState } from '../../lib/types'

describe('calculateNodeScore', () => {
  it('mastered = 100', () => {
    expect(calculateNodeScore('mastered', false)).toBe(100)
  })
  it('developing = 60', () => {
    expect(calculateNodeScore('developing', false)).toBe(60)
  })
  it('needs_work = 40', () => {
    expect(calculateNodeScore('needs_work', false)).toBe(40)
  })
  it('misconception deducts 15', () => {
    expect(calculateNodeScore('mastered', true)).toBe(85)
    expect(calculateNodeScore('developing', true)).toBe(45)
    expect(calculateNodeScore('needs_work', true)).toBe(25)
  })
  it('score never goes below 0', () => {
    expect(calculateNodeScore('needs_work', true)).toBeGreaterThanOrEqual(0)
  })
})

describe('calculateOverallScore', () => {
  it('averages node scores', () => {
    const nodes = [
      { score: 100 } as NodeEvaluation,
      { score: 60 } as NodeEvaluation,
      { score: 40 } as NodeEvaluation,
    ]
    expect(calculateOverallScore(nodes)).toBe(67)
  })
})

describe('calculateQuickPathScore', () => {
  it('scores only the three quick-path levels as 33 + 33 + 34', () => {
    const states: NodeLevelState[] = [
      { level: 'memory', status: 'passed' },
      { level: 'understanding', status: 'passed' },
      { level: 'application', status: 'passed' },
      { level: 'analysis', status: 'passed' },
      { level: 'evaluation', status: 'passed' },
      { level: 'creation', status: 'passed' },
    ]

    expect(calculateQuickPathScore(states)).toBe(100)
  })

  it('does not score levels passed after showing the answer', () => {
    const states: NodeLevelState[] = [
      { level: 'memory', status: 'passed' },
      {
        level: 'understanding',
        status: 'passed',
        supportRecords: [
          {
            kind: 'answer',
            level: 'understanding',
            question: '为什么需要 RAG？',
            content: 'RAG 用检索片段补充上下文。',
          },
        ],
      },
      { level: 'application', status: 'passed' },
    ]

    expect(calculateQuickPathScore(states)).toBe(67)
  })

  it('does not score answer-assisted levels', () => {
    const states: NodeLevelState[] = [
      { level: 'memory', status: 'passed' },
      { level: 'understanding', status: 'answer_assisted' },
      { level: 'application', status: 'passed' },
    ]

    expect(calculateQuickPathScore(states)).toBe(67)
  })

  it('keeps score for hint-assisted and analogy-assisted passes', () => {
    expect(calculateQuickPathScore([
      {
        level: 'memory',
        status: 'passed',
        supportRecords: [
          {
            kind: 'hint',
            level: 'memory',
            question: 'RAG 是什么？',
            content: '先说全称和基本作用。',
          },
        ],
      },
      {
        level: 'understanding',
        status: 'passed',
        supportRecords: [
          {
            kind: 'analogy',
            level: 'understanding',
            question: '为什么需要 RAG？',
            content: '可以类比开卷查资料。',
          },
        ],
      },
    ])).toBe(66)
  })
})

describe('isScoredQuickPathPass', () => {
  it('returns false for deep levels and answer-assisted quick levels', () => {
    expect(isScoredQuickPathPass({ level: 'analysis', status: 'passed' })).toBe(false)
    expect(isScoredQuickPathPass({
      level: 'memory',
      status: 'answer_assisted',
    })).toBe(false)
    expect(isScoredQuickPathPass({
      level: 'memory',
      status: 'passed',
      supportRecords: [
        {
          kind: 'answer',
          level: 'memory',
          question: 'RAG 是什么？',
          content: 'RAG 是检索增强生成。',
        },
      ],
    })).toBe(false)
  })
})
