/**
 * @file PaperPage.jsx
 * @brief 평가지 상세 - 표지 / 문제지 / 정답·배점 / 검증 / AI 풀이 / 채점 결과(성적표·OMR 답안지·문항 통계) 탭
 */

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import AnswerKeyEditor from '@/components/AnswerKeyEditor'
import AnswerKeyUpload from '@/components/AnswerKeyUpload'
import CoverOptionsForm from '@/components/CoverOptionsForm'
import { FileUploader, PaperViewer } from '@/components/FileUploader'
import OmrCard, { OmrLegend } from '@/components/OmrCard'
import SolveViewer from '@/components/SolveViewer'
import PaperCover from '@/components/PaperCover'
import RunPanel from '@/components/RunPanel'
import VerifyPanel, { LevelBadge } from '@/components/VerifyPanel'
import { applyAnswerKeyText } from '@/lib/answerKey'
import { db, getBackend } from '@/lib/db'
import { formatRate, gradeRun, questionStats } from '@/lib/grading'
import { makeId, paperTitle, QUESTION_TYPES } from '@/lib/schema'
import { navigate, useStore } from '@/lib/store'
import { useAutosave } from '@/lib/useAutosave'
import { checkCounts, validateStored } from '@/lib/verify'

// 그래프 도구는 채점 결과를 볼 때만 내려받음
const RateChart = lazy(() => import('@/components/RateChart'))

const TABS = [
  ['cover', '표지'],
  ['paper', '문제지'],
  ['key', '정답·배점'],
  ['check', '검증'],
  ['sim', 'AI 풀이'],
  ['results', '채점 결과']
]

/** @brief 현재 시각(ms) - 이벤트 처리 중에만 호출 */
const currentTime = () => Date.now()

const SOURCE_LABEL = { ai: 'AI 실행', manual: '직접 입력', import: '가져옴' }

