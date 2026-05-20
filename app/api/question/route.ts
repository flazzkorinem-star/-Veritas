import { NextRequest, NextResponse } from 'next/server'
import { getNextQuestion } from '@/lib/agents/questioner'
import { CognitiveLevel, KnowledgeNode, ConversationTurn, NodeLevelState } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      node: KnowledgeNode
      currentLevel?: CognitiveLevel
      levelStates?: NodeLevelState[]
      conversationHistory?: ConversationTurn[]
      requestType?: 'normal' | 'hint' | 'answer'
    }

    if (!body.node || !body.node.name) {
      return NextResponse.json({ error: '缺少知识节点信息' }, { status: 400 })
    }

    const result = await getNextQuestion({
      node: body.node,
      currentLevel: body.currentLevel,
      levelStates: body.levelStates,
      conversationHistory: body.conversationHistory ?? [],
      requestType: body.requestType ?? 'normal',
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Question error:', error)
    return NextResponse.json({ error: '提问失败，请重试' }, { status: 500 })
  }
}
