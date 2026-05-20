import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ReportCard from '../../components/ReportCard'

describe('ReportCard', () => {
  it('shows the source excerpt when evaluation includes material evidence', () => {
    render(
      <ReportCard
        evaluation={{
          nodeId: '1',
          nodeName: 'RAG',
          masteryLevel: 'mastered',
          hasMisconception: false,
          isSupplementalExplanation: false,
          score: 100,
          sourceExcerpt: 'RAG 会先检索相关文档片段，再把片段作为上下文交给大模型生成回答。',
        }}
      />
    )

    expect(screen.getByText('查看材料依据')).toBeInTheDocument()
    expect(screen.getByText(/RAG 会先检索相关文档片段/)).toBeInTheDocument()
  })

  it('marks supplemental explanations without showing learning advice', () => {
    render(
      <ReportCard
        evaluation={{
          nodeId: '2',
          nodeName: '位置编码',
          masteryLevel: 'needs_work',
          hasMisconception: false,
          explanation: '位置编码用于让模型区分序列中不同位置的信息。',
          isSupplementalExplanation: true,
          score: 40,
        }}
      />
    )

    expect(screen.getByText('补充解释')).toBeInTheDocument()
    expect(screen.queryByText('下一步练习')).not.toBeInTheDocument()
  })
})
