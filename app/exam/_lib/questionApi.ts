import { readApiJson } from '@/lib/apiResponse'
import { createSupportRecord } from '@/lib/examFlow'
import type { CognitiveLevel, KnowledgeNode, NodeLevelState } from '@/lib/types'
import type { QuestionApiResponse, QuestionRequestType, StructuredQuestionResponse } from './examPageTypes'
import { getLastAssistantQuestion } from './examPageHelpers'

type Turn = { role: 'assistant' | 'user'; content: string }

function normalizeQuestionResponse(
  data: QuestionApiResponse,
  fallbackLevel: CognitiveLevel,
  conversationTurns: Turn[]
): StructuredQuestionResponse {
  const reply = (data.reply ?? data.question)?.trim() ?? ''
  const passedCurrentLevel = data.passedCurrentLevel ?? data.levelPassed
  if (!reply || !data.nextAction || typeof passedCurrentLevel !== 'boolean') {
    throw new Error('服务器返回的数据不完整，请稍后重试')
  }

  const response: StructuredQuestionResponse = {
    ...data,
    question: reply,
    reply,
    currentLevel: data.currentLevel ?? fallbackLevel,
    passedCurrentLevel,
    nextAction: data.nextAction,
    blindSpotSummary: data.blindSpotSummary ?? '',
    supportRecords: data.supportRecords ?? [],
  }

  if (data.supportUsed && data.supportUsed !== 'none' && (response.supportRecords?.length ?? 0) === 0) {
    response.supportRecords = [
      createSupportRecord({
        kind: data.supportUsed,
        level: response.currentLevel,
        question: getLastAssistantQuestion(conversationTurns),
        content: response.reply,
      }),
    ]
  }

  return response
}

export async function requestQuestion(params: {
  node: KnowledgeNode
  currentLevel: CognitiveLevel
  levelStates: NodeLevelState[]
  conversationHistory: Turn[]
  requestType: QuestionRequestType
}): Promise<StructuredQuestionResponse> {
  const res = await fetch('/api/question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await readApiJson<QuestionApiResponse>(res)
  if (!res.ok) throw new Error(data.error || '请求失败')
  return normalizeQuestionResponse(data, params.currentLevel, params.conversationHistory)
}
