/**
 * @file OmrCard.jsx
 * @brief 문제지 구성에 맞춘 OMR 답안지
 *
 * 모드
 * - 정답 OMR: run 없이 정답을 마킹해서 보여줌
 * - 풀이 OMR: 모델(또는 직접 입력)의 마킹을 보여주고, showGrading이면 선생님 채점처럼 빨간 펜 표시
 *   (정답 = 문번에 동그라미, 오답 = 빗금 + 정답 위치 점선 표시)
 * - editable이면 버블을 눌러 마킹·수정 가능 (직접 입력용)
 */

import { useMemo } from 'react'
import { gradeRun } from '@/lib/grading'
import { paperTitle } from '@/lib/schema'

const ROWS_PER_COLUMN = 10

function chunk(list, size) {
  const result = []
  for (let i = 0; i < list.length; i += size) result.push(list.slice(i, i + size))
  return result
}

/** @brief 빨간 펜 채점 표시 (문번 칸 위에 겹침) */
function PenMark({ kind }) {
  if (!kind) return null
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox="0 0 40 32" aria-hidden="true">
      {kind === 'correct' && (
        <ellipse className="pen-stroke" cx="20" cy="16" rx="15" ry="12.5" fill="none" stroke="var(--color-pen)" strokeWidth="2.6" strokeLinecap="round" transform="rotate(-8 20 16)" />
      )}
      {kind === 'wrong' && (
        <path className="pen-stroke" d="M8 28 L33 3" stroke="var(--color-pen)" strokeWidth="2.8" strokeLinecap="round" />
      )}
    </svg>
  )
}

/** @brief OMR 버블 하나 */
function Bubble({ digit, filled, isKey, onClick, disabled, label }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-pressed={filled}
      className={`relative flex items-center justify-center w-[18px] h-[26px] sm:w-[19px] sm:h-[27px] rounded-[50%] text-[0.62rem] font-bold leading-none transition-colors ${filled
        ? 'bg-[#16161a] text-[#16161a]'
        : 'border-[1.5px] border-[var(--color-omr)] text-[var(--color-omr)]'} ${disabled ? 'cursor-default' : 'cursor-pointer hover:bg-[var(--color-omr-soft)]'}`}
    >
      {digit}
      {isKey && (
        <span className="absolute -inset-[4px] rounded-[50%] border-2 border-dashed border-[var(--color-pen)]" aria-hidden="true" />
      )}
    </button>
  )
}

/**
 * @param {Object} props
 * @param {Object} props.paper
 * @param {Object|null} props.run - 없으면 정답 OMR
 * @param {boolean} [props.showGrading]
 * @param {boolean} [props.editable]
 * @param {(no: number, answer: string) => void} [props.onAnswer]
 * @param {Set<number>|null} [props.visibleNos] - 시뮬레이션용: 지금까지 마킹이 끝난 문항 (null이면 전부)
 * @param {Set<number>|null} [props.gradedNos] - 시뮬레이션용: 지금까지 채점이 끝난 문항 (null이면 전부)
 * @param {number|null} [props.activeNo] - 시뮬레이션용: 지금 처리 중인 문항 강조
 * @param {boolean} [props.showStamp] - 점수 도장 표시
 */
