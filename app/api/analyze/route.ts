import { NextRequest, NextResponse } from 'next/server'
import { CONTENT_LENGTH_WARNING, extractUploadedFileText, FileContentError } from '@/lib/pdf'
import { analyzeContent } from '@/lib/agents/analyzer'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: '请先上传文件' }, { status: 400 })
    }

    const document = await extractUploadedFileText(file)
    const nodes = await analyzeContent(document.text)
    return NextResponse.json({
      nodes,
      documentContent: document.text,
      contentWarning: document.wasTrimmed ? CONTENT_LENGTH_WARNING : undefined,
    })
  } catch (error) {
    console.error('Analyze error:', error)
    if (error instanceof FileContentError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof Error && error.message.includes('knowledge nodes')) {
      return NextResponse.json(
        { error: '内容不足以生成检验，请补充更多内容' },
        { status: 422 }
      )
    }
    return NextResponse.json({ error: '分析失败，请重试' }, { status: 500 })
  }
}
