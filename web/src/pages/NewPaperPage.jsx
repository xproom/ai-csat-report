/**
 * @file NewPaperPage.jsx
 * @brief 새 평가지 만들기 - 1) 표지 옵션 2) 문제지·정답 3) 검증 4) AI 풀어보기
 *
 * 3단계(검증)에서 배점·총점, 문항 번호, 유형 구성, 객관식 선지, 정답 표기, 쪽 번호를 확인합니다.
 * 4단계에 들어가면 평가지를 자동 저장하고, 바로 AI가 문제지를 실시간으로 풀며
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
import VerifyPanel from '@/components/VerifyPanel'
import { applyAnswerKeyText } from '@/lib/answerKey'
import { getBackend } from '@/lib/db'
import { createPaper, makeId, missingAnswers, paperTitle } from '@/lib/schema'
import { navigate, useStore } from '@/lib/store'

const STEPS = ['표지 옵션', '문제지·정답', '검증', 'AI 풀어보기']
const VERIFY_STEP = 2
const AI_STEP = 3

export default function NewPaperPage() {
  const { runs: allRuns, applyPaper, notify } = useStore()
  const [paper, setPaper] = useState(() => createPaper())
  const [files, setFiles] = useState([])
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const savedFileIds = useRef(new Set())
  // 올렸지만 아직 반영하지 않은 정답표 { text, fileName }
  const [pendingKey, setPendingKey] = useState(null)
  const missing = missingAnswers(paper)
  const runs = useMemo(() => allRuns.filter(run => run.paperId === paper.id), [allRuns, paper.id])

  const addFiles = list => setFiles(prev => [...prev, ...list.map(file => ({ id: makeId('file'), name: file.name, type: file.type, size: file.size, blob: file }))])

  /** @brief 지금 내용으로 평가지·문제지 저장 (처음 저장과 다시 저장 모두) */
  const persist = async (current = paper) => {
    const records = files.map((file, order) => ({ ...file, paperId: paper.id, order }))
    const backend = getBackend()
    const keptIds = new Set(records.map(record => record.id))
    await Promise.all([
      ...records.map(record => backend.saveFile(record)),
      ...[...savedFileIds.current].filter(id => !keptIds.has(id)).map(id => backend.deleteFile(id))
    ])
    savedFileIds.current = keptIds
    const next = { ...current, files: records.map(({ id, name, type, size }) => ({ id, name, type, size })) }
    applyPaper(await backend.savePaper(next), backend)
    return records
  }

  const goTo = async index => {
    // 반영하지 않은 정답표가 있으면 반영할지 물음 (반영 안 하고 넘어가면 정답 없이 검증·채점됨)
    let current = paper
    if (pendingKey && index >= VERIFY_STEP) {
      if (window.confirm(`올린 정답표(${pendingKey.fileName})를 아직 반영하지 않았습니다. 반영하고 넘어갈까요?
취소를 누르면 정답 없이 넘어갑니다.`)) {
        const result = applyAnswerKeyText(paper, pendingKey.text, { fileName: pendingKey.fileName, restructure: 'auto' })
        current = result.paper
        setPaper(current)
        notify(`정답 ${result.count}문항을 반영했습니다${result.restructured ? ' (문항 구성도 정답표에 맞춤)' : ''}.`)
      }
      setPendingKey(null)
    }
    if (index !== AI_STEP) { setStep(index); window.scrollTo({ top: 0 }); return }
    setSaving(true)
    try {
      const records = await persist(current)
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
        <p className="mt-1 text-[var(--color-ink-soft)] break-keep">문제지와 정답을 올리면 배점·문항 번호·선지·정답 표기·쪽 번호를 검증하고, AI가 문제지에 풀이를 적으며 OMR로 채점합니다.</p>
      </div>

      {/* 단계 표시 */}
      <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

      {step === VERIFY_STEP ? (
        <div className="space-y-4">
          <VerifyPanel paper={paper} files={files} runs={runs} onChange={setPaper} onEditQuestion={() => goTo(1)} />
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => goTo(1)}>← 문제지·정답 고치기</button>
            <div className="flex flex-wrap items-center gap-3">
              {!files.length && <span className="text-xs text-[var(--color-ink-soft)]">문제지가 없으면 AI 풀이는 할 수 없습니다</span>}
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => goTo(AI_STEP)}>
                {saving ? '저장 중…' : '저장하고 AI 풀어보기 →'}
              </button>
            </div>
          </div>
        </div>
      ) : step === AI_STEP ? (
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
              <button type="button" className="btn btn-primary" onClick={() => navigate(`/paper/${paper.id}?tab=${runs.length ? 'results' : 'check'}`)}>평가지 상세로 이동 →</button>
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
                <AnswerKeyUpload paper={paper} onPendingChange={setPendingKey} onApply={next => { setPaper(next); setPendingKey(null); notify('실제 정답을 반영했습니다.') }} />
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
                  <button type="button" className="btn btn-primary" disabled={saving} onClick={() => goTo(VERIFY_STEP)}>다음: 검증 →</button>
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
