'use client'

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Action, StoreExamState } from '@/store/examStore'
import {
  appendTurnToNodeConversationById,
  buildNodeCompletion,
  getDeepDiveStartLevel,
  getLevelAfterNextAction,
  getNextSuitableLevel,
  getSkippedLevelStatus,
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
  runEvaluate: (nodeConversations: NodeConversation[]) => Promise<void>
}) {
  const initialQuestionRequestedRef = useRef<string | null>(null)
  const [retryQuestionRequest, setRetryQuestionRequest] = useState<RetryQuestionRequest | null>(null)
  const currentNode = state.nodes[state.currentNodeIndex]
  const currentConversation = state.nodeConversations[state.currentNodeIndex]
  const turns = currentConversation?.turns ?? []
  const currentNodeId = currentNode?.id
  const currentLevelStates = currentNodeId ? state.nodeLevelStates[currentNodeId] ?? [] : []
  const canContinueDialogue = state.phase === 'examining' || state.phase === 'reviewing'

  async function completeCurrentNode(nodeId: string, nodeConversations: NodeConversation[]): Promise<void> {
    const nodeIndex = state.nodes.findIndex((node) => node.id === nodeId)
    const completedNode = state.nodes[nodeIndex]
    if (!completedNode) return
    const isLastNode = nodeIndex >= state.nodes.length - 1
    const nextNode = isLastNode ? undefined : state.nodes[nodeIndex + 1]
    const completionMessage = buildNodeCompletion(completedNode.name, nextNode?.name)
    const completedConversations = appendTurnToNodeConversationById(nodeConversations, nodeId, {
      role: 'assistant',
      content: completionMessage,
    })
    dispatch({ type: 'COMPLETE_NODE', nodeId })
    dispatch({
      type: 'ADD_TURN',
      nodeId,
      turn: {
        role: 'assistant',
        content: completionMessage,
      },
    })

    if (isLastNode) {
      await runEvaluate(completedConversations)
      return
    }

    dispatch({ type: 'NEXT_NODE', fromNodeId: nodeId })
  }

  async function runFetch({
    userAnswer,
    requestType,
    levelOverride,
    baseConversations,
  }: FetchQuestionOptions): Promise<void> {
    if (!currentNode) return
    const requestNode = currentNode
    const requestNodeId = requestNode.id
    const requestLevelStates = currentLevelStates
    setRetryQuestionRequest(null)
    try {
      const shouldCommitUserTurn = Boolean(userAnswer)
      const startingConversations = baseConversations ?? state.nodeConversations
      const nextNodeConversations = shouldCommitUserTurn
        ? appendTurnToNodeConversationById(startingConversations, requestNodeId, {
            role: 'user',
            content: userAnswer,
          })
        : startingConversations

      const conversationTurns = nextNodeConversations.find((conversation) => (
        conversation.node.id === requestNodeId
      ))?.turns ?? turns
      const effectiveLevel = levelOverride ?? state.currentLevel
      const response = await requestQuestion({
        node: requestNode,
        currentLevel: effectiveLevel,
        levelStates: requestLevelStates,
        conversationHistory: conversationTurns,
        requestType,
      })
      const nextNodeConversationsWithAssistant = appendTurnToNodeConversationById(
        nextNodeConversations,
        requestNodeId,
        { role: 'assistant', content: response.reply }
      )

      if (shouldCommitUserTurn) {
        dispatch({ type: 'ADD_TURN', nodeId: requestNodeId, turn: { role: 'user', content: userAnswer } })
      }

      dispatch({ type: 'ADD_TURN', nodeId: requestNodeId, turn: { role: 'assistant', content: response.reply } })
      dispatch({ type: 'SET_AGENT_RESPONSE', nodeId: requestNodeId, response })

      if (response.nextAction === 'advance_next_level') {
        dispatch({
          type: 'SET_CURRENT_LEVEL',
          nodeId: requestNodeId,
          level: response.nextLevel ?? getLevelAfterNextAction({
            currentLevel: response.currentLevel,
            nextAction: response.nextAction,
            suitableLevels: requestNode.suitableLevels,
          }),
        })
      }

      if (response.nextAction === 'offer_deep_dive') {
        dispatch({ type: 'COMPLETE_QUICK_PATH', nodeId: requestNodeId })
      }

      if (response.nextAction === 'complete_node') {
        if (response.currentLevel === 'application' && response.passedCurrentLevel) {
          dispatch({ type: 'COMPLETE_QUICK_PATH', nodeId: requestNodeId })
        }
        await completeCurrentNode(requestNodeId, nextNodeConversationsWithAssistant)
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
    if (!canContinueDialogue) return
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
    const nextNodeConversations = appendTurnToNodeConversationById(
      state.nodeConversations,
      currentNode.id,
      { role: 'user', content: '继续问我一个类似问题' }
    )
    dispatch({ type: 'ADD_TURN', nodeId: currentNode.id, turn: { role: 'user', content: '继续问我一个类似问题' } })
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
    const nextNodeConversations = appendTurnToNodeConversationById(
      state.nodeConversations,
      currentNode.id,
      { role: 'user', content: nextLevel ? '下一层级' : '结束这个节点' }
    )
    dispatch({ type: 'ADD_TURN', nodeId: currentNode.id, turn: { role: 'user', content: nextLevel ? '下一层级' : '结束这个节点' } })
    const skippedLevelState = currentLevelStates.find((item) => item.level === skippedLevel)
    dispatch({
      type: 'UPDATE_NODE_LEVEL_STATUS',
      nodeId: currentNode.id,
      level: skippedLevel,
      status: getSkippedLevelStatus(skippedLevelState),
    })

    setSubmitting(true)
    if (!nextLevel) {
      await completeCurrentNode(currentNode.id, nextNodeConversations)
      setSubmitting(false)
      return
    }

    dispatch({ type: 'SET_CURRENT_LEVEL', nodeId: currentNode.id, level: nextLevel })
    await runFetch({
      userAnswer: '',
      requestType: 'normal',
      levelOverride: nextLevel,
      baseConversations: nextNodeConversations,
    })
  }

  async function handleCompleteNode() {
    if (submitting) return
    if (!currentNode) return
    dispatch({ type: 'SET_ERROR', error: '' })
    const nextNodeConversations = appendTurnToNodeConversationById(
      state.nodeConversations,
      currentNode.id,
      { role: 'user', content: '完成这个节点' }
    )
    dispatch({ type: 'ADD_TURN', nodeId: currentNode.id, turn: { role: 'user', content: '完成这个节点' } })
    setSubmitting(true)
    await completeCurrentNode(currentNode.id, nextNodeConversations)
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
    const nextNodeConversations = appendTurnToNodeConversationById(
      state.nodeConversations,
      currentNode.id,
      { role: 'user', content: '继续深入这个节点' }
    )
    dispatch({ type: 'ADD_TURN', nodeId: currentNode.id, turn: { role: 'user', content: '继续深入这个节点' } })
    dispatch({ type: 'ENTER_DEEP_PATH', nodeId: currentNode.id })
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
