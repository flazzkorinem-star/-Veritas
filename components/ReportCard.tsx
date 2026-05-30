import { CognitiveLevel, LevelStatus, NodeEvaluation } from '@/lib/types'

const LEVEL_LABELS: Record<CognitiveLevel, string> = {
  memory: '记忆',
  understanding: '理解',
  application: '应用',
  analysis: '分析',
}

const STATUS_LABELS: Record<LevelStatus, string> = {
  not_started: '未尝试',
  in_progress: '未通过',
  passed: '通过',
  answer_assisted: '答案辅助',
  failed: '未通过',
}

function getCardTone(levelStatus: NodeEvaluation['levelStatus']) {
  const levels = Object.keys(LEVEL_LABELS) as CognitiveLevel[]
  const passed = levels.filter((level) => levelStatus[level] === 'passed').length

  if (passed === levels.length) {
    return {
      label: '四层全部通过',
      color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      dot: 'bg-emerald-500',
    }
  }

  if (passed > 0) {
    return {
      label: '部分层级通过',
      color: 'bg-amber-50 border-amber-200 text-amber-700',
      dot: 'bg-amber-500',
    }
  }

  return {
    label: '待补齐',
    color: 'bg-red-50 border-red-200 text-red-700',
    dot: 'bg-red-500',
  }
}

function formatLevelStatus(levelStatus: NodeEvaluation['levelStatus']): string {
  return (Object.keys(LEVEL_LABELS) as CognitiveLevel[])
    .map((level) => `${LEVEL_LABELS[level]}：${STATUS_LABELS[levelStatus[level]]}`)
    .join(' / ')
}

function formatSupportUsed(supportUsed: NodeEvaluation['supportUsed']): string {
  const used = [
    supportUsed.hint ? '提示' : '',
    supportUsed.answer ? '答案' : '',
    supportUsed.analogy ? '主动类比' : '',
  ].filter(Boolean)

  return used.length > 0 ? used.join(' / ') : '未使用'
}

interface ReportCardProps {
  evaluation: NodeEvaluation
}

export default function ReportCard({ evaluation }: ReportCardProps) {
  const { label, color, dot } = getCardTone(evaluation.levelStatus)
  return (
    <div className={`border rounded-2xl p-5 space-y-3 ${color}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{evaluation.nodeName}</h3>
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          {label}
        </span>
      </div>

      <div className="bg-white/70 rounded-xl p-3">
        <p className="text-xs font-medium text-gray-500 mb-1">层级状态</p>
        <p className="text-sm text-gray-800">{formatLevelStatus(evaluation.levelStatus)}</p>
      </div>

      {evaluation.blindSpot && (
        <div className="bg-white/70 rounded-xl p-3">
          <p className="text-xs font-medium text-gray-500 mb-1">盲点诊断</p>
          <p className="text-sm text-gray-800">{evaluation.blindSpot}</p>
        </div>
      )}

      {evaluation.evidenceQuotes.length > 0 && (
        <div className="bg-white/70 rounded-xl p-3 space-y-2">
          <p className="text-xs font-medium text-gray-500">用户原话证据</p>
          {evaluation.evidenceQuotes.map((quote) => (
            <p key={quote} className="text-sm text-gray-600 italic">
              你说：“{quote}”
            </p>
          ))}
        </div>
      )}

      <div className="bg-white/70 rounded-xl p-3">
        <p className="text-xs font-medium text-gray-500 mb-1">支持使用</p>
        <p className="text-sm text-gray-800">{formatSupportUsed(evaluation.supportUsed)}</p>
      </div>

      {evaluation.correctUnderstanding && (
        <div className="bg-white/70 rounded-xl p-3">
          <p className="text-xs font-medium text-gray-500 mb-1">正确理解</p>
          <p className="text-sm text-gray-800">{evaluation.correctUnderstanding}</p>
        </div>
      )}

      {evaluation.nextStep && (
        <div className="bg-white/70 rounded-xl p-3">
          <p className="text-xs font-medium text-gray-500 mb-1">下一步</p>
          <p className="text-sm text-gray-800">{evaluation.nextStep}</p>
        </div>
      )}

      {evaluation.sourceExcerpt && (
        <details className="bg-white/60 rounded-xl p-3">
          <summary className="cursor-pointer text-xs font-medium text-gray-500">
            查看材料证据
          </summary>
          <p className="mt-2 text-sm text-gray-800">{evaluation.sourceExcerpt}</p>
        </details>
      )}
    </div>
  )
}
