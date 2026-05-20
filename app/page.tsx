import InputForm from '@/components/InputForm'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-2xl mx-auto px-4 py-16 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="text-6xl">🦉</div>
          <h1 className="text-4xl font-bold text-gray-900">你真的懂吗？</h1>
          <p className="text-gray-500 text-lg">
            如果真的懂，你应该能讲清楚。
          </p>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-3 gap-4 text-center text-sm">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-2xl mb-2">📄</div>
            <div className="font-medium">上传文件</div>
            <div className="text-gray-400">PDF / DOCX / PPTX / TXT / Markdown</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-2xl mb-2">🎤</div>
            <div className="font-medium">开口回答</div>
            <div className="text-gray-400">语音或文字均可</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-2xl mb-2">📊</div>
            <div className="font-medium">看真实报告</div>
            <div className="text-gray-400">哪里懂了，哪里没懂</div>
          </div>
        </div>

        <InputForm />
      </div>
    </main>
  )
}
