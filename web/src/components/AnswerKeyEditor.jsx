/**
 * @file AnswerKeyEditor.jsx
 * @brief 문항 구성(객관식·단답형·서술형 개수)과 정답·배점 입력
 */

import { useState } from 'react'
import { buildQuestions, countByType, QUESTION_TYPES, totalPoints } from '@/lib/schema'

const CIRCLED = ['①', '②', '③', '④', '⑤']

function NumberField({ label, value, onChange, min = 0, max = 60 }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input className="input" type="number" min={min} max={max} value={value} onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))} />
    </label>
  )
}

export default function AnswerKeyEditor({ paper, onChange }) {
  const counts = countByType(paper)
  const firstChoice = paper.questions.find(question => question.type === 'choice')
  const [layout, setLayout] = useState({
    choiceCount: counts.choice,
    shortCount: counts.short,
    essayCount: counts.essay,
    choices: firstChoice?.choices ?? 5
  })
  const total = totalPoints(paper)

  const setQuestion = (no, patch) => {
    onChange(prev => ({ ...prev, questions: prev.questions.map(question => question.no === no ? { ...question, ...patch } : question) }))
  }

  /** @brief 문항 구성 변경 - 같은 번호·유형의 기존 정답과 배점은 유지 */
  const applyLayout = () => {
    const fresh = buildQuestions(layout)
    onChange(prev => ({
      ...prev,
      questions: fresh.map(question => {
        const old = prev.questions.find(item => item.no === question.no && item.type === question.type)
        return old ? { ...old, choices: question.type === 'choice' ? layout.choices : old.choices } : question
      })
    }))
  }

  /** @brief 총점이 100점이 되도록 객관식 배점을 고르게 조정 */
  const distributeTo100 = () => {
    // 상태 갱신 함수는 여러 번 호출될 수 있으므로(개발 모드 등) 계산을 모두 함수 안에서 새로 함
    onChange(prev => {
      const fixed = prev.questions.filter(question => question.type !== 'choice').reduce((sum, question) => sum + Number(question.points || 0), 0)
      const choiceCount = prev.questions.filter(question => question.type === 'choice').length
      if (!choiceCount || fixed >= 100) return prev
      // 0.1점 단위로 나누고, 남는 0.1점은 앞 문항부터 하나씩 더함
      const remainTenths = Math.round((100 - fixed) * 10)
      const baseTenths = Math.floor(remainTenths / choiceCount)
      const extraCount = remainTenths - baseTenths * choiceCount
      let choiceIndex = 0
      return {
        ...prev,
        questions: prev.questions.map(question => {
          if (question.type !== 'choice') return question
          const tenths = baseTenths + (choiceIndex < extraCount ? 1 : 0)
          choiceIndex += 1
          return { ...question, points: tenths / 10 }
        })
      }
    })
  }

  const layoutChanged = layout.choiceCount !== counts.choice || layout.shortCount !== counts.short || layout.essayCount !== counts.essay || (firstChoice && layout.choices !== firstChoice.choices)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[var(--color-brand-soft)]/60 p-4 sm:p-5">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <NumberField label="객관식" value={layout.choiceCount} onChange={choiceCount => setLayout({ ...layout, choiceCount })} />
          <NumberField label="단답형" value={layout.shortCount} onChange={shortCount => setLayout({ ...layout, shortCount })} />
          <NumberField label="서술형" value={layout.essayCount} onChange={essayCount => setLayout({ ...layout, essayCount })} />
          <label className="block">
            <span className="field-label">선지 수</span>
            <select className="input" value={layout.choices} onChange={e => setLayout({ ...layout, choices: Number(e.target.value) })}>
              <option value={5}>5지선다</option>
              <option value={4}>4지선다</option>
            </select>
          </label>
          <button type="button" className="btn btn-primary col-span-2 sm:col-span-1" disabled={!layoutChanged} onClick={applyLayout}>
            문항 구성 적용
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">
          총 <b>{paper.questions.length}</b>문항 · 총점 <b className={total === 100 ? 'text-[var(--color-ok)]' : 'text-[var(--color-pen)]'}>{total}점</b>
        </span>
        {total !== 100 && (
          <button type="button" className="btn btn-ghost !py-1.5 text-xs" onClick={distributeTo100}>객관식 배점으로 100점 맞추기</button>
        )}
        <span className="text-xs text-[var(--color-ink-soft)] sm:ml-auto">단답형에 정답이 여러 개면 <code className="px-1 rounded bg-white">|</code>로 구분 (예: 1/2|0.5)</span>
      </div>

      <ol className="grid gap-2.5 md:grid-cols-2">
        {paper.questions.map(question => (
          <li key={question.no} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--color-line)] bg-white px-3 py-2.5">
            <span className="w-8 text-center font-extrabold text-lg tabular-nums">{question.no}</span>
            <span className={`chip ${question.type === 'essay' ? '!bg-amber-100 !text-amber-800' : question.type === 'short' ? '!bg-emerald-100 !text-emerald-800' : ''}`}>
              {QUESTION_TYPES[question.type]}
            </span>

            {question.type === 'choice' ? (
              <div className="flex gap-1" role="radiogroup" aria-label={`${question.no}번 정답`}>
                {Array.from({ length: question.choices }, (_, index) => String(index + 1)).map(choice => (
                  <button
                    key={choice}
                    type="button"
                    role="radio"
                    aria-checked={question.answer === choice}
                    onClick={() => setQuestion(question.no, { answer: question.answer === choice ? '' : choice })}
                    className={`w-8 h-9 rounded-full border-2 text-sm font-bold transition-colors ${question.answer === choice
                      ? 'bg-[var(--color-ink)] border-[var(--color-ink)] text-white'
                      : 'border-[var(--color-omr)]/60 text-[var(--color-omr)] hover:bg-[var(--color-omr-soft)]'}`}
                  >
                    {CIRCLED[Number(choice) - 1]}
                  </button>
                ))}
              </div>
            ) : (
              <input
                className="input !py-1.5 flex-1 min-w-[8rem]"
                value={question.answer}
                placeholder={question.type === 'essay' ? '모범답안 (선택)' : '정답'}
                aria-label={`${question.no}번 정답`}
                onChange={e => setQuestion(question.no, { answer: e.target.value })}
              />
            )}

            <label className="flex items-center gap-1 ml-auto text-xs text-[var(--color-ink-soft)]">
              <input
                className="input !w-16 !py-1 text-right"
                type="number"
                min="0"
                step="0.1"
                value={question.points}
                aria-label={`${question.no}번 배점`}
                onChange={e => setQuestion(question.no, { points: Number(e.target.value) || 0 })}
              />
              점
            </label>
          </li>
        ))}
      </ol>
    </div>
  )
}
