import { readApiJson } from '@/lib/apiResponse'
import type { NodeConversation, NodeLevelState } from '@/lib/types'
import type { EvaluateApiResponse } from './examPageTypes'

export async function requestReport(params: {
  nodeConversations: NodeConversation[]
  nodeLevelStates: Record<string, NodeLevelState[]>
}): Promise<EvaluateApiResponse> {
  const res = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const report = await readApiJson<EvaluateApiResponse>(res)
  if (!res.ok) throw new Error(report.error)
  if (!Array.isArray(report.nodes)) throw new Error('服务器返回的数据不完整，请稍后重试')
  return report
}
