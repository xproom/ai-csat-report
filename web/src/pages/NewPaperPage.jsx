/**
 * @file NewPaperPage.jsx
 * @brief 새 평가지 만들기 - 1) 표지 옵션 2) 문제지 업로드 3) 문항·정답
 */

import { useState } from 'react'
import AnswerKeyEditor from '@/components/AnswerKeyEditor'
import CoverOptionsForm from '@/components/CoverOptionsForm'
import { FileUploader } from '@/components/FileUploader'
import PaperCover from '@/components/PaperCover'
import { db } from '@/lib/db'
import { createPaper, makeId, missingAnswers } from '@/lib/schema'
import { navigate, useStore } from '@/lib/store'

const STEPS = ['표지 옵션', '문제지 업로드', '문항·정답']

export default function NewPaperPage() {
  const { refresh, notify } = useStore()
  const [paper, setPaper] = useState(() => createPaper())
  const [files, setFiles] = useState([])
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const missing = missingAnswers(paper)

  const addFiles = list => setFiles(prev => [...prev, ...list.map(file => ({ id: makeId('file'), name: file.name, type: file.type, size: file.size, blob: file }))])

  const finish = async () => {
    setSaving(true)
    try {
      const records = files.map((file, order) => ({ ...file, paperId: paper.id, order }))
      for (const record of records) await db.saveFile(record)
      await db.savePaper({ ...paper, files: records.map(({ id, name, type, size }) => ({ id, name, type, size })) })
      await refresh()
      notify('평가지를 만들었습니다.')
      navigate(`/paper/${paper.id}?tab=results`)
    } catch (error) {
      notify(error?.message || '저장하지 못했습니다.', 'error')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">새 평가지 만들기</h1>
        <p className="mt-1 text-[var(--color-ink-soft)]">표지를 꾸미고, 문제지를 올리고, 정답을 입력하면 AI 평가 준비가 끝납니다.</p>
      </div>

      {/* 단계 표시 */}
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(index)}
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start">
        <div className="card p-4 sm:p-6">
          {step === 0 && <CoverOptionsForm paper={paper} onChange={setPaper} />}
          {step === 1 && (
            <div className="space-y-3">
              <FileUploader files={files} onAdd={addFiles} onRemove={id => setFiles(prev => prev.filter(file => file.id !== id))} />
              <p className="text-xs text-[var(--color-ink-soft)]">문제지는 나중에 올려도 됩니다. 정답이 함께 인쇄된 파일은 AI가 정답을 볼 수 있으니 문제만 있는 파일을 올리세요.</p>
            </div>
          )}
          {step === 2 && <AnswerKeyEditor paper={paper} onChange={setPaper} />}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] pt-4">
            <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>이전</button>
            {step < STEPS.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>다음</button>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                {missing.length > 0 && <span className="text-xs text-[var(--color-pen)]">정답 미입력 {missing.length}문항 (나중에 입력 가능)</span>}
                <button type="button" className="btn btn-primary" disabled={saving} onClick={finish}>{saving ? '저장 중…' : '평가지 만들기'}</button>
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
    </div>
  )
}
