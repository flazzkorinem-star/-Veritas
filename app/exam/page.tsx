'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ConversationPanel } from './_components/ConversationPanel'
import { DiagnosticPanel } from './_components/DiagnosticPanel'
import { KnowledgeMap } from './_components/KnowledgeMap'
import { ReportModal } from './_components/ReportModal'
import { WorkspaceSidebar } from './_components/WorkspaceSidebar'
import { useExamController } from './_hooks/useExamController'

export default function ExamPage() {
  const router = useRouter()
  const workspace = useExamController()

  useEffect(() => {
    if (workspace.isHydrated && workspace.state.phase === 'idle') router.replace('/')
  }, [router, workspace.isHydrated, workspace.state.phase])

  if (!workspace.isHydrated || workspace.state.phase === 'idle') return null

  async function handleBackShelf() {
    await workspace.saveCurrentRecord()
    router.push('/')
  }

  return (
    <main className="h-screen overflow-hidden bg-[#F8F9FA] text-slate-900">
      <div className="grid h-full grid-cols-[280px_minmax(0,1fr)_330px]">
        <WorkspaceSidebar
          materialRecords={workspace.materialRecords}
          selectedRecordId={workspace.state.recordId}
          report={workspace.state.report}
          openMenu={workspace.openMenu}
          setOpenMenu={workspace.setOpenMenu}
          onBackShelf={handleBackShelf}
          onNewDiagnosis={workspace.handleBackHome}
          onOpenReport={() => workspace.state.report && workspace.setReportOpen(true)}
          onLoadRecord={workspace.handleLoadRecord}
          onRecordPin={workspace.handleRecordPin}
          onRecordRename={workspace.handleRecordRename}
          onRecordDelete={workspace.handleRecordDelete}
        />

        <section className="min-h-0 bg-[#F8F9FA]">
          <div className="grid h-full grid-cols-[260px_minmax(0,1fr)]">
            <KnowledgeMap
              key={workspace.state.recordId ?? 'new-diagnosis'}
              state={workspace.state}
              displayedTitle={workspace.displayedTitle}
              hasActiveDiagnosis={workspace.hasActiveDiagnosis}
              openMenu={workspace.openMenu}
              setOpenMenu={workspace.setOpenMenu}
              dispatch={workspace.dispatch}
              onNodeImportance={workspace.handleNodeImportance}
              onNodePin={workspace.handleNodePin}
              onNodeRename={workspace.handleNodeRename}
              onNodeDelete={workspace.handleNodeDelete}
            />

            <ConversationPanel
              state={workspace.state}
              displayedTitle={workspace.displayedTitle}
              levelLabel={workspace.levelLabels[workspace.state.currentLevel]}
              currentNode={workspace.currentNode}
              turns={workspace.turns}
              hasActiveDiagnosis={workspace.hasActiveDiagnosis}
              isBusy={workspace.isBusy}
              actionDisabled={workspace.actionDisabled}
              waitingForReportRetry={workspace.waitingForReportRetry}
              retryQuestionRequest={workspace.retryQuestionRequest}
              retryReportConversations={workspace.retryReportConversations}
              analyzeWarning={workspace.analyzeWarning}
              analyzeMessage={workspace.analyzeMessage}
              textAnswer={workspace.textAnswer}
              setTextAnswer={workspace.setTextAnswer}
              historyEndRef={workspace.historyEndRef}
              fileInputRef={workspace.fileInputRef}
              onSubmit={workspace.handleSubmit}
              onHint={workspace.handleHint}
              onAnswer={workspace.handleAnswer}
              onRetryQuestion={workspace.handleRetryQuestion}
              onRetryReport={workspace.handleRetryReport}
              onMaterialFile={workspace.handleMaterialFile}
              onVoiceInput={() => workspace.dispatch({ type: 'SET_ERROR', error: '语音输入第一版先保留入口，后续接入' })}
            />
          </div>
        </section>

        <DiagnosticPanel
          state={workspace.state}
          dispatch={workspace.dispatch}
          currentNode={workspace.currentNode}
          currentLevelStates={workspace.currentLevelStates}
          hasActiveDiagnosis={workspace.hasActiveDiagnosis}
          currentScore={workspace.currentScore}
          completedNodeCount={workspace.completedNodeCount}
          isDiagnosisComplete={workspace.isDiagnosisComplete}
          isBusy={workspace.isBusy}
          onReportAction={workspace.handleReportAction}
        />
      </div>

      {workspace.reportOpen && workspace.state.report && (
        <ReportModal
          report={workspace.state.report}
          reportStatus={workspace.state.reportStatus}
          completedNodeCount={workspace.completedNodeCount}
          nodeCount={workspace.state.nodes.length}
          onClose={() => workspace.setReportOpen(false)}
        />
      )}
    </main>
  )
}
