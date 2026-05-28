'use client'

import { ConversationPanel } from './_components/ConversationPanel'
import { DiagnosticPanel } from './_components/DiagnosticPanel'
import { KnowledgeNodeRail } from './_components/KnowledgeNodeRail'
import { ReportModal } from './_components/ReportModal'
import { WorkspaceSidebar } from './_components/WorkspaceSidebar'
import { useExamController } from './_hooks/useExamController'

export default function ExamPage() {
  const workspace = useExamController()

  if (!workspace.isHydrated) return null

  return (
    <main className="h-screen overflow-hidden bg-[#F8F9FA] text-slate-900">
      <div className="grid h-full grid-cols-[280px_minmax(0,1fr)_330px]">
        <WorkspaceSidebar
          historyRecords={workspace.historyRecords}
          selectedRecordId={workspace.state.recordId}
          report={workspace.state.report}
          openMenu={workspace.openMenu}
          setOpenMenu={workspace.setOpenMenu}
          onNewDiagnosis={workspace.handleBackHome}
          onOpenReport={() => workspace.state.report && workspace.setReportOpen(true)}
          onLoadRecord={workspace.handleLoadRecord}
          onRecordPin={workspace.handleRecordPin}
          onRecordRename={workspace.handleRecordRename}
          onRecordDelete={workspace.handleRecordDelete}
        />

        <section className="min-h-0 bg-[#F8F9FA]">
          <div className="grid h-full grid-cols-[260px_minmax(0,1fr)]">
            <KnowledgeNodeRail
              state={workspace.state}
              displayedTitle={workspace.displayedTitle}
              hasActiveDiagnosis={workspace.hasActiveDiagnosis}
              openMenu={workspace.openMenu}
              setOpenMenu={workspace.setOpenMenu}
              dispatch={workspace.dispatch}
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
              waitingForDeepDiveChoice={workspace.waitingForDeepDiveChoice}
              waitingForReportRetry={workspace.waitingForReportRetry}
              answerChoicePending={workspace.answerChoicePending}
              retryQuestionRequest={workspace.retryQuestionRequest}
              retryReportConversations={workspace.retryReportConversations}
              analyzeWarning={workspace.analyzeWarning}
              analyzeMessage={workspace.analyzeMessage}
              textAnswer={workspace.textAnswer}
              setTextAnswer={workspace.setTextAnswer}
              historyEndRef={workspace.historyEndRef}
              fileInputRef={workspace.fileInputRef}
              nextSuitableLevel={workspace.nextSuitableLevel}
              onSubmit={workspace.handleSubmit}
              onHint={workspace.handleHint}
              onAnswer={workspace.handleAnswer}
              onSimilarQuestion={workspace.handleSimilarQuestion}
              onSkipLevel={workspace.handleSkipLevel}
              onCompleteNode={workspace.handleCompleteNode}
              onEnterDeepPath={workspace.handleEnterDeepPath}
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
          currentPathState={workspace.currentPathState}
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
