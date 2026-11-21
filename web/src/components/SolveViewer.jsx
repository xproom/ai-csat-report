/**
 * @file SolveViewer.jsx
 * @brief AI 풀이 보기 - 문제지를 AI 시점에서 실제 속도로 풀며 OMR에 마킹하고, 끝나면 실제 정답과 비교해 채점
 *
 * 왼쪽: 문제지 쪽 + AI가 써 내려가는 풀이 노트 + 생각 자막
 * 오른쪽: 세로형 OMR 답안지 (현재 문항 강조, 답이 정해지는 순간 마킹)
 * 끝: 채점 완료 화면 (유형별 점수, 모델 답 ↔ 실제 정답)
 *
 * - 실시간: Claude가 문항마다 스트리밍으로 풀이 (API 키 필요), 끝나면 기록이 저장되어 언제든 다시 재생
 * - 다시 보기: 저장된 풀이를 실제 속도(또는 배속)로 재생. 실시간 기록이 없는 풀이는 추정 시간으로 재생
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { CLAUDE_MODELS, EFFORT_LEVELS } from '@/lib/aiRunner'
import { db } from '@/lib/db'
import { gradeRun } from '@/lib/grading'
import { runLiveSolve } from '@/lib/liveSolve'
import { buildReplay, formatClock, formatDuration, stateAt } from '@/lib/replay'
import { QUESTION_TYPES, paperTitle } from '@/lib/schema'
import { getApiKey } from '@/lib/settings'
import { useStore } from '@/lib/store'
import CompactOmr from './CompactOmr'
import GradeSheet from './GradeSheet'
import PageView from './PageView'

const SPEEDS = [1, 2, 4, 8, 16]
const CIRCLED = ['①', '②', '③', '④', '⑤']

/** @brief 페이지 정보가 없을 때 문항 순서로 파일을 짐작 (사진 여러 장 업로드용) */
function guessPage(paper, files, no) {
  if (files.length <= 1) return { file: 0, page: 1 }
  const index = paper.questions.findIndex(question => question.no === no)
  return { file: Math.min(files.length - 1, Math.floor((Math.max(0, index) / paper.questions.length) * files.length)), page: 1 }
}

