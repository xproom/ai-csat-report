/**
 * @file PerformanceView.jsx
 * @brief 성능 평가 - 실제 정답과 LLM 답을 비교해 정확도·수행 시간 평가
 */

import { useMemo, useState } from 'react'
import { CartesianGrid, LabelList, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { db } from '@/lib/db'
import { formatRate } from '@/lib/grading'
import { answerMatrix, evaluateRuns, highlights, performanceCsv } from '@/lib/performance'
import { missingAnswers, paperTitle, QUESTION_TYPES } from '@/lib/schema'
import { formatDuration } from '@/lib/replay'
import { useStore } from '@/lib/store'

const CIRCLED = ['①', '②', '③', '④', '⑤']
/** 엑셀에서 한글이 깨지지 않도록 CSV 앞에 붙이는 BOM */
const BOM = String.fromCharCode(0xfeff)

const COLUMNS = [
  ['model', '모델'],
  ['accuracy', '정확도'],
  ['scoreRate', '득점률'],
  ['durationMs', '수행 시간'],
  ['perQuestionMs', '문항당'],
  ['perCorrectMs', '정답 1개당'],
  ['throughput', '분당 문항']
]

const FILTERS = [
  ['all', '전체 문항'],
  ['split', '모델 간 답이 갈린 문항'],
  ['wrong', '하나라도 틀린 문항'],
  ['allWrong', '모두 틀린 문항']
]

function shortAnswer(type, value) {
  const text = String(value ?? '').trim()
  if (!text) return '—'
  if (type === 'choice') {
    const digit = Number(text.normalize('NFKC').match(/\d+/)?.[0])
    return CIRCLED[digit - 1] ?? text
  }
  return text.length > 10 ? `${text.slice(0, 10)}…` : text
}

/** @brief 수행 시간 입력 (기록이 없는 직접 입력·가져온 결과용) */
function DurationInput({ row }) {
  const { refresh, notify } = useStore()
  const [value, setValue] = useState(row.durationMs ? String(Math.round(row.durationMs / 100) / 10) : '')
  const save = async () => {
    const seconds = Number(value)
    if (!Number.isFinite(seconds) || seconds < 0) return
    await db.saveRun({ ...row.run, durationMs: Math.round(seconds * 1000) })
    await refresh()
    notify(`${row.model} 수행 시간을 저장했습니다.`)
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input className="input !w-20 !py-1 text-right text-xs" type="number" min="0" step="0.1" value={value} placeholder="초" onChange={e => setValue(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save() }} aria-label={`${row.model} 수행 시간(초)`} />
      <span className="text-xs text-[var(--color-ink-soft)]">초</span>
    </span>
  )
}

export default function PerformanceView({ paper, runs }) {
  const [sort, setSort] = useState({ key: 'accuracy', dir: -1 })
  const [filter, setFilter] = useState('all')
  const rows = useMemo(() => evaluateRuns(paper, runs), [paper, runs])
  const best = useMemo(() => highlights(rows), [rows])
  const matrix = useMemo(() => answerMatrix(paper, runs), [paper, runs])
  const missing = missingAnswers(paper)
  const uploaded = paper.answerKeySource?.type === 'upload'

  const sorted = useMemo(() => {
    const list = [...rows]
    list.sort((a, b) => {
      if (sort.key === 'model') return sort.dir * a.model.localeCompare(b.model)
      const av = a[sort.key] || (sort.dir === -1 ? -Infinity : Infinity)
      const bv = b[sort.key] || (sort.dir === -1 ? -Infinity : Infinity)
      return sort.dir * (av - bv)
    })
    return list
  }, [rows, sort])

  const chartData = rows.filter(row => row.durationMs > 0).map(row => ({
    model: row.model,
    seconds: Math.round(row.durationMs / 100) / 10,
    accuracy: Math.round(row.accuracy * 1000) / 10,
    pareto: row.pareto
  }))
  const front = chartData.filter(point => point.pareto).sort((a, b) => a.seconds - b.seconds)
  const others = chartData.filter(point => !point.pareto)

  const visibleMatrix = matrix.filter(row => {
    if (filter === 'split') return row.split
    if (filter === 'wrong') return row.cells.some(cell => cell.correct === false)
    if (filter === 'allWrong') return row.allWrong
    return true
  })

  const exportCsv = () => {
    const blob = new Blob([`${BOM}${performanceCsv(paper, rows)}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `성능평가-${paperTitle(paper)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!runs.length) {
    return (
      <div className="card px-6 py-14 text-center">
        <p className="text-lg font-extrabold">평가할 풀이가 없습니다</p>
        <p className="mt-1 text-[var(--color-ink-soft)]">‘결과’ 탭에서 AI 풀이를 추가하면 실제 정답과 비교해 정확도와 수행 시간을 평가합니다.</p>
        <a href={`#/paper/${paper.id}?tab=results`} className="btn btn-primary mt-5">풀이 추가하러 가기</a>
      </div>
    )
  }

  const toggleSort = key => setSort(prev => ({ key, dir: prev.key === key ? -prev.dir : key === 'model' ? 1 : key === 'accuracy' || key === 'scoreRate' || key === 'throughput' ? -1 : 1 }))

  return (
    <div className="space-y-6">
      {(!uploaded || missing.length > 0) && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {!uploaded && <>실제 정답을 업로드하지 않고 직접 입력한 정답으로 비교하고 있습니다. <a className="font-bold underline" href={`#/paper/${paper.id}?tab=key`}>정답·배점 탭</a>에서 실제 정답표를 올리면 정확도가 그 기준으로 다시 계산됩니다. </>}
          {missing.length > 0 && <>정답이 없는 {missing.length}문항은 모든 모델이 오답으로 처리됩니다.</>}
        </div>
      )}

      {/* 대표 지표 */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['가장 정확한 모델', best.mostAccurate, row => formatRate(row.accuracy), row => row.durationMs ? formatDuration(row.durationMs) : '시간 기록 없음'],
          ['가장 빠른 모델', best.fastest, row => formatDuration(row.durationMs), row => `정확도 ${formatRate(row.accuracy)}`],
          ['정확도·속도 균형 최적', best.balanced, row => formatRate(row.accuracy), row => `${formatDuration(row.durationMs)} · 정답당 ${formatDuration(row.perCorrectMs)}`]
        ].map(([label, row, main, sub]) => (
          <div key={label} className="card p-4 sm:p-5">
            <div className="text-xs font-bold text-[var(--color-ink-soft)]">{label}</div>
            {row ? (
              <>
                <div className="mt-1 font-extrabold truncate">{row.model}</div>
                <div className="text-2xl font-extrabold tabular-nums tracking-tight">{main(row)}</div>
                <div className="text-xs text-[var(--color-ink-soft)] truncate">{sub(row)}</div>
              </>
            ) : <div className="mt-2 text-sm text-[var(--color-ink-soft)]">수행 시간이 기록된 풀이가 없습니다.</div>}
          </div>
        ))}
      </div>

      {/* 성능 표 */}
      <div className="card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-extrabold">모델별 정확도와 수행 시간</h3>
            <p className="text-xs text-[var(--color-ink-soft)]">정확도 = 맞힌 문항 ÷ 채점한 문항 (서술형 채점 대기 제외) · 머리글을 누르면 정렬 · ★ 균형 최적</p>
          </div>
          <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={exportCsv}>CSV 내려받기</button>
        </div>
        <div className="scroll-x">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-ink-soft)] border-b border-[var(--color-line)]">
                {COLUMNS.map(([key, label]) => (
                  <th key={key} className={`py-2 pr-3 ${key === 'model' ? '' : 'text-right'}`}>
                    <button type="button" className="font-semibold hover:text-[var(--color-ink)]" onClick={() => toggleSort(key)}>
                      {label}{sort.key === key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
                    </button>
                  </th>
                ))}
                <th className="py-2 pr-3 text-right">토큰 (입력/출력)</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => (
                <tr key={row.run.id} className="border-b border-[var(--color-line)]/60 last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className="font-bold">{row.pareto && <span className="text-[var(--color-accent)]" title="정확도·속도 균형 최적">★ </span>}{row.model}</span>
                    <span className="block text-xs text-[var(--color-ink-soft)]">{row.correct}/{row.decided}문항 정답{row.invalid ? ` · 무응답 ${row.invalid}` : ''}{row.run.isDemo ? ' · 가상' : ''}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="hidden sm:block h-2 w-20 rounded-full bg-[#ece7db] overflow-hidden"><div className="h-full bg-[var(--color-brand)]" style={{ width: `${row.accuracy * 100}%` }} /></div>
                      <span className="font-extrabold tabular-nums">{formatRate(row.accuracy)}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatRate(row.scoreRate)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {row.run.source === 'ai' ? formatDuration(row.durationMs) : <DurationInput key={row.run.id + row.durationMs} row={row} />}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-xs">{formatDuration(row.perQuestionMs)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-xs">{formatDuration(row.perCorrectMs)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-xs">{row.throughput ? row.throughput.toFixed(1) : '—'}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-xs text-[var(--color-ink-soft)]">
                    {row.inputTokens || row.outputTokens ? `${row.inputTokens.toLocaleString()} / ${row.outputTokens.toLocaleString()}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">AI 실행은 요청부터 응답까지 실제로 잰 시간입니다. 직접 입력하거나 가져온 결과는 시간을 입력하면 평가에 포함됩니다.</p>
      </div>

      {/* 정확도-시간 산점도 */}
      <div className="card p-4 sm:p-6">
        <h3 className="text-lg font-extrabold">정확도 vs 수행 시간</h3>
        <p className="text-xs text-[var(--color-ink-soft)]">왼쪽 위로 갈수록 빠르고 정확합니다. 금색 점은 다른 모델보다 정확도와 속도가 모두 뒤지지 않는 균형 최적 모델입니다.</p>
        {chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--color-ink-soft)]">수행 시간이 기록된 풀이가 없습니다. 위 표에서 시간을 입력해 보세요.</p>
        ) : (
          <div className="h-72 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 36, right: 28, left: -8, bottom: 8 }}>
                <CartesianGrid stroke="#ece7db" />
                <XAxis type="number" dataKey="seconds" name="수행 시간" unit="초" tick={{ fontSize: 11 }} domain={[0, 'auto']} />
                <YAxis type="number" dataKey="accuracy" name="정확도" unit="%" tick={{ fontSize: 11 }} domain={[0, 100]} />
                <ZAxis range={[90, 90]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value, name) => [name === '수행 시간' ? `${value}초` : `${value}%`, name]} labelFormatter={() => ''} />
                <Scatter name="기타" data={others} fill="#8b93a7">
                  <LabelList dataKey="model" position="top" style={{ fontSize: 11, fill: '#5b6478' }} />
                </Scatter>
                <Scatter name="균형 최적" data={front} fill="var(--color-accent)" line={{ stroke: 'var(--color-accent)', strokeDasharray: '4 3' }} lineType="joint">
                  <LabelList dataKey="model" position="top" style={{ fontSize: 11, fontWeight: 700, fill: '#1f2a44' }} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 정답 비교표 */}
      <div className="card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-extrabold">실제 정답 vs 모델 답</h3>
            <p className="text-xs text-[var(--color-ink-soft)]">{visibleMatrix.length}/{matrix.length}문항 표시 · 실시간 풀이 기록은 칸 아래에 문항별 실제 시간 표시</p>
          </div>
          <div className="segmented flex-wrap" role="group" aria-label="문항 필터">
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="scroll-x max-h-[32rem] overflow-y-auto rounded-xl border border-[var(--color-line)]">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 220 + runs.length * 96 }}>
            <thead className="sticky top-0 z-10 bg-[var(--color-card)]">
              <tr className="text-xs text-[var(--color-ink-soft)] border-b border-[var(--color-line)]">
                <th className="sticky left-0 bg-[var(--color-card)] px-3 py-2 text-left">번호</th>
                <th className="px-3 py-2 text-center bg-emerald-50 text-emerald-900">실제 정답</th>
                {runs.map(run => <th key={run.id} className="px-2 py-2 text-center font-semibold whitespace-nowrap">{run.model}</th>)}
              </tr>
            </thead>
            <tbody>
              {visibleMatrix.map(row => (
                <tr key={row.no} className="border-b border-[var(--color-line)]/60 last:border-0">
                  <td className="sticky left-0 bg-[var(--color-card)] px-3 py-1.5 whitespace-nowrap">
                    <b className="tabular-nums">{row.no}</b> <span className="text-xs text-[var(--color-ink-soft)]">{QUESTION_TYPES[row.type]}</span>
                    {row.allWrong && <span className="ml-1 rounded bg-red-50 px-1 text-[0.65rem] font-bold text-[var(--color-pen)]">전원 오답</span>}
                  </td>
                  <td className="px-3 py-1.5 text-center font-bold bg-emerald-50/60">{row.type === 'essay' ? '서술' : shortAnswer(row.type, String(row.expected).split('|')[0])}</td>
                  {row.cells.map(cell => {
                    const seconds = runs.find(item => item.id === cell.runId)?.perQuestionMs?.[row.no]
                    return (
                    <td key={cell.runId} className="px-1.5 py-1">
                      <span className={`block rounded-md px-2 py-1 text-center font-semibold ${cell.status !== 'answered'
                        ? 'bg-gray-100 text-gray-400'
                        : cell.correct === null ? 'bg-gray-50 text-[var(--color-ink-soft)]'
                          : cell.correct ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-[var(--color-pen)]'}`}
                      >
                        {cell.status !== 'answered' ? '무응답' : row.type === 'essay' ? (cell.correct === null ? '채점 대기' : cell.correct ? '만점' : '감점') : shortAnswer(row.type, cell.answer)}
                      </span>
                      {seconds ? <span className="block text-center text-[0.65rem] tabular-nums text-[var(--color-ink-soft)]">{formatDuration(seconds)}</span> : null}
                    </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
