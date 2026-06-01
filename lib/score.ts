import { NodeLevelState } from './types'

const LEVEL_SCORE = 25

export function isScoredLevelPass(
  state: Pick<NodeLevelState, 'level' | 'status' | 'supportRecords'>
): boolean {
  if (state.status !== 'passed') return false
  return !state.supportRecords?.some((record) => (
    record.level === state.level && record.kind === 'answer'
  ))
}

export function calculateNodeScore(states: NodeLevelState[]): number {
  return states.reduce((sum, state) => (
    isScoredLevelPass(state) ? sum + LEVEL_SCORE : sum
  ), 0)
}