export default function PaperPage({ paperId, tab: requestedTab, runId, edit }) {
  // 예전 "OMR 채점" 탭 주소(tab=omr)는 채점 결과 탭으로 (OMR 답안지가 채점 결과 안에 있음)
  const tab = requestedTab === 'omr' ? 'results' : requestedTab
  const { papers, runs: allRuns, refresh, applyPaper, notify } = useStore()
  const stored = papers.find(item => item.id === paperId)
  // 사용자가 고친 내용만 draft에 담고, 고치기 전에는 저장된 평가지를 그대로 보여줌
  const [draft, setDraft] = useState(null)
  const paper = draft ?? stored ?? null
  const setPaper = next => setDraft(prev => (typeof next === 'function' ? next(prev ?? stored) : next))
  const [files, setFiles] = useState([])
  // 정답·배점 탭에서 올렸지만 아직 반영하지 않은 정답표
  const [pendingKey, setPendingKey] = useState(null)
  const runs = useMemo(() => allRuns.filter(run => run.paperId === paperId), [allRuns, paperId])

  useEffect(() => {
    let cancelled = false
    db.listFiles(paperId)
      .then(list => { if (!cancelled) setFiles([...list].sort((a, b) => a.order - b.order)) })
      .catch(error => { if (!cancelled) notify(error?.message || '문제지 파일을 불러오지 못했습니다.', 'error') })
    return () => { cancelled = true }
  }, [paperId, notify])

  const autosave = useAutosave(draft, applyPaper, error => notify(`저장하지 못했습니다: ${error?.message || '알 수 없는 오류'}`, 'error'))

  if (!stored || !paper) {
    return (
      <div className="py-20 text-center">
        <p className="text-[var(--color-ink-soft)]">평가지를 찾을 수 없습니다.</p>
        <a href="#/" className="btn btn-primary mt-4">목록으로</a>
      </div>
    )
  }

  const setTab = next => {
    if (pendingKey && next !== 'key') {
      if (window.confirm(`올린 정답표(${pendingKey.fileName})를 아직 반영하지 않았습니다. 반영할까요?
취소를 누르면 반영하지 않고 이동합니다.`)) {
        const result = applyAnswerKeyText(paper, pendingKey.text, { fileName: pendingKey.fileName, restructure: 'auto' })
        setPaper(result.paper)
        notify(`정답 ${result.count}문항을 반영했습니다${result.restructured ? ' (문항 구성도 정답표에 맞춤)' : ''}.`)
      }
      setPendingKey(null)
    }
    navigate(`/paper/${paperId}?tab=${next}${runId && (next === 'results' || next === 'sim') ? `&run=${runId}` : ''}`)
  }

  const addFiles = async list => {
    const records = list.map((file, index) => ({ id: makeId('file'), paperId, name: file.name, type: file.type, size: file.size, blob: file, order: files.length + index }))
    try {
      await Promise.all(records.map(record => db.saveFile(record)))
    } catch (error) {
      notify(error?.message || '문제지를 올리지 못했습니다.', 'error')
      return
    }
    const next = [...files, ...records]
    setFiles(next)
    setPaper(prev => ({ ...prev, files: next.map(({ id, name, type, size }) => ({ id, name, type, size })) }))
    notify(`문제지 ${records.length}개를 올렸습니다.`)
  }

  const removeFile = async id => {
    await db.deleteFile(id)
    const next = files.filter(file => file.id !== id)
    setFiles(next)
    setPaper(prev => ({ ...prev, files: next.map(({ id: fileId, name, type, size }) => ({ id: fileId, name, type, size })) }))
  }

  const removePaper = async () => {
    if (!window.confirm(`'${paperTitle(paper)}' 평가지와 문제지 파일, 풀이 기록 ${runs.length}개를 모두 삭제합니다. 되돌릴 수 없습니다.`)) return
    // 자동 저장을 멈춤 (지운 평가지가 뒤늦은 저장으로 되살아나지 않게)
    await autosave().discard()
    try {
      await db.deletePaper(paperId)
    } catch (error) {
      autosave().resume()
      notify(error?.message || '평가지를 삭제하지 못했습니다.', 'error')
      return
    }
    navigate('/')
    notify('평가지를 삭제했습니다.')
    await refresh()
  }

  return (
    <div className="space-y-6">
      {/* 머리말 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <a href="#/" className="text-sm font-semibold text-[var(--color-ink-soft)] hover:underline">← 평가지 목록</a>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight break-keep">{paperTitle(paper)}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="chip">{paper.meta.year}학년도</span>
            <span className="chip">{paper.questions.length}문항</span>
            <span className="chip">풀이 {runs.length}건</span>
            <VerifyChip paper={paper} runs={runs} onClick={() => setTab('check')} />
            {paper.isDemo && <span className="chip !bg-red-50 !text-[var(--color-pen)]">예시 데이터</span>}
          </div>
        </div>
        <button type="button" className="btn btn-danger" onClick={removePaper}>평가지 삭제</button>
      </div>

      {/* 탭 */}
      <div className="scroll-x -mx-4 px-4">
        <div className="flex gap-1.5 min-w-max border-b border-[var(--color-line)]" role="tablist">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-bold border-b-[3px] -mb-px transition-colors ${tab === key ? 'border-[var(--color-brand)] text-[var(--color-brand)]' : 'border-transparent text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'cover' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start">
          <div className="lg:sticky lg:top-24 max-w-md w-full mx-auto"><PaperCover paper={paper} /></div>
          <div className="card p-4 sm:p-6">
            <h2 className="text-lg font-extrabold mb-4">표지 옵션</h2>
            <CoverOptionsForm paper={paper} onChange={setPaper} />
            <p className="mt-4 text-xs text-[var(--color-ink-soft)]">바꾼 내용은 자동으로 저장됩니다.</p>
          </div>
        </div>
      )}

      {tab === 'paper' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start">
          <PaperViewer files={files} />
          <div className="card p-4 sm:p-6">
            <h2 className="text-lg font-extrabold mb-4">문제지 파일</h2>
            <FileUploader files={files} onAdd={addFiles} onRemove={removeFile} />
            <p className="mt-4 text-xs leading-relaxed text-[var(--color-ink-soft)]">
              파일은 이 브라우저에만 저장됩니다. AI로 풀 때는 올린 순서대로 모델에게 전달됩니다. 정답지가 같이 들어 있는 파일은 올리지 마세요.
            </p>
          </div>
        </div>
      )}

      {tab === 'key' && (
        <div className="space-y-6">
          <AnswerKeyUpload paper={paper} onPendingChange={setPendingKey} onApply={next => { setPaper(next); setPendingKey(null); notify('실제 정답을 반영했습니다. 모든 풀이가 새 정답으로 다시 채점됩니다.') }} />
          <div className="card p-4 sm:p-6">
            <h2 className="text-lg font-extrabold mb-4">문항 구성과 정답</h2>
            <AnswerKeyEditor key={paper.answerKeySource?.appliedAt ?? 'manual'} paper={paper} onChange={setPaper} />
          </div>
        </div>
      )}

      {tab === 'check' && <VerifyPanel paper={paper} files={files} runs={runs} onChange={setPaper} onEditQuestion={() => setTab('key')} />}

      {tab === 'sim' && <SolveViewer key={paper.id} paper={paper} runs={runs} files={files} initialRunId={runId} />}

      {tab === 'results' && <ResultsTab paper={paper} runs={runs} files={files} runId={runId} edit={edit} />}

    </div>
  )
}

