import { CognitiveLevel, MasteryLevel, NodeEvaluation, NodeLevelState } from './types'

const LEVEL_SCORES: Record<MasteryLevel, number> = {
  mastered: 100,
  developing: 60,
  needs_work: 40,
}

const QUICK_PATH_SCORES: Partial<Record<CognitiveLevel, number>> = {
  memory: 33,
  understanding: 33,
  application: 34,
}

export function calculateNodeScore(level: MasteryLevel, hasMisconception: boolean): number {
  const base = LEVEL_SCORES[level]
  const deduction = hasMisconception ? 15 : 0
  return Math.max(0, base - deduction)
}

export function calculateOverallScore(nodes: Pick<NodeEvaluation, 'score'>[]): number {
  if (nodes.length === 0) return 0
  const total = nodes.reduce((sum, n) => sum + n.score, 0)
  return Math.round(total / nodes.length)
}

export function isScoredQuickPathPass(
  state: Pick<NodeLevelState, 'level' | 'status' | 'supportRecords'>
): boolean {
  if (state.status !== 'passed') return false
  if (QUICK_PATH_SCORES[state.level] === undefined) return false
  return !state.supportRecords?.some((record) => (
    record.level === state.level && record.kind === 'answer'
  ))
}

export function calculateQuickPathScore(states: NodeLevelState[]): number {
  return states.reduce((sum, state) => {
    if (!isScoredQuickPathPass(state)) return sum
    return sum + (QUICK_PATH_SCORES[state.level] ?? 0)
  }, 0)
}
