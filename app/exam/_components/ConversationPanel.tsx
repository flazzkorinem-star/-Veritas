'use client'

import type { RefObject } from 'react'
import type { StoreExamState } from '@/store/examStore'
import type { CognitiveLevel, KnowledgeNode, NodeConversation } from '@/lib/types'
import { MATERIAL_FILE_ACCEPT } from '../_lib/materialFile'
import type { RetryQuestionRequest } from '../_lib/examPageTypes'

export function ConversationPanel({
  state,
  displayedTitle,
  levelLabel,
  currentNode,
  turns,
  hasActiveDiagnosis,
  isBusy,
  actionDisabled,
  waitingForDeepDiveChoice,
  waitingForReportRetry,
  answerChoicePending,
  retryQuestionRequest,
  retryReportConversations,
  analyzeWarning,
  analyzeMessage,
  textAnswer,
  setTextAnswer,
  historyEndRef,
  fileInputRef,
  nextSuitableLevel,
  onSubmit,
  onHint,
  onAnswer,
  onSimilarQuestion,
  onSkipLevel,
  onCompleteNode,
  onEnterDeepPath,
  onRetryQuestion,
  onRetryReport,
  onMaterialFile,
  onVoiceInput,
}: {
  state: StoreExamState
  displayedTitle: string
  levelLabel: string
  currentNode: KnowledgeNode | undefined
  turns: { role: 'assistant' | 'user'; content: string }[]
  hasActiveDiagnosis: boolean
  isBusy: boolean
  actionDisabled: boolean
  waitingForDeepDiveChoice: boolean
  waitingForReportRetry: boolean
  answerChoicePending: boolean
  retryQuestionRequest: RetryQuestionRequest | null
  retryReportConversations: NodeConversation[] | null
  analyzeWarning: string
  analyzeMessage: string
  textAnswer: string
  setTextAnswer: (value: string) => void
  historyEndRef: RefObject<HTMLDivElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  nextSuitableLevel: CognitiveLevel | null
  onSubmit: () => void
  onHint: () => void
  onAnswer: () => void
  onSimilarQuestion: () => void
  onSkipLevel: () => void
  onCompleteNode: () => void
  onEnterDeepPath: () => void
  onRetryQuestion: () => void
  onRetryReport: () => void
  onMaterialFile: (file: File | undefined) => void
  onVoiceInput: () => void
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <header className="border-b border-slate-200 bg-white/80 px-6 py-3 text-sm text-slate-500">
        {displayedTitle} · {currentNode ? levelLabel : '等待材料'}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {!hasActiveDiagnosis && (
          <div className="mx-auto mt-16 max-w-2xl text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#5C6BC0]/10 text-3xl">
              🤖
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">把材料给我，我们开始检验</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Veritas 只基于你上传或粘贴的材料诊断理解，不做无材料的通用问答。
            </p>
          </div>
        )}

        {hasActiveDiagnosis && turns.length === 0 && (
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">🤖</div>
            <div className="chat-bubble chat-bubble-ai bg-[#F0F0F0] px-4 py-3 text-sm text-slate-700 shadow-sm">
              正在根据材料组织第一个问题...
            </div>
          </div>
        )}

        {hasActiveDiagnosis && (
          <div className="mx-auto max-w-4xl space-y-5">
            {turns.map((turn, index) => (
              <div
                key={`${turn.role}-${index}`}
                className={`flex items-end gap-3 ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {turn.role === 'assistant' && (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">🤖</div>
                )}
                <div
                  className={`chat-bubble max-w-[72%] whitespace-pre-line px-4 py-3 text-sm leading-7 shadow-sm ${
                    turn.role === 'assistant'
                      ? 'chat-bubble-ai bg-[#F0F0F0] text-slate-800'
                      : 'chat-bubble-user bg-[#5C6BC0] text-white'
                  }`}
                >
                  {turn.content}
                </div>
                {turn.role === 'user' && (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500 shadow-sm">人</div>
                )}
              </div>
            ))}

            {isBusy && state.phase !== 'reporting' && (
              <div className="flex items-end gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">🤖</div>
                <div className="chat-bubble chat-bubble-ai bg-[#F0F0F0] px-4 py-3 shadow-sm">
                  <span className="typing-dot" />
                  <span className="typing-dot delay-150" />
                  <span className="typing-dot delay-300" />
                </div>
              </div>
            )}
            <div ref={historyEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white/90 px-6 py-4">
        <div className="mx-auto max-w-4xl">
          {state.error && (
            <div className="mb-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              <p>{state.error}</p>
              <div className="mt-2 flex gap-2">
                {retryQuestionRequest !== null && (
                  <button
                    onClick={onRetryQuestion}
                    disabled={isBusy}
                    className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    重试当前回复
                  </button>
                )}
                {retryReportConversations !== null && (
                  <button
                    onClick={onRetryReport}
                    disabled={isBusy}
                    className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    重试生成报告
                  </button>
                )}
              </div>
            </div>
          )}

          {analyzeWarning && (
            <div className="mb-3 rounded-2xl border border-[#FFA726]/25 bg-[#FFA726]/10 px-4 py-3 text-sm text-amber-700">
              {analyzeWarning}
            </div>
          )}

          {waitingForDeepDiveChoice && (
            <div className="mb-3 rounded-2xl border border-[#FFA726]/25 bg-[#FFA726]/10 px-4 py-3 text-sm text-amber-800">
              <p>快速路径已完成。可以结束这个节点，也可以继续深入。</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={onCompleteNode}
                  disabled={isBusy || waitingForReportRetry}
                  className="rounded-full bg-[#5C6BC0] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  完成这个节点
                </button>
                <button
                  onClick={onEnterDeepPath}
                  disabled={isBusy || waitingForReportRetry}
                  className="rounded-full border border-[#5C6BC0]/30 bg-white px-4 py-2 text-xs font-semibold text-[#5C6BC0] disabled:opacity-50"
                >
                  继续深入
                </button>
              </div>
            </div>
          )}

          {answerChoicePending && (
            <div className="mb-3 rounded-2xl border border-[#FFA726]/25 bg-[#FFA726]/10 px-4 py-3 text-sm text-amber-800">
              <p>这一层已经看过答案，不算独立通过。你可以继续练一个类似问题，或者跳到下一层级。</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={onSimilarQuestion}
                  disabled={isBusy || waitingForReportRetry}
                  className="rounded-full bg-[#5C6BC0] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  继续问我一个类似问题
                </button>
                <button
                  onClick={onSkipLevel}
                  disabled={isBusy || waitingForReportRetry}
                  className="rounded-full border border-[#5C6BC0]/30 bg-white px-4 py-2 text-xs font-semibold text-[#5C6BC0] disabled:opacity-50"
                >
                  {nextSuitableLevel ? '下一层级' : '结束这个节点'}
                </button>
              </div>
            </div>
          )}

          <div className="mb-2 flex gap-2">
            <button
              onClick={onHint}
              disabled={actionDisabled}
              className="rounded-full border border-[#FFA726] bg-white px-4 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-[#FFA726]/10 disabled:opacity-40"
            >
              💡 给我提示
            </button>
            <button
              onClick={onAnswer}
              disabled={actionDisabled}
              className="rounded-full border border-[#58CC02] bg-white px-4 py-2 text-sm font-semibold text-green-700 transition-colors hover:bg-[#58CC02]/10 disabled:opacity-40"
            >
              📖 给我答案
            </button>
          </div>

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              onMaterialFile(event.dataTransfer.files?.[0])
            }}
            className={`rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm transition-all ${
              hasActiveDiagnosis ? '' : 'border-dashed border-[#5C6BC0]/35 p-5'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={MATERIAL_FILE_ACCEPT}
              className="hidden"
              onChange={(event) => onMaterialFile(event.target.files?.[0])}
            />
            <textarea
              value={textAnswer}
              onChange={(event) => setTextAnswer(event.target.value)}
              placeholder={hasActiveDiagnosis ? '像聊天一样回答这个问题...' : '粘贴一段材料，或点击下方上传 PDF / DOCX / PPTX / TXT / Markdown'}
              rows={hasActiveDiagnosis ? 3 : 5}
              className="w-full resize-none rounded-2xl bg-transparent px-2 py-2 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400"
              disabled={isBusy || waitingForReportRetry || waitingForDeepDiveChoice}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  onSubmit()
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                className={`rounded-full border border-[#5C6BC0]/40 bg-white text-sm font-semibold text-[#5C6BC0] transition-colors hover:bg-[#5C6BC0]/10 disabled:opacity-50 ${
                  hasActiveDiagnosis ? 'px-3 py-2' : 'px-5 py-3'
                }`}
              >
                📎 上传材料
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={onVoiceInput}
                  disabled={isBusy}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-50"
                  aria-label="语音输入"
                >
                  🎤
                </button>
                <button
                  onClick={onSubmit}
                  disabled={isBusy || waitingForReportRetry || waitingForDeepDiveChoice || !textAnswer.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5C6BC0] text-white transition-colors hover:bg-[#505eb0] disabled:opacity-40"
                  aria-label={hasActiveDiagnosis ? '发送回答' : '分析材料'}
                >
                  →
                </button>
              </div>
            </div>
          </div>

          {analyzeMessage && (
            <p className="mt-2 text-center text-xs font-medium text-[#5C6BC0]">{analyzeMessage}</p>
          )}
        </div>
      </div>
    </div>
  )
}
