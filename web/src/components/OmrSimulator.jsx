/**
 * @file OmrSimulator.jsx
 * @brief LLM 풀이 시뮬레이션 뷰어
 * 1단계: 모델이 문항을 하나씩 풀어 OMR에 마킹 (측정한 수행 시간을 문항별로 나눠 시계 표시)
 * 2단계: 실제 정답과 비교해 한 문항씩 빨간 펜으로 채점 → 점수 도장
 */

import { useEffect, useMemo, useState } from 'react'
import { buildTimeline, formatClock, formatDuration, playbackDelay, progressAt } from '@/lib/simulation'
import { formatRate } from '@/lib/grading'
import OmrCard from './OmrCard'

const SPEEDS = [0.5, 1, 2, 4]
const CIRCLED = ['①', '②', '③', '④', '⑤']

function displayAnswer(step) {
  if (step.status !== 'answered') return step.status === 'parse_failed' ? '답 추출 실패' : '무응답'
  if (step.type === 'choice') {
    const digit = Number(String(step.answer).match(/\d+/)?.[0])
    return CIRCLED[digit - 1] ?? step.answer
  }
  const text = String(step.answer)
  return text.length > 18 ? `${text.slice(0, 18)}…` : text
}

/** @brief 진행 로그 한 줄 */
function logLine(step) {
  if (step.phase === 'mark') {
    return { key: `m${step.no}`, tone: step.status === 'answered' ? 'ink' : 'pen', text: `${step.no}번 ${displayAnswer(step)} ${step.status === 'answered' ? '마킹' : ''}`, meta: formatDuration(step.simMs) }
  }
  if (step.correct === null) return { key: `g${step.no}`, tone: 'soft', text: `${step.no}번 서술형 채점 대기`, meta: '' }
  if (step.type === 'essay') {
    return { key: `g${step.no}`, tone: step.correct ? 'ok' : 'ink', text: `${step.no}번 서술형 ${step.earned}/${step.points}점`, meta: step.earned ? `+${step.earned}점` : '0점' }
  }
  return {
    key: `g${step.no}`,
    tone: step.correct ? 'ok' : 'pen',
    text: `${step.no}번 ${step.correct ? '정답 ○' : `오답 ╱${step.expected ? ` (정답 ${step.type === 'choice' ? CIRCLED[Number(step.expected) - 1] ?? step.expected : String(step.expected).split('|')[0]})` : ''}`}`,
    meta: step.earned ? `+${step.earned}점` : '0점'
  }
}

