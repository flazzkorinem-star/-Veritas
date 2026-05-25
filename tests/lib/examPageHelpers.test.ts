// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getLevelStatusLabel, isDiagnosisPlanTurn } from '@/app/exam/_lib/examPageHelpers'

describe('examPageHelpers', () => {
  it('uses turn metadata to identify diagnosis plan messages', () => {
    expect(isDiagnosisPlanTurn({
      role: 'assistant',
      kind: 'diagnosis_plan',
      content: '文案可以变化',
    })).toBe(true)
  })

  it('does not infer plan messages from Chinese copy', () => {
    expect(isDiagnosisPlanTurn({
      role: 'assistant',
      content: '我已经从「材料」里识别出 3 个适合诊断的知识点。',
    })).toBe(false)
  })

  it('labels answer-assisted level state directly from status', () => {
    expect(getLevelStatusLabel({
      status: 'answer_assisted',
    })).toBe('答案辅助')
  })
})
