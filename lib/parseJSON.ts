/**
 * Extracts a JSON object from an LLM response that may contain:
 * - Markdown code fences (```json ... ```)
 * - Prose before/after the JSON
 * - <think>...</think> reasoning blocks
 * Uses bracket counting to find the exact object boundaries.
 */
export function extractJSON(raw: string): string {
  // Strip <think>...</think> blocks (reasoning models)
  const stripped = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

  // Strip markdown code fences
  const fenced = stripped.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()

  // Find JSON object using bracket counting (handles trailing prose)
  const start = stripped.indexOf('{')
  if (start === -1) return stripped

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (!inString) {
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) return stripped.slice(start, i + 1)
      }
    }
  }

  return stripped.slice(start)
}