export default function OmrSimulator({ paper, runs, initialRunId }) {
  const [runId, setRunId] = useState(initialRunId && runs.some(run => run.id === initialRunId) ? initialRunId : runs[0]?.id)
  const run = runs.find(item => item.id === runId) ?? null
  const timeline = useMemo(() => (run ? buildTimeline(paper, run) : null), [paper, run])
  const [done, setDone] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  const total = timeline?.steps.length ?? 0
  const progress = useMemo(() => (timeline ? progressAt(timeline, done) : null), [timeline, done])
  const finished = done >= total && total > 0
  const current = timeline?.steps[Math.min(done, total - 1)]
  const phase = !timeline ? 'idle' : done < timeline.markCount ? 'mark' : finished ? 'done' : 'grade'

  // 재생: 다음 단계까지 기다렸다가 한 칸 진행
  useEffect(() => {
    if (!playing || !timeline || done >= total) return undefined
    const timer = setTimeout(() => setDone(value => value + 1), playbackDelay(timeline.steps[done], timeline, speed))
    return () => clearTimeout(timer)
  }, [playing, done, timeline, total, speed])

  const choose = id => { setRunId(id); setDone(0); setPlaying(false) }
  const togglePlay = () => {
    if (finished) { setDone(0); setPlaying(true); return }
    setPlaying(value => !value)
  }

  if (!runs.length) {
    return (
      <div className="card px-6 py-14 text-center">
        <p className="text-lg font-extrabold">시뮬레이션할 풀이가 없습니다</p>
        <p className="mt-1 text-[var(--color-ink-soft)]">‘결과’ 탭에서 AI로 풀거나 결과를 가져오면 마킹·채점 과정을 재생할 수 있습니다.</p>
        <a href={`#/paper/${paper.id}?tab=results`} className="btn btn-primary mt-5">풀이 추가하러 가기</a>
      </div>
    )
  }

  const log = timeline.steps.slice(0, done).map(logLine).reverse().slice(0, 9)
  const markPct = Math.min(1, done / timeline.markCount)
  const gradePct = Math.max(0, Math.min(1, (done - timeline.markCount) / timeline.markCount))
  const playing_ = playing && !finished

  return (
    <div className="space-y-5">
      {/* 모델 선택 */}
      <div className="card p-3 sm:p-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-[var(--color-ink-soft)] mr-1">풀이 선택</span>
        {runs.map(item => (
          <button key={item.id} type="button" onClick={() => choose(item.id)} aria-pressed={item.id === runId} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold border ${item.id === runId ? 'bg-[var(--color-ink)] text-white border-[var(--color-ink)]' : 'bg-white border-[var(--color-line)]'}`}>
            {item.model}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
        <div className="space-y-4 min-w-0">
          {/* 조작부 */}
          <div className="card p-3 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary min-w-[6.5rem]" onClick={togglePlay}>
                {playing_ ? '⏸ 일시정지' : finished ? '↺ 다시 재생' : done ? '▶ 이어서' : '▶ 재생'}
              </button>
              <button type="button" className="btn btn-ghost !px-3" onClick={() => { setPlaying(false); setDone(value => Math.max(0, value - 1)) }} disabled={!done} aria-label="한 단계 뒤로">◀</button>
              <button type="button" className="btn btn-ghost !px-3" onClick={() => { setPlaying(false); setDone(value => Math.min(total, value + 1)) }} disabled={finished} aria-label="한 단계 앞으로">▶</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setPlaying(false); setDone(timeline.markCount) }}>풀이 끝으로</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setPlaying(false); setDone(total) }}>결과 보기</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setPlaying(false); setDone(0) }} disabled={!done}>처음으로</button>
              <div className="segmented ml-auto" role="group" aria-label="재생 속도">
                {SPEEDS.map(value => (
                  <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}×</button>
                ))}
              </div>
            </div>

            {/* 단계별 진행 막대 */}
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <div>
                <div className="flex justify-between mb-1"><span>1단계 · 풀이·마킹</span><span className="tabular-nums">{progress.marked}/{timeline.markCount}</span></div>
                <div className="h-2 rounded-full bg-[#ece7db] overflow-hidden"><div className="h-full bg-[var(--color-ink)] transition-[width] duration-150" style={{ width: `${markPct * 100}%` }} /></div>
              </div>
              <div>
                <div className="flex justify-between mb-1"><span>2단계 · 정답 비교·채점</span><span className="tabular-nums">{progress.graded}/{timeline.markCount}</span></div>
                <div className="h-2 rounded-full bg-[#ece7db] overflow-hidden"><div className="h-full bg-[var(--color-pen)] transition-[width] duration-150" style={{ width: `${gradePct * 100}%` }} /></div>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max={total}
              value={done}
              onChange={e => { setPlaying(false); setDone(Number(e.target.value)) }}
              className="w-full accent-[var(--color-brand)]"
              aria-label="시뮬레이션 위치"
            />
          </div>

          <OmrCard
            paper={paper}
            run={run}
            showGrading
            visibleNos={progress.visibleNos}
            gradedNos={progress.gradedNos}
            activeNo={finished ? null : current?.no}
            showStamp={finished}
          />
        </div>

        {/* 상황판 */}
        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="card p-4">
            <div className="text-xs font-bold text-[var(--color-ink-soft)]">
              {phase === 'mark' ? `${current?.no}번 푸는 중` : phase === 'grade' ? `${current?.no}번 채점 중` : phase === 'done' ? '채점 완료' : '대기'}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tabular-nums tracking-tight">{formatClock(progress.simClockMs)}</span>
              <span className="text-sm text-[var(--color-ink-soft)]">/ {formatClock(timeline.totalSimMs)}</span>
            </div>
            <div className="mt-1 text-xs text-[var(--color-ink-soft)]">
              {timeline.measured ? `실제 수행 시간(${formatDuration(timeline.totalSimMs)})을 문항 유형별로 나눠 표시` : '수행 시간 기록이 없어 문항 유형별 추정 시간으로 표시'}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-[var(--color-ink-soft)]">마킹</dt><dd className="font-extrabold tabular-nums">{progress.answered} <span className="font-normal text-xs">/ {progress.marked}</span></dd></div>
              <div><dt className="text-xs text-[var(--color-ink-soft)]">무응답</dt><dd className="font-extrabold tabular-nums text-[var(--color-pen)]">{progress.marked - progress.answered}</dd></div>
              <div><dt className="text-xs text-[var(--color-ink-soft)]">현재 점수</dt><dd className="font-extrabold tabular-nums">{progress.score}<span className="font-normal text-xs"> / {progress.maxGraded}</span></dd></div>
              <div><dt className="text-xs text-[var(--color-ink-soft)]">정확도</dt><dd className="font-extrabold tabular-nums">{progress.decided ? formatRate(progress.correct / progress.decided) : '—'}</dd></div>
            </dl>
            {finished && (
              <div className="mt-4 rounded-xl bg-[var(--color-brand-soft)] p-3 text-sm">
                <b>{run.model}</b>: {timeline.result.score}/{timeline.result.maxScore}점, {timeline.result.correct}/{timeline.result.total}문항 정답
                {timeline.measured && <>, {formatDuration(timeline.totalSimMs)} 소요</>}
                {timeline.result.pendingEssays > 0 && <span className="block mt-1 text-xs text-[var(--color-ink-soft)]">서술형 {timeline.result.pendingEssays}문항은 OMR 탭에서 점수를 입력해야 반영됩니다.</span>}
              </div>
            )}
          </div>

          <div className="card p-4">
            <div className="text-xs font-bold text-[var(--color-ink-soft)] mb-2">진행 기록</div>
            {log.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-soft)]">재생을 누르면 마킹과 채점 과정이 여기에 기록됩니다.</p>
            ) : (
              <ol className="space-y-1" aria-live="polite">
                {log.map((line, index) => (
                  <li key={line.key} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm ${index === 0 ? 'bg-amber-50' : ''}`}>
                    <span className={line.tone === 'ok' ? 'text-[var(--color-ok)] font-semibold' : line.tone === 'pen' ? 'text-[var(--color-pen)] font-semibold' : line.tone === 'soft' ? 'text-[var(--color-ink-soft)]' : ''}>{line.text}</span>
                    <span className="shrink-0 text-xs tabular-nums text-[var(--color-ink-soft)]">{line.meta}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
