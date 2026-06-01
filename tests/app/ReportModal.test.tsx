import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReportModal } from '../../app/exam/_components/ReportModal'
import type { ExamReport } from '../../lib/types'

function makeReport(): ExamReport {
  return {
    summary: '主要盲点是应用层需要答案辅助。',
    nodes: [
      {
        nodeId: 'rag',
        nodeName: 'RAG',
        levelStatus: {
          memory: 'passed',
          understanding: 'passed',
          application: 'answer_assisted',
          analysis: 'in_progress',
        },
        evidenceQuotes: [],
        blindSpot: '应用层需要答案辅助',
        supportUsed: { hint: false, answer: true },
        correctUnderstanding: '',
        nextStep: '',
        score: 75,
      },
    ],
  }
}

describe('ReportModal', () => {
  it('报告顶部条目(折叠态)直接展示各节点得分与四层状态', () => {
    render(
      <ReportModal
        report={makeReport()}
        reportStatus="ready"
        completedNodeCount={1}
        nodeCount={1}
        onClose={() => {}}
      />
    )

    // 节点条目折叠行直接显示得分(与 ReportCard 内的 "75 / 100" 区分：顶部无空格)
    expect(screen.getByText('75/100')).toBeInTheDocument()
    // 四层状态点的层级标签出现在折叠行
    expect(screen.getByText('记')).toBeInTheDocument()
    expect(screen.getByText('分')).toBeInTheDocument()
  })
})
