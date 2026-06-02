import OpenAI from 'openai'

export const MODEL_FAST = process.env.LLM_MODEL_FAST || 'deepseek-v4-flash'

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('Missing DEEPSEEK_API_KEY environment variable')
  }

  if (!client) {
    // DeepSeek is OpenAI API-compatible; swap baseURL to use another provider.
    client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.LLM_BASE_URL || 'https://api.deepseek.com',
    })
  }

  return client
}

export type Message = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatOptions {
  temperature?: number
  jsonMode?: boolean
  model?: string
  maxTokens?: number
  timeoutMs?: number
}

export async function chat(messages: Message[], options: ChatOptions = {}): Promise<string> {
  const requestOptions = typeof options.timeoutMs === 'number'
    ? { timeout: options.timeoutMs }
    : undefined

  const body = {
    model: options.model ?? MODEL_FAST,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens,
    response_format: options.jsonMode ? { type: 'json_object' } : undefined,
    // deepseek-v4-flash 默认开启思考模式：答案会漏进 reasoning_content，content 可能为空白。
    // 本产品不需要推理能力，全局关闭思考，确保回复直接落在 content。
    thinking: { type: 'disabled' },
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
    thinking: { type: 'disabled' }
  }
  const response = await getClient().chat.completions.create(body, requestOptions)

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('LLM returned empty response')
  return content
}
