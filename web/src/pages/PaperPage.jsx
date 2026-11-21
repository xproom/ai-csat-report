/**
 * @file PaperPage.jsx
 * @brief 평가지 상세 - 표지 / 문제지 / 정답·배점 / OMR / 결과 탭
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import AnswerKeyEditor from '@/components/AnswerKeyEditor'
import CoverOptionsForm from '@/components/CoverOptionsForm'
import { FileUploader, PaperViewer } from '@/components/FileUploader'
import OmrCard, { OmrLegend } from '@/components/OmrCard'
import PaperCover from '@/components/PaperCover'
import RunPanel from '@/components/RunPanel'
import { db } from '@/lib/db'
import { formatRate, gradeRun, questionStats } from '@/lib/grading'
import { makeId, paperTitle, QUESTION_TYPES } from '@/lib/schema'
import { navigate, useStore } from '@/lib/store'

const TABS = [
  ['cover', '표지'],
  ['paper', '문제지'],
  ['key', '정답·배점'],
  ['omr', 'OMR'],
  ['results', '결과']
]

const SOURCE_LABEL = { ai: 'AI 실행', manual: '직접 입력', import: '가져옴' }

/** @brief 평가지 수정 내용을 잠시 뒤 자동 저장 */
function useAutosave(paper, onSaved) {
  const onSavedRef = useRef(onSaved)
  useEffect(() => { onSavedRef.current = onSaved }, [onSaved])
  useEffect(() => {
    if (!paper) return undefined
    const timer = setTimeout(async () => {
      await db.savePaper(paper)
      onSavedRef.current?.()
    }, 500)
    return () => clearTimeout(timer)
  }, [paper])
}

export default function PaperPage({ paperId, tab, runId, edit }) {
  const { papers, runs: allRuns, refresh, notify } = useStore()
  const stored = papers.find(item => item.id === paperId)
  // 사용자가 고친 내용만 draft에 담고, 고치기 전에는 저장된 평가지를 그대로 보여줌
  const [draft, setDraft] = useState(null)
  const paper = draft ?? stored ?? null
  const setPaper = next => setDraft(prev => (typeof next === 'function' ? next(prev ?? stored) : next))
  const [files, setFiles] = useState([])
  const runs = useMemo(() => allRuns.filter(run => run.paperId === paperId), [allRuns, paperId])

  useEffect(() => {
    let cancelled = false
    db.listFiles(paperId).then(list => { if (!cancelled) setFiles(list.sort((a, b) => a.order - b.order)) })
    return () => { cancelled = true }
  }, [paperId])

  useAutosave(draft, refresh)

  if (!stored || !paper) {
    return (
      <div className="py-20 text-center">
        <p className="text-[var(--color-ink-soft)]">평가지를 찾을 수 없습니다.</p>
        <a href="#/" className="btn btn-primary mt-4">목록으로</a>
      </div>
    )
  }

  const setTab = next => navigate(`/paper/${paperId}?tab=${next}${runId && next === 'omr' ? `&run=${runId}` : ''}`)

  const addFiles = async list => {
    const records = list.map((file, index) => ({ id: makeId('file'), paperId, name: file.name, type: file.type, size: file.size, blob: file, order: files.length + index }))
    for (const record of records) await db.saveFile(record)
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
    await db.deletePaper(paperId)
    await refresh()
    notify('평가지를 삭제했습니다.')
    navigate('/')
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
        <div className="card p-4 sm:p-6">
          <h2 className="text-lg font-extrabold mb-4">문항 구성과 정답</h2>
          <AnswerKeyEditor paper={paper} onChange={setPaper} />
        </div>
      )}

      {tab === 'omr' && <OmrTab key={runId || 'answer-key'} paper={paper} runs={runs} runId={runId} edit={edit} />}

      {tab === 'results' && <ResultsTab paper={paper} runs={runs} files={files} />}
    </div>
  )
}

