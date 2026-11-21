/**
 * @file GradeSheet.jsx
 * @brief 풀이가 끝난 뒤의 "채점 완료" 화면 - 실제 정답과 비교한 유형별 점수와 틀린 문항
 */

import { formatRate } from '@/lib/grading'
import { QUESTION_TYPES } from '@/lib/schema'
import { formatDuration } from '@/lib/replay'

const CIRCLED = ['①', '②', '③', '④', '⑤']

function show(type, value) {
  const text = String(value ?? '').trim()
  if (!text) return '—'
  if (type === 'choice') {
    const digit = Number(text.normalize('NFKC').match(/\d+/)?.[0])
    return CIRCLED[digit - 1] ?? text
  }
  const first = text.split('|')[0]
  return first.length > 14 ? `${first.slice(0, 14)}…` : first
}

function fmt(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export default function GradeSheet({ paper, run, result, onReplay, onClose }) {
  const types = Object.keys(QUESTION_TYPES).filter(type => result.byType[type])
  const wrong = result.items.filter(item => item.correct === false)
  const uploaded = paper.answerKeySource?.type === 'upload'

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-xs font-bold tracking-[0.3em] text-[var(--color-ink-soft)]">채점 완료</div>
        <div className="mt-1 text-lg font-extrabold">{run.model}</div>
        <div className="text-xs text-[var(--color-ink-soft)]">
          {uploaded ? '업로드한 실제 정답' : '직접 입력한 정답'} 기준 · {result.correct}/{result.total}문항 정답
          {run.durationMs ? ` · ${formatDuration(run.durationMs)}` : ''}
        </div>
      </div>

      {/* 유형별 큰 점수 */}
      <div className={`grid gap-3 ${types.length >= 3 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
        {types.map(type => {
          const value = result.byType[type]
          const count = result.items.filter(item => item.type === type)
          return (
            <div key={type} className="rounded-2xl bg-white border border-[var(--color-line)] px-3 py-4 text-center">
              <div className="text-xs font-bold text-[var(--color-ink-soft)]">{QUESTION_TYPES[type]} · {type === 'essay' ? '만점 ' : ''}{count.filter(item => item.correct).length}/{count.length}</div>
              <div className="mt-1 font-mono font-black tracking-tight leading-none">
                <span className="text-4xl sm:text-5xl">{fmt(value.earned)}</span>
                <span className="text-sm text-[var(--color-ink-soft)]">/{fmt(value.max)}</span>
              </div>
            </div>
          )
        })}
        <div className="rounded-2xl bg-[var(--color-brand)] text-white px-3 py-4 text-center">
          <div className="text-xs font-bold opacity-80">총점 · {formatRate(result.rate)}</div>
          <div className="mt-1 font-mono font-black tracking-tight leading-none">
            <span className="text-4xl sm:text-5xl">{fmt(result.score)}</span>
            <span className="text-sm opacity-80">/{fmt(result.maxScore)}</span>
          </div>
        </div>
      </div>

      {/* 문항별 대조표 */}
      <div className="rounded-2xl border border-[var(--color-line)] bg-white p-3">
        <div className="mb-2 flex items-center justify-between text-xs font-bold text-[var(--color-ink-soft)]">
          <span>모델 답 ↔ 실제 정답</span>
          <span className="font-mono">{result.total} / {result.total}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1">
          {result.items.map((item, index) => (
            <div
              key={item.no}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs opacity-0 animate-[fadein_0.25s_ease-out_forwards]"
              style={{ animationDelay: `${index * 25}ms` }}
            >
              <span className="w-6 text-right font-mono font-bold tabular-nums">{item.no}</span>
              {item.type === 'essay' && item.status === 'answered' ? (
                <>
                  <span className="font-semibold">서술</span>
                  <span className="font-mono">{item.correct === null ? '채점 대기' : `${fmt(item.earned)}/${fmt(item.points)}점`}</span>
                  <span className="ml-auto font-black text-[var(--color-pen)]">{item.correct === null ? '·' : item.correct ? '○' : item.earned > 0 ? '△' : '✕'}</span>
                </>
              ) : (
                <>
                  <span className={`font-semibold ${item.correct === false ? 'text-[var(--color-pen)] line-through decoration-1' : ''}`}>{item.status === 'answered' ? show(item.type, item.given) : '무응답'}</span>
                  {item.correct === false && <span className="text-[var(--color-ok)] font-bold">→ {show(item.type, item.expected)}</span>}
                  <span className="ml-auto font-black text-[var(--color-pen)]">{item.correct === null ? '·' : item.correct ? '○' : '✕'}</span>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {wrong.length === 0 && result.pendingEssays === 0 ? (
        <p className="text-center font-hand text-3xl text-[var(--color-pen)]">마킹까지, 전부 맞았다.</p>
      ) : (
        <p className="text-center text-sm text-[var(--color-ink-soft)]">
          틀린 문항 {wrong.length}개{result.pendingEssays ? ` · 서술형 채점 대기 ${result.pendingEssays}개 (OMR 탭에서 점수 입력)` : ''}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-primary" onClick={onReplay}>↺ 처음부터 다시 보기</button>
        <a className="btn btn-ghost" href={`#/paper/${paper.id}?tab=perf`}>성능 평가 보기</a>
        {onClose && <button type="button" className="btn btn-ghost" onClick={onClose}>답안지 보기</button>}
      </div>
    </div>
  )
}
