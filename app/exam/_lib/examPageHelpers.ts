import type { StoreExamState } from '@/store/examStore'
import type { CognitiveLevel, ExamReport, KnowledgeNode, SupportKind, SupportRecord } from '@/lib/types'

export const levelLabels: Record<CognitiveLevel, string> = {
  memory: '记忆',
  understanding: '理解',
  application: '应用',
  analysis: '分析',
  evaluation: '评价',
  creation: '创造',
}

export const nodeBookColors = ['#5C6BC0', '#58CC02', '#FFA726', '#EC407A', '#26C6DA', '#7E57C2', '#66BB6A', '#FF7043']

export function getLastAssistantQuestion(turns: { role: 'assistant' | 'user'; content: string }[]): string {
  return [...turns].reverse().find((turn) => turn.role === 'assistant')?.content ?? ''
}

export function formatPathProgress(progress: string | undefined): string {
  if (progress === 'completed') return '已完成'
  if (progress === 'in_progress') return '进行中'
  if (progress === 'not_applicable') return '不适用'
  return '未开始'
}

export function hasSupportKind(levelState: { supportRecords?: SupportRecord[] } | undefined, kind: SupportKind): boolean {
  return Boolean(levelState?.supportRecords?.some((record) => record.kind === kind))
}

export function getLevelStatusLabel(levelState: { status?: string; supportRecords?: SupportRecord[] } | undefined): string {
  if (hasSupportKind(levelState, 'answer')) return '答案辅助'
  if (levelState?.status === 'passed') return '✓'
  if (levelState?.status === 'in_progress') return '当前'
  if (levelState?.status === 'not_applicable') return '不适用'
  if (levelState?.status === 'failed') return '未通过'
  return '未开始'
}

export function getLevelStatusClass(
  levelState: { status?: string; supportRecords?: SupportRecord[] } | undefined,
  isCurrent: boolean
): string {
  if (hasSupportKind(levelState, 'answer')) return 'border border-[#FFA726]/30 bg-[#FFA726]/10 text-amber-700'
  if (isCurrent) return 'bg-[#5C6BC0]/10 font-semibold text-[#5C6BC0]'
  if (levelState?.status === 'passed') return 'bg-[#58CC02]/10 text-green-700'
  if (levelState?.status === 'failed') return 'bg-red-50 text-red-600'
  if (levelState?.status === 'not_applicable') return 'bg-transparent text-slate-300'
  return 'bg-slate-50 text-slate-400'
}

export function needsReportAttention(evaluation: ExamReport['nodes'][number]): boolean {
  return ['memory', 'understanding', 'application'].some((level) => (
    evaluation.levelStatus[level as CognitiveLevel] !== 'passed'
  ))
}

export function createRecordTitle(fileName: string): string {
  const withoutExtension = fileName.replace(/\.(pdf|docx|pptx|txt|md|markdown)$/i, '')
  return withoutExtension
    .replace(/[_-]+/g, ' ')
    .replace(/\bweek\s*([0-9]+)\b/gi, 'WEEK$1')
    .replace(/\s*[:：]\s*/g, ': ')
    .replace(/\s+/g, ' ')
    .trim() || '当前诊断'
}

export function createRecordId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `diagnosis-${Date.now()}`
}

export function buildDiagnosisPlan(materialTitle: string, nodes: KnowledgeNode[]): string {
  const firstNodeName = nodes[0]?.name ?? '第一个知识点'
  const previewNames = nodes.slice(0, 3).map((node, index) => `${index + 1}. ${node.name}`).join('\n')
  return `我已经从「${materialTitle}」里识别出 ${nodes.length} 个适合诊断的知识点。

建议先按左侧顺序走，每个知识点先完成记忆、理解、应用三层。

${previewNames}

我们先从「${firstNodeName}」开始。`
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
