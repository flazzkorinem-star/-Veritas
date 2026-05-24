'use client'

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Action, StoreExamState } from '@/store/examStore'
import {
  appendTurnToNodeConversations,
  buildNodeTransition,
  getDeepDiveStartLevel,
  getLevelAfterNextAction,
  getNextSuitableLevel,
  shouldRequestInitialQuestion,
} from '@/lib/examFlow'
import type { NodeConversation } from '@/lib/types'
import { hasSupportKind, isDiagnosisPlanTurn } from '../_lib/examPageHelpers'
import { requestQuestion } from '../_lib/questionApi'
import type { FetchQuestionOptions, RetryQuestionRequest } from '../_lib/examPageTypes'

export function useQuestionFlow({
  state,
  dispatch,
  isHydrated,
  submitting,
  setSubmitting,
  textAnswer,
  setTextAnswer,
  hasActiveDiagnosis,
  isBusy,
  waitingForDeepDiveChoice,
  waitingForReportRetry,
  answerChoicePending,
  handlePastedMaterial,
  runEvaluate,
}: {
  state: StoreExamState
  dispatch: Dispatch<Action>
  isHydrated: boolean
  submitting: boolean
  setSubmitting: Dispatch<SetStateAction<boolean>>
  textAnswer: string
  setTextAnswer: (value: string) => void
  hasActiveDiagnosis: boolean
  isBusy: boolean
  waitingForDeepDiveChoice: boolean
  waitingForReportRetry: boolean
  answerChoicePending: boolean
  handlePastedMaterial: () => Promise<void>
  runEvaluate: (nodeConversations?: NodeConversation[]) => Promise<void>
}) {
  const initialQuestionRequestedRef = useRef<string | null>(null)
  const [retryQuestionRequest, setRetryQuestionRequest] = useState<RetryQuestionRequest | null>(null)
  const currentNode = state.nodes[state.currentNodeIndex]
  const currentConversation = state.nodeConversations[state.currentNodeIndex]
  const turns = currentConversation?.turns ?? []
  const currentNodeId = currentNode?.id
  const currentLevelStates = currentNodeId ? state.nodeLevelStates[currentNodeId] ?? [] : []

  async function completeCurrentNode(nodeConversations: NodeConversation[]): Promise<void> {
    if (!currentNode) return
    const isLastNode = state.currentNodeIndex >= state.nodes.length - 1
    if (isLastNode) {
      await runEvaluate(nodeConversations)
      return
    }

    const nextNode = state.nodes[state.currentNodeIndex + 1]
    dispatch({
      type: 'ADD_TURN',
      turn: {
        role: 'assistant',
        content: buildNodeTransition(currentNode.name, nextNode.name),
      },
    })
    dispatch({ type: 'NEXT_NODE' })
  }

  async function runFetch({
    userAnswer,
    requestType,
    levelOverride,
    baseConversations,
  }: FetchQuestionOptions): Promise<void> {
    if (!currentNode) return
    setRetryQuestionRequest(null)
    try {
      const shouldCommitUserTurn = Boolean(userAnswer)
      const startingConversations = baseConversations ?? state.nodeConversations
      const nextNodeConversations = shouldCommitUserTurn
        ? appendTurnToNodeConversations(startingConversations, state.currentNodeIndex, {
            role: 'user',
            content: userAnswer,
          })
        : startingConversations

      const conversationTurns = nextNodeConversations[state.currentNodeIndex]?.turns ?? turns
      const effectiveLevel = levelOverride ?? state.currentLevel
      const response = await requestQuestion({
        node: currentNode,
        currentLevel: effectiveLevel,
        levelStates: currentLevelStates,
        conversationHistory: conversationTurns,
        requestType,
      })
      const nextNodeConversationsWithAssistant = appendTurnToNodeConversations(
        nextNodeConversations,
        state.currentNodeIndex,
        { role: 'assistant', content: response.reply }
      )

      if (shouldCommitUserTurn) {
        dispatch({ type: 'ADD_TURN', turn: { role: 'user', content: userAnswer } })
      }

      dispatch({ type: 'ADD_TURN', turn: { role: 'assistant', content: response.reply } })
      dispatch({ type: 'SET_AGENT_RESPONSE', response })

      if (response.nextAction === 'advance_next_level') {
        dispatch({
          type: 'SET_CURRENT_LEVEL',
          level: response.nextLevel ?? getLevelAfterNextAction({
            currentLevel: response.currentLevel,
            nextAction: response.nextAction,
            suitableLevels: currentNode.suitableLevels,
          }),
        })
      }

      if (response.nextAction === 'offer_deep_dive') {
        dispatch({ type: 'COMPLETE_QUICK_PATH' })
      }

      if (response.nextAction === 'complete_node') {
        if (response.currentLevel === 'application' && response.passedCurrentLevel) {
          dispatch({ type: 'COMPLETE_QUICK_PATH' })
        }
        await completeCurrentNode(nextNodeConversationsWithAssistant)
      }

      setSubmitting(false)
      if (requestType === 'normal' && userAnswer) setTextAnswer('')
    } catch {
      if (!userAnswer && requestType === 'normal') {
        initialQuestionRequestedRef.current = null
      }
      setSubmitting(false)
      setRetryQuestionRequest({ userAnswer, requestType, levelOverride })
      dispatch({ type: 'SET_ERROR', error: '生成出现问题，请重试或回到首页' })
    }
  }

  useEffect(() => {
    const initialTurnCount = turns.length === 1 && isDiagnosisPlanTurn(turns[0]) ? 0 : turns.length
    if (shouldRequestInitialQuestion({
      isHydrated,
      phase: state.phase,
      currentNodeId: currentNode?.id,
      turnCount: initialTurnCount,
      submitting,
      requestedNodeId: initialQuestionRequestedRef.current,
    })) {
      initialQuestionRequestedRef.current = currentNode.id
      runFetch({ userAnswer: '', requestType: 'normal' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentNodeIndex, state.phase, isHydrated])

  async function handleSubmit() {
    const answer = textAnswer.trim()
    if (isBusy || waitingForDeepDiveChoice) return
    if (!hasActiveDiagnosis) {
      await handlePastedMaterial()
      return
    }
    if (state.phase !== 'examining') return
    if (!answer) {
      dispatch({ type: 'SET_ERROR', error: '请先输入你的回答' })
      return
    }
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    await runFetch({ userAnswer: answer, requestType: 'normal' })
  }

  async function handleHint() {
    if (submitting || waitingForDeepDiveChoice || waitingForReportRetry || answerChoicePending) return
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    await runFetch({ userAnswer: '给我提示', requestType: 'hint' })
  }

  async function handleAnswer() {
    if (submitting || waitingForDeepDiveChoice || waitingForReportRetry || answerChoicePending) return
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    await runFetch({ userAnswer: '给我答案', requestType: 'answer' })
  }

  async function handleSimilarQuestion() {
    if (submitting || !currentNode) return
    dispatch({ type: 'SET_ERROR', error: '' })
    const nextNodeConversations = appendTurnToNodeConversations(
      state.nodeConversations,
      state.currentNodeIndex,
      { role: 'user', content: '继续问我一个类似问题' }
    )
    dispatch({ type: 'ADD_TURN', turn: { role: 'user', content: '继续问我一个类似问题' } })
    setSubmitting(true)
    await runFetch({
      userAnswer: '',
      requestType: 'normal',
      baseConversations: nextNodeConversations,
    })
  }

  async function handleSkipLevel() {
    if (submitting || !currentNode) return
    dispatch({ type: 'SET_ERROR', error: '' })
    const skippedLevel = state.currentLevel
    const nextLevel = getNextSuitableLevel(skippedLevel, currentNode.suitableLevels)
    const nextNodeConversations = appendTurnToNodeConversations(
      state.nodeConversations,
      state.currentNodeIndex,
      { role: 'user', content: nextLevel ? '下一层级' : '结束这个节点' }
    )
    dispatch({ type: 'ADD_TURN', turn: { role: 'user', content: nextLevel ? '下一层级' : '结束这个节点' } })
    dispatch({
      type: 'UPDATE_NODE_LEVEL_STATUS',
      level: skippedLevel,
      status: 'failed',
    })

    setSubmitting(true)
    if (!nextLevel) {
      await completeCurrentNode(nextNodeConversations)
      setSubmitting(false)
      return
    }

    dispatch({ type: 'SET_CURRENT_LEVEL', level: nextLevel })
    await runFetch({
      userAnswer: '',
      requestType: 'normal',
      levelOverride: nextLevel,
      baseConversations: nextNodeConversations,
    })
  }

  async function handleCompleteNode() {
    if (submitting) return
    dispatch({ type: 'SET_ERROR', error: '' })
    const nextNodeConversations = appendTurnToNodeConversations(
      state.nodeConversations,
      state.currentNodeIndex,
      { role: 'user', content: '完成这个节点' }
    )
    dispatch({ type: 'ADD_TURN', turn: { role: 'user', content: '完成这个节点' } })
    setSubmitting(true)
    await completeCurrentNode(nextNodeConversations)
    setSubmitting(false)
  }

  async function handleEnterDeepPath() {
    if (submitting || !currentNode) return
    const deepLevel = getDeepDiveStartLevel(currentNode.suitableLevels)
    if (!deepLevel) {
      await handleCompleteNode()
      return
    }

    dispatch({ type: 'SET_ERROR', error: '' })
    const nextNodeConversations = appendTurnToNodeConversations(
      state.nodeConversations,
      state.currentNodeIndex,
      { role: 'user', content: '继续深入这个节点' }
    )
    dispatch({ type: 'ADD_TURN', turn: { role: 'user', content: '继续深入这个节点' } })
    dispatch({ type: 'ENTER_DEEP_PATH' })
    setSubmitting(true)
    await runFetch({
      userAnswer: '',
      requestType: 'normal',
      levelOverride: deepLevel,
      baseConversations: nextNodeConversations,
    })
  }

  async function handleRetryQuestion() {
    if (retryQuestionRequest === null || submitting) return
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    await runFetch(retryQuestionRequest)
  }

  return {
    retryQuestionRequest,
    handleSubmit,
    handleHint,
    handleAnswer,
    handleSimilarQuestion,
    handleSkipLevel,
    handleCompleteNode,
    handleEnterDeepPath,
    handleRetryQuestion,
    nextSuitableLevel: currentNode ? getNextSuitableLevel(state.currentLevel, currentNode.suitableLevels) : null,
    hasCurrentAnswerSupport: hasSupportKind(
      currentLevelStates.find((item) => item.level === state.currentLevel),
      'answer'
    ),
  }
}
