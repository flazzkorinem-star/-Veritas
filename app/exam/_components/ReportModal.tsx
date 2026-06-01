'use client'

import type { ExamReport } from '@/lib/types'
import ReportCard from '@/components/ReportCard'
import { needsReportAttention } from '../_lib/examPageHelpers'

export function ReportModal({
  report,
  reportStatus,
  completedNodeCount,
  nodeCount,
  onClose,
}: {
  report: ExamReport
  reportStatus: string
  completedNodeCount: number
  nodeCount: number
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-6 py-8">
      <div className="max-h-full w-full max-w-4xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold text-slate-400">诊断报告 · 主要盲点</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">{report.summary}</h2>
            {reportStatus === 'stale' && (
              <p className="mt-2 text-xs font-semibold text-amber-600">有新对话，报告可以更新。</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            aria-label="关闭报告"
          >
            ×
          </button>
        </div>
        <div className="max-h-[72vh] space-y-4 overflow-y-auto p-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-400">知识点</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{report.nodes.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-400">需关注</p>
              <p className="mt-1 text-2xl font-bold text-[#FFA726]">
                {report.nodes.filter(needsReportAttention).length}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-400">完成度</p>
              <p className="mt-1 text-2xl font-bold text-[#5C6BC0]">{completedNodeCount}/{nodeCount}</p>
            </div>
          </div>

          {report.nodes.map((evaluation, index) => {
            const shouldOpen = index < 2 && needsReportAttention(evaluation)
            return (
              <details key={evaluation.nodeId} open={shouldOpen} className="rounded-2xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{evaluation.nodeName}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {evaluation.blindSpot || evaluation.nextStep || '这一项暂无明显盲点'}
                    </span>
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    needsReportAttention(evaluation)
                      ? 'bg-[#FFA726]/10 text-amber-700'
                      : 'bg-[#58CC02]/10 text-green-700'
                  }`}>
                    {needsReportAttention(evaluation) ? '需关注' : '已通过'}
                  </span>
                </summary>
                <div className="border-t border-slate-100 p-4">
                  <ReportCard evaluation={evaluation} />
                </div>
              </details>
            )
          })}
        </div>
      </div>
    </div>
  )
}
