/**
 * @file CompactOmr.jsx
 * @brief 풀이 화면 오른쪽의 세로형 OMR 답안지
 * - 객관식: ①~⑤ 버블
 * - 단답형: 0~999 정수면 수능 답안지처럼 백·십·일의 자리 칸, 아니면 글자 칸
 * - 서술형: 한 줄 요약
 * - graded이면 문항마다 실제 정답과 비교한 ○/✕ 표시
 */

import { useEffect, useRef } from 'react'
import { normalizeChoice } from '@/lib/grading'

/** @brief 0~999 정수 답이면 세 자리 문자열 배열 */
function digitCells(answer) {
  const text = String(answer ?? '').normalize('NFKC').trim()
  if (!/^\d{1,3}$/.test(text)) return null
  return text.padStart(3, ' ').split('')
}

function Bubble({ digit, filled }) {
  return (
    <span className={`flex items-center justify-center w-[15px] h-[21px] rounded-[50%] text-[0.55rem] font-bold leading-none transition-colors duration-200 ${filled ? 'bg-[#16161a] text-[#16161a] scale-110' : 'border border-[var(--color-omr)] text-[var(--color-omr)]'}`}>
      {digit}
    </span>
  )
}

function GradeMark({ correct }) {
  if (correct === null || correct === undefined) return <span className="w-4" />
  return correct
    ? <span className="w-4 text-center text-[var(--color-pen)] font-black leading-none" aria-label="정답">○</span>
    : <span className="w-4 text-center text-[var(--color-pen)] font-black leading-none" aria-label="오답">✕</span>
}

/**
 * @param {Object} props
 * @param {Object} props.paper
 * @param {Object} props.answers - 지금까지 마킹된 답 { [no]: { answer, status } }
 * @param {number|null} props.currentNo
 * @param {Map<number, Object>|null} props.gradedItems - 채점 결과 (문항 번호 → gradeRun item)
 */
export default function CompactOmr({ paper, answers, currentNo, gradedItems = null, title = '답안지', onSelect = null }) {
  const listRef = useRef(null)
  const marked = paper.questions.filter(question => answers[question.no]).length

  // 현재 문항이 보이도록 스크롤
  useEffect(() => {
    if (currentNo == null || !listRef.current) return
    // 페이지 전체가 아니라 답안지 목록 안에서만 스크롤
    const list = listRef.current
    const row = list.querySelector(`[data-no="${currentNo}"]`)
    if (!row) return
    const top = row.offsetTop
    if (top < list.scrollTop + 8 || top + row.offsetHeight > list.scrollTop + list.clientHeight - 8) {
      list.scrollTo({ top: Math.max(0, top - list.clientHeight / 2), behavior: 'smooth' })
    }
  }, [currentNo])

  return (
    <div className="flex h-full flex-col rounded-2xl border-[1.5px] border-[var(--color-omr)] bg-[#fffafb] overflow-hidden">
      <div className="flex items-center justify-between border-b-[1.5px] border-[var(--color-omr)] px-3 py-2">
        <span className="text-sm font-black tracking-[0.2em] text-[var(--color-omr)]">{title}</span>
        <span className="font-mono text-xs font-bold tabular-nums text-[var(--color-ink-soft)]">{String(marked).padStart(2, '0')} / {paper.questions.length}</span>
      </div>
      {onSelect && <div className="border-b border-[var(--color-omr)]/30 px-3 py-1 text-[0.65rem] text-[var(--color-ink-soft)]">번호를 누르면 그 문항의 문제와 풀이를 봅니다</div>}
      <ol ref={listRef} className="relative flex-1 overflow-y-auto px-2 py-1.5">
        {paper.questions.map(question => {
          const entry = answers[question.no]
          const answer = entry?.status === 'answered' ? entry.answer : ''
          const item = gradedItems?.get(question.no)
          const active = currentNo === question.no
          return (
            <li
              key={question.no}
              data-no={question.no}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={onSelect ? `${question.no}번 문항 보기${answer ? ` (마킹: ${answer})` : ''}` : undefined}
              title={onSelect ? '이 문항의 문제와 풀이 보기' : undefined}
              onClick={onSelect ? () => onSelect(question.no) : undefined}
              onKeyDown={onSelect ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(question.no) } } : undefined}
              className={`flex items-center gap-1.5 rounded-md px-1.5 py-[3px] transition-colors ${active ? 'bg-amber-100 ring-1 ring-amber-300' : ''} ${onSelect ? 'cursor-pointer hover:bg-[var(--color-omr-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]' : ''}`}
            >
              <span className="w-6 text-right font-mono text-[0.7rem] font-bold tabular-nums text-[var(--color-ink)]">{question.no}</span>
              <span className="flex flex-1 items-center gap-[5px] min-w-0">
                {question.type === 'choice' && Array.from({ length: question.choices }, (_, index) => String(index + 1)).map(digit => (
                  <Bubble key={digit} digit={digit} filled={normalizeChoice(answer) === digit} />
                ))}
                {question.type === 'short' && (() => {
                  const cells = digitCells(answer)
                  if (cells || !answer) {
                    return (cells ?? [' ', ' ', ' ']).map((digit, index) => (
                      <span key={index} className="flex h-[19px] w-[19px] items-center justify-center rounded-[3px] border border-[var(--color-omr)]/70 bg-white font-mono text-[0.72rem] font-bold text-[#16161a]">
                        {digit.trim()}
                      </span>
                    ))
                  }
                  return <span className="truncate rounded-[3px] border border-[var(--color-omr)]/70 bg-white px-1.5 font-hand text-base leading-[19px] text-[#1b2a6b]">{answer}</span>
                })()}
                {question.type === 'essay' && (
                  <span className={`truncate rounded-[3px] border border-dashed border-[var(--color-omr)]/70 bg-white px-1.5 font-hand text-sm leading-[19px] ${answer ? 'text-[#1b2a6b]' : 'text-transparent'}`}>
                    {answer || '서술'}
                  </span>
                )}
              </span>
              <GradeMark correct={item ? item.correct : undefined} />
            </li>
          )
        })}
      </ol>
    </div>
  )
}
