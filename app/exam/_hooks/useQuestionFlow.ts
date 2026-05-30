'use client'

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Action, StoreExamState } from '@/store/examStore'
import {
  appendTurnToNodeConversationById,
  buildNodeCompletion,
  getNextSuitableLevel,
  shouldRequestInitialQuestion,
} from '@/lib/examFlow'
import type { LevelStatus, NodeConversation, NodeLevelState } from '@/lib/types'
import { isDiagnosisPlanTurn } from '../_lib/examPageHelpers'
import { requestQuestion } from '../_lib/questionApi'
import { buildQuestionResponseActions } from '../_lib/questionFlowTransitions'
import type { FetchQuestionOptions, RetryQuestionRequest } from '../_lib/examPageTypes'

export function useQuestionFlow({
  state,
  dispatch,
  isHydrated,
  submitting,
  setSubmitting,
  textAnswer,
  setTextAnswer,
  isBusy,
  waitingForReportRetry,
  runEvaluate,
}: {
  state: StoreExamState
  dispatch: Dispatch<Action>
  isHydrated: boolean
  submitting: boolean
  setSubmitting: Dispatch<SetStateAction<boolean>>
  textAnswer: string
  setTextAnswer: (value: string) => void
  isBusy: boolean
  waitingForReportRetry: boolean
  runEvaluate: (
    nodeConversations: NodeConversation[],
    nodeLevelStatesOverride?: Record<string, NodeLevelState[]>
  ) => Promise<void>
}) {
  const initialQuestionRequestedRef = useRef<string | null>(null)
  const [retryQuestionRequest, setRetryQuestionRequest] = useState<RetryQuestionRequest | null>(null)
  const currentNode = state.nodes[state.currentNodeIndex]
  const currentConversation = state.nodeConversations[state.currentNodeIndex]
  const turns = currentConversation?.turns ?? []
  const currentNodeId = currentNode?.id
  const currentLevelStates = currentNodeId ? state.nodeLevelStates[currentNodeId] ?? [] : []
  const canContinueDialogue = state.phase === 'examining' || state.phase === 'reviewing'

  async function completeCurrentNode(
    nodeId: string,
    nodeConversations: NodeConversation[],
    completedNodeLevelStates?: Record<string, NodeLevelState[]>
  ): Promise<void> {
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
      await runEvaluate(completedConversations, completedNodeLevelStates)
      return
    }

    dispatch({ type: 'NEXT_NODE', fromNodeId: nodeId })
  }

  async function runFetch({
    userAnswer,
    requestType,
    levelOverride,
    // Visible user text is committed by default; retries set this false to avoid duplicating the existing bubble.
    commitUserTurn = Boolean(userAnswer),
    baseConversations,
  }: FetchQuestionOptions): Promise<void> {
    if (!currentNode) return
    const requestNode = currentNode
    const requestNodeId = requestNode.id
    const requestLevelStates = currentLevelStates
    setRetryQuestionRequest(null)
    try {
      const startingConversations = baseConversations ?? state.nodeConversations
      const nextNodeConversations = commitUserTurn
        ? appendTurnToNodeConversationById(startingConversations, requestNodeId, {
            role: 'user',
            content: userAnswer,
          })
        : startingConversations
      if (commitUserTurn) {
        dispatch({ type: 'ADD_TURN', nodeId: requestNodeId, turn: { role: 'user', content: userAnswer } })
      }

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

      const transition = buildQuestionResponseActions({
        response,
        requestNodeId,
      })
      transition.actions.forEach(dispatch)

      if (requestType === 'answer') {
        dispatch({
          type: 'UPDATE_NODE_LEVEL_STATUS',
          nodeId: requestNodeId,
          level: response.currentLevel,
          status: 'answer_assisted',
          // 与 SET_AGENT_RESPONSE 写入保持一致，避免把刚写的盲点覆盖成 undefined。
          blindSpotSummary: response.blindSpotSummary,
        })
      }

      if (transition.shouldCompleteNode) {
        // 报告用刚算好的层级状态，不依赖尚未 re-render 的闭包 state。
        const finalStatus: LevelStatus = requestType === 'answer' ? 'answer_assisted' : 'passed'
        const completedNodeLevelStates: Record<string, NodeLevelState[]> = {
          ...state.nodeLevelStates,
          [requestNodeId]: (state.nodeLevelStates[requestNodeId] ?? []).map((levelState) => (
            levelState.level === response.currentLevel
              ? {
                  ...levelState,
                  status: finalStatus,
                  blindSpotSummary: response.blindSpotSummary,
                  supportRecords: response.supportRecords
                    ? [...(levelState.supportRecords ?? []), ...response.supportRecords]
                    : levelState.supportRecords,
                }
              : levelState
          )),
        }
        await completeCurrentNode(requestNodeId, nextNodeConversationsWithAssistant, completedNodeLevelStates)
        setSubmitting(false)
        return
      }

      // 看答案后确定性进入下一层，自动取下一层的开场问题。
      if (requestType === 'answer' && response.nextAction === 'advance_next_level') {
        await runFetch({
          userAnswer: '',
          requestType: 'normal',
          levelOverride: response.nextLevel ?? getNextSuitableLevel(response.currentLevel) ?? response.currentLevel,
          baseConversations: nextNodeConversationsWithAssistant,
        })
        return
      }

      setSubmitting(false)
    } catch {
      if (!userAnswer && requestType === 'normal') {
        initialQuestionRequestedRef.current = null
      }
      setSubmitting(false)
      setRetryQuestionRequest({
        userAnswer,
        requestType,
        levelOverride,
        commitUserTurn: false,
      })
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
    if (isBusy) return
    if (!canContinueDialogue) return
    if (!answer) {
      dispatch({ type: 'SET_ERROR', error: '请先输入你的回答' })
      return
    }
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    setTextAnswer('')
    await runFetch({ userAnswer: answer, requestType: 'normal' })
  }

  async function handleHint() {
    if (submitting || waitingForReportRetry) return
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    await runFetch({ userAnswer: '给我提示', requestType: 'hint' })
  }

  async function handleAnswer() {
    if (submitting || waitingForReportRetry) return
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    await runFetch({ userAnswer: '给我答案', requestType: 'answer' })
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
    handleRetryQuestion,
  }
}
