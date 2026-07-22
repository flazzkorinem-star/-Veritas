import type { StoreExamState } from '@/store/examStore'
import type { CognitiveLevel, ExamReport, SupportKind, SupportRecord } from '@/lib/types'

export const levelLabels: Record<CognitiveLevel, string> = {
  memory: '记忆',
  understanding: '理解',
  application: '应用',
  analysis: '分析',
}

export const nodeBookColors = ['#5C6BC0', '#58CC02', '#FFA726', '#EC407A', '#26C6DA', '#7E57C2', '#66BB6A', '#FF7043']

export function getLastAssistantQuestion(turns: { role: 'assistant' | 'user'; content: string }[]): string {
  return [...turns].reverse().find((turn) => turn.role === 'assistant')?.content ?? ''
}

export function hasSupportKind(levelState: { supportRecords?: SupportRecord[] } | undefined, kind: SupportKind): boolean {
  return Boolean(levelState?.supportRecords?.some((record) => record.kind === kind))
}

export function getLevelStatusLabel(levelState: { status?: string; supportRecords?: SupportRecord[] } | undefined): string {
  if (levelState?.status === 'answer_assisted') return '答案辅助'
  if (hasSupportKind(levelState, 'answer')) return '答案辅助'
  if (levelState?.status === 'passed') return '✓'
  if (levelState?.status === 'in_progress') return '当前'
  if (levelState?.status === 'failed') return '未通过'
  return '未开始'
}

export function getLevelStatusClass(
  levelState: { status?: string; supportRecords?: SupportRecord[] } | undefined,
  isCurrent: boolean
): string {
  if (levelState?.status === 'answer_assisted') return 'border border-[#FFA726]/30 bg-[#FFA726]/10 text-amber-700'
  if (hasSupportKind(levelState, 'answer')) return 'border border-[#FFA726]/30 bg-[#FFA726]/10 text-amber-700'
  if (isCurrent) return 'bg-[#5C6BC0]/10 font-semibold text-[#5C6BC0]'
  if (levelState?.status === 'passed') return 'bg-[#58CC02]/10 text-green-700'
  if (levelState?.status === 'failed') return 'bg-red-50 text-red-600'
  return 'bg-slate-50 text-slate-400'
}

export function needsReportAttention(evaluation: ExamReport['nodes'][number]): boolean {
  return ['memory', 'understanding', 'application', 'analysis'].some((level) => (
    evaluation.levelStatus[level as CognitiveLevel] !== 'passed'
  ))
}

export function isDiagnosisPlanTurn(turn: { role?: string; content?: string; kind?: string } | undefined): boolean {
  return turn?.kind === 'diagnosis_plan'
}

export function getNodeStageText(state: StoreExamState, nodeId: string, index: number): string {
  if (state.nodePathStates[nodeId]?.completed) return '已完成'
  if (index === state.currentNodeIndex) return levelLabels[state.currentLevel]
  const levelStates = state.nodeLevelStates[nodeId] ?? []
  const inProgress = levelStates.find((levelState) => levelState.status === 'in_progress')
  if (inProgress) return levelLabels[inProgress.level]
  if (levelStates.some((levelState) => levelState.status === 'passed')) return '已开始'
  return '未开始'
}
