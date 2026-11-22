/**
 * @file VerifyPanel.jsx
 * @brief 문제지·정답 검증 화면 - 배점·총점, 문항 번호, 유형 구성, 객관식 선지, 정답 표기, 쪽 번호
 *
 * - 문제지 PDF에 글자가 들어 있으면 바로 읽어서 대조 (API 사용 없음)
 * - 스캔본·사진이거나 더 정확히 보려면 「AI 정밀 검증」 (API 사용)
 * - 읽은 결과는 평가지에 저장해 두어 목록·검증 현황에서도 씀
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { CLAUDE_MODELS, verifyPaperWithClaude } from '@/lib/aiRunner'
import { extractPaperFacts } from '@/lib/pdfText'
import { getApiKey } from '@/lib/settings'
import { LEVEL_LABEL, composition, mergeFacts, targetTotal, validatePaper } from '@/lib/verify'

const LEVEL_STYLE = {
  error: { chip: 'bg-red-50 text-[var(--color-pen)] border-red-200', dot: 'bg-[var(--color-pen)]', icon: '✕' },
  warn: { chip: 'bg-amber-50 text-amber-900 border-amber-200', dot: 'bg-amber-500', icon: '!' },
  ok: { chip: 'bg-emerald-50 text-emerald-900 border-emerald-200', dot: 'bg-emerald-600', icon: '✓' },
  info: { chip: 'bg-[#f1ede4] text-[var(--color-ink-soft)] border-[var(--color-line)]', dot: 'bg-[#b9b2a3]', icon: 'i' }
}

const STATUS_TEXT = { error: '고칠 곳이 있습니다', warn: '확인이 필요한 곳이 있습니다', ok: '검증을 통과했습니다' }

/** @brief 문제지를 다시 읽어야 하는지 판단하는 키 (파일·문항 수·선택과목이 바뀌면 다시 읽음) */
function factsKey(files, paper) {
  const pdfs = files.filter(file => file.type === 'application/pdf').map(file => file.id).join(',')
  return pdfs ? `${pdfs}|${paper.questions.length}|${paper.meta?.elective ?? ''}` : ''
}