export default function OmrCard({ paper, run = null, showGrading = true, editable = false, onAnswer, visibleNos = null, gradedNos = null, activeNo = null, showStamp = true }) {
  const isKeySheet = !run
  const result = useMemo(() => (run ? gradeRun(paper, run) : null), [paper, run])
  const itemByNo = useMemo(() => new Map((result?.items || []).map(item => [item.no, item])), [result])
  const choiceQuestions = paper.questions.filter(question => question.type === 'choice')
  const writtenQuestions = paper.questions.filter(question => question.type !== 'choice')
  const columns = chunk(choiceQuestions, ROWS_PER_COLUMN)
  const maxChoices = Math.max(4, ...choiceQuestions.map(question => question.choices))
  const examinee = isKeySheet ? '정답' : run.model

  const markedOf = question => {
    if (isKeySheet) return String(question.answer ?? '')
    if (visibleNos && !visibleNos.has(question.no)) return ''
    const entry = run.answers?.[question.no]
    if (!entry || entry.status !== 'answered') return ''
    const match = String(entry.answer).normalize('NFKC').match(/\d+/)
    return match ? String(Number(match[0])) : ''
  }

  const gradeKind = question => {
    if (isKeySheet || !showGrading) return null
    if (gradedNos && !gradedNos.has(question.no)) return null
    const item = itemByNo.get(question.no)
    if (!item || item.correct === null) return null
    return item.correct ? 'correct' : 'wrong'
  }

  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--color-omr)] bg-[#fffafb] shadow-[0_20px_40px_-28px_rgba(223,74,124,0.6)]">
        {/* 타이밍 마크 */}
        <div
          className="absolute left-0 top-0 bottom-0 w-3 sm:w-4"
          style={{ background: 'repeating-linear-gradient(to bottom, transparent 0 14px, #16161a 14px 20px)', opacity: 0.85 }}
          aria-hidden="true"
        />

        <div className="pl-6 sm:pl-8 pr-3 sm:pr-5 py-4 sm:py-5">
          {/* 머리 부분 */}
          <div className={`grid gap-3 sm:grid-cols-[1fr_auto] items-start border-b-2 border-[var(--color-omr)] pb-3 ${result && showGrading ? 'pr-24 sm:pr-32' : ''}`}>
            <div>
              <div className="flex items-baseline gap-2 text-[var(--color-omr)]">
                <span className="text-xl sm:text-2xl font-black tracking-[0.3em]">답 안 지</span>
                <span className="text-xs font-bold">OMR</span>
              </div>
              <div className="mt-1 text-sm font-semibold text-[var(--color-ink)] truncate">{paperTitle(paper)}</div>
            </div>
            <div className="grid grid-cols-[auto_1fr] text-xs border-[1.5px] border-[var(--color-omr)] rounded-md overflow-hidden min-w-[14rem]">
              <span className="px-2.5 py-1.5 bg-[var(--color-omr-soft)] text-[var(--color-omr)] font-bold border-r-[1.5px] border-[var(--color-omr)]">성명</span>
              <span className="px-3 py-0.5 font-hand text-2xl leading-7 text-[#1b2a6b] truncate">{examinee}</span>
              <span className="px-2.5 py-1.5 bg-[var(--color-omr-soft)] text-[var(--color-omr)] font-bold border-r-[1.5px] border-t-[1.5px] border-[var(--color-omr)]">과목</span>
              <span className="px-3 py-1.5 font-semibold border-t-[1.5px] border-[var(--color-omr)]">{paper.meta.subject}</span>
            </div>
          </div>

          {/* 객관식 */}
          {choiceQuestions.length > 0 && (
            <section className="mt-4" aria-label="객관식 답란">
              <div className="mb-2 text-xs font-bold text-[var(--color-omr)]">객관식 답란</div>
              <div className="grid gap-3 grid-cols-1 min-[440px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {columns.map((column, columnIndex) => (
                  <div key={columnIndex} className="border-[1.5px] border-[var(--color-omr)] rounded-md overflow-hidden bg-white/70">
                    <div className="grid grid-cols-[2.6rem_1fr] text-[0.68rem] font-bold text-[var(--color-omr)] bg-[var(--color-omr-soft)] border-b-[1.5px] border-[var(--color-omr)]">
                      <span className="py-1 text-center border-r-[1.5px] border-[var(--color-omr)]">문번</span>
                      <span className="py-1 text-center tracking-[0.4em]">답 란</span>
                    </div>
                    {column.map((question, rowIndex) => {
                      const marked = markedOf(question)
                      const kind = gradeKind(question)
                      const item = itemByNo.get(question.no)
                      const showKey = !isKeySheet && showGrading && kind === 'wrong'
                      return (
                        <div
                          key={question.no}
                          className={`grid grid-cols-[2.6rem_1fr] items-center transition-colors ${activeNo === question.no ? 'bg-amber-100/80' : ''} ${rowIndex % 5 === 4 ? 'border-b-[1.5px] border-[var(--color-omr)]' : 'border-b border-[var(--color-omr)]/25'} last:border-b-0`}
                        >
                          <div className="relative h-9 flex items-center justify-center border-r-[1.5px] border-[var(--color-omr)] text-sm font-extrabold text-[var(--color-ink)] tabular-nums">
                            {question.no}
                            <PenMark kind={kind} />
                          </div>
                          <div className="flex items-center justify-around px-1.5 h-9">
                            {Array.from({ length: maxChoices }, (_, index) => String(index + 1)).map(digit => (
                              Number(digit) > question.choices
                                ? <span key={digit} className="w-[18px]" />
                                : (
                                  <Bubble
                                    key={digit}
                                    digit={digit}
                                    filled={marked === digit}
                                    isKey={showKey && String(question.answer) === digit}
                                    disabled={!editable}
                                    label={`${question.no}번 ${digit}번 선지${marked === digit ? ' (마킹됨)' : ''}`}
                                    onClick={() => onAnswer?.(question.no, marked === digit ? '' : digit)}
                                  />
                                )
                            ))}
                          </div>
                          {item && item.status !== 'answered' && showGrading && (
                            <span className="sr-only">{item.status === 'parse_failed' ? '답 추출 실패' : '미기재'}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 단답형·서술형 */}
          {writtenQuestions.length > 0 && (
            <section className="mt-5" aria-label="주관식 답란">
              <div className="mb-2 text-xs font-bold text-[var(--color-omr)]">단답형 · 서술형 답란</div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {writtenQuestions.map(question => {
                  const item = itemByNo.get(question.no)
                  const kind = gradeKind(question)
                  const hidden = !isKeySheet && visibleNos && !visibleNos.has(question.no)
                  const text = isKeySheet ? question.answer : hidden ? '' : run.answers?.[question.no]?.answer ?? ''
                  const graded = !gradedNos || gradedNos.has(question.no)
                  const isEssay = question.type === 'essay'
                  return (
                    <div key={question.no} className={`relative grid grid-cols-[2.6rem_1fr] border-[1.5px] border-[var(--color-omr)] rounded-md transition-colors ${activeNo === question.no ? 'bg-amber-100/80' : 'bg-white/70'} ${isEssay ? 'sm:col-span-2' : ''}`}>
                      <div className="relative flex flex-col items-center justify-center border-r-[1.5px] border-[var(--color-omr)] py-2">
                        <span className="text-sm font-extrabold tabular-nums">{question.no}</span>
                        <span className="text-[0.6rem] font-bold text-[var(--color-omr)]">{isEssay ? '서술' : '단답'}</span>
                        <PenMark kind={isEssay ? null : kind} />
                      </div>
                      <div className="relative min-h-[2.75rem] px-3 py-1.5">
                        {editable ? (
                          isEssay
                            ? <textarea className="w-full bg-transparent font-hand text-xl leading-6 text-[#1b2a6b] outline-none resize-y min-h-16" value={text} placeholder="답 쓰기" onChange={e => onAnswer?.(question.no, e.target.value)} />
                            : <input className="w-full bg-transparent font-hand text-2xl text-[#1b2a6b] outline-none" value={text} placeholder="답 쓰기" onChange={e => onAnswer?.(question.no, e.target.value)} />
                        ) : (
                          <p className={`font-hand text-[#1b2a6b] whitespace-pre-wrap break-words ${isEssay ? 'text-xl leading-6' : 'text-2xl leading-8'}`}>
                            {text || (hidden ? null : <span className="text-[var(--color-ink-soft)]/60 text-lg">{isKeySheet ? '(모범답안 없음)' : '미기재'}</span>)}
                          </p>
                        )}
                        {showGrading && !isKeySheet && item && graded && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            {isEssay ? (
                              item.correct === null && item.status === 'answered'
                                ? <span className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-500">채점 대기</span>
                                : <span className="font-hand text-2xl text-[var(--color-pen)]">{item.earned} / {item.points}점</span>
                            ) : (
                              kind === 'wrong' && question.answer && <span className="font-hand text-xl text-[var(--color-pen)]">정답: {question.answer.split('|')[0]}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* 점수 도장 */}
      {result && showGrading && showStamp && (
        <div className="stamp absolute -top-3 right-3 sm:right-6 flex flex-col items-center justify-center w-[5.5rem] h-[5.5rem] sm:w-28 sm:h-28 rounded-full border-[3px] border-[var(--color-pen)] text-[var(--color-pen)] bg-white/85 backdrop-blur-[1px] shadow-sm" style={{ transform: 'rotate(-10deg)' }} aria-label={`점수 ${result.score}점`}>
          <span className="font-hand text-[2.4rem] sm:text-5xl leading-none">{Number.isInteger(result.score) ? result.score : result.score.toFixed(1)}</span>
          <span className="text-[0.62rem] font-bold -mt-0.5">/ {result.maxScore}점</span>
        </div>
      )}
    </div>
  )
}

/** @brief OMR 채점 표시 범례 */
export function OmrLegend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--color-ink-soft)]">
      <li className="flex items-center gap-1.5"><span className="inline-block w-3 h-[18px] rounded-[50%] bg-[#16161a]" /> 마킹한 답</li>
      <li className="flex items-center gap-1.5">
        <svg width="22" height="18" viewBox="0 0 40 32" aria-hidden="true"><ellipse cx="20" cy="16" rx="15" ry="12.5" fill="none" stroke="var(--color-pen)" strokeWidth="3" /></svg> 정답
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="22" height="18" viewBox="0 0 40 32" aria-hidden="true"><path d="M8 28 L33 3" stroke="var(--color-pen)" strokeWidth="3" /></svg> 오답·미기재
      </li>
      <li className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-[20px] rounded-[50%] border-2 border-dashed border-[var(--color-pen)]" /> 원래 정답 위치</li>
    </ul>
  )
}
