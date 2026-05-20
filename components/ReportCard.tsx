import { NodeEvaluation, MasteryLevel } from '@/lib/types'

const LEVEL: Record<MasteryLevel, { label: string; color: string; dot: string }> = {
  mastered:   { label: '已掌握', color: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500' },
  developing: { label: '掌握中', color: 'bg-amber-50 border-amber-200 text-amber-700',   dot: 'bg-amber-500' },
  needs_work: { label: '待突破', color: 'bg-red-50 border-red-200 text-red-700',         dot: 'bg-red-500' },
}

interface ReportCardProps {
  evaluation: NodeEvaluation
}

export default function ReportCard({ evaluation }: ReportCardProps) {
  const { label, color, dot } = LEVEL[evaluation.masteryLevel]
  return (
    <div className={`border rounded-2xl p-5 space-y-3 ${color}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{evaluation.nodeName}</h3>
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          {label}
        </span>
      </div>

      {evaluation.evidenceSummary && (
        <div className="bg-white/70 rounded-xl p-3">
          <p className="text-xs font-medium text-gray-500 mb-1">判断理由</p>
          <p className="text-sm text-gray-800">{evaluation.evidenceSummary}</p>
        </div>
      )}

      {evaluation.hasMisconception && evaluation.misconceptionQuote && (
        <div className="bg-white/70 rounded-xl p-3 space-y-2">
          <p className="text-xs font-medium text-red-600">⚠️ 存在误解</p>
          <p className="text-sm text-gray-600 italic">
            你说：「{evaluation.misconceptionQuote}」
          </p>
          {evaluation.misconceptionCorrection && (
            <div className="space-y-1">
              <p className="text-sm text-gray-800">
                正确理解：{evaluation.misconceptionCorrection}
              </p>
              {evaluation.isSupplementalExplanation && (
                <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  补充解释
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {evaluation.explanation && (
        <div className="bg-white/70 rounded-xl p-3">
          <div className="mb-1 flex items-center gap-2">
            <p className="text-xs font-medium text-gray-500">正确解释</p>
            {evaluation.isSupplementalExplanation && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                补充解释
              </span>
            )}
          </div>
          <p className="text-sm text-gray-800">{evaluation.explanation}</p>
        </div>
      )}

      {evaluation.sourceExcerpt && (
        <details className="bg-white/60 rounded-xl p-3">
          <summary className="cursor-pointer text-xs font-medium text-gray-500">
            查看材料依据
          </summary>
          <p className="mt-2 text-sm text-gray-800">{evaluation.sourceExcerpt}</p>
        </details>
      )}
    </div>
  )
}
