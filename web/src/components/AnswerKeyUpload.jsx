/**
 * @file AnswerKeyUpload.jsx
 * @brief 실제 정답(정답표) 업로드 - 파일·붙여넣기·정답표 사진(PDF) 읽기 → 비교 미리보기 → 반영
 */

import { useMemo, useRef, useState } from 'react'
import { readAnswerKeyWithClaude } from '@/lib/aiRunner'
import { applyAnswerKey, diffAnswerKey, parseAnswerKey } from '@/lib/answerKey'
import { QUESTION_TYPES } from '@/lib/schema'
import { getApiKey } from '@/lib/settings'
import { Icon } from './Layout'

const TEXT_TYPES = /\.(csv|tsv|txt|json)$/i
const SCAN_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']

const STATUS = {
  same: { label: '같음', className: 'text-[var(--color-ink-soft)]' },
  changed: { label: '바뀜', className: 'bg-amber-100 text-amber-900' },
  new: { label: '새로 입력', className: 'bg-emerald-100 text-emerald-900' },
  missing: { label: '정답표에 없음', className: 'bg-gray-100 text-gray-500' }
}

const EXAMPLE = `번호,정답,배점
1,③,3.5
2,5
21,12
22,1/2|0.5`

export default function AnswerKeyUpload({ paper, onApply }) {
  const inputRef = useRef(null)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [applyPoints, setApplyPoints] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const parsed = useMemo(() => (text.trim() ? parseAnswerKey(text, paper) : null), [text, paper])
  const diff = useMemo(() => (parsed ? diffAnswerKey(paper, parsed.entries) : []), [parsed, paper])
  const counts = diff.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {})
  const hasPoints = parsed?.entries.some(entry => entry.points)
  const visibleRows = showAll ? diff : diff.filter(row => row.status === 'changed' || row.status === 'new')
  const source = paper.answerKeySource

  const loadFile = async file => {
    setError('')
    setFileName(file.name)
    if (TEXT_TYPES.test(file.name) || file.type.startsWith('text/') || file.type === 'application/json') {
      setText(await file.text())
      return
    }
    if (SCAN_TYPES.includes(file.type)) {
      setReading(true)
      try {
        setText(await readAnswerKeyWithClaude({ apiKey: getApiKey(), paper, file: { name: file.name, type: file.type, blob: file } }))
      } catch (err) {
        setError(err?.message || '정답표를 읽지 못했습니다.')
      } finally {
        setReading(false)
      }
      return
    }
    setError('CSV·TXT·JSON 파일이나 정답표 PDF·사진을 올려 주세요. 엑셀은 CSV로 저장해서 올리면 됩니다.')
  }

  const apply = () => {
    onApply(applyAnswerKey(paper, parsed.entries, { fileName: fileName || '직접 붙여넣기', applyPoints }))
    setText('')
    setFileName('')
  }

  return (
    <div className="card p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">실제 정답 업로드</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">학교에서 공개한 정답표를 올리면 모든 문항의 정답에 한 번에 반영됩니다. AI 답은 이 정답과 비교해 채점됩니다.</p>
        </div>
        {source?.type === 'upload' && (
          <span className="chip !bg-emerald-50 !text-emerald-800">
            실제 정답 반영됨 · {source.fileName} · {new Date(source.appliedAt).toLocaleDateString('ko-KR')}
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) loadFile(file) }}
          className="rounded-2xl border-2 border-dashed border-[var(--color-line)] bg-white px-5 py-7 text-center hover:border-[var(--color-brand)]"
          disabled={reading}
        >
          <Icon d="M9 12l2 2 4-4M6 3h9l5 5v13H6z" className="mx-auto w-8 h-8 text-[var(--color-brand)]" />
          <span className="mt-2 block font-bold">{reading ? '정답표 읽는 중…' : '정답 파일 선택 또는 끌어다 놓기'}</span>
          <span className="mt-1 block text-xs text-[var(--color-ink-soft)]">CSV · TXT · JSON / 정답표 PDF·사진은 Claude가 읽어 옵니다(API 키 필요)</span>
          {fileName && <span className="mt-2 block text-xs font-semibold text-[var(--color-brand)]">{fileName}</span>}
        </button>
        <input ref={inputRef} type="file" className="hidden" accept=".csv,.tsv,.txt,.json,application/pdf,image/*" onChange={e => { const file = e.target.files?.[0]; if (file) loadFile(file); e.target.value = '' }} />

        <label className="block">
          <span className="field-label">또는 정답 붙여넣기</span>
          <textarea
            className="input font-mono text-sm min-h-[8.5rem]"
            value={text}
            placeholder={`${EXAMPLE}\n\n(번호 없이 "35124…" 처럼 순서대로 써도 됩니다)`}
            onChange={e => { setText(e.target.value); setFileName('') }}
          />
        </label>
      </div>

      {error && <p className="text-sm text-[var(--color-pen)]">{error}</p>}

      {parsed && (
        <div className="space-y-3 rounded-2xl bg-[var(--color-paper)] p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold">{parsed.entries.length}문항 인식</span>
            <span className="text-xs text-[var(--color-ink-soft)]">({parsed.format})</span>
            {['changed', 'new', 'same', 'missing'].map(key => counts[key] ? (
              <span key={key} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[key].className}`}>{STATUS[key].label} {counts[key]}</span>
            ) : null)}
            {parsed.unknownNos.length > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-[var(--color-pen)]">평가지에 없는 번호 {parsed.unknownNos.join(', ')}</span>
            )}
          </div>

          {parsed.entries.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> 모든 문항 보기
                </label>
                {hasPoints && (
                  <label className="flex items-center gap-2 text-xs font-semibold">
                    <input type="checkbox" checked={applyPoints} onChange={e => setApplyPoints(e.target.checked)} /> 정답표의 배점도 반영
                  </label>
                )}
              </div>
              {visibleRows.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-soft)]">현재 정답과 모두 같습니다.</p>
              ) : (
                <div className="scroll-x max-h-72 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-white">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-left text-xs text-[var(--color-ink-soft)] border-b border-[var(--color-line)]">
                        <th className="px-3 py-2">번호</th>
                        <th className="px-3 py-2">유형</th>
                        <th className="px-3 py-2">현재 정답</th>
                        <th className="px-3 py-2">업로드 정답</th>
                        <th className="px-3 py-2">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map(row => (
                        <tr key={row.no} className="border-b border-[var(--color-line)]/60 last:border-0">
                          <td className="px-3 py-1.5 font-bold tabular-nums">{row.no}</td>
                          <td className="px-3 py-1.5 text-xs">{QUESTION_TYPES[row.type]}</td>
                          <td className="px-3 py-1.5">{row.current || <span className="text-[var(--color-ink-soft)]">—</span>}</td>
                          <td className="px-3 py-1.5 font-bold">{row.uploaded || '—'}{row.points ? <span className="ml-1 text-xs font-normal text-[var(--color-ink-soft)]">({row.points}점)</span> : null}</td>
                          <td className="px-3 py-1.5"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[row.status].className}`}>{STATUS[row.status].label}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-primary" onClick={apply}>정답 {parsed.entries.length}문항 반영</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setText(''); setFileName('') }}>취소</button>
                {counts.missing > 0 && <span className="text-xs text-[var(--color-ink-soft)]">정답표에 없는 {counts.missing}문항은 기존 정답을 유지합니다.</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