/** @brief 머리말의 검증 결과 표시 (누르면 검증 탭) */
function VerifyChip({ paper, runs, onClick }) {
  const result = useMemo(() => validateStored(paper, runs), [paper, runs])
  // 검증 탭 위 요약과 같은 기준(검증 항목 수)으로 셈
  const counts = checkCounts(result)
  const label = result.status === 'error' ? `검증 오류 ${counts.error}` : result.status === 'warn' ? `확인 필요 ${counts.warn}` : '검증 통과'
  return (
    <button type="button" onClick={onClick} className="hover:opacity-80">
      <LevelBadge level={result.status}>{label}</LevelBadge>
    </button>
  )
}

/** @brief 채점 결과 탭에서 보는 풀이 고르기 (run=key는 정답 OMR) */
const ANSWER_KEY = 'key'

/** @brief 성적표 - 큰 화면은 표, 작은 화면은 카드. 행을 누르면 아래 OMR 답안지가 그 풀이로 바뀜 */
function ScoreBoard({ paper, results, selectedId, onSelect, onRemove }) {
  const types = ['choice', 'short', 'essay'].filter(type => paper.questions.some(question => question.type === type))
  const meta = run => (
    <>
      {run.isDemo ? '가상 데이터' : SOURCE_LABEL[run.source]}
      {run.durationMs ? ` · ${Math.round(run.durationMs / 1000)}초` : ''}
    </>
  )
  return (
    <>
      {/* 작은 화면: 카드 */}
      <ul className="grid gap-2 md:hidden">
        {results.map(({ run, result }, index) => {
          const selected = run.id === selectedId
          return (
            <li key={run.id}>
              <button
                type="button"
                onClick={() => onSelect(run.id)}
                aria-pressed={selected}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${selected ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]' : 'border-[var(--color-line)] bg-white'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[var(--color-ink-soft)]">{index + 1}위 · {meta(run)}</div>
                    <div className="font-extrabold truncate">{run.model}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-2xl font-extrabold tabular-nums leading-none">{Number.isInteger(result.score) ? result.score : result.score.toFixed(1)}<span className="text-sm font-semibold text-[var(--color-ink-soft)]">/{result.maxScore}</span></div>
                    <div className="mt-1 text-xs tabular-nums text-[var(--color-ink-soft)]">{result.correct}/{result.total}문항 · {formatRate(result.rate)}</div>
                  </div>
                </div>
                <div className="mt-2 h-2 rounded-full bg-[#ece7db] overflow-hidden">
                  <div className="h-full rounded-full bg-[var(--color-brand)]" style={{ width: `${result.rate * 100}%` }} />
                </div>
                <div className="mt-2 text-xs font-bold text-[var(--color-brand)]">{selected ? '▼ 아래 OMR 답안지에 표시 중' : 'OMR 답안지 보기'}</div>
              </button>
            </li>
          )
        })}
      </ul>

      {/* 큰 화면: 표 */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--color-ink-soft)] border-b border-[var(--color-line)]">
              <th className="py-2 pr-2 font-semibold w-10">순위</th>
              <th className="py-2 pr-2 font-semibold">풀이</th>
              <th className="py-2 pr-2 font-semibold text-right">점수</th>
              <th className="py-2 pr-2 font-semibold w-[26%]">득점률</th>
              <th className="py-2 pr-2 font-semibold text-right">맞힌 문항</th>
              {types.map(type => <th key={type} className="py-2 pr-2 font-semibold text-right">{QUESTION_TYPES[type]}</th>)}
              <th className="py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {results.map(({ run, result }, index) => {
              const selected = run.id === selectedId
              return (
                <tr
                  key={run.id}
                  onClick={() => onSelect(run.id)}
                  aria-selected={selected}
                  className={`cursor-pointer border-b border-[var(--color-line)]/70 last:border-0 transition-colors ${selected ? 'bg-[var(--color-brand-soft)]' : 'hover:bg-white'}`}
                >
                  <td className="py-2.5 pr-2 pl-1 font-extrabold tabular-nums">{index + 1}</td>
                  <td className="py-2.5 pr-2">
                    <div className="font-bold">{run.model}</div>
                    <div className="text-xs text-[var(--color-ink-soft)]">
                      {meta(run)}
                      {result.invalid > 0 && <span className="text-[var(--color-pen)]"> · 무응답 {result.invalid}</span>}
                      {result.pendingEssays > 0 && <span> · 서술형 채점 대기 {result.pendingEssays}</span>}
                    </div>
                  </td>
                  <td className="py-2.5 pr-2 text-right font-extrabold tabular-nums">{Number.isInteger(result.score) ? result.score : result.score.toFixed(1)}<span className="font-normal text-[var(--color-ink-soft)]">/{result.maxScore}</span></td>
                  <td className="py-2.5 pr-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 flex-1 rounded-full bg-[#ece7db] overflow-hidden">
                        <div className="h-full rounded-full bg-[var(--color-brand)]" style={{ width: `${result.rate * 100}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs tabular-nums">{formatRate(result.rate)}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-2 text-right tabular-nums">{result.correct}/{result.total}</td>
                  {types.map(type => (
                    <td key={type} className="py-2.5 pr-2 text-right tabular-nums text-xs">{result.byType[type] ? formatRate(result.byType[type].earned / result.byType[type].max) : '—'}</td>
                  ))}
                  <td className="py-2.5 pr-1 text-right whitespace-nowrap">
                    <span className={`mr-3 text-xs font-bold ${selected ? 'text-[var(--color-brand)]' : 'text-[var(--color-ink-soft)]'}`}>{selected ? 'OMR 표시 중' : 'OMR 보기'}</span>
                    <button type="button" className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-pen)]" onClick={event => { event.stopPropagation(); onRemove(run) }}>삭제</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** @brief OMR 답안지 - 고른 풀이의 마킹·채점 표시, 직접 마킹 수정, 서술형 채점 */
function OmrSheet({ paper, runs, current, edit, onSelect }) {
  const { applyRun, notify } = useStore()
  const [showGrading, setShowGrading] = useState(true)
  // 풀이 선택이 바뀌면 key로 다시 마운트되므로 처음 값만 받고, 이후에는 이 화면이 가진 최신 값 기준으로 저장
  const [draft, setDraft] = useState(current)
  const draftRef = useRef(current)
  const editable = Boolean(current && edit && current.source === 'manual')

  const persist = async next => {
    draftRef.current = next
    setDraft(next)
    const backend = getBackend()
    try {
      await backend.saveRun(next)
      // 그사이 더 마킹했으면 마지막 저장 때 반영
      if (draftRef.current === next) applyRun(next, backend)
    } catch (error) {
      notify(`저장하지 못했습니다: ${error?.message || '알 수 없는 오류'}`, 'error')
    }
  }

  // 직접 입력: 첫 마킹부터 마지막 마킹까지의 시간을 수행 시간으로 기록
  const saveAnswer = (no, answer) => {
    const base = draftRef.current
    const now = currentTime()
    const startedAt = base.timing?.startedAt ?? now
    return persist({
      ...base,
      answers: { ...base.answers, [no]: { answer, status: answer.trim() ? 'answered' : 'no_answer' } },
      timing: { startedAt },
      durationMs: now - startedAt
    })
  }

  const saveEssayScore = (no, value) => {
    const base = draftRef.current
    return persist({ ...base, essayScores: { ...base.essayScores, [no]: value === '' ? '' : Number(value) } })
  }

  const essays = paper.questions.filter(question => question.type === 'essay')
  const editHref = current ? `#/paper/${paper.id}?tab=results&run=${current.id}${editable ? '' : '&edit=1'}` : ''

  return (
    <section id="omr-sheet" className="card p-3 sm:p-5 space-y-4 scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold">OMR 답안지</h3>
          <p className="text-xs text-[var(--color-ink-soft)]">{current ? '빨간 동그라미는 정답, 빗금은 오답, 점선은 원래 정답 자리입니다.' : '실제 정답을 OMR로 보여 줍니다.'}</p>
        </div>
        <label className="block w-full sm:w-auto">
          <span className="sr-only">보여 줄 답안지</span>
          <select className="input sm:!w-72" value={current?.id ?? ANSWER_KEY} onChange={e => onSelect(e.target.value)}>
            <option value={ANSWER_KEY}>정답 OMR (실제 정답)</option>
            {runs.map(run => <option key={run.id} value={run.id}>{run.model} · {gradeRun(paper, run).score}점</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <OmrLegend />
        <div className="flex flex-wrap items-center gap-3">
          {current?.source === 'manual' && <a className="btn btn-ghost !py-1.5 text-sm" href={editHref}>{editable ? '마킹 끝내기' : '마킹 수정'}</a>}
          {current && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={showGrading} onChange={e => setShowGrading(e.target.checked)} />
              채점 표시
            </label>
          )}
        </div>
      </div>

      {editable && (
        <p className="rounded-lg bg-[var(--color-brand-soft)] px-3 py-2 text-sm">버블을 눌러 마킹하세요. 다시 누르면 지워집니다. 누를 때마다 자동 저장되고, 첫 마킹부터 마지막 마킹까지의 시간이 수행 시간으로 기록됩니다{draft?.durationMs ? ` (지금까지 ${Math.round(draft.durationMs / 1000)}초)` : ''}.</p>
      )}

      <div className="scroll-x -mx-3 px-3 sm:mx-0 sm:px-0">
        <OmrCard paper={paper} run={draft} showGrading={showGrading && !editable} editable={editable} onAnswer={saveAnswer} />
      </div>

      {current && essays.length > 0 && (
        <div className="rounded-xl border border-[var(--color-line)] bg-white/60 p-3 sm:p-4">
          <h4 className="font-extrabold">서술형 채점</h4>
          <p className="mt-1 mb-3 text-sm text-[var(--color-ink-soft)]">서술형은 자동 채점하지 않습니다. 답을 읽고 점수를 입력하면 총점에 반영됩니다.</p>
          <div className="space-y-3">
            {essays.map(question => (
              <div key={question.no} className="grid gap-3 sm:grid-cols-[1fr_auto] items-start rounded-xl border border-[var(--color-line)] bg-white p-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold">{question.no}번 <span className="font-normal text-[var(--color-ink-soft)]">({question.points}점)</span></div>
                  {question.answer && <div className="mt-1 text-xs text-[var(--color-ok)]">모범답안: {question.answer}</div>}
                  <p className="mt-1.5 text-sm whitespace-pre-wrap break-words">{draft?.answers?.[question.no]?.answer || <span className="text-[var(--color-ink-soft)]">미기재</span>}</p>
                </div>
                <label className="flex items-center gap-1.5 text-sm">
                  <input className="input !w-20 text-right" type="number" min="0" max={question.points} step="0.5" value={draft?.essayScores?.[question.no] ?? ''} placeholder="—" onChange={e => saveEssayScore(question.no, e.target.value)} aria-label={`${question.no}번 서술형 점수`} />
                  / {question.points}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * @brief 채점 결과 탭 - 성적표(풀이 고르기) → OMR 답안지 → 문항별 정답률 → 풀이 추가
 * - 예전 "OMR 채점" 탭을 합쳐, 성적표에서 풀이를 누르면 바로 아래 OMR 답안지에 채점 결과가 보임
 */
function ResultsTab({ paper, runs, files, runId, edit }) {
  const { refresh, notify } = useStore()
  const results = useMemo(() => runs.map(run => ({ run, result: gradeRun(paper, run) })).sort((a, b) => b.result.score - a.result.score), [paper, runs])
  const stats = useMemo(() => questionStats(paper, runs), [paper, runs])
  const hardest = [...stats].filter(item => item.rate !== null).sort((a, b) => a.rate - b.rate).slice(0, 5)
  // 고른 풀이 (주소에 없으면 점수가 가장 높은 풀이, 풀이가 없으면 정답 OMR)
  const current = runId === ANSWER_KEY ? null : runs.find(run => run.id === runId) ?? results[0]?.run ?? null

  const select = id => {
    navigate(`/paper/${paper.id}?tab=results&run=${id}`)
    // 작은 화면에서는 성적표 아래에 있는 답안지로 이동
    requestAnimationFrame(() => document.getElementById('omr-sheet')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const removeRun = async run => {
    if (!window.confirm(`'${run.model}' 풀이 기록을 삭제할까요?`)) return
    await db.deleteRun(run.id)
    await refresh()
    notify('풀이 기록을 삭제했습니다.')
  }

  return (
    <div className="space-y-6">
      <section className="card p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-lg font-extrabold">성적표</h3>
            <p className="text-xs text-[var(--color-ink-soft)]">풀이를 누르면 아래 OMR 답안지에 채점 결과가 표시됩니다.</p>
          </div>
          {results.length > 0 && <span className="chip">풀이 {results.length}건</span>}
        </div>
        {results.length === 0 ? (
          <p className="py-8 text-center text-[var(--color-ink-soft)]">아직 풀이 기록이 없습니다. 「AI 풀이」 탭에서 AI에게 풀게 하거나, 아래 「풀이 추가」를 쓰세요.</p>
        ) : (
          <ScoreBoard paper={paper} results={results} selectedId={current?.id} onSelect={select} onRemove={removeRun} />
        )}
      </section>

      <OmrSheet key={`${current?.id ?? ANSWER_KEY}:${edit ? 'edit' : 'view'}`} paper={paper} runs={results.map(item => item.run)} current={current} edit={edit} onSelect={select} />

      {runs.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="card p-3 sm:p-5 min-w-0">
            <h3 className="text-lg font-extrabold">문항별 정답률</h3>
            <p className="mb-3 text-xs text-[var(--color-ink-soft)]">풀이 기록 {runs.length}건 기준 · 빨강 50% 미만, 노랑 80% 미만</p>
            <div className="h-56 sm:h-64">
              <Suspense fallback={null}><RateChart stats={stats} /></Suspense>
            </div>
          </div>
          <div className="card p-3 sm:p-5">
            <h3 className="text-lg font-extrabold">AI가 가장 많이 틀린 문항</h3>
            <p className="mb-3 text-xs text-[var(--color-ink-soft)]">AI가 틀린 문항은 정답이나 문제에 오류가 없는지 한 번 더 확인해 보세요.</p>
            {hardest.length === 0 ? <p className="text-sm text-[var(--color-ink-soft)]">채점된 문항이 없습니다.</p> : (
              <ol className="space-y-2">
                {hardest.map(item => (
                  <li key={item.no} className="flex items-center justify-between rounded-lg bg-white border border-[var(--color-line)] px-3 py-2 text-sm">
                    <span><b>{item.no}번</b> <span className="text-[var(--color-ink-soft)]">{QUESTION_TYPES[item.type]} · {item.points}점</span></span>
                    <span className="font-bold tabular-nums text-[var(--color-pen)]">{formatRate(item.rate)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      <details className="card p-3 sm:p-5 group" open={runs.length === 0}>
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
          <span>
            <span className="text-lg font-extrabold">풀이 추가</span>
            <span className="ml-2 text-xs text-[var(--color-ink-soft)]">AI로 한 번에 풀기 · OMR 직접 입력 · 결과 가져오기</span>
          </span>
          <span className="text-sm font-bold text-[var(--color-brand)] group-open:rotate-180 transition-transform" aria-hidden="true">▾</span>
        </summary>
        <div className="mt-4">
          <RunPanel paper={paper} files={files} />
        </div>
      </details>
    </div>
  )
}
