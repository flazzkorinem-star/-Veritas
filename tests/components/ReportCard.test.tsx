import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ReportCard from '../../components/ReportCard'
import { NodeEvaluation } from '../../lib/types'

function makeEvaluation(overrides: Partial<NodeEvaluation> = {}): NodeEvaluation {
  return {
    nodeId: '1',
    nodeName: 'RAG',
    sourceExcerpt: 'RAG 会先检索相关材料，再把材料交给模型生成回答。',
    levelStatus: {
      memory: 'passed',
      understanding: 'passed',
      application: 'not_started',
      analysis: 'not_applicable',
      evaluation: 'not_applicable',
      creation: 'not_applicable',
    },
    evidenceQuotes: [],
    blindSpot: '',
    supportUsed: { hint: false, answer: false, analogy: false },
    correctUnderstanding: '',
    nextStep: '',
    score: 66,
    ...overrides,
  }
}

describe('ReportCard', () => {
  it('shows the source excerpt when evaluation includes material evidence', () => {
    render(<ReportCard evaluation={makeEvaluation()} />)

    expect(screen.getByText('查看材料证据')).toBeInTheDocument()
    expect(screen.getByText(/RAG 会先检索相关材料/)).toBeInTheDocument()
  })

  it('reads v3.0 report fields instead of legacy mastery fields', () => {
    render(
      <ReportCard
        evaluation={makeEvaluation({
          evidenceQuotes: ['RAG 是先找资料，再结合资料回答。'],
          blindSpot: '应用层还需要把流程放进具体场景。',
          supportUsed: { hint: true, answer: false, analogy: true },
          correctUnderstanding: 'RAG 是检索材料后，把材料作为上下文交给模型生成。',
          nextStep: '用客服场景重新说明检索、引用材料和生成回答三步。',
        })}
      />
    )

    expect(screen.getByText(/记忆：通过/)).toBeInTheDocument()
    expect(screen.getByText('应用层还需要把流程放进具体场景。')).toBeInTheDocument()
    expect(screen.getByText(/RAG 是先找资料/)).toBeInTheDocument()
    expect(screen.getByText('提示 / 主动类比')).toBeInTheDocument()
    expect(screen.getByText(/检索材料后/)).toBeInTheDocument()
    expect(screen.getByText(/客服场景/)).toBeInTheDocument()
  })
})
