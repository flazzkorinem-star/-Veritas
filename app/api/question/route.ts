import { NextRequest, NextResponse } from 'next/server'
import { getNextQuestion } from '@/lib/agents/questioner'
import { countUserAnswers } from '@/lib/examFlow'
import { KnowledgeNode, ConversationTurn } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      node: KnowledgeNode
      conversationHistory: ConversationTurn[]
    }

    if (!body.node || !body.node.name) {
      return NextResponse.json({ error: '缺少知识节点信息' }, { status: 400 })
    }

    if (countUserAnswers(body.conversationHistory || []) >= 3) {
      return NextResponse.json({ error: '当前知识节点已完成，请进入下一步' }, { status: 400 })
    }

    const result = await getNextQuestion(body.node, body.conversationHistory || [])
    return NextResponse.json(result)
  } catch (error) {
    console.error('Question error:', error)
    return NextResponse.json({ error: '提问失败，请重试' }, { status: 500 })
  }
}
