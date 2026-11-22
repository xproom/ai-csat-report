/**
 * @file AnswerKeyEditor.jsx
 * @brief 문항 구성(객관식·단답형·서술형 개수)과 정답·배점 입력
 * - 유형 칸을 누르면 그 문항만 유형을 바꿀 수 있어 수능처럼 유형이 섞인 구성도 만들 수 있음
 * - 수능·모의고사 과목이면 표준 구성을 한 번에 적용
 */

import { useState } from 'react'
import { describeComposition, standardPreset } from '@/lib/presets'
import { buildQuestions, countByType, QUESTION_TYPES, totalPoints } from '@/lib/schema'

const TYPE_ORDER = ['choice', 'short', 'essay']

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
  // 사용자가 숫자를 고치기 전에는 현재 구성 그대로 보여줌 (프리셋·유형 변경 뒤에도 자동으로 맞음)
  const [draftLayout, setDraftLayout] = useState(null)
  const layout = draftLayout ?? {
    choiceCount: counts.choice,
    shortCount: counts.short,
    essayCount: counts.essay,
    choices: firstChoice?.choices ?? 5
  }
  const setLayout = next => setDraftLayout(next)
  const total = totalPoints(paper)
  const preset = standardPreset(paper.meta)
  const hasAnswers = paper.questions.some(question => String(question.answer ?? '').trim())

  /** @brief 수능·모의고사 표준 구성 적용 (같은 번호·유형의 정답은 유지) */
  const applyPreset = () => {
    if (!preset) return
    if (hasAnswers && !window.confirm(`문항 구성을 "${preset.label}"(으)로 바꿉니다. 번호와 유형이 같은 문항의 정답만 남고 나머지는 지워집니다. 계속할까요?`)) return
    setDraftLayout(null)
    onChange(prev => ({
      ...prev,
      questions: preset.questions.map(question => {
        const old = prev.questions.find(item => item.no === question.no && item.type === question.type)
        return old?.answer ? { ...question, answer: old.answer } : question
      })
    }))
  }

  /** @brief 한 문항의 유형을 다음 유형으로 바꿈 (객관식 → 단답형 → 서술형) */
  const cycleType = no => {
    setDraftLayout(null)
    onChange(prev => ({
      ...prev,
      questions: prev.questions.map(question => {
        if (question.no !== no) return question
        const type = TYPE_ORDER[(TYPE_ORDER.indexOf(question.type) + 1) % TYPE_ORDER.length]
        const keep = type !== 'choice' || /^[1-5]$/.test(String(question.answer ?? ''))
        return { ...question, type, answer: keep ? question.answer : '' }
      })
    }))
  }

  const setQuestion = (no, patch) => {
    onChange(prev => ({ ...prev, questions: prev.questions.map(question => question.no === no ? { ...question, ...patch } : question) }))
  }

  /** @brief 문항 구성 변경 - 같은 번호·유형의 기존 정답과 배점은 유지 */
  const applyLayout = () => {
    const fresh = buildQuestions(layout)
    setDraftLayout(null)
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
      {preset && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-brand)]/20 bg-white px-4 py-3">
          <div className="text-sm">
            <b>{paper.meta.examType} 표준 구성</b> <span className="text-[var(--color-ink-soft)]">{preset.label}</span>
            <span className="block text-xs text-[var(--color-ink-soft)]">현재: {describeComposition(paper.questions)}</span>
          </div>
          <button type="button" className="btn btn-primary !py-1.5 text-sm" onClick={applyPreset}>표준 구성 적용</button>
        </div>
      )}

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
        <span className="text-xs text-[var(--color-ink-soft)] sm:ml-auto">유형 칸을 누르면 그 문항의 유형이 바뀝니다 · 단답형 정답이 여러 개면 <code className="px-1 rounded bg-white">|</code>로 구분 (예: 1/2|0.5)</span>
      </div>

      <ol className="grid gap-2.5 md:grid-cols-2">
        {paper.questions.map(question => (
          <li key={question.no} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--color-line)] bg-white px-3 py-2.5">
            <span className="w-8 text-center font-extrabold text-lg tabular-nums">{question.no}</span>
            <button
              type="button"
              onClick={() => cycleType(question.no)}
              title="눌러서 유형 바꾸기"
              aria-label={`${question.no}번 유형 ${QUESTION_TYPES[question.type]}, 눌러서 바꾸기`}
              className={`chip cursor-pointer hover:ring-2 hover:ring-[var(--color-brand)]/30 ${question.type === 'essay' ? '!bg-amber-100 !text-amber-800' : question.type === 'short' ? '!bg-emerald-100 !text-emerald-800' : ''}`}
            >
              {QUESTION_TYPES[question.type]}
            </button>
            {question.elective && <span className="chip !bg-violet-100 !text-violet-800">선택</span>}

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
