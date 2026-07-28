import type { KnowledgeNode } from '@/lib/types'
import {
  LOCAL_DIAGNOSIS_SCHEMA_VERSION,
  saveDiagnosisRecord,
  toPersistedDiagnosisState,
  type LocalDiagnosisRecord,
} from '@/lib/localHistory'
import { initialState, reducer, type StoreExamState } from '@/store/examStore'
import { validateMaterialFile } from './materialFile'
import { buildDiagnosisPlan, createRecordId, createRecordTitle } from './materialRecord'

export interface MaterialAnalysis {
  documentContent: string
  nodes: KnowledgeNode[]
}

export interface MaterialProgress {
  status: 'idle' | 'active' | 'done'
  label: string
  completedCount: number
  totalCount: number
}

export interface MaterialImportProgress {
  current: number
  processed: number
  total: number
  fileName: string
}

export function createMaterialRecord({
  id,
  fileName,
  now,
  analysis,
}: {
  id: string
  fileName: string
  now: string
  analysis: MaterialAnalysis
}): LocalDiagnosisRecord {
  const title = createRecordTitle(fileName)
  let state: StoreExamState = reducer(initialState, {
    type: 'START_ANALYZING',
    content: analysis.documentContent,
  })
  state = reducer(state, {
    type: 'SET_RECORD_META',
    recordId: id,
    materialTitle: title,
    recordPinned: false,
    createdAt: now,
    updatedAt: now,
  })
  state = reducer(state, { type: 'SET_NODES', nodes: analysis.nodes })
  state = reducer(state, {
    type: 'ADD_TURN',
    turn: {
      role: 'assistant',
      kind: 'diagnosis_plan',
      content: buildDiagnosisPlan(title, analysis.nodes),
    },
  })

  return {
    schemaVersion: LOCAL_DIAGNOSIS_SCHEMA_VERSION,
    id,
    title,
    createdAt: now,
    updatedAt: now,
    pinned: false,
    state: toPersistedDiagnosisState(state),
  }
}

export function getMaterialProgress(record: LocalDiagnosisRecord): MaterialProgress {
  const totalCount = record.state.nodes.length
  const completedCount = record.state.nodes.filter((node) => (
    record.state.nodePathStates[node.id]?.completed
  )).length

  if (totalCount > 0 && completedCount === totalCount) {
    return { status: 'done', label: '已完成', completedCount, totalCount }
  }

  const hasUserTurn = record.state.nodeConversations.some((conversation) => (
    conversation.turns.some((turn) => turn.role === 'user')
  ))
  if (hasUserTurn) {
    return {
      status: 'active',
      label: `进行中 ${completedCount}/${totalCount}`,
      completedCount,
      totalCount,
    }
  }

  return { status: 'idle', label: '未开始', completedCount, totalCount }
}

interface ImportMaterialDependencies {
  analyze: (file: File) => Promise<MaterialAnalysis>
  save?: (record: LocalDiagnosisRecord) => Promise<void>
  createId?: () => string
  now?: () => string
  onProgress?: (current: number, total: number, fileName: string) => void
}

export async function importMaterialFiles(
  files: File[],
  {
    analyze,
    save = saveDiagnosisRecord,
    createId = createRecordId,
    now = () => new Date().toISOString(),
    onProgress,
  }: ImportMaterialDependencies
): Promise<{ savedCount: number; errors: string[] }> {
  const errors: string[] = []
  let savedCount = 0

  for (const [index, file] of files.entries()) {
    onProgress?.(index + 1, files.length, file.name)
    const validationError = validateMaterialFile(file)
    if (validationError) {
      errors.push(`${file.name}：${validationError}`)
      continue
    }

    try {
      const analysis = await analyze(file)
      await save(createMaterialRecord({
        id: createId(),
        fileName: file.name,
        now: now(),
        analysis,
      }))
      savedCount += 1
    } catch (error) {
      errors.push(`${file.name}：${error instanceof Error ? error.message : '导入失败，请重试'}`)
    }
  }

  return { savedCount, errors }
}
