/**
 * @file NewPaperPage.jsx
 * @brief 새 평가지 만들기 - 1) 표지 옵션 2) 문제지·정답 3) AI 풀어보기
 *
 * 3단계에 들어가면 평가지를 자동 저장하고, 바로 AI가 문제지를 실시간으로 풀며
 * OMR에 마킹하고 실제 정답과 비교해 채점하는 화면(AI 풀이 보기)을 보여줍니다.
 * 이전 단계로 돌아가 고친 뒤 다시 3단계로 오면 바뀐 내용이 다시 저장됩니다.
 */

import { useMemo, useRef, useState } from 'react'
import AnswerKeyEditor from '@/components/AnswerKeyEditor'
import AnswerKeyUpload from '@/components/AnswerKeyUpload'
import CoverOptionsForm from '@/components/CoverOptionsForm'
import { FileUploader } from '@/components/FileUploader'
import PaperCover from '@/components/PaperCover'
import SolveViewer from '@/components/SolveViewer'
import { db } from '@/lib/db'
import { createPaper, makeId, missingAnswers, paperTitle } from '@/lib/schema'
import { navigate, useStore } from '@/lib/store'

const STEPS = ['표지 옵션', '문제지·정답', 'AI 풀어보기']
const AI_STEP = 2

export default function NewPaperPage() {
  const { runs: allRuns, refresh, notify } = useStore()
  const [paper, setPaper] = useState(() => createPaper())
  const [files, setFiles] = useState([])
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const savedFileIds = useRef(new Set())
  const missing = missingAnswers(paper)
  const runs = useMemo(() => allRuns.filter(run => run.paperId === paper.id), [allRuns, paper.id])

  const addFiles = list => setFiles(prev => [...prev, ...list.map(file => ({ id: makeId('file'), name: file.name, type: file.type, size: file.size, blob: file }))])

  /** @brief 지금 내용으로 평가지·문제지 저장 (처음 저장과 다시 저장 모두) */
  const persist = async () => {
    const records = files.map((file, order) => ({ ...file, paperId: paper.id, order }))
    for (const record of records) await db.saveFile(record)
    const current = new Set(records.map(record => record.id))
    for (const id of savedFileIds.current) {
      if (!current.has(id)) await db.deleteFile(id)
    }
    savedFileIds.current = current
    const next = { ...paper, files: records.map(({ id, name, type, size }) => ({ id, name, type, size })) }
    await db.savePaper(next)
    await refresh()
    return records
  }

  const goTo = async index => {
    if (index !== AI_STEP) { setStep(index); return }
    setSaving(true)
    try {
      const records = await persist()
      setFiles(records)
      if (!saved) notify('평가지를 저장했습니다. 이제 AI에게 풀게 할 수 있습니다.')
      setSaved(true)
      setStep(AI_STEP)
      window.scrollTo({ top: 0 })
    } catch (error) {
      notify(error?.message || '저장하지 못했습니다.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">새 평가지 만들기</h1>
        <p className="mt-1 text-[var(--color-ink-soft)]">표지를 꾸미고, 문제지와 정답을 올린 뒤, AI가 문제를 풀며 OMR에 마킹하고 채점하는 모습을 바로 확인하세요.</p>
      </div>

      {/* 단계 표시 */}
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => goTo(index)}
              disabled={saving}
              aria-current={step === index ? 'step' : undefined}
              className={`w-full text-left rounded-xl px-3 py-2.5 border transition-colors ${step === index
                ? 'bg-[var(--color-brand)] border-[var(--color-brand)] text-white'
                : index < step ? 'bg-[var(--color-brand-soft)] border-transparent text-[var(--color-brand)]' : 'bg-white border-[var(--color-line)] text-[var(--color-ink-soft)]'}`}
            >
              <span className="block text-[0.7rem] font-bold opacity-80">STEP {index + 1}</span>
              <span className="block text-sm font-extrabold truncate">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === AI_STEP ? (
        <div className="space-y-4">
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-extrabold truncate">{paperTitle(paper)}</div>
              <div className="text-xs text-[var(--color-ink-soft)]">
                저장됨 · {paper.questions.length}문항 · 문제지 {files.length}개
                {missing.length > 0 && <span className="text-[var(--color-pen)]"> · 정답 미입력 {missing.length}문항 (오답으로 채점됨)</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => goTo(1)}>← 문제지·정답 고치기</button>
              <button type="button" className="btn btn-primary" onClick={() => navigate(`/paper/${paper.id}?tab=${runs.length ? 'perf' : 'results'}`)}>평가지 상세로 이동 →</button>
            </div>
          </div>
          <SolveViewer key={paper.id} paper={paper} runs={runs} files={files} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start">
          <div className="space-y-6 min-w-0">
            {step === 0 && (
              <div className="card p-4 sm:p-6"><CoverOptionsForm paper={paper} onChange={setPaper} /></div>
            )}
            {step === 1 && (
              <>
                <section className="card p-4 sm:p-6 space-y-3">
                  <h2 className="text-lg font-extrabold">문제지 업로드</h2>
                  <FileUploader files={files} onAdd={addFiles} onRemove={id => setFiles(prev => prev.filter(file => file.id !== id))} />
                  <p className="text-xs text-[var(--color-ink-soft)]">정답이 함께 인쇄된 파일은 AI가 정답을 볼 수 있으니 문제만 있는 파일을 올리세요.</p>
                </section>
                <AnswerKeyUpload paper={paper} onApply={next => { setPaper(next); notify('실제 정답을 반영했습니다.') }} />
                <section className="card p-4 sm:p-6">
                  <h2 className="text-lg font-extrabold mb-4">문항 구성과 정답</h2>
                  <AnswerKeyEditor key={paper.answerKeySource?.appliedAt ?? 'manual'} paper={paper} onChange={setPaper} />
                </section>
              </>
            )}

            <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
              <button type="button" className="btn btn-ghost" disabled={step === 0 || saving} onClick={() => goTo(step - 1)}>이전</button>
              {step === 0 ? (
                <button type="button" className="btn btn-primary" onClick={() => goTo(1)}>다음: 문제지·정답</button>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  {!files.length && <span className="text-xs text-[var(--color-ink-soft)]">문제지가 없으면 AI 풀이는 할 수 없습니다</span>}
                  {missing.length > 0 && <span className="text-xs text-[var(--color-pen)]">정답 미입력 {missing.length}문항</span>}
                  <button type="button" className="btn btn-primary" disabled={saving} onClick={() => goTo(AI_STEP)}>
                    {saving ? '저장 중…' : '저장하고 AI 풀어보기 →'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 space-y-3">
            <div className="text-xs font-bold text-[var(--color-ink-soft)]">표지 미리보기</div>
            <div className="max-w-sm mx-auto lg:max-w-none"><PaperCover paper={paper} /></div>
            {files.length > 0 && <p className="text-center text-xs text-[var(--color-ink-soft)]">문제지 {files.length}개 첨부됨</p>}
          </aside>
        </div>
      )}
    </div>
  )
}
