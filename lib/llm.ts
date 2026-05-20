import OpenAI from 'openai'

export const MODEL_FAST = process.env.LLM_MODEL_FAST || 'deepseek-v4-flash'
export const MODEL_SMART = process.env.LLM_MODEL_SMART || 'deepseek-v4-pro'

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

  const response = await getClient().chat.completions.create(
    {
      model: options.model ?? MODEL_FAST,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      response_format: options.jsonMode ? { type: 'json_object' } : undefined,
    },
    requestOptions
  )

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('LLM returned empty response')
  return content
}
