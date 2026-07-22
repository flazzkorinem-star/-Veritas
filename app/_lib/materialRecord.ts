import type { KnowledgeNode } from '@/lib/types'

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

建议先按左侧顺序走，每个知识点都会走记忆、理解、应用、分析四层。

${previewNames}

我们先从「${firstNodeName}」开始。`
}
