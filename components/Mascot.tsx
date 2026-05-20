'use client'

type MascotMood = 'idle' | 'thinking' | 'asking' | 'listening' | 'done'

interface MascotProps {
  mood: MascotMood
  message?: string
}

const MOOD: Record<MascotMood, { emoji: string; bg: string }> = {
  idle:      { emoji: '🦉', bg: 'bg-amber-50' },
  thinking:  { emoji: '🤔', bg: 'bg-purple-50' },
  asking:    { emoji: '🧐', bg: 'bg-blue-50' },
  listening: { emoji: '👂', bg: 'bg-green-50' },
  done:      { emoji: '✅', bg: 'bg-emerald-50' },
}

export default function Mascot({ mood, message }: MascotProps) {
  const { emoji, bg } = MOOD[mood]
  return (
    <div className={`flex items-start gap-3 p-4 rounded-2xl ${bg} transition-all`}>
      <span
        className={`text-4xl select-none ${mood === 'thinking' ? 'animate-bounce' : ''}`}
        role="img"
        aria-label="mascot"
      >
        {emoji}
      </span>
      {message && (
        <div className="flex-1 text-gray-800 text-base leading-relaxed">
          {message}
        </div>
      )}
    </div>
  )
}
