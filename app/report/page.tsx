'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useExam } from '@/store/examStore'
import ReportCard from '@/components/ReportCard'

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? 'text-emerald-500' : score >= 50 ? 'text-amber-500' : 'text-red-500'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`text-7xl font-bold ${color}`}>{score}</div>
      <div className="text-gray-400 text-sm">综合得分</div>
    </div>
  )
}

export default function ReportPage() {
  const { state, dispatch } = useExam()
  const router = useRouter()
  const hasReportNodes = Boolean(state.report?.nodes.length)

  useEffect(() => {
    if (state.phase !== 'done' || !hasReportNodes) {
      dispatch({ type: 'RESET' })
      router.push('/')
    }
  }, [state.phase, hasReportNodes, dispatch, router])

  if (!state.report || !hasReportNodes) return null

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="text-4xl">📊</div>
          <h1 className="text-2xl font-bold text-gray-900">检验报告</h1>
        </div>

        {/* Score */}
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
          <ScoreRing score={state.report.overallScore} />
          {state.report.summary && (
            <p className="mt-4 text-gray-600 text-sm leading-relaxed">{state.report.summary}</p>
          )}
        </div>

        {/* Per-node cards */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            各知识节点详情
          </h2>
          {state.report.nodes.map((node) => (
            <ReportCard key={node.nodeId} evaluation={node} />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => { dispatch({ type: 'RESET' }); router.push('/') }}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 rounded-xl transition-colors"
          >
            再检验一次
          </button>
        </div>
      </div>
    </main>
  )
}
