// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  calculateOverallScore,
  calculateNodeScore,
  isScoredLevelPass,
} from '../../lib/score'
import { NodeEvaluation, NodeLevelState } from '../../lib/types'

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

describe('calculateNodeScore', () => {
  it('scores each of the four levels as 25, summing to 100 when all pass', () => {
    const states: NodeLevelState[] = [
      { level: 'memory', status: 'passed' },
      { level: 'understanding', status: 'passed' },
      { level: 'application', status: 'passed' },
      { level: 'analysis', status: 'passed' },
    ]

    expect(calculateNodeScore(states)).toBe(100)
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
      { level: 'analysis', status: 'passed' },
    ]

    expect(calculateNodeScore(states)).toBe(75)
  })

  it('does not score answer-assisted levels', () => {
    const states: NodeLevelState[] = [
      { level: 'memory', status: 'passed' },
      { level: 'understanding', status: 'answer_assisted' },
      { level: 'application', status: 'passed' },
      { level: 'analysis', status: 'passed' },
    ]

    expect(calculateNodeScore(states)).toBe(75)
  })

  it('keeps score for hint-assisted and analogy-assisted passes', () => {
    expect(calculateNodeScore([
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
    ])).toBe(50)
  })
})

describe('isScoredLevelPass', () => {
  it('returns false for answer-assisted and answer-supported passes', () => {
    expect(isScoredLevelPass({ level: 'analysis', status: 'passed' })).toBe(true)
    expect(isScoredLevelPass({
      level: 'memory',
      status: 'answer_assisted',
    })).toBe(false)
    expect(isScoredLevelPass({
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