export function LevelBadge({ level, children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-extrabold ${LEVEL_STYLE[level].chip}`}>
      {children ?? LEVEL_LABEL[level]}
    </span>
  )
}

function PlanField({ label, value, placeholder, onChange, unit }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <span className="flex items-center gap-1.5">
        <input className="input text-right tabular-nums" type="number" min="0" step="0.5" value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
        <span className="text-sm text-[var(--color-ink-soft)]">{unit}</span>
      </span>
    </label>
  )
}

/**
 * @param {Object} props
 * @param {Object} props.paper
 * @param {Array} props.files - 문제지 파일 (blob 포함)
 * @param {Array} props.runs - 이 평가지의 풀이 기록 (AI 답과 정답 대조)
 * @param {(updater: Function) => void} props.onChange - 평가지 고치기 (함수형 업데이트)
 * @param {(no: number) => void} [props.onEditQuestion] - 문항 번호를 누르면 정답·배점 편집으로 이동
 */
export default function VerifyPanel({ paper, files, runs = [], onChange, onEditQuestion }) {
  const [reading, setReading] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [error, setError] = useState('')
  const [model, setModel] = useState(CLAUDE_MODELS[0].id)
  const abortRef = useRef(null)
  const key = factsKey(files, paper)
  const stored = paper.verification ?? {}
  const pdfFacts = stored.pdf?.key === key ? stored.pdf : null
  const aiFacts = stored.ai?.key === key || (!key && stored.ai) ? stored.ai : null

  // 문제지 PDF가 바뀌면 글자를 다시 읽음 (무료)
  useEffect(() => {
    if (!key || stored.pdf?.key === key) return undefined
    let cancelled = false
    const pdfs = files.filter(file => file.type === 'application/pdf')
    setReading(true)
    extractPaperFacts(pdfs, paper)
      .then(facts => {
        if (cancelled) return
        onChange(prev => ({ ...prev, verification: { ...(prev.verification ?? {}), pdf: { ...facts, key } } }))
      })
      .catch(err => { if (!cancelled) setError(err?.message || '문제지를 읽지 못했습니다.') })
      .finally(() => { if (!cancelled) setReading(false) })
    return () => { cancelled = true }
    // 키가 바뀔 때만 다시 읽음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const facts = mergeFacts(pdfFacts, aiFacts)
  const result = useMemo(() => validatePaper(paper, { facts, runs }), [paper, facts, runs])
  const plan = paper.meta?.plan ?? {}
  const actual = composition(paper.questions)
  const setPlan = (field, value) => onChange(prev => ({ ...prev, meta: { ...prev.meta, plan: { ...(prev.meta?.plan ?? {}), [field]: value } } }))

  const runAi = async () => {
    setError('')
    setAiBusy(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const facts = await verifyPaperWithClaude({ apiKey: getApiKey(), model, paper, files, signal: controller.signal })
      onChange(prev => ({ ...prev, verification: { ...(prev.verification ?? {}), ai: { ...facts, key } } }))
    } catch (err) {
      if (!controller.signal.aborted) setError(err?.message || 'AI 정밀 검증에 실패했습니다.')
    } finally {
      setAiBusy(false)
      abortRef.current = null
    }
  }

  const sourceText = () => {
    const parts = []
    if (pdfFacts) {
      const found = Object.keys(pdfFacts.questions ?? {}).length
      parts.push(pdfFacts.readable ? `문제지 글자에서 ${found}/${paper.questions.length}문항을 읽음` : '문제지에 글자가 없음 (스캔본·사진)')
    }
    if (aiFacts) parts.push(`AI 정밀 검증(${aiFacts.model}) ${new Date(aiFacts.createdAt).toLocaleString('ko-KR')}`)
    if (!files.length) parts.push('문제지 없이 정답·배점만 검사함')
    else if (!key && !aiFacts) parts.push('사진 문제지는 「AI 정밀 검증」으로 대조합니다')
    return parts.join(' · ')
  }

  return (
    <div className="space-y-5">
      {/* 요약 */}
      <section className="card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-extrabold">문제지·정답 검증</h2>
            <p className={`mt-1 font-bold ${result.status === 'error' ? 'text-[var(--color-pen)]' : result.status === 'warn' ? 'text-amber-800' : 'text-emerald-800'}`}>
              {reading ? '문제지를 읽는 중…' : STATUS_TEXT[result.status]}
            </p>
            <p className="mt-1 text-xs text-[var(--color-ink-soft)] break-keep">{sourceText()}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <LevelBadge level="error">오류 {result.counts.error}</LevelBadge>
            <LevelBadge level="warn">확인 {result.counts.warn}</LevelBadge>
            <LevelBadge level="ok">통과 {result.counts.ok}</LevelBadge>
          </div>
        </div>

        {files.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--color-brand-soft)] p-3">
            <div className="flex-1 min-w-[12rem] text-sm leading-relaxed break-keep">
              <b>AI 정밀 검증</b> — AI가 문제지를 직접 보고 문항 번호·배점 표시·선지·쪽 번호를 읽습니다. 스캔본·사진도 됩니다. <span className="text-[var(--color-ink-soft)]">API 사용량이 듭니다.</span>
            </div>
            <select className="input !w-auto" value={model} onChange={e => setModel(e.target.value)} aria-label="검증 모델" disabled={aiBusy}>
              {CLAUDE_MODELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            {aiBusy ? (
              <button type="button" className="btn btn-ghost" onClick={() => abortRef.current?.abort()}>멈추기</button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={runAi}>{aiFacts ? 'AI로 다시 검증' : 'AI 정밀 검증'}</button>
            )}
          </div>
        )}
        {aiBusy && <p className="mt-2 text-sm text-[var(--color-ink-soft)]">AI가 문제지를 읽는 중입니다… (문항 수에 따라 1~3분)</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--color-pen)]">{error}</p>}
      </section>

      {/* 출제 계획 */}
      <section className="card p-4 sm:p-6">
        <h3 className="font-extrabold">출제 계획</h3>
        <p className="mt-1 mb-4 text-xs text-[var(--color-ink-soft)] break-keep">이원목적분류표·출제 계획의 값을 넣으면 실제 구성과 대조합니다. 비워 둔 칸은 검사하지 않습니다.</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
          <PlanField label="총점" unit="점" value={plan.totalPoints} placeholder={String(targetTotal({ ...paper, meta: { ...paper.meta, plan: {} } }))} onChange={value => setPlan('totalPoints', value)} />
          <PlanField label="선택형 문항 수" unit="개" value={plan.choiceCount} placeholder={String(actual.choiceCount)} onChange={value => setPlan('choiceCount', value)} />
          <PlanField label="서답형 문항 수" unit="개" value={plan.writtenCount} placeholder={String(actual.writtenCount)} onChange={value => setPlan('writtenCount', value)} />
          <PlanField label="선택형 배점" unit="점" value={plan.choicePoints} placeholder={String(actual.choicePoints)} onChange={value => setPlan('choicePoints', value)} />
          <PlanField label="서답형 배점" unit="점" value={plan.writtenPoints} placeholder={String(actual.writtenPoints)} onChange={value => setPlan('writtenPoints', value)} />
        </div>
      </section>

      {/* 항목별 결과 */}
      <div className="grid gap-4 lg:grid-cols-2">
        {result.checks.map(check => (
          <section key={check.id} className="card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className={`shrink-0 flex w-8 h-8 items-center justify-center rounded-lg text-sm font-extrabold text-white ${LEVEL_STYLE[check.status].dot}`} aria-hidden="true">{check.letter}</span>
                <div className="min-w-0">
                  <h3 className="font-extrabold leading-tight">{check.title}</h3>
                  {check.description && <p className="mt-0.5 text-xs text-[var(--color-ink-soft)] break-keep">{check.description}</p>}
                </div>
              </div>
              <LevelBadge level={check.status} />
            </div>
            <ul className="mt-3 space-y-1.5">
              {check.items.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className={`mt-[3px] shrink-0 flex w-4 h-4 items-center justify-center rounded-full text-[0.6rem] font-black text-white ${LEVEL_STYLE[item.level].dot}`} aria-label={LEVEL_LABEL[item.level]}>{LEVEL_STYLE[item.level].icon}</span>
                  <span className="min-w-0 break-keep">
                    {item.text}
                    {item.no && onEditQuestion && item.level !== 'ok' && (
                      <button type="button" className="ml-1.5 text-xs font-bold text-[var(--color-brand)] hover:underline" onClick={() => onEditQuestion(item.no)}>고치기</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
