import { NextRequest, NextResponse } from 'next/server'
import { evaluateConversations } from '@/lib/agents/evaluator'
import { NodeConversation } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { nodeConversations: NodeConversation[] }

    if (!Array.isArray(body.nodeConversations) || body.nodeConversations.length === 0) {
      return NextResponse.json({ error: '缺少对话记录' }, { status: 400 })
    }

    const report = await evaluateConversations(body.nodeConversations)
    return NextResponse.json(report)
  } catch (error) {
    console.error('Evaluate error:', error)
    return NextResponse.json({ error: '评估失败，请重试' }, { status: 500 })
  }
}
