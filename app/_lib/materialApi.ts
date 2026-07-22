import { readApiJson } from '@/lib/apiResponse'
import type { MaterialAnalysis } from './materialLibrary'

interface MaterialAnalysisResponse extends Partial<MaterialAnalysis> {
  contentWarning?: string
  error?: string
}

export interface MaterialAnalysisResult extends MaterialAnalysis {
  contentWarning?: string
}

export async function analyzeMaterialFile(file: File): Promise<MaterialAnalysisResult> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch('/api/analyze', { method: 'POST', body: formData })
  const data = await readApiJson<MaterialAnalysisResponse>(response)

  if (!response.ok) throw new Error(data.error || '分析失败')
  if (!data.documentContent || !Array.isArray(data.nodes)) {
    throw new Error('服务器返回的数据不完整，请稍后重试')
  }

  return {
    documentContent: data.documentContent,
    nodes: data.nodes,
    contentWarning: data.contentWarning,
  }
}
