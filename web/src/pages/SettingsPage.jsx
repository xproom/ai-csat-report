/**
 * @file SettingsPage.jsx
 * @brief (관리자) 중앙 서버(Supabase) 연결, API 키, 데이터 백업·복원·초기화, 예시 데이터
 */

import ApiKeySection from '@/components/ApiKeySection'
import CloudPanel from '@/components/CloudPanel'
import { db } from '@/lib/db'
import { loadDemo } from '@/lib/demo'
import { useStore } from '@/lib/store'

export default function SettingsPage() {
  const { papers, runs, refresh, notify, cloud } = useStore()
  const demoPapers = papers.filter(paper => paper.isDemo)

  const exportBackup = async () => {
    const backup = await db.exportAll()
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `AI-검증-평가-백업-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importBackup = async file => {
    try {
      const result = await db.importAll(JSON.parse(await file.text()))
      await refresh()
      notify(`평가지 ${result.papers}개, 풀이 ${result.runs}개를 복원했습니다.`)
    } catch (error) {
      notify(error?.message || '복원하지 못했습니다.', 'error')
    }
  }

  const removeDemo = async () => {
    for (const paper of demoPapers) await db.deletePaper(paper.id)
    await refresh()
    notify('예시 데이터를 지웠습니다.')
  }

  const resetAll = async () => {
    if (!window.confirm(`평가지 ${papers.length}개와 풀이 기록 ${runs.length}개, 문제지 파일을 모두 지웁니다. 되돌릴 수 없습니다. 먼저 백업하는 것을 권장합니다.`)) return
    await db.clearAll()
    await refresh()
    notify('모든 데이터를 지웠습니다.')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">설정</h1>
        <p className="mt-1 text-[var(--color-ink-soft)]">{cloud.user ? `자료는 중앙 서버에 저장됩니다 (${cloud.user.email}).` : '로그인하지 않으면 자료는 이 브라우저(IndexedDB)에만 저장됩니다.'}</p>
      </div>

      <CloudPanel />

      <ApiKeySection />

      <section className="card p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-extrabold">데이터 백업</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">평가지 {papers.length}개 · 풀이 기록 {runs.length}개. 다른 기기로 옮기거나 보관하려면 백업 파일을 내려받으세요(문제지 파일 포함).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={exportBackup} disabled={!papers.length}>백업 내려받기</button>
          <label className="btn btn-ghost">
            백업 파일로 복원
            <input type="file" accept="application/json,.json" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) importBackup(file); e.target.value = '' }} />
          </label>
        </div>
      </section>

      <section className="card p-4 sm:p-6 space-y-4">
        <h2 className="text-lg font-extrabold">예시 데이터</h2>
        <p className="text-sm text-[var(--color-ink-soft)]">화면을 둘러보기 위한 평가지 3개와 가상 모델 점수입니다. 실제 AI 성능이 아닙니다.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => loadDemo(refresh, notify)}>예시 데이터 불러오기</button>
          <button type="button" className="btn btn-ghost" disabled={!demoPapers.length} onClick={removeDemo}>예시 데이터 지우기 ({demoPapers.length})</button>
        </div>
      </section>

      <section className="card p-4 sm:p-6 space-y-3 border-[#f1c4c9]">
        <h2 className="text-lg font-extrabold text-[var(--color-pen)]">전체 초기화</h2>
        <p className="text-sm text-[var(--color-ink-soft)]">이 브라우저에 저장된 평가지, 문제지 파일, 풀이 기록을 모두 지웁니다.</p>
        <button type="button" className="btn btn-danger" onClick={resetAll} disabled={!papers.length && !runs.length}>모두 지우기</button>
      </section>
    </div>
  )
}
