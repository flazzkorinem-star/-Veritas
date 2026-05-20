import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { ExamProvider } from '@/store/examStore'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '你真的懂吗 | Veritas',
  description: '用苏格拉底式对话，检验你是否真的理解了所学知识',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className="h-full">
      <body className={`${geist.className} min-h-full flex flex-col`}>
        <ExamProvider>{children}</ExamProvider>
      </body>
    </html>
  )
}
