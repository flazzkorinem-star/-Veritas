'use client'

import type { Dispatch } from 'react'
import type { Action, StoreExamState } from '@/store/examStore'
import type { CognitiveLevel, KnowledgeNode, NodeLevelState } from '@/lib/types'
import {
  getLevelStatusClass,
  getLevelStatusLabel,
  levelLabels,
} from '../_lib/examPageHelpers'

export function DiagnosticPanel({
  state,
  dispatch,
  currentNode,
  currentLevelStates,
  hasActiveDiagnosis,
  currentScore,
  completedNodeCount,
  isDiagnosisComplete,
  isBusy,
  onReportAction,
}: {
  state: StoreExamState
  dispatch: Dispatch<Action>
  currentNode: KnowledgeNode | undefined
  currentLevelStates: NodeLevelState[]
  hasActiveDiagnosis: boolean
  currentScore: number
  completedNodeCount: number
  isDiagnosisComplete: boolean
  isBusy: boolean
  onReportAction: () => void
}) {
  return (
    <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-white/90">
      <div className="border-b border-slate-200 px-5 py-5">
        <p className="text-xs font-semibold text-slate-400">诊断旁注</p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">{currentNode?.name ?? '等待材料'}</h2>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <section>
          <p className="mb-3 text-xs font-semibold text-slate-400">学习阶段进度</p>
          <div className="space-y-2">
            {(Object.keys(levelLabels) as CognitiveLevel[]).map((level) => {
              const levelState = currentLevelStates.find((item) => item.level === level)
              const isCurrent = currentNode && state.currentLevel === level
              return (
                <div
                  key={level}
                  className={`flex items-center justify-between rounded-2xl px-3 py-2 text-sm ${getLevelStatusClass(levelState, Boolean(isCurrent))}`}
                >
                  <span>{levelLabels[level]}</span>
                  <span className="text-xs">{getLevelStatusLabel(levelState)}</span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-400">当前得分</p>
            <p className="mt-1 text-3xl font-bold text-[#58CC02]">{currentScore}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-400">节点进度</p>
            <p className="mt-2 text-lg font-bold text-slate-900">
              {hasActiveDiagnosis ? `${state.currentNodeIndex + 1}/${state.nodes.length}` : '0/0'}
            </p>
          </div>
        </section>

        <section className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-400">当前目标</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {currentNode
              ? `围绕“${currentNode.name}”完成 ${levelLabels[state.currentLevel]} 层级判断。`
              : '上传材料后，系统会先抽取知识节点。'}
          </p>
        </section>

        <details className="rounded-3xl bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-600">盲点摘要</summary>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {state.currentAgentResponse?.blindSpotSummary || '暂未暴露稳定盲点。'}
          </p>
        </details>

        <details className="rounded-3xl bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-600">本次节点列表</summary>
          <div className="mt-3 space-y-2">
            {state.nodes.length > 0 ? state.nodes.map((node, index) => (
              <button
                key={node.id}
                onClick={() => dispatch({ type: 'SELECT_NEXT_NODE', nodeIndex: index })}
                className="block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-white"
              >
                {index + 1}. {node.name}
              </button>
            )) : (
              <p className="text-sm text-slate-400">暂无节点</p>
            )}
          </div>
        </details>
      </div>

      <div className="border-t border-slate-200 p-5">
        <button
          onClick={onReportAction}
          disabled={!hasActiveDiagnosis || isBusy || (!state.report && !isDiagnosisComplete)}
          className="w-full rounded-2xl bg-[#5C6BC0] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#505eb0] disabled:opacity-40"
        >
          {state.phase === 'reporting'
            ? '报告生成中...'
            : state.reportStatus === 'stale'
              ? '更新报告'
              : state.report
                ? '查看报告'
                : isDiagnosisComplete
                  ? '生成报告'
                  : `当前进度 ${completedNodeCount}/${state.nodes.length}`}
        </button>
      </div>
    </aside>
  )
}