/** @brief OMR 탭 - 풀이 선택, 채점 표시, 직접 마킹 */
function OmrTab({ paper, runs, runId, edit }) {
  const { refresh } = useStore()
  const [showGrading, setShowGrading] = useState(true)
  const current = runs.find(run => run.id === runId) ?? null
  // 풀이 선택이 바뀌면 key로 다시 마운트되므로 처음 값만 받고, 이후에는 이 화면이 가진 최신 값 기준으로 저장
  const [draft, setDraft] = useState(current)
  const draftRef = useRef(current)
  const editable = Boolean(current && edit && current.source === 'manual')

  const persist = async next => {
    draftRef.current = next
    setDraft(next)
    await db.saveRun(next)
    refresh()
  }

  const choose = id => navigate(`/paper/${paper.id}?tab=omr${id ? `&run=${id}` : ''}`)

  const saveAnswer = (no, answer) => {
    const base = draftRef.current
    return persist({ ...base, answers: { ...base.answers, [no]: { answer, status: answer.trim() ? 'answered' : 'no_answer' } } })
  }

  const saveEssayScore = (no, value) => {
    const base = draftRef.current
    return persist({ ...base, essayScores: { ...base.essayScores, [no]: value === '' ? '' : Number(value) } })
  }

  const essays = paper.questions.filter(question => question.type === 'essay')

  return (
    <div className="space-y-5">
      <div className="card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => choose(null)} aria-pressed={!current} className={`rounded-full px-3.5 py-1.5 text-sm font-bold border ${!current ? 'bg-[var(--color-pen)] text-white border-[var(--color-pen)]' : 'bg-white border-[var(--color-line)]'}`}>
            정답 OMR
          </button>
          {runs.map(run => {
            const result = gradeRun(paper, run)
            return (
              <button key={run.id} type="button" onClick={() => choose(run.id)} aria-pressed={current?.id === run.id} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold border ${current?.id === run.id ? 'bg-[var(--color-ink)] text-white border-[var(--color-ink)]' : 'bg-white border-[var(--color-line)]'}`}>
                {run.model} <span className="opacity-70 tabular-nums">{result.score}점</span>
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <OmrLegend />
          <div className="flex items-center gap-3">
            {current?.source === 'manual' && (
              <a className="btn btn-ghost !py-1.5 text-sm" href={`#/paper/${paper.id}?tab=omr&run=${current.id}${editable ? '' : '&edit=1'}`}>
                {editable ? '마킹 끝내기' : '마킹 수정'}
              </a>
            )}
            {current && (
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={showGrading} onChange={e => setShowGrading(e.target.checked)} />
                채점 표시
              </label>
            )}
          </div>
        </div>
      </div>

      {editable && (
        <p className="rounded-lg bg-[var(--color-brand-soft)] px-3 py-2 text-sm">버블을 눌러 마킹하세요. 다시 누르면 지워집니다. 누를 때마다 자동 저장됩니다.</p>
      )}

      <OmrCard paper={paper} run={draft} showGrading={showGrading && !editable} editable={editable} onAnswer={saveAnswer} />

      {current && essays.length > 0 && (
        <div className="card p-4 sm:p-6">
          <h3 className="text-lg font-extrabold">서술형 채점</h3>
          <p className="mt-1 mb-4 text-sm text-[var(--color-ink-soft)]">서술형은 자동 채점하지 않습니다. 답을 읽고 점수를 입력하면 총점에 반영됩니다.</p>
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
    </div>
  )
}

/** @brief 결과 탭 - 풀이 추가, 점수표, 문항별 정답률 */
function ResultsTab({ paper, runs, files }) {
  const { refresh, notify } = useStore()
  const results = useMemo(() => runs.map(run => ({ run, result: gradeRun(paper, run) })).sort((a, b) => b.result.score - a.result.score), [paper, runs])
  const stats = useMemo(() => questionStats(paper, runs), [paper, runs])
  const hardest = [...stats].filter(item => item.rate !== null).sort((a, b) => a.rate - b.rate).slice(0, 5)

  const removeRun = async run => {
    if (!window.confirm(`'${run.model}' 풀이 기록을 삭제할까요?`)) return
    await db.deleteRun(run.id)
    await refresh()
    notify('풀이 기록을 삭제했습니다.')
  }

  return (
    <div className="space-y-6">
      <RunPanel paper={paper} files={files} />

      <div className="card p-4 sm:p-6">
        <h3 className="text-lg font-extrabold mb-4">성적표</h3>
        {results.length === 0 ? (
          <p className="py-8 text-center text-[var(--color-ink-soft)]">아직 풀이 기록이 없습니다. 위에서 AI로 풀거나 결과를 추가하세요.</p>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--color-ink-soft)] border-b border-[var(--color-line)]">
                  <th className="py-2 pr-2 font-semibold">순위</th>
                  <th className="py-2 pr-2 font-semibold">모델</th>
                  <th className="py-2 pr-2 font-semibold text-right">점수</th>
                  <th className="py-2 pr-2 font-semibold w-[28%]">득점률</th>
                  <th className="py-2 pr-2 font-semibold text-right">맞힌 문항</th>
                  {['choice', 'short', 'essay'].filter(type => paper.questions.some(question => question.type === type)).map(type => (
                    <th key={type} className="py-2 pr-2 font-semibold text-right">{QUESTION_TYPES[type]}</th>
                  ))}
                  <th className="py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {results.map(({ run, result }, index) => (
                  <tr key={run.id} className="border-b border-[var(--color-line)]/70 last:border-0">
                    <td className="py-2.5 pr-2 font-extrabold tabular-nums">{index + 1}</td>
                    <td className="py-2.5 pr-2">
                      <a href={`#/paper/${paper.id}?tab=omr&run=${run.id}`} className="font-bold hover:underline">{run.model}</a>
                      <div className="text-xs text-[var(--color-ink-soft)]">
                        {run.isDemo ? '가상 데이터' : SOURCE_LABEL[run.source]}
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
                    {['choice', 'short', 'essay'].filter(type => result.byType[type]).map(type => (
                      <td key={type} className="py-2.5 pr-2 text-right tabular-nums text-xs">{formatRate(result.byType[type].earned / result.byType[type].max)}</td>
                    ))}
                    <td className="py-2.5 text-right">
                      <button type="button" className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-pen)]" onClick={() => removeRun(run)}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {runs.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="card p-4 sm:p-6">
            <h3 className="text-lg font-extrabold">문항별 정답률</h3>
            <p className="mb-3 text-xs text-[var(--color-ink-soft)]">풀이 기록 {runs.length}건 기준 · 빨강 50% 미만, 노랑 80% 미만</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.map(item => ({ ...item, pct: item.rate === null ? 0 : Math.round(item.rate * 100) }))} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#ece7db" />
                  <XAxis dataKey="no" tick={{ fontSize: 11 }} interval={0} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={value => [`${value}%`, '정답률']} labelFormatter={label => `${label}번`} />
                  <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                    {stats.map(item => (
                      <Cell key={item.no} fill={item.rate === null ? '#d6d0c2' : item.rate < 0.5 ? 'var(--color-pen)' : item.rate < 0.8 ? 'var(--color-accent)' : 'var(--color-brand)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card p-4 sm:p-6">
            <h3 className="text-lg font-extrabold mb-3">AI가 가장 많이 틀린 문항</h3>
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
    </div>
  )
}