export default function SolveViewer({ paper, runs, files, initialRunId }) {
  const { refresh, notify } = useStore()
  const sortedRuns = useMemo(() => [...runs].sort((a, b) => (b.trace ? 1 : 0) - (a.trace ? 1 : 0)), [runs])
  const [runId, setRunId] = useState(() => (initialRunId && runs.some(run => run.id === initialRunId) ? initialRunId : sortedRuns[0]?.id))
  const run = runs.find(item => item.id === runId) ?? null

  // 재생 상태
  const [clock, setClock] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [showSheet, setShowSheet] = useState(true)

  // 실시간 풀이 상태
  const [model, setModel] = useState(CLAUDE_MODELS[0].id)
  const [effort, setEffort] = useState('medium')
  const [live, setLive] = useState(null) // { events, answers, error }
  const liveRef = useRef({ lastT: 0, lastAt: 0, controller: null })
  const apiKey = getApiKey()
  const isLive = Boolean(live && !live.finished)

  const replay = useMemo(() => {
    if (live) return { events: live.events, totalMs: Number.POSITIVE_INFINITY, measured: true, live: true }
    return run ? buildReplay(paper, run) : null
  }, [live, run, paper])
  const total = replay && Number.isFinite(replay.totalMs) ? replay.totalMs : 0

  // 재생 시계 (requestAnimationFrame)
  useEffect(() => {
    if (!playing && !isLive) return undefined
    let frame
    let last = performance.now()
    const tick = now => {
      if (isLive) {
        const { lastT, lastAt } = liveRef.current
        setClock(lastAt ? lastT + (now - lastAt) : 0)
      } else {
        const delta = (now - last) * speed
        setClock(value => {
          const next = Math.min(total, value + delta)
          if (next >= total) setPlaying(false)
          return next
        })
      }
      last = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, isLive, speed, total])

  const view = useMemo(() => (replay ? stateAt(replay, clock) : null), [replay, clock])
  const done = Boolean(view?.done && !live)

  const shownAnswers = useMemo(() => {
    if (live) return live.answers
    if (!run || !view) return {}
    return Object.fromEntries([...view.answeredNos].map(no => [no, run.answers?.[no]]).filter(([, entry]) => entry))
  }, [live, run, view])

  const result = useMemo(() => (run && done ? gradeRun(paper, run) : null), [run, done, paper])
  const gradedItems = useMemo(() => (result ? new Map(result.items.map(item => [item.no, item])) : null), [result])

  const choose = id => {
    setRunId(id)
    setClock(0)
    setPlaying(false)
    setShowSheet(true)
  }

  const togglePlay = () => {
    if (done) { setClock(0); setPlaying(true); return }
    setPlaying(value => !value)
  }

  const startLive = async () => {
    const controller = new AbortController()
    liveRef.current = { lastT: 0, lastAt: 0, controller }
    setPlaying(false)
    setClock(0)
    setLive({ events: [], answers: {}, error: '', finished: false })
    try {
      const saved = await runLiveSolve({
        apiKey,
        model,
        effort,
        paper,
        files,
        signal: controller.signal,
        onEvent: event => {
          liveRef.current.lastT = event.t
          liveRef.current.lastAt = performance.now()
          setLive(prev => {
            if (!prev) return prev
            const answers = event.kind === 'answer' ? { ...prev.answers, [event.no]: { answer: event.text, status: 'answered' } } : prev.answers
            return { ...prev, events: [...prev.events, event], answers }
          })
        }
      })
      await db.saveRun(saved)
      await refresh()
      notify(saved.note ? `풀이를 멈췄습니다. 푼 문항까지 저장했습니다.` : `${saved.model} 풀이를 마쳤습니다.`)
      setLive(null)
      setRunId(saved.id)
      setClock(saved.durationMs)
      setShowSheet(true)
    } catch (error) {
      setLive(prev => ({ ...(prev ?? { events: [], answers: {} }), error: error?.message || '풀이에 실패했습니다.', finished: true }))
    }
  }

  const currentQuestion = paper.questions.find(question => question.no === view?.currentNo)
  const pageRef = view?.page ?? (view?.currentNo != null ? guessPage(paper, files, view.currentNo) : { file: 0, page: 1 })
  const solved = live ? new Set(live.events.filter(event => event.kind === 'end').map(event => event.no)).size : view?.solvedCount ?? 0

  return (
    <div className="space-y-4">
      {/* 실행 / 재생 조작부 */}
      <div className="card p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-[var(--color-ink-soft)]">{isLive ? 'AI가 푸는 중' : '풀이 기록'}</div>
            {isLive ? (
              <div className="mt-1 flex items-center gap-2 font-extrabold">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-pen)] animate-pulse" />
                {CLAUDE_MODELS.find(item => item.id === model)?.label} · 실시간
              </div>
            ) : (
              <select className="input mt-1 !py-1.5 font-semibold" value={runId ?? ''} onChange={e => choose(e.target.value)} disabled={!runs.length} aria-label="재생할 풀이">
                {!runs.length && <option value="">아직 풀이가 없습니다</option>}
                {sortedRuns.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.model}{item.trace ? ' · 실제 속도 기록' : ''}{item.durationMs ? ` · ${formatDuration(item.durationMs)}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl sm:text-4xl font-black tabular-nums tracking-tight leading-none">{formatClock(clock, true)}</div>
            <div className="mt-1 font-mono text-xs text-[var(--color-ink-soft)] tabular-nums">
              {String(solved).padStart(2, '0')} / {paper.questions.length}문항
              {!isLive && total ? ` · 전체 ${formatClock(total)}` : ''}
            </div>
          </div>
        </div>

        {!isLive && run && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary min-w-[6.5rem]" onClick={togglePlay}>
                {playing ? '⏸ 일시정지' : done ? '↺ 다시 재생' : clock ? '▶ 이어서' : '▶ 재생'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setPlaying(false); setClock(total) }}>채점 결과로</button>
              <div className="segmented ml-auto" role="group" aria-label="재생 속도">
                {SPEEDS.map(value => (
                  <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value === 1 ? '실제 속도' : `${value}×`}</button>
                ))}
              </div>
            </div>
            <input
              type="range"
              min="0"
              max={total}
              step="100"
              value={Math.min(clock, total)}
              onChange={e => { setPlaying(false); setClock(Number(e.target.value)) }}
              className="w-full accent-[var(--color-brand)]"
              aria-label="재생 위치"
            />
            {!replay?.live && (
              <p className="text-xs text-[var(--color-ink-soft)]">
                이 풀이는 문항별 시각 기록이 없어 {run.durationMs ? `전체 시간(${formatDuration(run.durationMs)})을 문항 유형별로 나눈` : '추정한'} 속도로 재생합니다. 아래에서 실시간으로 풀면 실제 속도가 기록됩니다.
              </p>
            )}
          </>
        )}

        {/* 실시간 풀이 시작 */}
        <details className="rounded-xl bg-[var(--color-brand-soft)]/60 px-3 py-2" open={!runs.length || isLive}>
          <summary className="cursor-pointer text-sm font-bold">AI에게 실시간으로 풀게 하기</summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="field-label">모델</span>
              <select className="input !w-auto" value={model} onChange={e => setModel(e.target.value)} disabled={isLive}>
                {CLAUDE_MODELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="field-label">추론 강도</span>
              <select className="input !w-auto" value={effort} onChange={e => setEffort(e.target.value)} disabled={isLive}>
                {EFFORT_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
              </select>
            </label>
            {isLive
              ? <button type="button" className="btn btn-danger" onClick={() => liveRef.current.controller?.abort()}>■ 멈추기</button>
              : <button type="button" className="btn btn-primary" disabled={!apiKey || !files.length} onClick={startLive}>● 실시간 풀이 시작</button>}
          </div>
          <p className="mt-2 text-xs text-[var(--color-ink-soft)] leading-relaxed">
            문항마다 한 번씩 요청해 문항별 실제 시간을 잽니다. 문제지는 첫 요청 뒤 캐시되어 다음 문항부터 입력 비용이 크게 줄어듭니다.
            {!apiKey && <> <a href="#/settings" className="font-bold underline">설정</a>에서 API 키를 먼저 입력하세요.</>}
            {apiKey && !files.length && <> 먼저 문제지 파일을 올려 주세요.</>}
          </p>
          {live?.error && <p className="mt-2 text-sm text-[var(--color-pen)]">{live.error} <button type="button" className="underline" onClick={() => setLive(null)}>닫기</button></p>}
        </details>
      </div>

      {!run && !live ? (
        <div className="card px-6 py-14 text-center">
          <p className="text-lg font-extrabold">아직 볼 수 있는 풀이가 없습니다</p>
          <p className="mt-1 text-[var(--color-ink-soft)]">위에서 AI에게 실시간으로 풀게 하거나, ‘결과’ 탭에서 풀이를 추가하세요.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] items-start">
          {/* 무대: 문제지 + 풀이 노트 + 자막 */}
          <div className="card overflow-hidden p-0">
            {done && showSheet && result ? (
              <div className="p-4 sm:p-6">
                <GradeSheet paper={paper} run={run} result={result} onReplay={() => { setClock(0); setPlaying(true) }} onClose={() => setShowSheet(false)} />
              </div>
            ) : (
              <div className="relative">
                <div className="relative max-h-[72vh] min-h-[22rem] overflow-hidden bg-white pt-12">
                  <PageView
                    files={files}
                    pageRef={pageRef}
                    placeholder={(
                      <div className="flex min-h-[22rem] flex-col items-center justify-center gap-2 bg-[#fbfaf6] px-6 py-10 text-center">
                        <div className="text-xs font-bold text-[var(--color-ink-soft)]">{paperTitle(paper)}</div>
                        <div className="font-serif text-6xl font-extrabold">{currentQuestion ? `${currentQuestion.no}.` : '—'}</div>
                        <div className="text-sm text-[var(--color-ink-soft)]">문제지 파일이 없는 평가지라 문항 번호만 표시합니다</div>
                      </div>
                    )}
                  />

                  {/* 현재 문항 배지 */}
                  {currentQuestion && (
                    <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-3 py-1 text-xs font-bold text-white shadow">
                      <span>{currentQuestion.no}번</span>
                      <span className="opacity-70">{QUESTION_TYPES[currentQuestion.type]} · {currentQuestion.points}점</span>
                      <span className="font-mono tabular-nums opacity-90">{formatClock(view.questionElapsedMs, true)}</span>
                    </div>
                  )}

                  {/* 풀이 노트 (손글씨) */}
                  {view?.notes.length > 0 && (
                    <div className="absolute inset-x-3 bottom-14 sm:inset-x-6 max-h-[45%] overflow-hidden rounded-xl border border-[var(--color-line)] bg-[#fffdf6]/95 px-4 py-3 shadow-lg backdrop-blur-[2px]">
                      <ol className="space-y-0.5">
                        {view.notes.filter(note => note.kind !== 'step').slice(-6).map((note, index) => (
                          <li key={index} className={`font-hand leading-7 break-words ${note.kind === 'answer' ? 'text-3xl text-[var(--color-pen)]' : 'text-2xl text-[#1b2a6b]'}`}>
                            {note.kind === 'answer'
                              ? `답: ${currentQuestion?.type === 'choice' ? CIRCLED[Number(String(note.text).match(/\d+/)?.[0]) - 1] ?? note.visible : note.visible}`
                              : note.visible}
                            {note.writing && <span className="ml-0.5 inline-block h-6 w-[2px] translate-y-1 animate-pulse bg-[#1b2a6b]" />}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* 자막 */}
                  {view?.caption && (
                    <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
                      <span className={`max-w-[95%] rounded-md px-3 py-1.5 text-center text-sm sm:text-base font-semibold leading-snug ${view.caption.kind === 'think' ? 'bg-black/55 text-white/85' : 'bg-black/80 text-white'}`}>
                        {view.caption.kind === 'think' && <span className="mr-1 text-xs opacity-70">생각 중 ·</span>}
                        {view.caption.text}
                      </span>
                    </div>
                  )}
                </div>
                {done && !showSheet && (
                  <div className="border-t border-[var(--color-line)] p-3 text-center">
                    <button type="button" className="btn btn-primary" onClick={() => setShowSheet(true)}>채점 결과 보기</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* OMR 답안지 */}
          <div className="h-[min(72vh,40rem)] lg:sticky lg:top-24">
            <CompactOmr paper={paper} answers={shownAnswers} currentNo={view?.currentNo ?? null} gradedItems={gradedItems} />
          </div>
        </div>
      )}
    </div>
  )
}
