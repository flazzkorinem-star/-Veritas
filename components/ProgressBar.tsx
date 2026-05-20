interface ProgressBarProps {
  currentNode: number
  totalNodes: number
  currentRound: number
  maxRounds: number
}

export default function ProgressBar({
  currentNode,
  totalNodes,
  currentRound,
  maxRounds,
}: ProgressBarProps) {
  const nodeProgress = (currentNode / totalNodes) * 100

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-sm text-gray-500">
        <span>知识节点 {currentNode + 1} / {totalNodes}</span>
        <span>第 {currentRound} 轮追问 / 最多 {maxRounds} 轮</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${nodeProgress}%` }}
        />
      </div>
      <div className="flex gap-1">
        {Array.from({ length: totalNodes }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-1 rounded-full ${
              i < currentNode ? 'bg-blue-500' : i === currentNode ? 'bg-blue-300' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
